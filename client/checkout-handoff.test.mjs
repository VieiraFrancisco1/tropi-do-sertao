import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../logic.js';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const bridge=readFileSync(new URL('./cloud-ui.inc.js',import.meta.url),'utf8');
const R=globalThis.TropiRules;
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
const messageCode=app.slice(app.indexOf('function storePix(){'),app.indexOf('\nfunction finishWhatsAppHandoff('));
const makeUrl=new Function('R','window','money','STORE_WHATSAPP_NUMBER','ORDER_TRACKING_URL',messageCode+';return whatsappOrderUrl;')(R,{TropiConfig:{}},money,'5588996862960','https://tropidosertao.web.app/#pedidos');
const handoffCode=app.slice(app.indexOf('function finishWhatsAppHandoff('),app.indexOf('\nconst date='));
const submitCode=bridge.slice(bridge.indexOf(' submitOrder=async function(e){'),bridge.indexOf('\n cashFormSubmit='));
assert.ok(handoffCode.startsWith('function finishWhatsAppHandoff('));
assert.ok(submitCode.includes('submitOrder=async function(e){'));

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
const result=()=>({order:{id:'TROPI-321',date:Date.parse('2026-10-12T03:00:00Z'),status:'recebido',customer:{id:'buyer',name:'Cliente de teste',phone:'5588999999999'},delivery:'Retirada',payment:'Pix',total:700,payableTotal:700,lines:[{productId:'suco-laranja',qty:1,extras:[],notes:'',subtotal:700}]},loyalty:{qualifying:1,available:0,stamps:1}});

function handoffHarness(assign){
 const nodes=new Map(),events={urls:[],dialogs:[],toasts:[],popups:0};
 nodes.set('success-title',{nextElementSibling:{textContent:''}});
 nodes.set('success-receipt',{insertAdjacentElement(position,element){assert.equal(position,'afterend');nodes.set(element.id,element);}});
 const document={getElementById:id=>nodes.get(id),createElement:()=>({remove(){nodes.delete(this.id);}})};
 const window={open(){events.popups++;throw new Error('Popup blocked');},location:{assign:assign||((url)=>events.urls.push(url))}};
 const finish=new Function('$','document','window','whatsappOrderUrl','svg','showDialog','toast',handoffCode+';return finishWhatsAppHandoff;')(id=>nodes.get(id),document,window,makeUrl,()=>'',id=>events.dialogs.push(id),message=>events.toasts.push(message));
 return{finish,nodes,events};
}

test('abre a mensagem pronta na mesma página, sem depender de popups',()=>{
 const h=handoffHarness(),order=result().order;
 h.finish(order);
 assert.equal(h.events.popups,0);
 assert.deepEqual(h.events.urls,[makeUrl(order)]);
 assert.deepEqual(h.events.dialogs,['success-dialog']);
 assert.equal(h.nodes.get('success-whatsapp').target,'_self');
 assert.equal(h.nodes.get('success-whatsapp').href,makeUrl(order));
 assert.ok(new URL(h.events.urls[0]).searchParams.get('text').includes(order.id));
});

test('mantém o link manual do mesmo pedido quando a abertura do aplicativo é bloqueada',()=>{
 const h=handoffHarness(()=>{throw new Error('App navigation blocked');}),order=result().order;
 h.finish(order);
 const link=h.nodes.get('success-whatsapp');
 assert.equal(link.href,makeUrl(order));
 assert.equal(link.target,'_self');
 assert.match(h.events.toasts[0],/Abrir WhatsApp para enviar/);
 h.finish(order);
 assert.equal(h.nodes.get('success-whatsapp').href,makeUrl(order));
});

