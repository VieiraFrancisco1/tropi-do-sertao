(function(root){
'use strict';
const PRODUCTS=[
 {id:'300',name:'Salada de frutas',size:'300 ml',price:600,kind:'salad',category:'saladas',image:'salada',description:'Banana, mamão, manga e uva.'},
 {id:'500',name:'Salada de frutas',size:'500 ml',price:1200,kind:'salad',category:'saladas',image:'salada',description:'Banana, mamão, manga e uva.'},
 {id:'sanduiche-natural',name:'Sanduíche natural',size:'',price:700,kind:'sandwich',category:'lanches',image:'sanduiche-natural',description:'Pão integral, frango desfiado e um toque cremoso.',ingredients:'Pão integral, frango desfiado, cenoura ralada, dueto, maionese, requeijão zero lactose e alface.'},
 {id:'suco-laranja',name:'Suco de laranja',size:'300 ml',price:700,kind:'juice',category:'sucos',image:'suco-laranja',description:'100% natural da fruta. Sem adição de açúcar.'},
 {id:'suco-abacaxi-hortela',name:'Abacaxi com hortelã',size:'300 ml',price:700,kind:'juice',category:'sucos',image:'suco-abacaxi-hortela',description:'Suco natural de abacaxi com hortelã. Sem adição de açúcar.'},
 {id:'suco-maracuja',name:'Suco de maracujá',size:'300 ml',price:700,kind:'juice',category:'sucos',image:'suco-maracuja',description:'100% natural da fruta. Sem adição de açúcar.'},
 {id:'combo-tropi',name:'Combo Tropi Lanche',size:'',price:1700,kind:'combo',category:'combos',image:'combo-tropi',description:'1 sanduíche natural + 1 suco de 300 ml + 1 salada de frutas de 145 ml.'}
];
const JUICES=PRODUCTS.filter(p=>p.kind==='juice');
const EXTRAS=[
{id:'ninho',name:'Creme de Ninho',price:400,category:'cremes',image:'ninho'},
{id:'morango-creme',name:'Creme de morango',price:400,category:'cremes',image:'morango-creme'},
{id:'maracuja',name:'Creme de maracujá',price:400,category:'cremes',image:'maracuja'},
{id:'morango',name:'Morango',price:300,category:'frutas',image:'morango'},
{id:'kiwi',name:'Kiwi',price:300,category:'frutas',image:'kiwi'},
{id:'iogurte-morango',name:'Iogurte grego de morango',price:200,category:'iogurtes',image:'iogurte-morango'},
{id:'iogurte-natural',name:'Iogurte natural',price:200,category:'iogurtes',image:'iogurte-natural'}
];
const product=id=>PRODUCTS.find(p=>p.id===id);
const extra=id=>EXTRAS.find(e=>e.id===id);
function validLine(l){
 const p=l&&product(l.productId);
 if(!p||!Array.isArray(l.extras)||l.extras.length>EXTRAS.length||new Set(l.extras).size!==l.extras.length||!l.extras.every(id=>extra(id))||!Number.isInteger(l.qty)||l.qty<1||l.qty>20)return false;
 if(l.reward)return l.productId==='500'&&l.qty===1&&l.extras.length<=5&&!l.comboJuiceId;
 if(p.kind!=='salad'&&l.extras.length)return false;
 return p.kind==='combo'?JUICES.some(j=>j.id===l.comboJuiceId):!l.comboJuiceId;
}
const unitPrice=l=>validLine(l)?(l.reward?0:product(l.productId).price+l.extras.reduce((n,id)=>n+extra(id).price,0)):0;
const cartTotal=lines=>lines.reduce((sum,l)=>sum+unitPrice(l)*l.qty,0);
const lineTitle=l=>{const p=product(l.productId);return p?p.name+(p.size?' · '+p.size:''):'';};
function lineDescription(l){
 const p=product(l.productId);if(!p)return '';
 if(p.kind==='combo'){const juice=product(l.comboJuiceId);return '1 sanduíche natural + '+(juice?juice.name+' (300 ml)':'1 suco de 300 ml')+' + 1 salada de frutas de 145 ml';}
 if(p.kind==='salad'&&l.extras.length)return l.extras.map(id=>extra(id)?.name||'').join(' + ');
 return p.description;
}
function lineLabel(l){
 const p=product(l.productId);return l.qty+'× '+lineTitle(l)+(p?.kind==='combo'?' · '+lineDescription(l):l.extras.length?' + '+lineDescription(l):'');
}
const STATUS_LABELS=Object.freeze({recebido:'Recebido',preparando:'Em preparo',entrega:'Saiu para entrega',concluido:'Finalizado',cancelado:'Cancelado'});
const nextStatus=o=>o.status==='recebido'?'preparando':o.status==='preparando'?(o.delivery==='Entrega'?'entrega':'concluido'):o.status==='entrega'?'concluido':null;
const canTransition=(o,status)=>!!o&&(status===nextStatus(o)||status==='cancelado'&&['recebido','preparando','entrega'].includes(o.status));
function periodKey(timestamp,period='day'){
  const value=new Date(timestamp);if(!Number.isFinite(value.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
  const part=type=>parts.find(p=>p.type===type).value;
  return part('year')+'-'+part('month')+(period==='month'?'':'-'+part('day'));
}
function periodBounds(value,period='day'){
  if(!['day','week','month'].includes(period)||typeof value!=='string')return null;
  const iso=period==='month'?value+'-01':value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null;
  const d=new Date(iso+'T12:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==iso)return null;
  if(period==='week')d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  const start=d.toISOString().slice(0,10);
  if(period==='week')d.setUTCDate(d.getUTCDate()+6);
  if(period==='month'){d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);}
  return {start,end:d.toISOString().slice(0,10)};
}
function orderReport(orders,{period='day',value}={}){
  const bounds=periodBounds(value,period),seen=new Set(),list=orders.filter(o=>{
    if(!bounds||!o||typeof o.id!=='string'||!Number.isFinite(o.date)||!Number.isSafeInteger(o.total)||o.total<0||!Object.hasOwn(STATUS_LABELS,o.status))return false;
    const day=periodKey(o.date);return day>=bounds.start&&day<=bounds.end&&!seen.has(o.id)&&seen.add(o.id);
  }).sort((a,b)=>b.date-a.date);
  const completed=list.filter(o=>o.status==='concluido'),totalCents=completed.reduce((sum,o)=>sum+o.total,0);
  const products=new Map(),extras=new Map(),payments={Dinheiro:0,Pix:0,'Cartão':0,Outros:0};
  for(const o of completed){
    payments[Object.hasOwn(payments,o.payment)?o.payment:'Outros']+=o.total;
    for(const l of Array.isArray(o.lines)?o.lines:[]){
      if(!validLine(l)||l.reward)continue;
      products.set(l.productId,(products.get(l.productId)||0)+l.qty);
      for(const id of l.extras)extras.set(id,(extras.get(id)||0)+l.qty);
    }
  }
  const ranking=(map,label)=>Array.from(map,([id,qty])=>({id,qty,name:label(id)})).sort((a,b)=>b.qty-a.qty||a.name.localeCompare(b.name,'pt-BR'));
  return {orders:list,bounds,payments,bestSellers:ranking(products,id=>{const p=product(id);return p.kind==='salad'?'Salada '+p.size:p.name+(p.size?' · '+p.size:'');}),topExtras:ranking(extras,id=>extra(id).name),totalCount:list.length,completedCount:completed.length,totalCents,ticketCents:completed.length?Math.round(totalCents/completed.length):0,activeCount:list.filter(o=>['recebido','preparando','entrega'].includes(o.status)).length,canceledCount:list.filter(o=>o.status==='cancelado').length};
}
const isCents=n=>Number.isSafeInteger(n)&&n>=0&&n<=999999999;
function parseMoney(value){
  const s=String(value??'').trim();if(!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(s))return null;
  const [whole,fraction='']=s.replace(',','.').split('.'),cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  return isCents(cents)?cents:null;
}
function openCashSession(sessions,{id,at,openingCents}){
  if(!id||sessions.some(s=>s.status==='open'||s.id===id)||!Number.isFinite(at)||!isCents(openingCents))return null;
  return {id,status:'open',openedAt:at,openingCents,entries:[]};
}
function cashSummary(session){
  const payments={Dinheiro:0,Pix:0,'Cartão':0,Outros:0};let entriesCents=0,withdrawalsCents=0,salesCount=0;
  for(const e of session.entries){
    if(e.type==='sale'){payments[Object.hasOwn(payments,e.payment)?e.payment:'Outros']+=e.amountCents;salesCount++;}
    if(e.type==='entry')entriesCents+=e.amountCents;
    if(e.type==='withdrawal')withdrawalsCents+=e.amountCents;
  }
  const totalSalesCents=Object.values(payments).reduce((sum,n)=>sum+n,0);
  return {payments,entriesCents,withdrawalsCents,salesCount,totalSalesCents,expectedCents:session.openingCents+payments.Dinheiro+entriesCents-withdrawalsCents};
}
function bookCashSale(sessions,order,at){
  if(!order||order.status!=='concluido'||!isCents(order.total)||!order.id||!Number.isFinite(at)||sessions.some(s=>s.entries.some(e=>e.orderId===order.id)))return sessions;
  const current=sessions.find(s=>s.status==='open');if(!current||at<current.openedAt)return sessions;
  const entry={id:'sale-'+order.id,type:'sale',orderId:order.id,at,amountCents:order.total,payment:order.payment,reason:order.id};
  return sessions.map(s=>s===current?{...s,entries:[...s.entries,entry]}:s);
}
function cashMovement(session,{id,type,amountCents,reason,at}){
  if(!session||session.status!=='open'||!id||session.entries.some(e=>e.id===id)||!['entry','withdrawal'].includes(type)||!isCents(amountCents)||amountCents===0||typeof reason!=='string'||!reason.trim()||!Number.isFinite(at)||at<session.openedAt)return null;
  if(type==='withdrawal'&&amountCents>cashSummary(session).expectedCents)return null;
  return {...session,entries:[...session.entries,{id,type,amountCents,reason:reason.trim().slice(0,120),at}]};
}
function closeCashSession(session,{countedCents,at}){
  if(!session||session.status!=='open'||!isCents(countedCents)||!Number.isFinite(at)||at<session.openedAt||session.entries.some(e=>e.at>at))return null;
  const expectedCents=cashSummary(session).expectedCents;
  return {...session,status:'closed',closedAt:at,countedCents,expectedCents,differenceCents:countedCents-expectedCents};
}
function loyaltyState(orders,customerId){
  const seen=new Set();
  const own=orders.filter(o=>o&&o.customer&&o.customer.id===customerId&&o.status!=='cancelado'&&!seen.has(o.id)&&seen.add(o.id));
  const qualifying=own.filter(o=>!o.reward&&o.total>0).length;
  const redeemed=own.filter(o=>o.reward||o.redeemsReward).length;
  const earned=Math.floor(qualifying/10),available=Math.max(0,earned-redeemed);
  const remainder=qualifying%10,stamps=remainder===0&&available>0?10:remainder;
  return {qualifying,redeemed,earned,available,stamps,remaining:10-remainder};
}
function validateCheckout(lines,loyalty){
  if(!lines.length||!lines.every(validLine))return 'Revise os itens da sua sacola.';
  const rewards=lines.filter(l=>l.reward).length;
  if(rewards>1||rewards>loyalty.available)return 'Esse presente ainda não está disponível. Confira seu cartão.';
  const paid=lines.filter(l=>!l.reward);
  if(paid.length&&cartTotal(paid)<500)return 'O pedido mínimo é R$ 5,00.';
  return '';
}
root.TropiRules=Object.freeze({PRODUCTS,JUICES,EXTRAS,product,extra,validLine,unitPrice,cartTotal,lineTitle,lineDescription,lineLabel,STATUS_LABELS,nextStatus,canTransition,periodKey,periodBounds,orderReport,parseMoney,openCashSession,cashSummary,bookCashSale,cashMovement,closeCashSession,loyaltyState,validateCheckout});
})(typeof window==='undefined'?globalThis:window);

module.exports = globalThis.TropiRules;
