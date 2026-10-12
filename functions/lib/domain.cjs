'use strict';
const crypto = require('node:crypto');
const R = require('./catalog.cjs');
class AppError extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (code, message) => { throw new AppError(code, message); };
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function requireUser(user, admin = false) {
  if (!user || typeof user.uid !== 'string' || !user.uid) fail('unauthenticated', 'Entre na sua conta para continuar.');
  if (admin && user.admin !== true) fail('permission-denied', 'Esta ação é exclusiva do dono da loja.');
}
function key(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(value)) fail('invalid-argument', 'A identificação da solicitação é inválida.');
  return value;
}
function orderId(value) {
  if (typeof value !== 'string' || !/^TROPI-\d{3,12}$/.test(value)) fail('invalid-argument', 'Pedido inválido.');
  return value;
}
const text = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : '';
function phone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  if (!/^55[1-9]\d\d{8,9}$/.test(digits)) fail('invalid-argument', 'Informe um telefone válido com DDD.');
  return digits;
}
function sanitizeCheckout(input) {
  if (!input || !Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 40) fail('invalid-argument', 'Revise os itens da sacola.');
  const lines = input.lines.map(l => ({
    productId: text(l?.productId, 60), extras: Array.isArray(l?.extras) ? [...l.extras] : [],
    comboJuiceId: text(l?.comboJuiceId, 60), qty: l?.qty, reward: l?.reward === true, notes: text(l?.notes, 240)
  }));
  if (!lines.every(R.validLine)) fail('invalid-argument', 'Há um item ou adicional inválido.');
  const name = text(input.name, 60);
  if (!name) fail('invalid-argument', 'Informe seu nome.');
  if (!['Pix', 'Cartão', 'Dinheiro'].includes(input.payment)) fail('invalid-argument', 'Escolha uma forma de pagamento.');
  if (!['Entrega', 'Retirada'].includes(input.delivery)) fail('invalid-argument', 'Escolha entrega ou retirada.');
  const address = input.delivery === 'Entrega' ? text(input.address, 180) : '';
  if (input.delivery === 'Entrega' && !address) fail('invalid-argument', 'Informe o endereço de entrega.');
  const total = R.cartTotal(lines);
  const neighborhood = input.delivery === 'Entrega' ? text(input.neighborhood,60) : '';
  const deliveryFee = input.delivery === 'Entrega' ? R.deliveryFeeCents(neighborhood) : 0;
  if (deliveryFee === null) fail('invalid-argument', 'Escolha um bairro válido para entrega.');
  const payableTotal = total + deliveryFee;
  const cardType = input.payment === 'Cartão' && ['Débito','Crédito'].includes(input.cardType) ? input.cardType : '';
  const change = input.payment === 'Dinheiro' ? (input.change || 0) : 0;
  if (!Number.isSafeInteger(change) || change < 0 || change > 999999999 || change && change < payableTotal) fail('invalid-argument', 'Revise o valor para troco.');
  return {
    requestKey: key(input.requestKey), name, phone: phone(input.phone),
    payment: input.payment, cardType, delivery: input.delivery, neighborhood, deliveryFee, payableTotal, address,
    reference: input.delivery === 'Entrega' ? text(input.reference, 120) : '', change,
    whatsappOptIn: input.whatsappOptIn === true, total,
    lines: lines.map(l => ({ ...l, label: R.lineLabel(l), unitPrice: R.unitPrice(l), subtotal: R.unitPrice(l) * l.qty })),
    reward: lines.every(l => l.reward), redeemsReward: lines.some(l => l.reward)
  };
}
function loyalty(counts = {}) {
  const qualifying = Math.max(0, counts.qualifying || 0), redeemed = Math.max(0, counts.redeemed || 0), reserved = Math.max(0,counts.reserved||0);
  const earned = Math.floor(qualifying / 10), available = Math.max(0, earned - redeemed - reserved), rest = qualifying % 10;
  return { version:2,qualifying, redeemed, reserved, earned, available, stamps: rest === 0 && earned>redeemed ? 10 : rest, remaining: 10 - rest };
}
function verifySignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || !secret || !/^sha256=[0-9a-f]{64}$/i.test(signature || '')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}
function templatePayload(job, config) {
  const name = job.status === 'preparando' ? config.preparoTemplate : job.status === 'entrega' ? config.entregaTemplate : '';
  if (!name || !/^[a-z0-9_]+$/.test(name)) fail('failed-precondition', 'Configure o modelo de mensagem aprovado.');
  return {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: phone(job.phone), type: 'template',
    biz_opaque_callback_data: job.id,
    template: { name, language: { code: config.language || 'pt_BR' }, components: [{ type: 'body', parameters: [
      { type: 'text', text: text(job.customerName, 60).split(/\s+/)[0] || 'Cliente' },
      { type: 'text', text: orderId(job.orderId) }
    ] }] }
  };
}
function deliveryProgress(oldState, newState) {
  const rank = { accepted: 0, sent: 1, delivered: 2, read: 3 };
  if (newState === 'failed') return ['delivered', 'read'].includes(oldState) ? oldState : 'failed';
  if (!Object.hasOwn(rank, newState)) return oldState;
  return (rank[newState] >= (rank[oldState] ?? -1)) ? newState : oldState;
}
module.exports = { R, AppError, fail, digest, requireUser, key, orderId, text, phone, sanitizeCheckout, loyalty, verifySignature, templatePayload, deliveryProgress };
