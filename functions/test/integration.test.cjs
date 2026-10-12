'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, collection, query, where, getDocs } = require('firebase/firestore');
const { createService } = require('../lib/service.cjs');
const { createWhatsApp } = require('../lib/whatsapp.cjs');
const { digest } = require('../lib/domain.cjs');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Execute pelo npm run test:integration. Nunca use produção.');
const projectId = 'demo-tropisertao', app = initializeApp({ projectId }), db = getFirestore(app);
const customer = { uid: 'customer-one' }, other = { uid: 'customer-two' }, owner = { uid: 'store-owner', admin: true };
const config = { enabled: true, token: 'local-test-token', phoneNumberId: '1234567890', wabaId: '0987654321', version: 'v24.0', appSecret: 'local-test-app-secret', preparoTemplate: 'tropi_pedido_em_preparo', entregaTemplate: 'tropi_pedido_saiu_entrega', language: 'pt_BR' };
let now = Date.parse('2026-10-10T14:00:00-03:00'), rules;
const service = createService({ db, clock: () => now, whatsappEnabled: () => true });
const checkout = overrides => ({ requestKey: crypto.randomUUID(), name: 'Cliente fictício', phone: '88900000001', payment: 'Dinheiro', delivery: 'Entrega', neighborhood: 'Centro', address: 'Endereço fictício para teste local', whatsappOptIn: true, lines: [{ productId: '300', extras: [], qty: 1, reward: false }], ...overrides });
test.before(async () => {
  rules = await initializeTestEnvironment({ projectId, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await rules.clearFirestore();
});
test.after(async () => { await rules.cleanup(); await deleteApp(app); });
test('concurrent duplicate checkout creates exactly one pending order without a loyalty stamp', async () => {
  const input = checkout({ total: 1 });
  const results = await Promise.all([service.createOrder(customer, input), service.createOrder(customer, input)]);
  assert.equal(results[0].order.id, results[1].order.id);
  assert.equal((await db.collection('orders').get()).size, 1);
  assert.equal((await db.doc('customers/customer-one').get()).data().loyalty.qualifying, 0);
  assert.equal(results[0].order.total, 600);
});
test('rules isolate customers, reject direct mutation, and restrict cash/messages to owner', async () => {
  const own = rules.authenticatedContext(customer.uid).firestore();
  const outsider = rules.authenticatedContext(other.uid).firestore();
  const admin = rules.authenticatedContext(owner.uid, { tropiAdmin: true }).firestore();
  await assertSucceeds(getDoc(doc(own, 'orders/TROPI-001')));
  await assertFails(getDoc(doc(outsider, 'orders/TROPI-001')));
  await assertFails(getDocs(collection(own, 'orders')));
  await assertSucceeds(getDocs(query(collection(own, 'orders'), where('customer.id', '==', customer.uid))));
  await assertFails(setDoc(doc(own, 'orders/TROPI-001'), { total: 1 }, { merge: true }));
  await assertFails(setDoc(doc(admin, 'orders/TROPI-001'), { status: 'concluido' }, { merge: true }));
  await assertFails(getDocs(collection(own, 'cashSessions')));
  await assertFails(getDocs(collection(own, 'messageJobs')));
  await assertSucceeds(getDoc(doc(admin, 'orders/TROPI-001')));
  await assert.rejects(service.updateStatus(customer, { id: 'TROPI-001', status: 'preparando', expectedStatus: 'recebido' }), /exclusiva/);
});
test('status transitions enqueue one job despite duplicate updates', async () => {
  const input = { id: 'TROPI-001', status: 'preparando', expectedStatus: 'recebido' };
  await Promise.all([service.updateStatus(owner, input), service.updateStatus(owner, input)]);
  assert.equal((await db.collection('messageJobs').get()).size, 1);
  assert.equal((await db.doc('orders/TROPI-001').get()).data().status, 'preparando');
  await assert.rejects(service.updateStatus(owner, { id: 'TROPI-001', status: 'recebido', expectedStatus: 'preparando' }), /mudança/);
});
test('parallel workers send once; signed read webhook outranks late sent event', async () => {
  let calls = 0, sentBody;
  const sender = createWhatsApp({ db, config: () => config, clock: () => now, fetchImpl: async (url, options) => {
    calls++; sentBody = JSON.parse(options.body); assert.equal(url, 'https://graph.facebook.com/v24.0/1234567890/messages');
    return { ok: true, json: async () => ({ messages: [{ id: 'wamid.test-one' }] }) };
  } });
  await Promise.all([sender.process('TROPI-001__preparando'), sender.process('TROPI-001__preparando')]);
  assert.equal(calls, 1); assert.equal(sentBody.template.name, config.preparoTemplate);
  const body = state => ({ object: 'whatsapp_business_account', entry: [{ id: config.wabaId, changes: [{ value: { metadata: { phone_number_id: config.phoneNumberId }, statuses: [{ id: 'wamid.test-one', status: state, biz_opaque_callback_data: 'TROPI-001__preparando' }] } }] }] });
  for (const state of ['read', 'sent']) {
    const value = body(state), rawBody = Buffer.from(JSON.stringify(value)), signature = 'sha256=' + crypto.createHmac('sha256', config.appSecret).update(rawBody).digest('hex');
    assert.equal((await sender.webhook({ rawBody, signature, body: value })).status, 200);
  }
  assert.equal((await db.doc('messageJobs/TROPI-001__preparando').get()).data().deliveryState, 'read');
});
test('completion is booked once in cash and included in full month report', async () => {
  now += 1000;
  const session = (await service.cashAction(owner, { action: 'open', requestKey: 'cash-session-local-001', openingCents: 10000 })).session;
  await service.updateStatus(owner, { id: 'TROPI-001', status: 'entrega', expectedStatus: 'preparando' });
  now += 1000;
  const finish = { id: 'TROPI-001', status: 'concluido', expectedStatus: 'entrega' };
  await Promise.all([service.updateStatus(owner, finish), service.updateStatus(owner, finish)]);
  assert.equal((await db.doc('customers/customer-one').get()).data().loyalty.qualifying, 1);
  const cash = (await db.doc('cashSessions/' + session.id).get()).data();
  assert.equal(cash.entries.length, 1); assert.equal(cash.entries[0].amountCents, 600);
  const report = await service.report(owner, { period: 'month', value: '2026-10' });
  assert.equal(report.totalCents, 600); assert.equal(report.completedCount, 1); assert.equal(report.payments.Dinheiro, 600);
  const closed = await service.cashAction(owner, { action: 'close', id: session.id, requestKey: 'cash-close-local-001', countedCents: 10600 });
  assert.equal(closed.session.differenceCents, 0);
});
test('opt-in absent, automation disabled, or customer opt-out prevents any send', async () => {
  const off = createService({ db, clock: () => now, whatsappEnabled: () => false });
  const a = (await service.createOrder(other, checkout({ whatsappOptIn: false, phone: '88900000002' }))).order;
  await service.updateStatus(owner, { id: a.id, status: 'preparando', expectedStatus: 'recebido' });
  assert.equal((await db.doc('messageJobs/' + a.id + '__preparando').get()).exists, false);
  const b = (await off.createOrder(other, checkout({ phone: '88900000002' }))).order;
  await off.updateStatus(owner, { id: b.id, status: 'preparando', expectedStatus: 'recebido' });
  assert.equal((await db.doc('messageJobs/' + b.id + '__preparando').get()).exists, false);
  const c = (await service.createOrder(other, checkout({ phone: '88900000002' }))).order;
  await service.updateStatus(owner, { id: c.id, status: 'preparando', expectedStatus: 'recebido' });
  await db.doc('whatsappRecipients/' + digest(c.customer.phone)).set({ optedOut: true });
  const blocked = createWhatsApp({ db, config: () => config, clock: () => now, fetchImpl: async () => { throw new Error('Must not send'); } });
  await blocked.process(c.id + '__preparando');
  assert.equal((await db.doc('messageJobs/' + c.id + '__preparando').get()).data().state, 'no-consent');
});
test('ambiguous network failure is not retried; explicit rate rejection is scheduled', async () => {
  const c = (await service.createOrder({ uid: 'network-case' }, checkout({ phone: '88900000003' }))).order;
  await service.updateStatus(owner, { id: c.id, status: 'preparando', expectedStatus: 'recebido' });
  let calls = 0;
  const ambiguous = createWhatsApp({ db, config: () => config, clock: () => now, fetchImpl: async () => { calls++; throw new Error('Timeout'); } });
  await ambiguous.process(c.id + '__preparando'); await ambiguous.process(c.id + '__preparando');
  assert.equal(calls, 1); assert.equal((await db.doc('messageJobs/' + c.id + '__preparando').get()).data().state, 'unknown');
  await service.updateStatus(owner, { id: c.id, status: 'entrega', expectedStatus: 'preparando' });
  const limited = createWhatsApp({ db, config: () => config, clock: () => now, fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: { code: 130429 } }) }) });
  await limited.process(c.id + '__entrega');
  const job = (await db.doc('messageJobs/' + c.id + '__entrega').get()).data();
  assert.equal(job.state, 'retry'); assert.equal(job.attempts, 1); assert.ok(job.nextAttemptAt > now);
});
test('gift claims and cancellation keep server loyalty consistent', async () => {
  const uid = 'loyal-customer';
  await db.doc('customers/' + uid).set({ id: uid, loyalty: { version: 2, qualifying: 10, redeemed: 0, reserved: 0 } });
  const input = checkout({ lines: [{ productId: '500', extras: ['ninho'], qty: 1, reward: true }] });
  const gift = (await service.createOrder({ uid }, input)).order;
  assert.equal(gift.total, 0); assert.equal(gift.reward, true);
  await assert.rejects(service.createOrder({ uid }, { ...input, requestKey: crypto.randomUUID() }), /aguardando/);
  await service.updateStatus(owner, { id: gift.id, status: 'cancelado', expectedStatus: 'recebido' });
  assert.equal((await db.doc('customers/' + uid).get()).data().loyalty.redeemed, 0);
});
