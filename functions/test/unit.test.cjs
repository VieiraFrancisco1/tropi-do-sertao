'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { sanitizeCheckout, phone, verifySignature, templatePayload, deliveryProgress, loyalty, requireUser } = require('../lib/domain.cjs');
const fixture = () => ({ requestKey: 'request-key-unit-001', name: 'Cliente de teste', phone: '88900000001', payment: 'Pix', delivery: 'Retirada', lines: [{ productId: 'combo-tropi', comboJuiceId: 'suco-maracuja', extras: [], qty: 1, reward: false }], total: 1 });
test('backend recalculates combo price and ignores forged totals', () => {
  const actual = sanitizeCheckout(fixture());
  assert.equal(actual.total, 1700); assert.equal(actual.lines[0].unitPrice, 1700);
  assert.match(actual.lines[0].label, /maracujá/);
});
test('invalid catalog, duplicate extras, quantity and missing combo juice are rejected', () => {
  for (const line of [
    { productId: 'inventado', extras: [], qty: 1 },
    { productId: '300', extras: ['ninho', 'ninho'], qty: 1 },
    { productId: '300', extras: [], qty: 99 },
    { productId: 'combo-tropi', extras: [], qty: 1 }
  ]) assert.throws(() => sanitizeCheckout({ ...fixture(), lines: [line] }), /inválido/);
});
test('taxas por bairro são calculadas no servidor, sem confiar no preço do navegador', () => {
 const base=fixture();
 const centro=sanitizeCheckout({...base,delivery:'Entrega',neighborhood:'Centro',address:'Rua Centro, 10'});
 const floresta=sanitizeCheckout({...base,delivery:'Entrega',neighborhood:'Floresta',address:'Rua Floresta, 2'});
 const anafue=sanitizeCheckout({...base,delivery:'Entrega',neighborhood:'Anafuê',address:'Rua Anafuê, 3'});
 assert.equal(centro.deliveryFee,0);
 assert.equal(floresta.deliveryFee,500);
 assert.equal(anafue.deliveryFee,600);
 assert.equal(floresta.payableTotal,floresta.total+500);
 assert.throws(()=>sanitizeCheckout({...base,delivery:'Entrega',address:'Rua A, 10',neighborhood:'Bairro Inexistente'}),/bairro/);
 assert.throws(()=>sanitizeCheckout({...base,delivery:'Entrega',address:'Rua B, 20',neighborhood:'Floresta',payment:'Dinheiro',change:base.total}),/troco/);
});
test('delivery address, payment, phone and change validated on server', () => {
  assert.throws(() => sanitizeCheckout({ ...fixture(), delivery: 'Entrega' }), /endereço/);
  assert.throws(() => sanitizeCheckout({ ...fixture(), payment: 'fraude' }), /pagamento/);
  assert.throws(() => sanitizeCheckout({ ...fixture(), phone: '' }), /telefone/);
  assert.throws(() => sanitizeCheckout({ ...fixture(), payment: 'Dinheiro', change: 100 }), /troco/);
  assert.equal(phone('+55 (88) 90000-0001'), '5588900000001');
});
test('opt-in is explicit, rather than inferred from a phone number', () => {
  assert.equal(sanitizeCheckout(fixture()).whatsappOptIn, false);
  assert.equal(sanitizeCheckout({ ...fixture(), whatsappOptIn: 'true' }).whatsappOptIn, false);
  assert.equal(sanitizeCheckout({ ...fixture(), whatsappOptIn: true }).whatsappOptIn, true);
});
test('loyalty consumes one previously earned gift', () => {
  assert.equal(loyalty({ qualifying: 10, redeemed: 0 }).available, 1);
  assert.equal(loyalty({ qualifying: 10, redeemed: 1 }).available, 0);
  assert.equal(loyalty({ qualifying: 10, redeemed: 0, reserved: 1 }).available, 0);
  assert.equal(loyalty({ qualifying: 10, redeemed: 0, reserved: 1 }).stamps, 10);
});
test('administrative role must be an actual server boolean', () => {
  assert.throws(() => requireUser({ uid: 'customer', admin: 'true' }, true), /exclusiva/);
  assert.throws(() => requireUser(null), /conta/);
  requireUser({ uid: 'owner', admin: true }, true);
});
test('webhook validates exact raw bytes and rejects tampering', () => {
  const raw = Buffer.from('{"entry":[]}'), secret = 'local-test-app-secret';
  const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(verifySignature(raw, signature, secret), true);
  assert.equal(verifySignature(Buffer.from('{"entry":[1]}'), signature, secret), false);
  assert.equal(verifySignature(raw, signature, ''), false);
  assert.equal(verifySignature(raw, 'bad', secret), false);
});
test('template payload matches two utility templates and two body parameters', () => {
  const config = { preparoTemplate: 'tropi_pedido_em_preparo', entregaTemplate: 'tropi_pedido_saiu_entrega', language: 'pt_BR' };
  const job = { id: 'TROPI-001__preparando', orderId: 'TROPI-001', status: 'preparando', phone: '88900000001', customerName: 'Cliente de teste' };
  const payload = templatePayload(job, config);
  assert.equal(payload.type, 'template'); assert.equal(payload.template.name, config.preparoTemplate);
  assert.deepEqual(payload.template.components[0].parameters.map(p => p.text), ['Cliente', 'TROPI-001']);
  assert.equal(templatePayload({ ...job, status: 'entrega' }, config).template.name, config.entregaTemplate);
  assert.throws(() => templatePayload({ ...job, status: 'concluido' }, config), /modelo/);
});
test('late webhooks cannot downgrade read or delivered to sent/failed', () => {
  assert.equal(deliveryProgress('read', 'sent'), 'read');
  assert.equal(deliveryProgress('delivered', 'failed'), 'delivered');
  assert.equal(deliveryProgress('sent', 'delivered'), 'delivered');
});
