import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { normalizeBrazilPhone, phoneLoginAlias } from '../client/phone-login.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
test('telefone com DDD aceita máscara e prefixo +55', () => {
  assert.equal(normalizeBrazilPhone('(88) 99999-9999'), '88999999999');
  assert.equal(normalizeBrazilPhone('+55 (88) 99999-9999'), '88999999999');
});
test('identificador não expõe telefone no email interno', async () => {
  const a = await phoneLoginAlias('(88) 99999-9999');
  const b = await phoneLoginAlias('+55 88 99999-9999');
  assert.equal(a,b);
  assert.match(a, /^p[a-f0-9]{64}@login\.tropidosertao\.invalid$/);
  assert.ok(!a.includes('88999999999'));
});
test('telefones diferentes não colidem nos casos normais', async () => {
  assert.notEqual(await phoneLoginAlias('88999999999'), await phoneLoginAlias('85999999999'));
});
test('número sem DDD é recusado', () => {
  assert.throws(() => normalizeBrazilPhone('99999-9999'), /DDD/);
  assert.throws(() => normalizeBrazilPhone('11'), /DDD/);
});
