'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createService}=require('../lib/service.cjs');
const {R}=require('../lib/domain.cjs');
const {memoryDb}=require('./memory-db.cjs');
const customer={uid:'buyer'},owner={uid:'owner',admin:true};
const input=(key,extra={})=>({requestKey:'request-key-'+key,name:'Cliente teste',phone:'88999999999',payment:'Pix',delivery:'Retirada',whatsappOptIn:false,lines:[{productId:'300',qty:1,extras:[],reward:false}],...extra});
function fixture(){const db=memoryDb();let now=Date.parse('2026-10-12T12:00:00Z');return{db,service:createService({db,clock:()=>now}),advance:ms=>now+=ms};}
const finish=(service,order)=>service.updateStatus(owner,{id:order.id,status:'concluido',expectedStatus:order.status});

test('a pending order earns nothing and customer-supplied loyalty cannot grant points',async()=>{
 const {db,service}=fixture(),data=input('0001',{loyalty:{qualifying:100}});
 const first=await service.createOrder(customer,data);
 assert.equal(first.loyalty.qualifying,0);assert.equal(first.order.loyaltyApplied,false);
 assert.equal((await service.createOrder(customer,data)).duplicate,true);
 assert.equal(db.store.get('customers/buyer').loyalty.qualifying,0);
 assert.equal(db.store.get('controls/orderCounter').value,1);
});

test('finalization and idempotent checkout read current authoritative loyalty',async()=>{
 const {db,service}=fixture(),data=input('0001');
 const {order}=await service.createOrder(customer,data);
 await assert.rejects(service.updateStatus(customer,{id:order.id,status:'concluido',expectedStatus:'recebido'}),/exclusiva/);
 const results=await Promise.all([finish(service,order),finish(service,order)]);
 assert.equal(results.filter(r=>r.duplicate).length,1);
 assert.equal(db.store.get('customers/buyer').loyalty.qualifying,1);
 assert.equal(db.store.get('orders/'+order.id).loyaltyApplied,true);
 const repeat=await service.createOrder(customer,data);
 assert.equal(repeat.duplicate,true);assert.equal(repeat.order.status,'concluido');assert.equal(repeat.loyalty.qualifying,1);
 assert.equal(db.store.get('controls/orderCounter').value,1);
});

