import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const begin = app.indexOf('function whatsappOrderUrl(order){');
const end = app.indexOf('\nfunction beginWhatsAppHandoff()', begin);
assert.ok(begin >= 0 && end > begin, 'Função de WhatsApp não encontrada');
const money = n => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(n/100);
const makeUrl = new Function('money', 'STORE_WHATSAPP_NUMBER', app.slice(begin, end) + ';return whatsappOrderUrl;')(money, '5588996862960');

test('cria link da loja com mensagem completa, pedido e entrega', () => {
 const order = { id:'TROPI-123', customer:{name:'Maria',phone:'5588999999999'},
   lines:[{label:'2× Salada + ninho',subtotal:2400,notes:'Sem banana'}],
   total:2400, delivery:'Entrega', address:'Rua A, 10',reference:'Casa azul',payment:'Dinheiro',change:3000 };
 const url = new URL(makeUrl(order));
 const message = url.searchParams.get('text');
 assert.equal(url.origin,'https://wa.me');
 assert.equal(url.pathname,'/5588996862960');
 for(const phrase of ['TROPI-123','Maria','5588999999999','Salada + ninho','Sem banana','Rua A, 10','Casa azul','Dinheiro','R$\\u00a024,00','R$\\u00a030,00'])assert.ok(message.includes(phrase), phrase);
 assert.ok(message.includes('\\nItens do pedido:') === false);
 assert.ok(message.includes('\\n*Itens do pedido:*'));
 assert.equal(message.includes('\\\\n'), false, 'Não usar barra + n literal em vez de quebra de linha');
});

test('retirada não inclui endereço nem troco', () => {
 const order = { id:'TROPI-124', customer:{name:'João',phone:'5588998888888'},
   lines:[{label:'1× Suco',subtotal:700,notes:''}],
   total:700, delivery:'Retirada',address:'',reference:'',payment:'Pix',change:0 };
 const message = new URL(makeUrl(order)).searchParams.get('text');
 assert.ok(message.includes('Retirada'));
 assert.ok(!message.includes('Endereço:'));
 assert.ok(!message.includes('Troco para:'));
});
