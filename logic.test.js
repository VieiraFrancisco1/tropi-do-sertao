'use strict';
const assert = require('node:assert/strict');
require('./logic.js');
const R = globalThis.TropiRules;
const line = {productId:'500', extras:['ninho','morango'], qty:2, reward:false};
assert.equal(R.unitPrice(line),1900);
assert.equal(R.cartTotal([line]),3800);
const paid = (id, extra={}) => ({id, customer:{id:'cliente'}, total:1200, status:'concluido', reward:false, ...extra});
const ten = Array.from({length:10},(_,i)=>paid(String(i)));
assert.deepEqual(R.loyaltyState(ten,'cliente'),{qualifying:10,redeemed:0,reserved:0,earned:1,available:1,stamps:10,remaining:10});
assert.equal(R.loyaltyState(ten.map(o=>({...o,status:'recebido'})),'cliente').qualifying,0);
assert.equal(R.loyaltyState(ten.map(o=>({...o,status:'preparando'})),'cliente').qualifying,0);
assert.equal(R.loyaltyState([...ten,ten[0]],'cliente').qualifying,10);
assert.equal(R.loyaltyState([...ten,paid('outro',{customer:{id:'outra'}})],'cliente').qualifying,10);
const gift = paid('presente',{total:0,reward:true,redeemsReward:true});
assert.equal(R.loyaltyState([...ten,gift],'cliente').available,0);
assert.equal(R.loyaltyState([...ten,gift],'cliente').stamps,0);
assert.equal(R.loyaltyState([...ten,{...gift,status:'cancelado'}],'cliente').available,1);
const mixed = paid('misto',{redeemsReward:true});
const mixedState = R.loyaltyState([...ten,mixed],'cliente');
assert.equal(mixedState.qualifying,11);
assert.equal(mixedState.redeemed,1);
assert.equal(mixedState.available,0);
assert.equal(mixedState.stamps,1);
assert.equal(R.loyaltyState(ten.map((o,i)=>i===0?{...o,status:'cancelado'}:o),'cliente').available,0);
assert.equal(R.loyaltyState([...ten,...ten.map(o=>({...o,id:'b'+o.id})),gift],'cliente').available,1);
const reward = {productId:'500',qty:1,reward:true,extras:R.EXTRAS.slice(0,5).map(e=>e.id)};
assert.equal(R.unitPrice(reward),0);
assert.equal(R.validateCheckout([reward],{available:1}),'');
assert.ok(R.validateCheckout([reward],{available:0}));
assert.ok(R.validateCheckout([reward,{...reward}],{available:2}));
assert.equal(R.validLine({...reward,productId:'300'}),false);
assert.equal(R.validLine({...reward,qty:2}),false);
assert.equal(R.validLine({...reward,extras:R.EXTRAS.slice(0,6).map(e=>e.id)}),false);
assert.equal(R.validLine({...line,extras:['ninho','ninho']}),false);
assert.equal(R.validLine({...line,extras:['desconhecido']}),false);
assert.equal(R.validLine({...line,qty:21}),false);
assert.ok(R.validateCheckout([],{available:0}));
assert.equal(R.validateCheckout([line,reward],{available:1}),'');
assert.equal(R.validateCheckout([{productId:'300',extras:[],qty:1}],{available:0}),'');
console.log('Regras de preço, fidelidade, cancelamento e resgate: verificadas.');

// Fortaleza: 02:30 UTC still belongs to the preceding local day and month.
assert.equal(R.periodKey(Date.parse('2026-10-01T02:30:00Z')),'2026-09-30');
assert.equal(R.periodKey(Date.parse('2026-10-01T02:30:00Z'),'month'),'2026-09');
assert.equal(R.periodKey(Date.parse('2026-10-01T03:00:00Z')),'2026-10-01');
const operation=(id,status,total,when,delivery='Entrega')=>({id,status,total,date:Date.parse(when),delivery});
const samples=[
 operation('a','concluido',1200,'2026-10-06T12:00:00Z'),
 operation('b','concluido',1000,'2026-10-06T13:00:00Z'),
 operation('c','preparando',900,'2026-10-06T14:00:00Z'),
 operation('d','entrega',1600,'2026-10-06T14:30:00Z'),
 operation('e','cancelado',600,'2026-10-06T15:00:00Z'),
 operation('f','concluido',2000,'2026-10-05T15:00:00Z'),
 operation('g','concluido',3000,'2026-10-01T02:30:00Z'),
 operation('h','recebido',600,'2026-10-06T15:30:00Z')
];
const daily=R.orderReport([...samples,samples[0]],{value:'2026-10-06'});
assert.equal(daily.totalCount,6);assert.equal(daily.completedCount,2);assert.equal(daily.totalCents,2200);assert.equal(daily.activeCount,3);assert.equal(daily.canceledCount,1);assert.equal(daily.ticketCents,1100);
assert.equal(R.orderReport(samples,{period:'month',value:'2026-10'}).totalCents,4200);
assert.equal(R.orderReport(samples,{period:'month',value:'2026-09'}).totalCents,3000);
assert.equal(R.orderReport(samples,{value:'2026-10-07'}).ticketCents,0);
const delivery=operation('delivery','recebido',1600,'2026-10-06T12:00:00Z');
assert.equal(R.canTransition(delivery,'concluido'),true);
for(const expected of ['preparando','entrega','concluido']){
 assert.equal(R.nextStatus(delivery),expected);assert.equal(R.canTransition(delivery,expected),true);delivery.status=expected;
}
assert.equal(R.nextStatus(delivery),null);assert.equal(R.canTransition(delivery,'preparando'),false);
assert.equal(R.nextStatus({...delivery,status:'preparando',delivery:'Retirada'}),'concluido');
assert.equal(R.canTransition({...delivery,status:'entrega'},'cancelado'),true);
assert.equal(R.canTransition({...delivery,status:'cancelado'},'concluido'),false);
console.log('Relatórios, períodos em Fortaleza e etapas de entrega/retirada: verificados.');

