'use strict';
const { digest, phone, verifySignature, deliveryProgress } = require('./domain.cjs');
// Desde outubro/2026, a franquia de 1.000 cobre apenas mensagens de SERVIÇO
// (texto livre enviado até 24h após uma mensagem do cliente). Templates utility
// não fazem parte da franquia. Este emissor nunca envia templates pagos.
const SAFE_SERVICE_WINDOW_MS = 23 * 60 * 60 * 1000 + 45 * 60 * 1000;
function monthKey(at, timeZone = 'America/Fortaleza') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit'
  }).formatToParts(new Date(at));
  const field = type => parts.find(part => part.type === type)?.value;
  return field('year') + field('month');
}
function servicePayload(job) {
  const name = String(job.customerName || 'Cliente').trim().split(/\s+/)[0].slice(0, 60) || 'Cliente';
  const content = job.status === 'preparando'
    ? 'Seu pedido ' + job.orderId + ' foi aceito e entrou em preparação.'
    : job.status === 'entrega'
      ? 'Seu pedido ' + job.orderId + ' saiu para entrega!'
      : null;
  if (!content) throw new Error('Invalid order status for WhatsApp');
  return {
    messaging_product: 'whatsapp', recipient_type: 'individual',
    to: phone(job.phone), type: 'text', biz_opaque_callback_data: job.id,
    text: { preview_url: false, body: 'Olá, ' + name + '! ' + content + ' Acompanhe pelo site da Tropi do Sertão. Para não receber mais avisos, responda SAIR.' }
  };
}
function createWhatsApp({ db, config, fetchImpl = fetch, clock = Date.now }) {
  const jobRef = id => db.doc('messageJobs/' + id);
  const safeId = id => typeof id === 'string' && /^TROPI-\d{3,12}__(preparando|entrega)$/.test(id);
  async function finish(id, patch) {
    const ref = jobRef(id);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref); if (!snap.exists) return;
      const job = snap.data();
      if (patch.state !== 'accepted' && !['pending','retry','sending'].includes(job.state)) return;
      const orderRef = db.doc('orders/' + job.orderId), order = await tx.get(orderRef);
      const merged = { ...patch };
      // A signed delivery callback may arrive before the send response.
      // Preserve that authoritative delivery state when the worker finishes.
      if (job.webhookAt) { delete merged.state; delete merged.deliveryState; }
      tx.update(ref, { ...merged, updatedAt: clock() });
      if (order.exists) tx.update(orderRef, { ['notifications.' + job.status]: { state: job.webhookAt ? job.deliveryState : merged.deliveryState || merged.state || job.state, at: clock(), jobId: id } });
    });
  }
  async function process(id) {
    if (!safeId(id)) return;
    const cfg = config();
    if (!cfg.enabled) { await finish(id, { state: 'disabled' }); return; }
    // A project without a configured provider cannot send accidentally.
    if (!cfg.token || !/^\d+$/.test(cfg.phoneNumberId || '') || !/^v\d+\.0$/.test(cfg.version || '')) {
      await finish(id, { state: 'blocked', errorCode: 'provider-not-configured' }); return;
    }
    const ref = jobRef(id), at = clock();
    const job = await db.runTransaction(async tx => {
      const snap = await tx.get(ref); if (!snap.exists) return null;
      const current = snap.data();
      if (!['pending', 'retry'].includes(current.state) || current.nextAttemptAt > at) return null;
      const orderRef = db.doc('orders/' + current.orderId);
      const quotaRef = db.doc('whatsappMonthlyQuota/' + monthKey(at, cfg.billingTimeZone));
      const [recipient, order, quota] = await Promise.all([
        tx.get(db.doc('whatsappRecipients/' + digest(current.phone))),
        tx.get(orderRef),
        tx.get(quotaRef)
      ]);
      const o = order.data();
      let skipped = '';
      if (!o?.whatsappConsent?.granted || recipient.data()?.optedOut) skipped = 'no-consent';
      else if (o.status !== current.status) skipped = 'superseded';
      else if (current.attempts >= 5) skipped = 'failed';
      const inboundAt = Number(recipient.data()?.lastInboundAt || 0);
      const openWindow = inboundAt > 0 && at >= inboundAt && at - inboundAt < SAFE_SERVICE_WINDOW_MS;
      if (!skipped && !openWindow) {
        // Aguarda o webhook da mensagem do pedido por alguns minutos. A loja
        // pode atualizar o status antes de a Meta entregar esse webhook.
        if (at - current.createdAt < 10 * 60 * 1000) {
          tx.update(ref, { state: 'retry', nextAttemptAt: at + 120000, updatedAt: at });
          if (order.exists) tx.update(orderRef, {
            ['notifications.' + current.status]: { state: 'waiting-for-customer', at, jobId: id }
          });
          return null;
        }
        skipped = 'outside-window';
      }
      const reserved = Math.max(0, Number(quota.data()?.reserved || 0));
      if (!skipped && reserved >= (cfg.monthlyCap || 1000)) skipped = 'quota-reached';
      if (skipped) {
        tx.update(ref, { state: skipped, updatedAt: at });
        if (order.exists) tx.update(orderRef, { ['notifications.' + current.status]: { state: skipped, at, jobId: id } });
        return null;
      }
      const attempts = current.attempts + 1;
      // Reserva uma vaga de forma transacional ANTES de chamar a Meta.
      // Reservas contam tentativas, mesmo se forem rejeitadas: conservador
      // para evitar ultrapassar o limite gratuito em falhas/reenvios.
      tx.set(quotaRef, { reserved: reserved + 1, phoneNumberId: cfg.phoneNumberId, updatedAt: at }, { merge: true });
      tx.update(ref, { state: 'sending', attempts, leaseUntil: at + 90000, updatedAt: at });
      return { ...current, attempts };
    });
    if (!job) return;
    let payload;
    try { payload = servicePayload(job); }
    catch { await finish(id, { state: 'blocked', errorCode: 'invalid-service-message' }); return; }
    let response, body;
    try {
      response = await fetchImpl('https://graph.facebook.com/' + cfg.version + '/' + cfg.phoneNumberId + '/messages', {
        method: 'POST', headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(15000)
      });
      body = await response.json();
    } catch {
      // A timeout may occur AFTER Meta accepts a message. Do not resend blindly.
      await finish(id, { state: 'unknown', errorCode: 'ambiguous-network-result' }); return;
    }
    const messageId = body?.messages?.[0]?.id;
    if (response.ok && typeof messageId === 'string' && messageId.length <= 300) {
      await db.doc('whatsappMessageMap/' + digest(messageId)).set({ jobId: id, messageId, createdAt: clock() });
      await finish(id, { state: 'accepted', messageId, deliveryState: 'accepted', acceptedAt: clock() });
      return;
    }
    if (response.ok) { await finish(id, { state: 'unknown', errorCode: 'accepted-without-message-id' }); return; }
    const code = Number(body?.error?.code) || response.status;
    // Retry only explicit rejections. No timeout/transport or HTTP 5xx retries.
    const retryable = response.status === 429 && body?.error || [130429, 131056].includes(code);
    await finish(id, { state: retryable && job.attempts < 5 ? 'retry' : 'failed', errorCode: String(code), nextAttemptAt: clock() + Math.min(3600000, 60000 * 2 ** job.attempts) });
  }
  async function retryDue() {
    const at = clock();
    const expired = await db.collection('messageJobs').where('state', '==', 'sending').where('leaseUntil', '<=', at).limit(20).get();
    for (const doc of expired.docs) await finish(doc.id, { state: 'unknown', errorCode: 'expired-send-lease' });
    for (const state of ['pending', 'retry']) {
      const due = await db.collection('messageJobs').where('state', '==', state).where('nextAttemptAt', '<=', at).limit(20).get();
      for (const doc of due.docs) await process(doc.id);
    }
  }
  async function webhook({ rawBody, signature, body }) {
    const cfg = config();
    if (!verifySignature(rawBody, signature, cfg.appSecret)) return { status: 401 };
    if (body?.object !== 'whatsapp_business_account') return { status: 200 };
    for (const entry of body.entry || []) {
      if (!cfg.wabaId || String(entry.id) !== cfg.wabaId) continue;
      for (const change of entry.changes || []) {
        const value = change.value;
        if (String(value?.metadata?.phone_number_id) !== cfg.phoneNumberId) continue;
        for (const status of value?.statuses || []) {
          if (!['sent', 'delivered', 'read', 'failed'].includes(status.status) || typeof status.id !== 'string' || !status.id || status.id.length > 300) continue;
          let id = status.biz_opaque_callback_data;
          if (!safeId(id) && typeof status.id === 'string') {
            id = (await db.doc('whatsappMessageMap/' + digest(status.id)).get()).data()?.jobId;
          }
          if (!safeId(id)) continue;
          const ref = jobRef(id);
          await db.runTransaction(async tx => {
            const snap = await tx.get(ref); if (!snap.exists) return;
            const job = snap.data();
            if (job.messageId && job.messageId !== status.id) return;
            const orderRef = db.doc('orders/' + job.orderId), order = await tx.get(orderRef);
            const deliveryState = deliveryProgress(job.deliveryState, status.status);
            const at = clock();
            tx.update(ref, { state: deliveryState === 'failed' ? 'failed' : 'accepted', messageId: status.id, deliveryState, webhookAt: at, updatedAt: at });
            if (order.exists) tx.update(orderRef, { ['notifications.' + job.status]: { state: deliveryState, at, jobId: id } });
          });
        }
        for (const message of value?.messages || []) {
          let number; try { number = phone(message.from); } catch { continue; }
          const at = clock();
          const inboundAt = Number(message.timestamp) * 1000;
          // A assinatura do webhook foi validada; aceitamos o horário da Meta,
          // mas não estendemos a janela com webhooks antigos/repetidos.
          if (!Number.isFinite(inboundAt) || inboundAt > at + 60000 || inboundAt < at - 2 * 86400000) continue;
          const stop = message.type === 'text' && /^\s*(SAIR|PARAR|STOP)\s*$/i.test(message.text?.body || '');
          const recipientRef = db.doc('whatsappRecipients/' + digest(number));
          await db.runTransaction(async tx => {
            const previous = await tx.get(recipientRef);
            const lastInboundAt = Math.max(Number(previous.data()?.lastInboundAt || 0), Math.min(at, inboundAt));
            tx.set(recipientRef, {
              phone: number, lastInboundAt,
              ...(stop ? { optedOut: true, optedOutAt: at, source: 'whatsapp-keyword' } : {})
            }, { merge: true });
          });
        }
      }
    }
    return { status: 200 };
  }
  return { process, retryDue, webhook };
}
module.exports = { createWhatsApp };
