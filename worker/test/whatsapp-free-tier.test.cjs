'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { memoryDb } = require('../../functions/test/memory-db.cjs');
const { createWhatsApp } = require('../../functions/lib/whatsapp.cjs');
const number = '5588999999999';
const makeScenario = (options = {}) => {
  const now = Date.UTC(2026, 9, 12, 16, 0, 0);
  const db = memoryDb();
  const jobId = 'TROPI-001__preparando';
  db.store.set('orders/TROPI-001', {
    id: 'TROPI-001', status: 'preparando', customer: { phone: number, name: 'Maria' },
    whatsappConsent: { granted: true }, notifications: { preparando: { state: 'pending' } }
  });
  db.store.set('messageJobs/' + jobId, {
    id: jobId, orderId: 'TROPI-001', status: 'preparando', phone: number,
    customerName: 'Maria', state: 'pending', attempts: 0,
    createdAt: now - (options.createdAgoMs || 60000), nextAttemptAt: now - 1000
  });
  const sent = [];
  const config = { enabled: true, phoneNumberId: '123456789', wabaId: '222222',
    token: 'test-token', appSecret: 'test-secret', version: 'v21.0',
    monthlyCap: options.cap || 1000, billingTimeZone: 'America/Fortaleza' };
  const api = createWhatsApp({
    db, clock: () => now, config: () => config,
    fetchImpl: async (_url, request) => {
      sent.push(JSON.parse(request.body));
      return Response.json({ messages: [{ id: 'wamid-' + sent.length }] });
    }
  });
  const webhook = async (message) => {
    const body = { object: 'whatsapp_business_account', entry: [{
      id: '222222', changes: [{ value: {
        metadata: { phone_number_id: '123456789' }, messages: [message]
      } }]
    }] };
    const raw = Buffer.from(JSON.stringify(body));
    const signature = 'sha256=' + crypto.createHmac('sha256', 'test-secret').update(raw).digest('hex');
    return api.webhook({ rawBody: raw, signature, body });
  };
  return { db, now, jobId, api, sent, webhook };
};
test('customer inbound message opens service window, notification uses TEXT not paid utility template', async () => {
  const s = makeScenario();
  const response = await s.webhook({ from: number, type: 'text',
    timestamp: String(Math.floor((s.now - 3000) / 1000)), text: { body: 'Quero fazer um pedido' } });
  assert.equal(response.status, 200);
  await s.api.process(s.jobId);
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].type, 'text');
  assert.match(s.sent[0].text.body, /aceito e entrou em preparação/);
  assert.equal(s.db.store.get('messageJobs/' + s.jobId).state, 'accepted');
  assert.equal(s.db.store.get('whatsappMonthlyQuota/202610').reserved, 1);
  await s.api.process(s.jobId);
  assert.equal(s.sent.length, 1, 'idempotent job must not send twice');
});
test('no inbound message after 10 min: never send and never reserve free quota', async () => {
  const s = makeScenario({ createdAgoMs: 11 * 60000 });
  await s.api.process(s.jobId);
  assert.equal(s.sent.length, 0);
  assert.equal(s.db.store.get('messageJobs/' + s.jobId).state, 'outside-window');
  assert.equal(s.db.store.has('whatsappMonthlyQuota/202610'), false);
});
test('wait for inbound webhook for up to 10 minutes without spending quota', async () => {
  const s = makeScenario();
  await s.api.process(s.jobId);
  assert.equal(s.sent.length, 0);
  assert.equal(s.db.store.get('messageJobs/' + s.jobId).state, 'retry');
  assert.equal(s.db.store.get('orders/TROPI-001').notifications.preparando.state, 'waiting-for-customer');
});
test('monthly cap stops sends before exceeding 1000 reserved attempts', async () => {
  const s = makeScenario();
  s.db.store.set('whatsappRecipients/' + crypto.createHash('sha256').update(number).digest('hex'), {
    phone: number, lastInboundAt: s.now - 3000
  });
  s.db.store.set('whatsappMonthlyQuota/202610', { reserved: 1000 });
  await s.api.process(s.jobId);
  assert.equal(s.sent.length, 0);
  assert.equal(s.db.store.get('messageJobs/' + s.jobId).state, 'quota-reached');
  assert.equal(s.db.store.get('whatsappMonthlyQuota/202610').reserved, 1000);
});
test('SAIR via signed inbound webhook opts out of status updates', async () => {
  const s = makeScenario();
  await s.webhook({ from: number, type: 'text',
    timestamp: String(Math.floor(s.now / 1000)), text: { body: 'SAIR' } });
  await s.api.process(s.jobId);
  assert.equal(s.sent.length, 0);
  assert.equal(s.db.store.get('messageJobs/' + s.jobId).state, 'no-consent');
});
test('stale incoming message does not extend 24h free-form window', async () => {
  const s = makeScenario({ createdAgoMs: 11 * 60000 });
  await s.webhook({ from: number, type: 'text',
    timestamp: String(Math.floor((s.now - 25 * 3600000) / 1000)), text: { body: 'Oi' } });
  await s.api.process(s.jobId);
  assert.equal(s.sent.length, 0);
  assert.equal(s.db.store.get('messageJobs/' + s.jobId).state, 'outside-window');
});
test('invalid webhook signature does not register an inbound service window', async () => {
  const s = makeScenario();
  const body = { object: 'whatsapp_business_account', entry: [] };
  assert.equal((await s.api.webhook({ rawBody: Buffer.from('{}'), signature: 'sha256=' + '0'.repeat(64), body })).status, 401);
  assert.equal([...s.db.store.keys()].some(key => key.startsWith('whatsappRecipients/')), false);
});
