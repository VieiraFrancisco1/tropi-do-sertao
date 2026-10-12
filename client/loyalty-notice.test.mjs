import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const code=app.slice(app.indexOf('function updateLoyaltyUI(){'),app.indexOf('\nconst total='));
function fixture({count=0,owner=false,ready=true}={}){
 const nodes=new Map(),state={qualifying:count,available:0,stamps:count%10};let dialog=false;
 for(const id of ['loyalty-badge','club-teaser','success-dialog','loyalty-welcome-content','loyalty-welcome'])nodes.set(id,{hidden:true,attributes:{},setAttribute(k,v){this.attributes[k]=v;}});
 const deps={$:id=>nodes.get(id),loyalty:()=>state,loyaltyReady:ready,cloudSession:{uid:'buyer',owner},
  document:{hidden:false,querySelector:()=>dialog?{}:null},whatsappReturn:{peek:()=>null},orders:[],svg:()=>'<svg></svg>',renderReturnedOrder(){},setTimeout:()=>1,clearTimeout(){}};
 const update=new Function('deps','const {$,loyalty,loyaltyReady,cloudSession,document,whatsappReturn,orders,svg,renderReturnedOrder,setTimeout,clearTimeout}=deps;let welcomeCount=-1,welcomeTimer,returnedOrderId=null;'+code+';return updateLoyaltyUI;')(deps);
 return {nodes,state,update,setDialog:value=>dialog=value};
}
test('pending purchases have no count or entry animation; one and two completions show their exact badge',()=>{
 const h=fixture();h.update();assert.equal(h.nodes.get('loyalty-badge').hidden,true);assert.equal(h.nodes.get('loyalty-welcome').hidden,true);
 h.state.qualifying=1;h.state.stamps=1;h.update();
 assert.equal(h.nodes.get('loyalty-badge').textContent,'1');assert.equal(h.nodes.get('loyalty-badge').hidden,false);
 assert.match(h.nodes.get('club-teaser').attributes['aria-label'],/1 pedido finalizado/);
 assert.match(h.nodes.get('loyalty-welcome-content').innerHTML,/1 de 10 pedidos concluídos/);
 h.state.qualifying=2;h.state.stamps=2;h.update();assert.equal(h.nodes.get('loyalty-badge').textContent,'2');
});
test('the entry animation waits for dialogs to close, then runs once per count and visit',()=>{
 const h=fixture({count:2});h.setDialog(true);h.update();assert.equal(h.nodes.get('loyalty-welcome').hidden,true);
 h.setDialog(false);h.update();assert.equal(h.nodes.get('loyalty-welcome').hidden,false);
 h.nodes.get('loyalty-welcome').hidden=true;h.update();assert.equal(h.nodes.get('loyalty-welcome').hidden,true);
});
test('legacy counters awaiting migration and the store owner do not get customer notifications',()=>{
 for(const h of [fixture({count:2,ready:false}),fixture({count:2,owner:true})]){
  h.update();assert.equal(h.nodes.get('loyalty-badge').hidden,true);assert.equal(h.nodes.get('loyalty-welcome').hidden,true);
 }
});