// Weeks span Monday through Sunday in Fortaleza, including year boundaries.
assert.deepEqual(R.periodBounds('2026-01-01','week'),{start:'2025-12-29',end:'2026-01-04'});
assert.deepEqual(R.periodBounds('2026-10-11','week'),{start:'2026-10-05',end:'2026-10-11'});
assert.deepEqual(R.periodBounds('2024-02','month'),{start:'2024-02-01',end:'2024-02-29'});
assert.equal(R.periodBounds('2026-02-30','week'),null);
assert.equal(R.periodBounds('2026-13','month'),null);
assert.equal(R.orderReport(samples,{period:'week',value:'2026-10-06'}).totalCents,4200);
const weekBoundary=[
 operation('sunday','concluido',600,'2026-10-12T02:59:59Z'),
 operation('monday','concluido',1200,'2026-10-12T03:00:00Z')
];
assert.equal(R.orderReport(weekBoundary,{period:'week',value:'2026-10-09'}).totalCents,600);
assert.equal(R.orderReport(weekBoundary,{period:'week',value:'2026-10-12'}).totalCents,1200);
const ranked=R.orderReport([
 {...samples[0],payment:'Pix',lines:[{productId:'500',qty:2,extras:['ninho'],reward:false}]},
 {...samples[1],payment:'Cartão',lines:[{productId:'300',qty:1,extras:[],reward:false}]},
 {...samples[2],payment:'Dinheiro',lines:[{productId:'300',qty:20,extras:[],reward:false}]},
 operation('gift','concluido',0,'2026-10-06T12:30:00Z')
],{value:'2026-10-06'});
assert.deepEqual(ranked.bestSellers.map(p=>[p.id,p.qty]),[['500',2],['300',1]]);
assert.equal(ranked.topExtras[0].qty,2);
assert.deepEqual(ranked.payments,{Dinheiro:0,Pix:1200,'Cartão':1000,Outros:0});