test('parallel distinct requests permit one unattended order; owner acceptance releases that slot',async()=>{
 const {service}=fixture();
 const results=await Promise.allSettled([service.createOrder(customer,input('0001')),service.createOrder(customer,input('0002'))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.match(results.find(r=>r.status==='rejected').reason.message,/aguardando a loja/);
 const order=results.find(r=>r.status==='fulfilled').value.order;
 const accepted=(await service.updateStatus(owner,{id:order.id,status:'preparando',expectedStatus:'recebido'})).order;
 assert.equal((await service.getLoyalty(customer)).loyalty.qualifying,0);
 const second=(await service.createOrder(customer,input('0003'))).order;
 await finish(service,accepted);await finish(service,second);
 assert.equal((await service.getLoyalty(customer)).loyalty.qualifying,2);
});

test('cancellation does not subtract points from earlier completed purchases',async()=>{
 const {service}=fixture();
 await finish(service,(await service.createOrder(customer,input('0001'))).order);
 const {order}=await service.createOrder(customer,input('0002'));
 await service.updateStatus(owner,{id:order.id,status:'cancelado',expectedStatus:'recebido'});
 assert.equal((await service.getLoyalty(customer)).loyalty.qualifying,1);
 assert.equal((await service.createOrder(customer,input('0003'))).loyalty.qualifying,1);
});

test('legacy migration counts the complete customer history once, excluding pending and foreign orders',async()=>{
 const {db,service}=fixture();
 db.store.set('customers/buyer',{id:'buyer',loyalty:{qualifying:999,redeemed:10}});
 for(let i=0;i<231;i++)db.store.set('orders/HISTORY-'+i,{id:'HISTORY-'+i,customer:{id:'buyer'},date:1,total:600,reward:false,status:'concluido'});
 db.store.set('orders/FOREIGN',{id:'FOREIGN',customer:{id:'another'},date:1,total:600,status:'concluido'});
 db.store.set('orders/PENDING',{id:'PENDING',customer:{id:'buyer'},date:Date.parse('2026-10-12T12:00:00Z'),total:600,status:'recebido'});
 db.store.set('orders/CANCELED',{id:'CANCELED',customer:{id:'buyer'},date:1,total:600,status:'cancelado'});
 const first=await service.getLoyalty(customer);
 assert.equal(first.loyalty.qualifying,231);assert.equal(first.loyalty.redeemed,0);assert.equal(first.loyalty.version,2);
 const queries=db.queries;
 await service.getLoyalty(customer);assert.equal(db.queries,queries);
 const outsider=await service.getLoyalty({uid:'new-visitor'},{uid:'buyer'});
 assert.equal(outsider.loyalty.qualifying,0);assert.equal(db.store.has('customers/new-visitor'),false);
});

function earnedGift(db){db.store.set('customers/buyer',{id:'buyer',loyalty:{version:2,qualifying:10,redeemed:0,reserved:0}});}
const giftInput=key=>input(key,{lines:[{productId:'500',qty:1,extras:['ninho'],reward:true}]});
test('a gift is reserved, restored on cancellation and consumed only upon completion',async()=>{
 const {db,service}=fixture();earnedGift(db);
 const first=await service.createOrder(customer,giftInput('0001'));
 assert.equal(first.loyalty.qualifying,10);assert.equal(first.loyalty.redeemed,0);assert.equal(first.loyalty.reserved,1);assert.equal(first.loyalty.available,0);
 await service.updateStatus(owner,{id:first.order.id,status:'cancelado',expectedStatus:'recebido'});
 assert.equal((await service.getLoyalty(customer)).loyalty.available,1);
 const second=await service.createOrder(customer,giftInput('0002'));
 await finish(service,second.order);
 const completed=(await service.getLoyalty(customer)).loyalty;
 assert.equal(completed.qualifying,10);assert.equal(completed.redeemed,1);assert.equal(completed.reserved,0);assert.equal(completed.available,0);
});

test('a mixed paid and gift order increments and redeems exactly once at completion',async()=>{
 const {db,service}=fixture();earnedGift(db);
 const first=await service.createOrder(customer,input('0001',{lines:[...giftInput('0001').lines,...input('0001').lines]}));
 assert.equal(first.loyalty.qualifying,10);assert.equal(first.loyalty.redeemed,0);
 await finish(service,first.order);
 const completed=(await service.getLoyalty(customer)).loyalty;
 assert.equal(completed.qualifying,11);assert.equal(completed.redeemed,1);assert.equal(completed.reserved,0);
});

test('unattended requests expire in 24 hours without points; they disappear and release the pending slot',async()=>{
 const {db,service,advance}=fixture();
 const first=await service.createOrder(customer,input('0001'));
 advance(R.PENDING_REQUEST_TTL-1);
 assert.equal((await service.expirePending()).expired,0);
 advance(1);
 assert.equal((await service.expirePending()).expired,1);
 assert.equal((await service.expirePending()).expired,0);
 const expired=db.store.get('orders/'+first.order.id);
 assert.equal(expired.expired,true);assert.equal(R.visibleOrder(expired),false);
 assert.equal(db.store.get('customers/buyer').loyalty.qualifying,0);
 await assert.rejects(finish(service,expired),/mudança/);
 assert.equal((await service.createOrder(customer,input('0002'))).loyalty.qualifying,0);
});

test('expired gifts restore availability; accepted requests remain eligible for owner finalization',async()=>{
 const {db,service,advance}=fixture();earnedGift(db);
 const first=await service.createOrder(customer,giftInput('0001'));
 advance(R.PENDING_REQUEST_TTL);
 assert.equal((await service.getLoyalty(customer)).loyalty.available,1);
 assert.equal(db.store.get('orders/'+first.order.id).expired,true);
 const next=await service.createOrder(customer,input('0002'));
 const accepted=(await service.updateStatus(owner,{id:next.order.id,status:'preparando',expectedStatus:'recebido'})).order;
 advance(R.PENDING_REQUEST_TTL*2);
 assert.equal((await service.expirePending()).expired,0);
 await finish(service,accepted);
 assert.equal((await service.getLoyalty(customer)).loyalty.qualifying,11);
});

test('old active gift counters migrate to reservations rather than redemptions',async()=>{
 const {db,service}=fixture();
 db.store.set('customers/buyer',{id:'buyer',loyalty:{qualifying:10,redeemed:1}});
 for(let i=0;i<10;i++)db.store.set('orders/PAID-'+i,{id:'PAID-'+i,customer:{id:'buyer'},date:1,status:'concluido',total:600,reward:false});
 const id='TROPI-011';db.store.set('orders/'+id,{id,customer:{id:'buyer'},date:Date.parse('2026-10-12T12:00:00Z'),status:'recebido',total:0,reward:true,redeemsReward:true});
 const migrated=(await service.getLoyalty(customer)).loyalty;
 assert.equal(migrated.redeemed,0);assert.equal(migrated.reserved,1);assert.equal(migrated.stamps,10);
 await service.updateStatus(owner,{id,status:'cancelado',expectedStatus:'recebido'});
 assert.equal((await service.getLoyalty(customer)).loyalty.available,1);
});
