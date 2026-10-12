import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './whatsapp-return.js';
import '../logic.js';
const {createReturnTracker}=globalThis.TropiWhatsAppReturn;
const R=globalThis.TropiRules;
function fixture(){
 let stored=null,now=1000;
 const options={read:()=>stored,write:value=>stored=structuredClone(value),remove:()=>stored=null,now:()=>now};
 return {tracker:createReturnTracker(options),reload:()=>createReturnTracker(options),advance:ms=>now+=ms,stored:()=>stored};
}
test('a click or focus alone does not count as returning from WhatsApp',()=>{
 const h=fixture();h.tracker.begin({uid:'buyer',id:'TROPI-001'});
 assert.equal(h.tracker.peek('buyer'),null);
 assert.equal(h.tracker.consume('buyer'),null);
 h.tracker.leave();assert.equal(h.tracker.peek('buyer').id,'TROPI-001');
});
test('return survives reload, is consumed once and never exposes an order to another account',()=>{
 const h=fixture();h.tracker.begin({uid:'buyer',id:'TROPI-001'});h.tracker.leave();
 const reload=h.reload();assert.equal(reload.peek('another'),null);
 assert.equal(reload.consume('another'),null);assert.equal(reload.consume('buyer').id,'TROPI-001');
 assert.equal(reload.consume('buyer'),null);reload.leave();assert.equal(h.stored(),null);
});
test('return storage expires without retaining customer details or message content',()=>{
 const h=fixture();h.tracker.begin({uid:'buyer',id:'TROPI-001'});h.tracker.leave();
 assert.deepEqual(Object.keys(h.stored()).sort(),['at','id','left','uid']);
 h.advance(24*60*60*1000+1);assert.equal(h.tracker.peek('buyer'),null);assert.equal(h.stored(),null);
});
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const resumeCode=app.slice(app.indexOf('function resumeWhatsAppReturn(){'),app.indexOf('\nfunction updateLoyaltyUI(){'));
function resumeFixture(){
 const h=fixture(),dialogs=[],nodes=new Map();
 const order={id:'TROPI-001',customer:{id:'buyer'},status:'recebido',total:600,date:Date.now()};
 for(const id of ['checkout-form','success-dialog','success-title','success-receipt','success-loyalty','success-whatsapp-footer'])nodes.set(id,{reset(){},classList:{toggle(){}},nextElementSibling:{}});
 const document={hidden:false};let session={uid:'buyer'},orders=[order];
 const deps={LIVE:true,document,R,$:id=>nodes.get(id),whatsappReturn:h.tracker,loyaltyReady:true,
  cloudSession:session,orders,preparedWhatsAppOrder:null,clearWhatsAppHandoff(){},deliveryFields(){},resetCheckoutSteps(){},
  esc:String,money:n=>String(n),loyaltyMarkup:()=>'<div>0/10</div>',showDialog:id=>dialogs.push(id)};
 const resume=new Function('deps','const {LIVE,document,R,$,whatsappReturn,loyaltyReady,cloudSession,orders,preparedWhatsAppOrder,clearWhatsAppHandoff,deliveryFields,resetCheckoutSteps,esc,money,loyaltyMarkup,showDialog}=deps;let returnedOrderId=null;const states=R.STATUS_LABELS;'+resumeCode+';return resumeWhatsAppReturn;')(deps);
 return {...h,resume,dialogs,nodes,document,session,order,orders};
}
test('the success sheet opens only after leaving and returning and keeps uncompleted loyalty at zero',()=>{
 const h=resumeFixture();h.tracker.begin({uid:'buyer',id:h.order.id});
 assert.equal(h.resume(),false);assert.deepEqual(h.dialogs,[]);
 h.tracker.leave();h.document.hidden=true;assert.equal(h.resume(),false);
 h.document.hidden=false;assert.equal(h.resume(),true);assert.deepEqual(h.dialogs,['success-dialog']);
 assert.equal(h.nodes.get('success-title').textContent,'Aguardando a loja');
 assert.match(h.nodes.get('success-title').nextElementSibling.textContent,/quando o dono finalizar/);
 assert.match(h.nodes.get('success-loyalty').innerHTML,/0\/10/);
 assert.equal(h.nodes.get('success-whatsapp-footer').hidden,true);
 assert.equal(h.resume(),false);
});
test('a matching return waits for its own order and cannot show a different user’s receipt',()=>{
 const h=resumeFixture();h.tracker.begin({uid:'buyer',id:h.order.id});h.tracker.leave();
 h.order.customer.id='another';assert.equal(h.resume(),false);assert.deepEqual(h.dialogs,[]);
 h.order.customer.id='buyer';h.session.uid='another';assert.equal(h.resume(),false);
 h.session.uid='buyer';assert.equal(h.resume(),true);
});
test('the returned sheet reports completion only when the owner finalized the order',()=>{
 const h=resumeFixture();h.order.status='concluido';h.tracker.begin({uid:'buyer',id:h.order.id});h.tracker.leave();
 assert.equal(h.resume(),true);assert.equal(h.nodes.get('success-title').textContent,'Pedido finalizado pela loja');
});
