(()=>{
'use strict';
const asset=path=>path;
const R=window.TropiRules;
const CLOUD=window.TropiCloud;
const LIVE=!!CLOUD?.enabled;
let cloudSession=null,cloudLoyalty=null;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);

const STORE_WHATSAPP_NUMBER='5588996862960';
function whatsappOrderUrl(order){
 const details=[
  '*PEDIDO - TROPI DO SERTÃO*',
  'Número: '+order.id,
  'Cliente: '+order.customer.name,
  'Telefone: '+order.customer.phone,
  '',
  '*Itens do pedido:*',
  ...order.lines.map(item=>'- '+item.label+' — '+money(item.subtotal)+(item.notes?'\\n  Observação: '+item.notes:'')),
  '',
  '*Total dos produtos: '+money(order.total)+'*',
  'Recebimento: '+order.delivery,
  ...(order.delivery==='Entrega'?['Endereço: '+order.address,...(order.reference?['Referência: '+order.reference]:[])]:[]),
  'Pagamento: '+order.payment,
  ...(order.payment==='Dinheiro'&&order.change?['Troco para: '+money(order.change)]:[]),
  'Taxa de entrega e pagamento a confirmar com a loja.'
 ];
 return 'https://wa.me/'+STORE_WHATSAPP_NUMBER+'?text='+encodeURIComponent(details.join('\\n'));
}
function beginWhatsAppHandoff(){
 const tab=window.open('about:blank','_blank');
 if(tab)try{
  tab.document.title='Preparando seu pedido - Tropi do Sertão';
  tab.document.body.textContent='Aguarde, preparando sua mensagem para o WhatsApp...';
 }catch{}
 return tab;
}
function finishWhatsAppHandoff(order,tab){
 const url=whatsappOrderUrl(order);
 document.getElementById('success-whatsapp')?.remove();
 const link=document.createElement('a');
 link.id='success-whatsapp';
 link.className='primary full';
 link.href=url;
 link.target='_blank';
 link.rel='noopener noreferrer';
 link.innerHTML=svg('whatsapp')+' Abrir WhatsApp para enviar';
 $('success-receipt').insertAdjacentElement('afterend',link);
 $('success-title').textContent='Pedido registrado!';
 $('success-title').nextElementSibling.textContent='Finalize o envio da mensagem no WhatsApp. Abrir a conversa não garante que a mensagem foi enviada.';
 showDialog('success-dialog');
 if(tab)try{tab.location.replace(url);return;}catch{}
 toast('Pedido registrado. Toque em "Abrir WhatsApp para enviar".');
}

const date=n=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Fortaleza'}).format(n);
const normal=v=>String(v).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const uid=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const icons={
whatsapp:'<path d="M20 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.8-4.7A8.5 8.5 0 1 1 20 11.5Z"/><path d="m8.5 7 1 2-1 1c1 2 2 3 4 4l1-1 2 1c0 2-2 2-3 1-3-1-6-4-6-7 0-1 1-2 2-1Z"/>',
instagram:'<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
bag:'<path d="M6 7h12l2 13H4L6 7Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/>',
search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
x:'<path d="m6 6 12 12M6 18 18 6"/>',
plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
home:'<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/>',
grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>',
user:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
store:'<path d="M4 10v11h16V10M3 10l2-7h14l2 7M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 21v-7h6v7"/>',
truck:'<path d="M3 5h11v12H3V5Zm11 5h4l3 4v3h-7"/><circle cx="6.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
qr:'<path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6z"/>',
card:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
wallet:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 8h18m-5 4h5v5h-5z"/>',
check:'<path d="m5 12 4 4L19 6"/>',
gift:'<path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13"/><path d="M12 8C5 8 5 2 8 3c2 0 4 5 4 5s2-5 4-5c3-1 3 5-4 5Z"/>',
arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
'chevron-left':'<path d="m15 5-7 7 7 7"/>','chevron-right':'<path d="m9 5 7 7-7 7"/>',
pause:'<path d="M8 5v14M16 5v14"/>',play:'<path d="m8 4 12 8-12 8V4Z"/>',
printer:'<path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6zM17 11h.01"/>'
 ,chart:'<path d="M4 3v18h17M8 16v-4m5 4V7m5 9v-6"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h2m4 0h2"/>'
};
const svg=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[name]||icons.info)+'</svg>';
const fruits={
strawberry:'<path d="M10 18C6 28 17 47 26 51c11-5 22-23 17-34-4-8-12-8-17-3-7-5-14-4-16 4Z" fill="#ff4777"/><path d="m13 14 7-7 5 6 6-9 3 8 10 1-10 7-8-6-7 8Z" fill="#4d901c"/><path d="m17 26 2 3m13-6-1 3m6 9-2 2m-12-1 1 3m3 7 1 2m-15-9 2 2" stroke="#ffeca1" stroke-width="2.6" stroke-linecap="round"/><path d="M15 25c-1 4 1 9 3 13" stroke="#ffb3c7" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
orange:'<path d="M27 16c-1-9 7-13 16-10-2 9-9 12-16 10Z" fill="#56a422"/><circle cx="27" cy="33" r="20" fill="#ff8e16"/><circle cx="27" cy="33" r="15.7" fill="#fff4a9"/><circle cx="27" cy="33" r="12.6" fill="#ffc93b"/><path d="M27 21v24M15 33h24m-20-8 16 16m0-16L19 41" stroke="#fff4a9" stroke-width="1.7"/><circle cx="27" cy="33" r="2.8" fill="#fff6c4"/>',
kiwi:'<circle cx="27" cy="29" r="23" fill="#8d6633"/><circle cx="27" cy="29" r="20" fill="#bdff55"/><circle cx="27" cy="29" r="13" fill="#8ce337"/><ellipse cx="27" cy="29" rx="5" ry="8" fill="#f4ffd0"/><g fill="#225134"><ellipse cx="27" cy="14" rx="1.3" ry="2"/><ellipse cx="27" cy="44" rx="1.3" ry="2"/><ellipse cx="12" cy="29" rx="2" ry="1.3"/><ellipse cx="42" cy="29" rx="2" ry="1.3"/><ellipse cx="17" cy="18" rx="1.5" ry="2" transform="rotate(-40 17 18)"/><ellipse cx="37" cy="18" rx="1.5" ry="2" transform="rotate(40 37 18)"/><ellipse cx="17" cy="40" rx="1.5" ry="2" transform="rotate(40 17 40)"/><ellipse cx="37" cy="40" rx="1.5" ry="2" transform="rotate(-40 37 40)"/></g>'
};
const fruit=name=>'<svg viewBox="0 0 54 56" aria-hidden="true">'+(fruits[name]||fruits.orange)+'</svg>';
function paint(scope=document){scope.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=svg(el.dataset.icon));scope.querySelectorAll('[data-fruit]').forEach(el=>el.innerHTML=fruit(el.dataset.fruit));}
function storageKey(key){return LIVE&&key==='tropisertao-demo-cart-v1'?'tropisertao-live-cart-v1':key;}
function read(key,fallback){if(LIVE&&key.startsWith('tropisertao-demo-')&&key!=='tropisertao-demo-cart-v1')return fallback;try{const value=JSON.parse(localStorage.getItem(storageKey(key)));return value??fallback;}catch{return fallback;}}
let warnedStorage=false,toastTimer;
function save(key,value){if(LIVE&&key.startsWith('tropisertao-demo-')&&key!=='tropisertao-demo-cart-v1')return true;try{localStorage.setItem(storageKey(key),JSON.stringify(value));return true;}catch{if(!warnedStorage){warnedStorage=true;toast('O navegador não permitiu guardar sua sacola. Mantenha esta página aberta.');}return false;}}
let profile=read('tropisertao-demo-profile-v2',null);
if(!profile||typeof profile.id!=='string'||typeof profile.name!=='string')profile={id:uid(),name:'',phone:''};
profile={id:profile.id,name:String(profile.name).slice(0,60),phone:String(profile.phone||'').slice(0,20)};
save('tropisertao-demo-profile-v2',profile);
let cart=read('tropisertao-demo-cart-v1',[]);
cart=(Array.isArray(cart)?cart:[]).filter(l=>R.validLine(l)&&typeof l.key==='string'&&/^[a-z0-9-]+$/.test(l.key)).map(l=>({...l,notes:String(l.notes||'').slice(0,240),reward:!!l.reward}));
let rawOrders=read('tropisertao-demo-orders-v2',null);
if(!Array.isArray(rawOrders))rawOrders=read('tropisertao-demo-orders-v1',[]);
let orders=(Array.isArray(rawOrders)?rawOrders:[]).filter(o=>o&&typeof o.id==='string'&&/^[A-Z0-9-]+$/.test(o.id)&&Number.isFinite(o.date)&&Number.isInteger(o.total)&&o.total>=0&&Array.isArray(o.lines)).map(o=>({...o,customer:o.customer&&typeof o.customer.id==='string'?o.customer:{id:profile.id,name:'Cliente da demonstração',phone:''},status:Object.hasOwn(R.STATUS_LABELS,o.status)?o.status:'recebido',reward:!!o.reward}));
save('tropisertao-demo-orders-v2',orders);
let cashSessions=read('tropisertao-demo-cash-v1',[]);
cashSessions=(Array.isArray(cashSessions)?cashSessions:[]).filter(s=>s&&typeof s.id==='string'&&['open','closed'].includes(s.status)&&Number.isFinite(s.openedAt)&&Number.isSafeInteger(s.openingCents)&&s.openingCents>=0&&Array.isArray(s.entries)&&s.entries.every(e=>e&&Number.isSafeInteger(e.amountCents)&&e.amountCents>=0&&Number.isFinite(e.at)&&['sale','entry','withdrawal'].includes(e.type)));
let category='tudo',builder={productId:'300',extras:[],qty:1,reward:false},filter='pendentes',detailOwner=false,lastFocus=null,reportPeriod='day';
const states=R.STATUS_LABELS;
const loyalty=()=>LIVE&&cloudLoyalty?cloudLoyalty:R.loyaltyState(orders,profile.id);
const total=()=>R.cartTotal(cart);
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3000);}
function showDialog(id){
  if(!document.querySelector('dialog[open]'))lastFocus=document.activeElement;
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  document.body.style.overflow='hidden';$(id).showModal();
  $(id).querySelector('.sheet-scroll')?.scrollTo(0,0);
}
function closeDialog(d){d.close();if(!document.querySelector('dialog[open]')){document.body.style.overflow='';if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});}}
function choose(){document.querySelectorAll('dialog[open]').forEach(closeDialog);category='tudo';$('search').value='';renderMenu();$('cardapio').scrollIntoView({behavior:motion.matches?'auto':'smooth'});}
function renderMenu(){
 const q=normal($('search').value.trim()),matches=s=>normal(s).includes(q);
 const ps=R.PRODUCTS.filter(p=>(category==='tudo'||category===p.category)&&matches(p.name+' '+p.size+' '+p.description+' '+(p.ingredients||'')));
 const es=R.EXTRAS.filter(e=>(category==='tudo'||category===e.category)&&matches(e.name));
 for(const [kind,target,section] of [['salad','products','salad-section'],['sandwich','lanches','lanches-section'],['juice','sucos','sucos-section'],['combo','combos','combos-section']]){
  const list=ps.filter(p=>p.kind===kind);$(target).innerHTML=list.map(menuProductMarkup).join('');$(section).hidden=!list.length;
 }
 $('extras').innerHTML=es.map(e=>`<button class="extra-card" data-extra="${e.id}" aria-label="Adicionar ${esc(e.name)} à sua salada, ${money(e.price)}"><img src="${asset('assets/'+e.image+'.webp')}" alt="${esc(e.name)}" width="180" height="160" loading="lazy"><span class="extra-body"><h3>${esc(e.name)}</h3><small>Adicional na sua salada</small><span class="extra-price"><strong>+ ${money(e.price)}</strong><span class="extra-plus">${svg('plus')}</span></span></span></button>`).join('');
 $('extra-section').hidden=!es.length;$('empty-search').hidden=!!(ps.length+es.length);$('clear-search').hidden=!q;
 document.querySelectorAll('[data-category]').forEach(b=>{const active=b.dataset.category===category;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
 $('menu-content').setAttribute('aria-labelledby','tab-'+category);
}
function menuProductMarkup(p){
 const badge=p.size||(p.kind==='combo'?'Kit completo':'Natural'),label=p.kind==='salad'?'Montar salada '+p.size:p.kind==='combo'?'Montar Combo Tropi Lanche':'Adicionar '+p.name+(p.size?' '+p.size:'');
 return `<article class="product-card ${p.kind}-card"><button class="product-photo" data-product="${p.id}" aria-label="${esc(label)}"><img src="${asset('assets/'+p.image+'.webp')}" alt="${esc(p.name+(p.size?' de '+p.size:''))}" width="360" height="360" loading="${p.kind==='salad'?'eager':'lazy'}"><span class="size-badge ${p.id==='500'?'large':''}">${esc(badge)}</span></button><div class="product-info"><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><div class="product-bottom"><div class="product-price"><small>${p.kind==='salad'?'A partir de':p.kind==='combo'?'O kit completo':'Por unidade'}</small><strong>${money(p.price)}</strong></div><button class="add-circle" data-product="${p.id}" aria-label="${esc(label)}">${svg('plus')}</button></div></div></article>`;
}
function openBuilder(productId='300',preselected=null,reward=false){
 if(!R.product(productId))return;
 if(reward&&(loyalty().available<1||cart.some(l=>l.reward))){toast('Confira seu presente disponível na conta ou na sacola.');return;}
 const p=R.product(reward?'500':productId),salad=p.kind==='salad',combo=p.kind==='combo';
 builder={productId:p.id,extras:salad&&preselected?[preselected]:[],comboJuiceId:'',qty:1,reward};
 $('notes').value='';$('notes').placeholder=salad?'Como você prefere sua salada?':'Alguma observação sobre seu pedido?';$('reward-notice').hidden=!reward;
 $('builder-title').textContent=reward?'Monte seu presente':salad?'Monte sua salada':combo?'Monte seu combo':p.kind==='juice'?'Seu suco natural':'Seu sanduíche';
 $('builder-product').innerHTML=`<img src="${asset('assets/'+p.image+'.webp')}" alt="${esc(p.name)}" width="82" height="82"><div><h3>${esc(R.lineTitle(builder))}</h3><p>${esc(p.ingredients||p.description)}</p></div>`;
 $('builder-sizes').hidden=!salad;$('builder-extras-step').hidden=!salad;$('builder-combo').hidden=!combo;
 $('notes-number').textContent=salad?'03':combo?'02':'01';
 $('extras-help').textContent=reward?'Escolha até 5 adicionais. Seu presente é um copo de 500 ml.':'Escolha seus adicionais favoritos. É opcional.';
 $('size-options').innerHTML=salad?R.PRODUCTS.filter(p=>p.kind==='salad').map(p=>`<label class="size-choice"><input type="radio" name="size" value="${p.id}" ${p.id===builder.productId?'checked':''} ${reward?'disabled':''}><strong>${p.size}</strong><span>${reward&&p.id==='500'?'Seu presente':money(p.price)}</span></label>`).join(''):'';
 $('builder-extras').innerHTML=salad?R.EXTRAS.map(e=>`<label class="extra-choice"><img src="${asset('assets/'+e.image+'.webp')}" alt="" width="42" height="42"><span class="extra-choice-copy"><strong>${esc(e.name)}</strong><small>${reward?'Incluso no presente':'+ '+money(e.price)}</small></span><input type="checkbox" name="extra" value="${e.id}" ${e.id===preselected?'checked':''} aria-label="${esc(e.name)}"></label>`).join(''):'';
 $('combo-juices').innerHTML=combo?R.JUICES.map(j=>`<label class="combo-juice-choice"><img src="${asset('assets/'+j.image+'.webp')}" alt="" width="56" height="56"><span><strong>${esc(j.name)}</strong><small>300 ml · incluso no combo</small></span><input type="radio" name="combo-juice" value="${j.id}" aria-label="${esc(j.name)}" required></label>`).join(''):'';
 updateBuilder();showDialog('builder-dialog');
}
function updateBuilder(){
 if(R.product(builder.productId).kind==='salad'){
  builder.productId=$('size-options').querySelector('input:checked').value;
  builder.extras=Array.from($('builder-extras').querySelectorAll('input:checked')).map(i=>i.value);
 }
 if(R.product(builder.productId).kind==='combo'){
  builder.comboJuiceId=$('combo-juices').querySelector('input:checked')?.value||'';
  $('combo-selection-help').textContent=builder.comboJuiceId?'Combo completo: sanduíche + '+R.product(builder.comboJuiceId).name+' + salada de 145 ml.':'Falta escolher 1 sabor de suco para completar seu combo.';
  $('combo-selection-help').classList.toggle('complete',!!builder.comboJuiceId);
 }
 if(builder.reward){builder.qty=1;$('builder-extras').querySelectorAll('input').forEach(i=>i.disabled=builder.extras.length>=5&&!i.checked);}
 const p=R.product(builder.productId),price=p.kind==='combo'?p.price:R.unitPrice(builder);
 $('builder-product').querySelector('h3').textContent=R.lineTitle(builder);
 $('builder-qty').textContent=builder.qty;$('builder-less').disabled=builder.qty<=1||builder.reward;$('builder-more').disabled=builder.qty>=20||builder.reward;$('builder-total').textContent=money(price*builder.qty);$('add-to-bag').disabled=!R.validLine(builder);
}
function updateCart(){
 save('tropisertao-demo-cart-v1',cart);
 const count=cart.reduce((n,l)=>n+l.qty,0);document.querySelectorAll('[data-count]').forEach(e=>{e.textContent=count;e.hidden=count===0;});
 $('cart-peek').hidden=!count;$('peek-total').textContent=money(total());document.querySelector('.page-shell').style.paddingBottom=count&&innerWidth<=700?'175px':'';
 if($('cart-dialog').open)renderCart();
}
function renderCart(){
 $('cart-bottom').hidden=!cart.length;
 if(!cart.length){$('cart-content').innerHTML=`<div class="empty-state"><span class="empty-icon">${svg('bag')}</span><h3>Falta um pouco de Tropi.</h3><p>Escolha seu tamanho e dê o seu toque.</p><button class="primary" data-action="choose">Explorar cardápio</button></div>`;return;}
 $('cart-content').innerHTML=cart.map(l=>`<article class="cart-row"><img src="${asset('assets/'+R.product(l.productId).image+'.webp')}" alt="${esc(R.product(l.productId).name)}" width="65" height="86"><div class="cart-row-main"><h3>${esc(R.lineTitle(l))}</h3><p>${l.reward?'<b>Presente fidelidade</b><br>':''}${esc(R.lineDescription(l))}${l.notes?'<br>Obs.: '+esc(l.notes):''}</p><div class="cart-row-bottom"><strong>${money(R.unitPrice(l)*l.qty)}</strong><div class="qty-control"><button data-cart-change="-1" data-key="${l.key}" aria-label="Diminuir quantidade de ${esc(R.lineTitle(l))}">${svg('minus')}</button><span>${l.qty}</span><button data-cart-change="1" data-key="${l.key}" ${l.reward||l.qty>=20?'disabled':''} aria-label="Aumentar quantidade de ${esc(R.lineTitle(l))}">${svg('plus')}</button></div></div><button class="remove-line" data-remove="${l.key}">Remover</button></div></article>`).join('');
 $('cart-total').textContent=money(total());
}
function loyaltyMarkup(celebrate=false){
 const s=loyalty(),ready=s.available>0;
 const stamps=Array.from({length:10},(_,i)=>`<span class="stamp ${i<s.stamps?'checked':''} ${celebrate&&i===s.stamps-1?'just-earned':''}" aria-label="${i+1} de 10: ${i<s.stamps?'marcado':'a completar'}">${i===9?svg('gift'):i<s.stamps?svg('check'):i+1}</span>`).join('');
 return `<section class="loyalty-card" aria-label="Cartão fidelidade: ${s.qualifying} ${s.qualifying===1?'pedido':'pedidos'}, ${s.available} ${s.available===1?'presente disponível':'presentes disponíveis'}"><div class="loyalty-card-top"><div><small>CLUBE TROPI · FIDELIDADE</small><h3>${ready?'Seu Tropi grátis chegou!':'Mais sabor. Mais presentes.'}</h3></div><span data-fruit="strawberry">${fruit('strawberry')}</span></div><p>10 pedidos dão direito a um <b>500 ml</b><br>com até <b>5 adicionais</b>.</p><div class="stamp-grid">${stamps}</div><div class="loyalty-meta"><span><b>${s.stamps}/10</b> neste cartão</span><span>${ready?'Presente liberado':s.remaining===1?'Falta só 1 pedido':s.remaining+' pedidos para seu presente'}</span></div><div class="loyalty-track" style="--progress:${s.stamps*10}%"><span></span></div>${ready?`<div class="reward-ready"><strong>${s.available} ${s.available===1?'presente disponível':'presentes disponíveis'}</strong>500 ml + até 5 adicionais. Do seu jeito.</div><button class="primary full reward-button" data-action="reward">Montar meu Tropi grátis ${svg('gift')}</button>`:''}</section>`;
}
function renderAccount(){
 const today=R.orderReport(orders,{value:R.periodKey(Date.now())}),running=orders.filter(o=>['recebido','preparando','entrega'].includes(o.status));
 $('account-content').innerHTML=`<div class="owner-heading"><img src="${asset('assets/logo.webp')}" alt="" width="48" height="48"><div><span class="owner-label">VISÃO DO DONO</span><h3>TropiSertão</h3><p>Sua loja, em um só lugar.</p></div><span class="owner-label owner-demo">DEMO</span></div><div class="owner-summary"><div><small>Pedidos de hoje</small><strong>${today.totalCount}</strong></div><div><small>Em andamento</small><strong>${running.length}</strong></div><div><small>Finalizados hoje</small><strong>${money(today.totalCents)}</strong></div></div><h3 class="owner-section-title">Gerencie sua loja</h3><div class="owner-menu"><button data-action="admin"><span class="owner-menu-icon">${svg('receipt')}</span><strong>Pedidos</strong><small>Aceite, acompanhe e imprima</small>${svg('chevron-right')}</button><button data-action="cash"><span class="owner-menu-icon">${svg('wallet')}</span><strong>Controle de caixa</strong><small>${cashSessions.some(s=>s.status==='open')?'Caixa aberto · acompanhar':'Abra, confira e feche'}</small>${svg('chevron-right')}</button><button data-action="report-day"><span class="owner-menu-icon">${svg('calendar')}</span><strong>Relatório diário</strong><small>Veja os resultados do dia</small>${svg('chevron-right')}</button><button data-action="report-week"><span class="owner-menu-icon">${svg('chart')}</span><strong>Relatório semanal</strong><small>De segunda a domingo</small>${svg('chevron-right')}</button><button data-action="report-month"><span class="owner-menu-icon">${svg('chart')}</span><strong>Relatório mensal</strong><small>Vendas e sabores favoritos</small>${svg('chevron-right')}</button><button data-action="about"><span class="owner-menu-icon">${svg('store')}</span><strong>Informações da loja</strong><small>Horário e fidelidade</small>${svg('chevron-right')}</button></div><section class="owner-status"><h3>Cada pedido, no seu momento.</h3><div><span>${svg('receipt')}Recebido</span><span>${svg('clock')}Em preparo</span><span>${svg('truck')}Saiu para entrega</span><span>${svg('check')}Finalizado</span></div></section>${!orders.length?`<div class="owner-example"><p>Veja como fica a rotina da sua loja.</p><button class="secondary full" data-action="sample-orders">Carregar pedidos de exemplo ${svg('arrow')}</button></div>`:''}<p class="help-text owner-note">Apresentação da área do dono. Pedidos, caixa e mensagens são simulados e ficam neste navegador.</p>`;
}
function renderClub(){ $('club-content').innerHTML=loyaltyMarkup()+`<p class="help-text">Cartão demonstrativo do cliente, separado da área do dono.</p><button class="secondary full" data-action="choose">Voltar ao cardápio ${svg('arrow')}</button>`; }
function statusAction(o){
 const next=R.nextStatus(o);if(!next)return '';
 const label=next==='preparando'?'Aceitar pedido':next==='entrega'?'Saiu para entrega':'Finalizar pedido';
 return `<button class="order-next ${next}" data-status="${next}" data-order="${esc(o.id)}">${svg(next==='preparando'?'clock':next==='entrega'?'truck':'check')}${label}</button>`;
}
const statusBadge=o=>`<span class="status-badge ${o.status}">${states[o.status]||'Recebido'}</span>`;
function orderCard(o,owner=false){
 return `<article class="order-card"><div class="order-top"><strong>${esc(o.id)}</strong>${statusBadge(o)}</div><p class="order-date">${date(o.date)}${o.reward?' · Resgate fidelidade':''}</p>${owner?`<h3 class="order-customer">${esc(o.customer.name||'Cliente da demonstração')}</h3>`:''}<div class="order-items">${o.lines.map(l=>`<p>${esc(l.label)}</p>`).join('')}</div><div class="order-foot"><span>${esc(o.delivery||'Retirada')} · ${esc(o.payment||'Pix')}</span><strong>${money(o.total)}</strong></div><div class="order-actions"><button data-detail="${o.id}" data-owner="${owner}">Ver detalhes ${svg('arrow')}</button>${owner?`<button class="print-button" data-print="${o.id}">${svg('printer')} Imprimir</button>${statusAction(o)}`:''}</div></article>`;
}
function renderOrders(){
 const own=orders.filter(o=>o.customer.id===profile.id);
 const s=loyalty();
 $('orders-content').innerHTML=`<div class="mini-loyalty"><span>Seu cartão já tem <strong>${s.qualifying} ${s.qualifying===1?'pedido':'pedidos'}</strong></span><button data-action="club">Ver cartão</button></div>`+(own.length?own.map(o=>orderCard(o)).join(''):`<div class="empty-state"><span class="empty-icon">${svg('receipt')}</span><h3>Sua primeira combinação.</h3><p>Ao finalizar, seu pedido aparece aqui e no cartão fidelidade.</p><button class="primary" data-action="choose">Escolher minha salada</button></div>`);
}
function renderAdmin(){
 const active=orders.filter(o=>o.status!=='cancelado'),q=normal($('admin-search').value);
 $('admin-stats').innerHTML=`<div><small>Todos os pedidos</small><strong>${orders.length}</strong></div><div><small>Em andamento</small><strong>${active.filter(o=>o.status!=='concluido').length}</strong></div><div><small>Vendas finalizadas</small><strong>${money(active.filter(o=>o.status==='concluido').reduce((n,o)=>n+o.total,0))}</strong></div>`;
 const list=orders.filter(o=>(filter==='todos'||filter==='pendentes'&&['recebido','preparando','entrega'].includes(o.status)||o.status===filter)&&normal(o.id+' '+o.customer.name+' '+o.customer.phone).includes(q));
 $('admin-content').innerHTML=list.length?list.map(o=>orderCard(o,true)).join(''):`<div class="empty-state"><span class="empty-icon">${svg('store')}</span><h3>${orders.length?'Nenhum pedido neste filtro':'Sua operação, organizada.'}</h3><p>${orders.length?'Experimente outra busca ou status.':'Carregue exemplos para conhecer os pedidos e acompanhar cada etapa.'}</p>${!orders.length?'<button class="primary" data-action="sample-orders">Carregar pedidos de exemplo</button>':''}</div>`;
 document.querySelectorAll('[data-filter]').forEach(b=>{const on=b.dataset.filter===filter;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
}
function reportLabel(){
 const value=$('report-date').value;
 if(!value)return 'Escolha um período';
 const valid=reportPeriod==='month'?/^\d{4}-\d{2}$/.test(value):/^\d{4}-\d{2}-\d{2}$/.test(value);
 if(!valid)return 'Escolha um período';
 if(reportPeriod==='week'){
  const b=R.periodBounds(value,'week');if(!b)return 'Escolha um período';
  const short=d=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(d+'T12:00:00-03:00'));
  return short(b.start)+' a '+short(b.end);
 }
 const when=new Date(value+(reportPeriod==='month'?'-01':'')+'T12:00:00-03:00');
 return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',...(reportPeriod==='month'?{month:'long',year:'numeric'}:{day:'2-digit',month:'long',year:'numeric'})}).format(when);
}
function currentReport(){return R.orderReport(orders,{period:reportPeriod,value:$('report-date').value});}
function renderReport(){
 const r=currentReport();
 $('report-title').textContent='Relatório '+({month:'mensal',week:'semanal',day:'diário'}[reportPeriod]);
 $('report-period-label').textContent=reportPeriod==='month'?'Escolha o mês':reportPeriod==='week'?'Escolha um dia da semana':'Escolha o dia';
 document.querySelectorAll('[data-report-period]').forEach(b=>{const active=b.dataset.reportPeriod===reportPeriod;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 $('report-content').innerHTML=`<div class="report-headline"><small>${{month:'SEU MÊS EM NÚMEROS',week:'SUA SEMANA EM NÚMEROS',day:'SEU DIA EM NÚMEROS'}[reportPeriod]}</small><h3>${esc(reportLabel())}</h3><strong>${money(r.totalCents)}</strong><p>Valor dos produtos dos pedidos finalizados</p></div><div class="report-stats"><div><small>Pedidos</small><strong>${r.totalCount}</strong></div><div><small>Finalizados</small><strong>${r.completedCount}</strong></div><div><small>Em andamento</small><strong>${r.activeCount}</strong></div><div><small>Ticket médio</small><strong>${money(r.ticketCents)}</strong></div></div><p class="report-note">${r.canceledCount} ${r.canceledCount===1?'pedido cancelado':'pedidos cancelados'}. Em andamento e cancelados não entram no faturamento. Período pela data do pedido, no horário de Fortaleza.</p>${paymentMarkup(r.payments)}<section class="bestsellers"><h3 class="owner-section-title">Mais vendidos</h3>${rankingMarkup(r.bestSellers,'Nenhuma salada vendida neste período.')}${r.topExtras.length?'<h4>Adicionais favoritos</h4>'+rankingMarkup(r.topExtras.slice(0,3),''):''}<p>Unidades pagas de pedidos finalizados. Presentes não entram no ranking.</p></section><h3 class="owner-section-title">Pedidos do período</h3>${r.orders.length?r.orders.map(o=>`<article class="report-order"><div><strong>${esc(o.id)}</strong><p>${esc(o.customer.name||'Cliente da demonstração')}</p><small>${date(o.date)}</small></div><div>${statusBadge(o)}<strong>${money(o.total)}</strong></div><button class="report-detail" data-detail="${esc(o.id)}" data-owner="true">Ver detalhes ${svg('chevron-right')}</button></article>`).join(''):'<div class="empty-state"><span class="empty-icon">'+svg('chart')+'</span><h3>Nenhum pedido neste período</h3><p>Escolha outra data para consultar.</p></div>'}`;
 $('report-print').disabled=!$('report-date').value;
}
function openReport(period,preserve=false){
 if(!['day','week','month'].includes(period))return;
 let value=preserve?$('report-date').value:R.periodKey(Date.now(),period);
 value=period==='month'?value.slice(0,7):value.length===7?value+'-01':value;
 reportPeriod=period;$('report-date').type=period==='month'?'month':'date';$('report-date').value=value;renderReport();showDialog('report-dialog');
}
function openReportPrint(){
 const r=currentReport();if(!$('report-date').value)return;
 const html=`<article class="print-receipt"><h3>TropiSertão</h3><p>RELATÓRIO ${{month:'MENSAL',week:'SEMANAL',day:'DIÁRIO'}[reportPeriod]} · DEMONSTRAÇÃO</p><p>${esc(reportLabel())}</p><hr><dl><dt>Pedidos</dt><dd>${r.totalCount}</dd><dt>Finalizados</dt><dd>${r.completedCount}</dd><dt>Em andamento</dt><dd>${r.activeCount}</dd><dt>Cancelados</dt><dd>${r.canceledCount}</dd><dt>Ticket médio</dt><dd>${money(r.ticketCents)}</dd>${Object.entries(r.payments).filter(([k,v])=>k!=='Outros'||v).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${money(v)}</dd>`).join('')}</dl><hr><div class="print-total"><span>FINALIZADOS</span><span>${money(r.totalCents)}</span></div><hr><h4>MAIS VENDIDOS</h4>${r.bestSellers.map(p=>`<p>${esc(p.name)}: ${p.qty} ${p.qty===1?'unidade':'unidades'}</p>`).join('')||'<p>Nenhuma venda.</p>'}<hr>${r.orders.map(o=>`<div class="print-line"><strong>${esc(o.id)} · ${esc(o.customer.name)}</strong><small>${date(o.date)} · ${states[o.status]}</small><b>${money(o.total)}</b></div>`).join('')}<p class="print-footer">Valores dos produtos, sem taxa de entrega.<br>Somente pedidos finalizados compõem o total.<br>Dados de demonstração.</p></article>`;
 $('print-title').textContent='Imprimir relatório';$('print-confirm').innerHTML=svg('printer')+' Imprimir relatório';$('print-preview').innerHTML=html;$('print-area').innerHTML=html;showDialog('print-dialog');
}
function paymentMarkup(payments){
 return `<div class="payment-totals" aria-label="Vendas por forma de pagamento">${Object.entries(payments).filter(([k,v])=>k!=='Outros'||v).map(([k,v])=>`<div>${svg(k==='Pix'?'qr':k==='Cartão'?'card':'wallet')}<span>${esc(k)}<strong>${money(v)}</strong></span></div>`).join('')}</div>`;
}
function rankingMarkup(items,empty){
 return items.length?`<ol class="ranking-list">${items.map((p,i)=>`<li><b>${i+1}</b><span>${esc(p.name)}</span><strong>${p.qty} <small>${p.qty===1?'unidade':'unidades'}</small></strong></li>`).join('')}</ol>`:`<p class="help-text">${esc(empty)}</p>`;
}
const signedMoney=n=>(n>0?'+ ':'')+money(n);
const currentCash=()=>cashSessions.find(s=>s.status==='open');
function persistCash(){save('tropisertao-demo-cash-v1',cashSessions);}
function replaceCash(session){cashSessions=cashSessions.map(s=>s.id===session.id?session:s);persistCash();}
function cashHistoryMarkup(){
 const closed=cashSessions.filter(s=>s.status==='closed').sort((a,b)=>b.closedAt-a.closedAt);
 return `<h3 class="owner-section-title">Histórico de fechamentos</h3>${closed.length?closed.map(s=>`<article class="cash-history"><div><strong>${date(s.closedAt)}</strong><small>Aberto em ${date(s.openedAt)}</small></div><span class="cash-difference ${s.differenceCents===0?'balanced':'unbalanced'}">${s.differenceCents===0?'Conferido':signedMoney(s.differenceCents)+' de diferença'}</span><dl><dt>Dinheiro esperado</dt><dd>${money(s.expectedCents)}</dd><dt>Dinheiro contado</dt><dd>${money(s.countedCents)}</dd></dl><button class="secondary full" data-cash-report="${esc(s.id)}">${svg('printer')} Ver e imprimir fechamento</button></article>`).join(''):'<p class="help-text">Os caixas encerrados ficam salvos aqui.</p>'}`;
}
function renderCash(){
 const s=currentCash();
 $('cash-content').innerHTML=`<button class="owner-back" data-action="account">${svg('chevron-left')} Minha conta</button>`+(s?cashOpenMarkup(s):`<div class="cash-hero"><div class="cash-title"><span class="cash-icon">${svg('wallet')}</span><span class="cash-status closed">CAIXA FECHADO</span></div><h3>Comece o dia<br>com tudo no controle.</h3><p>Informe o valor inicial em dinheiro e acompanhe as vendas da sua loja.</p></div><form id="cash-open-form" class="cash-form"><h3>Abertura de caixa</h3><label class="field-label" for="cash-opening">Valor inicial em dinheiro</label><div class="cash-money-input"><span>R$</span><input id="cash-opening" class="text-input" name="opening" inputmode="decimal" placeholder="0,00" maxlength="10" required></div><p class="help-text">Somente o dinheiro que já está no caixa.</p><button class="primary full" type="submit">Abrir caixa ${svg('arrow')}</button></form>`)+cashHistoryMarkup()+`<p class="help-text owner-note">Caixa demonstrativo, salvo apenas neste navegador. Nenhuma movimentação ou cobrança real.</p>`;
}
function cashOpenMarkup(s){
 const r=R.cashSummary(s);
 const entries=[...s.entries].sort((a,b)=>b.at-a.at);
 return `<div class="cash-hero"><div class="cash-title"><span class="cash-icon">${svg('wallet')}</span><span class="cash-status">CAIXA ABERTO</span></div><small>DINHEIRO ESPERADO NO CAIXA</small><strong>${money(r.expectedCents)}</strong><p>Aberto em ${date(s.openedAt)}</p><span class="cash-live-dot" aria-hidden="true"></span></div>${paymentMarkup(r.payments)}<div class="cash-breakdown"><div><span>Saldo inicial</span><b>${money(s.openingCents)}</b></div><div><span>Entradas extras</span><b>+ ${money(r.entriesCents)}</b></div><div><span>Retiradas</span><b>− ${money(r.withdrawalsCents)}</b></div><div><span>Vendas finalizadas · ${r.salesCount} pedidos</span><b>${money(r.totalSalesCents)}</b></div></div><p class="report-note">Vendas finalizadas enquanto este caixa estiver aberto são registradas uma vez. Pix e cartão ficam separados do dinheiro físico. Vendas anteriores à abertura não entram neste caixa.</p><form id="cash-movement-form" class="cash-form"><h3>Entrada ou retirada</h3><div class="cash-form-grid"><label class="field-label" for="cash-type">Movimentação<select id="cash-type" name="type" class="text-input"><option value="entry">Entrada em dinheiro</option><option value="withdrawal">Retirada em dinheiro</option></select></label><label class="field-label" for="cash-amount">Valor em reais<input id="cash-amount" name="amount" class="text-input" inputmode="decimal" placeholder="0,00" maxlength="10" required></label></div><label class="field-label" for="cash-reason">Descrição</label><input id="cash-reason" name="reason" class="text-input" placeholder="Ex.: reforço de troco" maxlength="120" required><button type="submit" class="secondary full">Registrar movimentação ${svg('plus')}</button></form><section class="cash-movements"><h3 class="owner-section-title">Movimentações deste caixa</h3>${entries.length?entries.map(e=>`<article><span class="cash-entry-icon ${e.type}">${svg(e.type==='sale'?'receipt':e.type==='entry'?'plus':'minus')}</span><div><strong>${esc(e.reason)}</strong><small>${date(e.at)} · ${e.type==='sale'?esc(e.payment||'Outros'):e.type==='entry'?'Entrada em dinheiro':'Retirada em dinheiro'}</small></div><b>${e.type==='withdrawal'?'− ':''}${money(e.amountCents)}</b></article>`).join(''):'<p class="help-text">Finalize um pedido ou registre uma movimentação para começar.</p>'}</section><form id="cash-close-form" class="cash-form cash-close"><h3>Fechamento de caixa</h3><p>Conte o dinheiro físico. O sistema confere com o saldo esperado.</p><label class="field-label" for="cash-counted">Dinheiro contado</label><div class="cash-money-input"><span>R$</span><input id="cash-counted" name="counted" class="text-input" inputmode="decimal" placeholder="0,00" maxlength="10" required></div><div class="cash-close-preview" id="cash-close-preview" aria-live="polite">Esperado: ${money(r.expectedCents)}</div><button class="primary full" type="submit">Fechar caixa ${svg('check')}</button></form>`;
}
function cashFormSubmit(e){
 const form=e.target;if(!['cash-open-form','cash-movement-form','cash-close-form'].includes(form.id))return;
 e.preventDefault();const values=new FormData(form),at=Date.now();
 if(form.id==='cash-open-form'){
  const amount=R.parseMoney(values.get('opening'));
  if(amount===null){toast('Informe o valor inicial em reais. Ex.: 100,00.');return;}
  const session=R.openCashSession(cashSessions,{id:uid(),at,openingCents:amount});
  if(!session){toast('Já existe um caixa aberto.');return;}
  cashSessions.unshift(session);persistCash();renderCash();toast('Caixa demonstrativo aberto.');return;
 }
 const s=currentCash();if(!s){renderCash();toast('Abra o caixa para continuar.');return;}
 if(form.id==='cash-movement-form'){
  const amountCents=R.parseMoney(values.get('amount')),reason=String(values.get('reason')||'').trim(),type=values.get('type');
  if(amountCents===null||amountCents===0){toast('Informe um valor maior que zero.');return;}
  if(!reason){toast('Informe uma descrição para a movimentação.');return;}
  if(type==='withdrawal'&&amountCents>R.cashSummary(s).expectedCents){toast('A retirada não pode superar o dinheiro esperado no caixa.');return;}
  const changed=R.cashMovement(s,{id:uid(),type,amountCents,reason,at});
  if(!changed){toast('Confira os dados da movimentação.');return;}
  replaceCash(changed);renderCash();toast('Movimentação demonstrativa registrada.');return;
 }
 const countedCents=R.parseMoney(values.get('counted'));
 if(countedCents===null){toast('Informe o dinheiro contado em reais.');return;}
 const closed=R.closeCashSession(s,{countedCents,at});if(!closed){toast('Confira o valor de fechamento.');return;}
 replaceCash(closed);renderCash();toast(closed.differenceCents===0?'Caixa fechado e conferido.':'Caixa fechado. A diferença ficou registrada.');
}
function openCashPrint(id){
 const s=cashSessions.find(s=>s.id===id&&s.status==='closed');if(!s)return;const r=R.cashSummary(s);
 const html=`<article class="print-receipt"><h3>TropiSertão</h3><p>FECHAMENTO DE CAIXA · DEMONSTRAÇÃO</p><hr><dl><dt>Abertura</dt><dd>${date(s.openedAt)}</dd><dt>Fechamento</dt><dd>${date(s.closedAt)}</dd><dt>Saldo inicial</dt><dd>${money(s.openingCents)}</dd><dt>Vendas em dinheiro</dt><dd>${money(r.payments.Dinheiro)}</dd><dt>Vendas em Pix</dt><dd>${money(r.payments.Pix)}</dd><dt>Vendas em cartão</dt><dd>${money(r.payments['Cartão'])}</dd><dt>Entradas extras</dt><dd>${money(r.entriesCents)}</dd><dt>Retiradas</dt><dd>${money(r.withdrawalsCents)}</dd><dt>Dinheiro esperado</dt><dd>${money(s.expectedCents)}</dd><dt>Dinheiro contado</dt><dd>${money(s.countedCents)}</dd><dt>Diferença</dt><dd>${signedMoney(s.differenceCents)}</dd></dl><hr><div class="print-total"><span>VENDAS · ${r.salesCount} pedidos</span><span>${money(r.totalSalesCents)}</span></div><hr>${s.entries.map(e=>`<div class="print-line"><strong>${esc(e.reason)}</strong><small>${date(e.at)} · ${e.type==='sale'?esc(e.payment||'Outros'):e.type==='entry'?'Entrada':'Retirada'}</small><b>${e.type==='withdrawal'?'− ':''}${money(e.amountCents)}</b></div>`).join('')}<p class="print-footer">Valores e movimentações simulados neste navegador.<br>Sem operação financeira real.</p></article>`;
 $('print-title').textContent='Fechamento de caixa';$('print-confirm').innerHTML=svg('printer')+' Imprimir fechamento';$('print-preview').innerHTML=html;$('print-area').innerHTML=html;showDialog('print-dialog');
}
function showMessagePreview(o){
 const name=(o.customer.name||'Tropilover').split(' ')[0];
 const message=o.status==='preparando'?`Oi, ${name}! A TropiSertão aceitou seu pedido ${o.id} e já começou o preparo. Sua combinação está ganhando aquele toque de frescor e sabor. Vamos avisar quando ${o.delivery==='Entrega'?'sair para entrega':'estiver pronta para retirada'}!`:`Oi, ${name}! Seu pedido ${o.id} saiu para entrega. Sua explosão de sabores está a caminho! Obrigado por escolher a TropiSertão.`;
 $('message-stage').textContent=o.status==='preparando'?'PEDIDO ACEITO · EM PREPARO':'PEDIDO SAIU PARA ENTREGA';
 $('message-order').textContent=o.id+' · '+(o.customer.name||'Cliente da demonstração');
 $('message-text').textContent=message;showDialog('message-dialog');
}
function sampleOrders(){
 const today=R.periodKey(Date.now()),base=new Date(today+'T10:00:00-03:00').getTime();
 const examples=[['001','Marina (exemplo)','recebido','Entrega','500',['ninho'],'Pix',0],['002','João (exemplo)','preparando','Entrega','300',['morango'],'Cartão',15],['003','Ana (exemplo)','entrega','Entrega','500',['maracuja'],'Dinheiro',30],['004','Lucas (exemplo)','concluido','Retirada','500',[],'Pix',45],['005','Clara (exemplo)','concluido','Retirada','300',['ninho'],'Cartão',60],['006','Pedro (exemplo)','cancelado','Entrega','300',[],'Pix',75]];
 for(const [id,name,status,delivery,productId,extras,payment,minutes] of examples){
  const key='EXEMPLO-'+id;if(orders.some(o=>o.id===key))continue;
  const line={productId,extras,qty:1,reward:false},value=R.unitPrice(line);
  orders.push({id:key,date:base+minutes*60000,status,customer:{id:key,name,phone:'Telefone de exemplo'},total:value,payment,delivery,address:delivery==='Entrega'?'Rua de exemplo, 100 · Centro':'',reference:'',change:0,reward:false,lines:[{...line,label:'1× Salada '+R.product(productId).size+(extras.length?' + '+extras.map(id=>R.extra(id).name).join(' + '):''),unitPrice:value,subtotal:value,notes:''}]});
 }
 orders.sort((a,b)=>b.date-a.date);save('tropisertao-demo-orders-v2',orders);filter='pendentes';renderAccount();renderAdmin();toast('Pedidos fictícios carregados para apresentação.');
}
function itemDetails(o){return o.lines.map(l=>`<div class="detail-line"><strong>${esc(l.label)}</strong>${l.notes?`<p>Obs.: ${esc(l.notes)}</p>`:''}${Number.isFinite(l.unitPrice)?`<p><small>Unidade: ${money(l.unitPrice)} · ${l.qty} ×</small></p><p>Subtotal: <b>${money(l.subtotal)}</b></p>`:''}</div>`).join('');}
function openDetail(id,owner){
 const o=orders.find(x=>x.id===id);if(!o||(!owner&&o.customer.id!==profile.id))return;detailOwner=owner;
 $('detail-title').textContent=o.id;
 $('detail-content').innerHTML=`<div class="order-top"><span class="order-date">${date(o.date)}</span>${statusBadge(o)}</div><section class="detail-section"><h3>Cliente</h3><p><b>${esc(o.customer.name||'Cliente da demonstração')}</b></p><p>${esc(o.customer.phone||'Telefone não informado')}</p></section><section class="detail-section"><h3>Seu pedido${o.reward?' · presente fidelidade':''}</h3>${itemDetails(o)}</section><section class="detail-section"><h3>Recebimento</h3><p>${esc(o.delivery)}</p><p>${esc(o.delivery==='Entrega'?o.address||'Não informado':'Local de retirada a combinar com a loja.')}</p>${o.reference?`<p>Referência: ${esc(o.reference)}</p>`:''}</section><section class="detail-section"><h3>Pagamento</h3><p>${esc(o.payment)} · simulação</p>${o.change?`<p>Troco para ${money(o.change)}</p>`:''}<p><small>Taxa de entrega a confirmar. Nenhum pagamento cobrado.</small></p></section><div class="detail-total"><span>Total dos produtos</span><strong>${money(o.total)}</strong></div><p class="help-text">Demonstração. Nenhum pedido enviado à loja.</p>`;
 $('detail-actions').innerHTML=owner?`<div class="detail-actions full"><button class="secondary" data-action="admin">${svg('chevron-left')} Pedidos</button><button class="secondary" data-print="${o.id}">${svg('printer')} Imprimir</button>${statusAction(o)}${['recebido','preparando','entrega'].includes(o.status)?`<button class="text-button" data-status="cancelado" data-order="${o.id}">Cancelar pedido</button>`:''}</div>`:`<button class="secondary full" data-action="orders">Voltar aos meus pedidos</button>`;
 showDialog('detail-dialog');
}
function printMarkup(o){
 return `<article class="print-receipt"><h3>TropiSertão</h3><p>COMANDA · DEMONSTRAÇÃO</p><hr><dl><dt>Pedido</dt><dd>${esc(o.id)} · ${states[o.status]}</dd><dt>Data</dt><dd>${date(o.date)}</dd><dt>Cliente</dt><dd>${esc(o.customer.name||'Cliente da demonstração')}</dd><dt>Telefone</dt><dd>${esc(o.customer.phone||'Não informado')}</dd><dt>Recebimento</dt><dd>${esc(o.delivery)}</dd>${o.delivery==='Entrega'?`<dt>Endereço</dt><dd>${esc(o.address||'Não informado')}</dd>`:''}${o.reference?`<dt>Referência</dt><dd>${esc(o.reference)}</dd>`:''}<dt>Pagamento</dt><dd>${esc(o.payment)} (simulação)</dd>${o.change?`<dt>Troco para</dt><dd>${money(o.change)}</dd>`:''}</dl><hr>${o.lines.map(l=>`<div class="print-line"><strong>${esc(l.label)}</strong>${l.notes?`<small>OBS.: ${esc(l.notes)}</small>`:''}${Number.isFinite(l.unitPrice)?`<span><small>${l.qty} × ${money(l.unitPrice)}</small><b>${money(l.subtotal)}</b></span>`:''}</div>`).join('')}${o.reward?'<p>PRESENTE DO CARTÃO FIDELIDADE</p>':''}<hr><div class="print-total"><span>PRODUTOS</span><span>${money(o.total)}</span></div><p class="print-footer">Taxa de entrega a confirmar.<br>Nenhum pedido enviado à loja.<br>Nenhum pagamento cobrado.</p></article>`;
}
function openPrint(id){const o=orders.find(x=>x.id===id);if(!o)return;const html=printMarkup(o);$('print-title').textContent='Pronto para imprimir';$('print-confirm').innerHTML=svg('printer')+' Imprimir pedido';$('print-preview').innerHTML=html;$('print-area').innerHTML=html;showDialog('print-dialog');}
function startCheckout(){
 const error=R.validateCheckout(cart,loyalty());if(error){toast(error);return;}
 $('checkout-summary-items').innerHTML=cart.map(l=>`<div class="summary-line"><span>${l.qty}× ${esc(R.lineTitle(l))}${l.reward?'<small>Presente fidelidade</small>':''}${l.extras.length||R.product(l.productId).kind==='combo'?'<small>'+esc(R.lineDescription(l))+'</small>':''}${l.notes?'<small>Obs.: '+esc(l.notes)+'</small>':''}</span><strong>${money(R.unitPrice(l)*l.qty)}</strong></div>`).join('');
 $('checkout-total').textContent=money(total());$('customer-name').value=profile.name;$('customer-phone').value=profile.phone;showDialog('checkout-dialog');
}
function submitOrder(e){
 e.preventDefault();const error=R.validateCheckout(cart,loyalty());if(error){toast(error);return;}
 const form=new FormData(e.currentTarget),name=String(form.get('customer')||'').trim();
 if(!name){$('customer-name').setCustomValidity('Informe um nome para a demonstração.');$('customer-name').reportValidity();return;}
 const change=Number(form.get('change')),payment=form.get('payment'),changeCents=payment==='Dinheiro'&&change>0?Math.round(change*100):0;
 if(changeCents&&changeCents<total()){$('customer-change').setCustomValidity('O valor para troco precisa cobrir os produtos.');$('customer-change').reportValidity();return;}
 profile={...profile,name:name.slice(0,60),phone:String(form.get('phone')||'').slice(0,20)};
 save('tropisertao-demo-profile-v2',profile);
 const number=Math.max(0,...orders.map(o=>Number(o.id.replace('TROPI-',''))||0))+1;
 const order={id:'TROPI-'+String(number).padStart(3,'0'),date:Date.now(),status:'recebido',customer:{...profile},total:total(),payment,delivery:form.get('delivery')==='entrega'?'Entrega':'Retirada',address:form.get('delivery')==='entrega'?String(form.get('address')||'').trim().slice(0,180):'',reference:form.get('delivery')==='entrega'?String(form.get('reference')||'').trim().slice(0,120):'',change:changeCents,reward:cart.every(l=>l.reward),lines:cart.map(l=>({label:R.lineLabel(l),productId:l.productId,extras:[...l.extras],comboJuiceId:l.comboJuiceId||'',notes:l.notes,qty:l.qty,unitPrice:R.unitPrice(l),subtotal:R.unitPrice(l)*l.qty,reward:l.reward}))};
 // Mixed paid/reward orders earn a stamp and consume exactly one existing gift.
 order.reward=cart.every(l=>l.reward);
 order.redeemsReward=cart.some(l=>l.reward);
 orders.unshift(order);save('tropisertao-demo-orders-v2',orders);cart=[];updateCart();
 $('checkout-form').reset();deliveryFields();paymentFields();
 $('success-receipt').innerHTML=`<span>${order.id}</span><strong>${money(order.total)}</strong>`;
 $('success-loyalty').innerHTML=loyaltyMarkup(!order.reward);
 showDialog('success-dialog');
}
function deliveryFields(){const delivery=$('checkout-form').elements.delivery.value==='entrega';$('address-fields').hidden=!delivery;$('customer-address').required=delivery;$('delivery-help').textContent=delivery?'Taxa de entrega a confirmar com a loja.':'Local de retirada a combinar com a loja.';}
function paymentFields(){const cash=$('checkout-form').elements.payment.value==='Dinheiro';$('change-fields').hidden=!cash;if(!cash){$('customer-change').value='';$('customer-change').setCustomValidity('');}}
// CLOUD_BRIDGE
document.addEventListener('click',e=>{
 const close=e.target.closest('[data-close]');if(close){closeDialog(close.closest('dialog'));return;}
 const p=e.target.closest('[data-product]');if(p){openBuilder(p.dataset.product);return;}
 const extra=e.target.closest('[data-extra]');if(extra){openBuilder('300',extra.dataset.extra);return;}
 const cat=e.target.closest('[data-category]');if(cat){category=cat.dataset.category;renderMenu();return;}
 const change=e.target.closest('[data-cart-change]');if(change){const l=cart.find(x=>x.key===change.dataset.key);if(l&&!change.disabled){l.qty=Math.max(0,Math.min(l.reward?1:20,l.qty+Number(change.dataset.cartChange)));cart=cart.filter(x=>x.qty>0);updateCart();}return;}
 const remove=e.target.closest('[data-remove]');if(remove){cart=cart.filter(x=>x.key!==remove.dataset.remove);updateCart();return;}
 const f=e.target.closest('[data-filter]');if(f){filter=f.dataset.filter;renderAdmin();return;}
 const detail=e.target.closest('[data-detail]');if(detail){openDetail(detail.dataset.detail,detail.dataset.owner==='true');return;}
 const print=e.target.closest('[data-print]');if(print){openPrint(print.dataset.print);return;}
 const cashPrint=e.target.closest('[data-cash-report]');if(cashPrint){openCashPrint(cashPrint.dataset.cashReport);return;}
 const status=e.target.closest('[data-status]');if(status){
  const o=orders.find(x=>x.id===status.dataset.order),ownerView=!!status.closest('#admin-dialog,#account-dialog')||detailOwner&&!!status.closest('#detail-dialog');
  if(ownerView&&R.canTransition(o,status.dataset.status)){
   o.status=status.dataset.status;o.updatedAt=Date.now();
   if(o.status==='concluido'){o.completedAt=o.updatedAt;cashSessions=R.bookCashSale(cashSessions,o,o.updatedAt);persistCash();}
   save('tropisertao-demo-orders-v2',orders);
   if($('detail-dialog').open)openDetail(o.id,true);else if($('admin-dialog').open)renderAdmin();else renderAccount();
   if(['preparando','entrega'].includes(o.status))showMessagePreview(o);
   else toast('Pedido: '+states[o.status].toLocaleLowerCase('pt-BR')+'.');
  }return;
 }
 const period=e.target.closest('[data-report-period]');if(period){openReport(period.dataset.reportPeriod,true);return;}
 const action=e.target.closest('[data-action]');if(action){switch(action.dataset.action){
 case'cart':renderCart();showDialog('cart-dialog');break;
 case'orders':renderOrders();showDialog('orders-dialog');break;
 case'account':renderAccount();showDialog('account-dialog');break;
 case'club':renderClub();showDialog('club-dialog');break;
 case'admin':renderAdmin();showDialog('admin-dialog');break;
 case'report-day':openReport('day');break;
 case'report-week':openReport('week');break;
 case'report-month':openReport('month');break;
 case'report-print':openReportPrint();break;
 case'cash':renderCash();showDialog('cash-dialog');break;
 case'copy-message':try{navigator.clipboard.writeText($('message-text').textContent).then(()=>toast('Prévia copiada.'),()=>toast('Não foi possível copiar neste navegador.'));}catch{toast('Não foi possível copiar neste navegador.');}break;
 case'sample-orders':sampleOrders();break;
 case'about':showDialog('about-dialog');break;
 case'reward':openBuilder('500',null,true);break;
 case'choose':choose();break;
 case'reset-search':category='tudo';$('search').value='';renderMenu();break;
 case'confirm-print':window.print();break;
 }}
 const nav=e.target.closest('[data-nav]');if(nav)document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a===nav));
 const slide=e.target.closest('[data-slide-to],[data-slide-change]');if(slide){userPaused=true;updatePause();setSlide(slide.dataset.slideTo!==undefined?Number(slide.dataset.slideTo):slideIndex+Number(slide.dataset.slideChange));}
});
document.querySelectorAll('dialog').forEach(d=>{
 d.addEventListener('cancel',e=>{e.preventDefault();closeDialog(d);});
 d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(d);});
});
document.querySelector('.category-tabs').addEventListener('keydown',e=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=Array.from(document.querySelectorAll('[data-category]'));let n=tabs.findIndex(t=>t.dataset.category===category);n=e.key==='Home'?0:e.key==='End'?tabs.length-1:(n+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;category=tabs[n].dataset.category;renderMenu();tabs[n].focus();tabs[n].scrollIntoView({block:'nearest',inline:'nearest'});
});
$('search').addEventListener('input',renderMenu);$('clear-search').addEventListener('click',()=>{$('search').value='';renderMenu();$('search').focus();});
$('admin-search').addEventListener('input',renderAdmin);
$('report-date').addEventListener('change',renderReport);
document.addEventListener('submit',cashFormSubmit);
document.addEventListener('input',e=>{
 if(e.target.id!=='cash-counted')return;const s=currentCash();if(!s)return;
 const counted=R.parseMoney(e.target.value),diff=counted===null?null:counted-R.cashSummary(s).expectedCents;
 $('cash-close-preview').textContent=diff===null?'Esperado: '+money(R.cashSummary(s).expectedCents):diff===0?'Tudo certo: dinheiro conferido.':'Diferença: '+signedMoney(diff);
});
$('size-options').addEventListener('change',updateBuilder);$('builder-extras').addEventListener('change',updateBuilder);
$('combo-juices').addEventListener('change',updateBuilder);
$('builder-less').addEventListener('click',()=>{builder.qty=Math.max(1,builder.qty-1);updateBuilder();});$('builder-more').addEventListener('click',()=>{builder.qty=Math.min(20,builder.qty+1);updateBuilder();});
$('add-to-bag').addEventListener('click',()=>{
 const line={...builder,extras:[...builder.extras],key:uid(),notes:$('notes').value.trim()};
 if(!R.validLine(line)||line.reward&&(loyalty().available<1||cart.some(l=>l.reward))){toast('Revise os adicionais e seu presente disponível.');return;}
 const match=!line.reward&&cart.find(l=>!l.reward&&l.productId===line.productId&&(l.comboJuiceId||'')===(line.comboJuiceId||'')&&l.notes===line.notes&&l.extras.slice().sort().join(',')===line.extras.slice().sort().join(','));
 if(match&&match.qty+line.qty<=20)match.qty+=line.qty;else cart.push(line);
 updateCart();closeDialog($('builder-dialog'));toast(line.reward?'Seu presente foi adicionado à sacola.':'Sua combinação está na sacola.');
});
$('start-checkout').addEventListener('click',startCheckout);$('checkout-form').addEventListener('submit',submitOrder);
document.querySelectorAll('input[name="delivery"]').forEach(i=>i.addEventListener('change',deliveryFields));
document.querySelectorAll('input[name="payment"]').forEach(i=>i.addEventListener('change',paymentFields));
$('customer-name').addEventListener('input',()=>$('customer-name').setCustomValidity(''));
$('customer-change').addEventListener('input',()=>$('customer-change').setCustomValidity(''));
window.addEventListener('resize',updateCart);
window.addEventListener('storage',e=>{if(LIVE)return;if(e.key==='tropisertao-demo-orders-v2'){const value=read(e.key,[]);if(Array.isArray(value)){orders=value;if($('account-dialog').open)renderAccount();if($('club-dialog').open)renderClub();if($('orders-dialog').open)renderOrders();if($('admin-dialog').open)renderAdmin();if($('report-dialog').open)renderReport();}}});
window.addEventListener('storage',e=>{if(LIVE)return;if(e.key==='tropisertao-demo-cash-v1'){const value=read(e.key,[]);if(Array.isArray(value)){cashSessions=value;if($('cash-dialog').open)renderCash();if($('account-dialog').open)renderAccount();}}});
const motion=matchMedia('(prefers-reduced-motion: reduce)');
let slideIndex=0,userPaused=motion.matches,hovering=false;
function setSlide(index){slideIndex=(index+2)%2;document.querySelectorAll('[data-slide]').forEach(e=>e.hidden=Number(e.dataset.slide)!==slideIndex);document.querySelectorAll('[data-slide-to]').forEach(e=>{const active=Number(e.dataset.slideTo)===slideIndex;e.classList.toggle('active',active);e.setAttribute('aria-pressed',String(active));});}
function updatePause(){$('carousel-pause').setAttribute('aria-label',userPaused?'Reproduzir carrossel':'Pausar carrossel');$('carousel-pause').innerHTML=svg(userPaused?'play':'pause');}
$('carousel-pause').addEventListener('click',()=>{userPaused=!userPaused;updatePause();});
$('banner').addEventListener('mouseenter',()=>hovering=true);$('banner').addEventListener('mouseleave',()=>hovering=false);
setInterval(()=>{if(!userPaused&&!motion.matches&&!hovering&&!document.hidden&&!document.querySelector('dialog[open]')&&!$('banner').contains(document.activeElement))setSlide(slideIndex+1);},6500);
paint();renderMenu();updateCart();updatePause();
})();