// Cash uses integer cents and records each finalized order only once.
assert.equal(R.parseMoney('100,05'),10005);
assert.equal(R.parseMoney('100.5'),10050);
assert.equal(R.parseMoney('0'),0);
for(const invalid of ['','-1','1,234','1.000,00','abc','Infinity'])assert.equal(R.parseMoney(invalid),null);
const at=Date.parse('2026-10-09T12:00:00Z');
const session=R.openCashSession([],{id:'caixa-1',at,openingCents:10000});
assert.ok(session);
assert.equal(R.openCashSession([session],{id:'caixa-2',at,openingCents:0}),null);
let sessions=[session];
const cashOrder={id:'cash-order',status:'concluido',total:1600,payment:'Dinheiro'};
assert.equal(R.bookCashSale(sessions,{...cashOrder,status:'recebido'},at),sessions);
assert.equal(R.bookCashSale(sessions,cashOrder,at-1),sessions);
sessions=R.bookCashSale(sessions,cashOrder,at+1);
assert.equal(R.bookCashSale(sessions,cashOrder,at+2),sessions);
sessions=R.bookCashSale(sessions,{...cashOrder,id:'pix-order',total:1200,payment:'Pix'},at+3);
sessions=R.bookCashSale(sessions,{...cashOrder,id:'card-order',total:900,payment:'Cartão'},at+4);
let changed=R.cashMovement(sessions[0],{id:'entry-1',type:'entry',amountCents:2000,reason:'Troco',at:at+5});
assert.ok(changed);
changed=R.cashMovement(changed,{id:'withdrawal-1',type:'withdrawal',amountCents:500,reason:'Retirada',at:at+6});
assert.ok(changed);
let summary=R.cashSummary(changed);
assert.equal(summary.expectedCents,13100);
assert.equal(summary.totalSalesCents,3700);
assert.equal(summary.salesCount,3);
assert.deepEqual(summary.payments,{Dinheiro:1600,Pix:1200,'Cartão':900,Outros:0});
assert.equal(R.cashMovement(changed,{id:'withdrawal-2',type:'withdrawal',amountCents:13101,reason:'Retirada',at:at+7}),null);
assert.equal(R.cashMovement(changed,{id:'entry-1',type:'entry',amountCents:100,reason:'Duplicada',at:at+7}),null);
assert.equal(R.closeCashSession(changed,{countedCents:13000,at:at+5}),null);
const closed=R.closeCashSession(changed,{countedCents:13000,at:at+8});
assert.equal(closed.differenceCents,-100);
assert.equal(closed.expectedCents,13100);
assert.equal(R.cashMovement(closed,{id:'entry-2',type:'entry',amountCents:100,reason:'Após fechar',at:at+9}),null);
assert.equal(R.closeCashSession(closed,{countedCents:0,at:at+9}),null);
const closedSessions=[closed];
assert.equal(R.bookCashSale(closedSessions,{...cashOrder,id:'late'},at+9),closedSessions);
const next=R.openCashSession(closedSessions,{id:'caixa-2',at:at+10,openingCents:0});
const all=[next,closed];
assert.equal(R.bookCashSale(all,cashOrder,at+11),all);
assert.equal(R.cashSummary(closed).expectedCents,13100);
assert.equal(R.cashSummary(next).expectedCents,0);
console.log('Relatório semanal, ranking, abertura, movimentos e fechamento de caixa: verificados.');

const sandwich={productId:'sanduiche-natural',extras:[],qty:1,reward:false};
assert.equal(R.unitPrice(sandwich),700);
for(const juice of R.JUICES){
 const single={productId:juice.id,extras:[],qty:1,reward:false};
 assert.equal(R.validLine(single),true);assert.equal(R.unitPrice(single),700);
 const combo={productId:'combo-tropi',comboJuiceId:juice.id,extras:[],qty:2,reward:false};
 assert.equal(R.validLine(combo),true);assert.equal(R.unitPrice(combo),1700);assert.equal(R.cartTotal([combo]),3400);
 assert.ok(R.lineDescription(combo).includes(juice.name));assert.ok(R.lineLabel(combo).includes('145 ml'));
}
const kit={productId:'combo-tropi',comboJuiceId:'suco-abacaxi-hortela',extras:[],qty:1,reward:false};
assert.equal(R.validLine({...kit,comboJuiceId:''}),false);
assert.equal(R.validLine({...kit,comboJuiceId:'sanduiche-natural'}),false);
assert.equal(R.validLine({...kit,extras:['ninho']}),false);
assert.equal(R.validLine({...kit,reward:true}),false);
assert.equal(R.validLine({...sandwich,extras:['ninho']}),false);
assert.equal(R.validLine({...sandwich,reward:true}),false);
assert.equal(R.validLine({...sandwich,comboJuiceId:'suco-laranja'}),false);
assert.equal(R.cartTotal([sandwich,{productId:'suco-laranja',extras:[],qty:1},kit]),3100);
assert.equal(R.validateCheckout([sandwich,kit],{available:0}),'');
const newOrder={id:'new-items',status:'concluido',payment:'Pix',total:3100,date:at,lines:[sandwich,{productId:'suco-laranja',extras:[],qty:1},kit]};
const newReport=R.orderReport([newOrder],{value:'2026-10-09'});
assert.equal(newReport.totalCents,3100);
assert.equal(newReport.bestSellers.length,3);
assert.ok(newReport.bestSellers.some(p=>p.id==='combo-tropi'&&p.name==='Combo Tropi Lanche'));
assert.ok(newReport.bestSellers.every(p=>!p.name.includes('undefined')));
assert.equal(R.loyaltyState([{...newOrder,customer:{id:'cliente'}}],'cliente').qualifying,1);
console.log('Sanduíche, três sucos, combo com sabor obrigatório, preços fixos, ranking e fidelidade: verificados.');

const orderWithDeliveryFee={id:'TROPI-fee',date:Date.parse('2026-10-11T14:00:00-03:00'),status:'concluido',total:600,payableTotal:1100,deliveryFee:500,payment:'Pix',lines:[{productId:'300',qty:1,extras:[],reward:false}],customer:{id:'cliente'}};
const reportWithFee=R.orderReport([orderWithDeliveryFee],{period:'day',value:'2026-10-11'});
assert.equal(reportWithFee.totalCents,1100);
assert.equal(reportWithFee.payments.Pix,1100);