function submitHarness(createOrder,{sessionUid='buyer'}={}){
 const events={requests:[],handoffs:[],errors:[],toasts:[]},stored=new Map();
 const button={innerHTML:'Enviar pedido para WhatsApp',disabled:false,attributes:new Map(),setAttribute(k,v){this.attributes.set(k,v);},removeAttribute(k){this.attributes.delete(k);}};
 const form={values:{customer:'Cliente de teste',phone:'88999999999',payment:'Pix',delivery:'retirada'},elements:{payment:{value:'Pix'}},querySelector(selector){return selector==='[type="submit"]'?button:{dataset:{}};},reset(){this.elements.payment.value='';}};
 const nodes={'checkout-form':form,'success-receipt':{},'success-loyalty':{}};
 class FormValues{constructor(form){this.values=form.values;}get(name){return this.values[name]??null;}}
 const deps={R,$:id=>nodes[id],crypto:webcrypto,FormData:FormValues,cloudSession:{uid:sessionUid},
  CLOUD:{async createOrder(data){events.requests.push(data);return createOrder(data);}},
  read:(key,fallback)=>stored.get(key)??fallback,save:(key,value)=>stored.set(key,value),localStorage:{removeItem:key=>stored.delete(key)},
  uid:()=> 'test-request-key-00001',loyalty:()=>({available:0}),validateCheckoutPayment:()=>true,checkoutAddress:()=>'',
  svg:()=>'',esc:String,money,loyaltyMarkup:()=>'',updateCart:()=>{},deliveryFields:()=>{},paymentFields:()=>{},
  finishWhatsAppHandoff:(order,url)=>events.handoffs.push({order,url}),whatsappOrderUrl:makeUrl,
  cloudError:error=>events.errors.push(error),toast:message=>events.toasts.push(message),
  inputCart:[{productId:'suco-laranja',qty:1,extras:[],reward:false,notes:''}]};
 const harness=new Function('deps',`const {R,$,CLOUD,crypto,FormData,cloudSession,read,save,localStorage,uid,loyalty,validateCheckoutPayment,checkoutAddress,svg,esc,money,loyaltyMarkup,updateCart,deliveryFields,paymentFields,finishWhatsAppHandoff,whatsappOrderUrl,cloudError,toast,inputCart}=deps;let submitOrder,submitting=false,cart=inputCart,orders=[],profile={},cloudLoyalty=null;${submitCode};return {submit:submitOrder,state:()=>({submitting,cart,orders,profile})};`)(deps);
 return{...harness,events,stored,button,event:{currentTarget:form,preventDefault(){}}};
}

test('aguarda o registro e impede dois cliques antes de abrir a conversa',async()=>{
 const requested=deferred(),response=deferred();
 const h=submitHarness(()=>{requested.resolve();return response.promise;});
 const operation=h.submit(h.event);
 await requested.promise;
 assert.equal(h.button.disabled,true);
 assert.equal(h.button.attributes.get('aria-busy'),'true');
 assert.match(h.button.innerHTML,/Preparando seu pedido/);
 assert.equal(h.events.handoffs.length,0);
 assert.equal(h.state().cart.length,1);
 await h.submit(h.event);
 assert.equal(h.events.requests.length,1);
 response.resolve(result());
 await operation;
 assert.equal(h.events.handoffs.length,1);
 assert.equal(h.events.handoffs[0].order.id,'TROPI-321');
 assert.equal(h.events.handoffs[0].url,makeUrl(result().order));
 assert.equal(h.state().cart.length,0);
 assert.equal(h.state().orders.length,1);
 assert.equal(h.state().submitting,false);
 assert.equal(h.button.attributes.has('aria-busy'),false);
 assert.equal(h.button.innerHTML,'Enviar pedido para WhatsApp');
});

test('uma falha conserva a sacola e a nova tentativa usa a mesma identificação',async()=>{
 let attempts=0;
 const error=Object.assign(new Error('Resposta interrompida'),{code:'unavailable'});
 const h=submitHarness(()=>{if(++attempts===1)throw error;return result();});
 await h.submit(h.event);
 assert.equal(h.state().cart.length,1);
 assert.equal(h.events.handoffs.length,0);
 assert.equal(h.button.disabled,false);
 assert.equal(h.events.errors[0],error);
 assert.ok(h.stored.has('tropisertao-live-checkout-key'));
 await h.submit(h.event);
 assert.equal(h.events.requests[0].requestKey,h.events.requests[1].requestKey);
 assert.equal(h.events.handoffs.length,1);
 assert.equal(h.stored.has('tropisertao-live-checkout-key'),false);
});

test('trocar de conta durante o registro não envia o pedido da outra pessoa',async()=>{
 const h=submitHarness(()=>result(),{sessionUid:'another-user'});
 await h.submit(h.event);
 assert.equal(h.events.handoffs.length,0);
 assert.equal(h.state().cart.length,1);
 assert.equal(h.state().orders.length,0);
 assert.match(h.events.toasts[0],/conta anterior/);
});
