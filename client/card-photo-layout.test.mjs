import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../style.css',import.meta.url),'utf8');
test('foto unica e nitida por produto e adicional, sem segunda imagem desfocada',()=>{
  assert.ok(app.includes('<img class="photo-main"'));
  assert.equal(app.includes('class="photo-backdrop"'),false);
});
test('cards das saladas usam foto em largura total com altura responsiva',()=>{
  assert.match(css,/CARD PHOTOS V2/);
  assert.match(css,/\.product-photo img\.photo-main\s*\{[^}]*object-fit:cover/);
  assert.match(css,/\.product-photo\s*\{[^}]*aspect-ratio:4 \/ 5/);
  assert.match(css,/\.product-photo \.size-badge\s*\{[^}]*z-index:2/);
});
test('iogurtes altos preservam rótulos inteiros',()=>{
  assert.match(css,/\.extra-card\[data-extra\^="iogurte"\].*?\{[^}]*object-fit:contain/);
});
