import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../logic.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const begin = app.indexOf('function storePix(){');
const end = app.indexOf('\nfunction finishWhatsAppHandoff(', begin);
assert.ok(begin >= 0 && end > begin, 'Função de WhatsApp não encontrada');
const money = n => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(n/100);
const R = globalThis.TropiRules;
const { makeUrl, pix } = new Function('money', 'STORE_WHATSAPP_NUMBER', 'ORDER_TRACKING_URL', 'R', 'window', app.slice(begin, end) + ';return {makeUrl:whatsappOrderUrl,pix:storePix};')(money, '5588996862960', 'https://tropidosertao.web.app/#pedidos', R, {TropiConfig:{}});

test('cria link da loja com mensagem completa, pedido e entrega', () => {
 const order = { id:'TROPI-123', customer:{name:'Maria',phone:'5588999999999'},
   date:Date.parse('2026-09-28T19:10:27Z'),status:'recebido',
   lines:[{qty:2,productId:'300',extras:['ninho'],subtotal:2400,notes:'Sem banana'}],
   total:2400, delivery:'Entrega', neighborhood:'Floresta',deliveryFee:500,payableTotal:2900,address:'Rua A, 10',reference:'Casa azul',payment:'Dinheiro',change:3000 };
 const url = new URL(makeUrl(order));
 const message = url.searchParams.get('text');
 assert.equal(url.origin,'https://wa.me');
 assert.equal(url.pathname,'/5588996862960');
 for(const phrase of ['TROPI-123','Maria','5588999999999','Salada de frutas','## Creme de Ninho x2','Sem banana','Rua A, 10','Casa azul','Floresta','*Entrega:*', 'Dinheiro',money(2400),money(2900),money(3000)])assert.ok(message.includes(phrase), phrase);
 assert.ok(message.includes('https://tropidosertao.web.app/#pedidos'));
 assert.match(message,/28\/09\/2026\s+16:10:27/);
 assert.ok(message.includes('*Status:* Recebido'));
 assert.equal(message.includes('aceito'), false);
 assert.ok(message.includes('*Itens (2):*'));
 assert.equal(message.includes('Chave Pix'), false, 'Dinheiro não deve incluir instruções Pix');
 assert.equal(message.includes(String.fromCharCode(92)+'n'), false, 'Não usar barra + n literal em vez de quebra de linha');
});

test('retirada inclui o endereço da loja e a chave Pix fornecida', () => {
 const order = { id:'TROPI-124', customer:{name:'João',phone:'5588998888888'},
   lines:[{qty:1,productId:'suco-laranja',extras:[],subtotal:700,notes:''}],
   total:700, delivery:'Retirada',address:'',reference:'',payment:'Pix',change:0 };
 const message = new URL(makeUrl(order)).searchParams.get('text');
 assert.ok(message.includes('Retirada'));
 assert.ok(message.includes('*Endereço de retirada:* '+R.STORE.address));
 assert.equal(message.includes('*Endereço:*'), false);
 assert.equal(message.includes('*Entrega:*'), false);
 assert.equal(message.includes('Troco para'), false);
 assert.ok(message.includes('64.701.245/0001-29'));
 assert.ok(message.includes('Ana Kamille Rocha Santos Ferreira'));
});

test('Pix mostra o CNPJ formatado e copia somente os dígitos corretos', () => {
 assert.deepEqual(pix(),{key:'64701245000129',display:'64.701.245/0001-29',holder:'Ana Kamille Rocha Santos Ferreira',type:'CNPJ'});
});

test('combo informa seus componentes e o suco escolhido uma vez', () => {
 const order={id:'TROPI-125',customer:{name:'Cliente',phone:'5588999999999'},lines:[{qty:1,productId:'combo-tropi',comboJuiceId:'suco-maracuja',extras:[],subtotal:1700}],total:1700,delivery:'Retirada',payment:'Cartão',cardType:'Crédito'};
 const message=new URL(makeUrl(order)).searchParams.get('text');
 for(const label of ['## Sanduíche natural x1','## Salada de frutas 145 ml x1','## Suco de maracujá · 300 ml x1','Cartão (Crédito)'])assert.ok(message.includes(label),label);
 assert.equal(message.includes('Chave Pix'),false);
});
