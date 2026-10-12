// Included inside the app closure. The demo remains the default build.
if(LIVE){
 const owner=()=>cloudSession?.owner===true;
 const baseShowDialog=showDialog,baseRenderAccount=renderAccount,baseRenderAdmin=renderAdmin;
 const baseCurrentReport=currentReport,baseRenderReport=renderReport,baseOpenPrint=openPrint;
 const reports=new Map();let reportRequest=0,submitting=false,connection=null,authPage='login';
 const notificationLabels={pending:'Na fila',retry:'Nova tentativa agendada',sending:'Enviando',accepted:'Aceita pelo WhatsApp',sent:'Enviada',delivered:'Entregue',read:'Lida',failed:'Falha no envio',unknown:'Envio a conferir',blocked:'Configuração pendente',disabled:'Envio não ativado','no-consent':'Cliente não autorizou',superseded:'Etapa já atualizada'};
 function copyLive(scope){
  const mappings=[
   ['Demonstração: use dados fictícios. Nenhum pedido é enviado à loja e nenhum pagamento é cobrado.','Seu pedido será registrado na TropiSertão. O pagamento é combinado diretamente com a loja.'],
   ['Seu perfil, pedidos e cartão demonstrativos ficam salvos neste navegador.','Crie uma conta para acessar seus pedidos e cartão em outros dispositivos.'],
   ['Concluir demonstração','Confirmar pedido'],['Demonstração concluída.','Pedido recebido pela TropiSertão.'],
   ['PAINEL DA LOJA · DEMONSTRAÇÃO','PAINEL DA LOJA'],['COMANDA · DEMONSTRAÇÃO','COMANDA'],
   ['Relatório demonstrativo. Valores dos produtos, sem taxa de entrega.','Faturamento dos pedidos finalizados, incluindo a entrega.'],
   ['Aceite o pedido, acompanhe o preparo e a entrega e imprima a comanda. As mensagens de WhatsApp são prévias de demonstração.','Aceite o pedido, acompanhe o preparo e a entrega e imprima a comanda. Confira abaixo o estado das mensagens.'],
   ['Caixa demonstrativo, salvo apenas neste navegador. Nenhuma movimentação ou cobrança real.','Caixa sincronizado com a loja. Pix e cartão ficam separados do dinheiro físico.'],
   ['Apresentação da área do dono. Pedidos, caixa e mensagens são simulados e ficam neste navegador.','Pedidos recentes sincronizados com a loja. Os relatórios consultam o período completo no servidor.'],
   ['Carregue exemplos para conhecer os pedidos e acompanhar cada etapa.','Os pedidos feitos no site aparecerão aqui.'],
   ['Proposta interativa de demonstração. Perfil, pedidos, gestão e fidelidade são simulados neste navegador.','Pedidos e cartão fidelidade conectados à TropiSertão.'],
   ['Nenhum pedido enviado à loja.','Pedido registrado na TropiSertão.'],['Demonstração. ',''],
   ['Nenhum pagamento cobrado.','Pagamento diretamente com a loja.'],[' (simulação)',''],[' · simulação',''],
   [' · DEMONSTRAÇÃO',''],['Dados de demonstração.','Dados da loja.']
  ];
  const walk=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);let node;
  while((node=walk.nextNode())){if(node.parentElement?.closest('script,style'))continue;let value=node.nodeValue;for(const [from,to]of mappings)value=value.split(from).join(to);node.nodeValue=value;}
 }
 function cloudError(error){
  const messages={'auth/invalid-credential':'Telefone ou senha incorretos.','auth/email-already-in-use':'Este telefone já está cadastrado. Use Entrar.','auth/weak-password':'Use uma senha com pelo menos 6 caracteres.','auth/too-many-requests':'Aguarde alguns minutos e tente novamente.','auth/network-request-failed':'Confira sua conexão e tente novamente.'};
  toast(messages[error?.code]||error?.message||'Não foi possível conectar. Tente novamente.');
 }
 function refreshVisible(){
  if($('account-dialog').open)renderAccount();
  if($('admin-dialog').open)renderAdmin();
  if($('orders-dialog').open)renderOrders();
  if($('club-dialog').open)renderClub();
  if($('cash-dialog').open){renderCash();copyLive($('cash-dialog'));}
  if($('report-dialog').open)renderReport();
  if($('detail-dialog').open)openDetail($('detail-title').textContent,detailOwner);
 }
 showDialog=function(id){
  if(['admin-dialog','report-dialog','cash-dialog'].includes(id)&&!owner()){renderAccount();baseShowDialog('account-dialog');return;}
  baseShowDialog(id);copyLive($(id));
 };
 renderAccount=function(){
  $('account-dialog').querySelector('.sheet-top .eyebrow').textContent=owner()?'PAINEL DO LOJISTA':'SUA CONTA';
  if(!owner()){
   if(cloudSession&&!cloudSession.anonymous){
    $('account-content').innerHTML=`<div class="owner-heading"><span class="owner-menu-icon">${svg('user')}</span><div><h3>Minha conta</h3><p>Seus pedidos e benefícios Tropi do Sertão</p></div></div><div class="owner-menu"><button data-action="orders">${svg('receipt')}<strong>Meus pedidos</strong><small>Acompanhe as etapas da compra</small></button><button data-action="club">${svg('gift')}<strong>Meu cartão fidelidade</strong><small>Acompanhe seus benefícios</small></button></div><button class="secondary full" data-cloud-logout>Sair da conta</button>`;
   }else{
    const registering=authPage==='register';
    $('account-content').innerHTML=`<h3>${registering?'Criar conta':'Entrar'}</h3><p>${registering?'Cadastre seu telefone e uma senha para acompanhar seus pedidos.':'Acesse seus pedidos e seu cartão fidelidade.'}</p><form id="cloud-auth-form" data-mode="${registering?'register':'login'}"><label class="field-label" for="cloud-phone">Telefone com DDD</label><input class="text-input" type="tel" id="cloud-phone" name="phone" inputmode="tel" autocomplete="tel-national" placeholder="(88) 99999-9999" maxlength="20" required><label class="field-label" for="cloud-password">Senha</label><input class="text-input" type="password" id="cloud-password" name="password" minlength="8" autocomplete="${registering?'new-password':'current-password'}" required><button class="primary full" type="submit">${registering?'Criar conta':'Entrar'}</button></form><button type="button" class="secondary full" data-cloud-auth-page="${registering?'login':'register'}">${registering?'Já tenho conta · Entrar':'Criar conta'}</button>${registering?'<p class="help-text">O número informado não será verificado por SMS. Guarde sua senha.</p>':''}`;
   }
   $('account-title').textContent='Minha conta';return;
  }
  baseRenderAccount();copyLive($('account-content'));
  $('account-content').querySelector('.owner-demo').textContent='LOJA';
  $('account-content').querySelector('.owner-example')?.remove();
  const settings=$('account-content').querySelector('[data-action="about"] strong');if(settings)settings.textContent='Configurações da loja';
  $('account-content').insertAdjacentHTML('beforeend',`<p class="help-text">WhatsApp: ${connection?.whatsappEnabled?'envio automático ativado':'integração preparada; envio desativado'}.</p><button class="secondary full" data-cloud-logout>Sair da conta</button>`);
 };
 renderAdmin=function(){
  if(!owner())return;
  baseRenderAdmin();copyLive($('admin-dialog'));
  $('admin-dialog').querySelector('[data-action="sample-orders"]')?.remove();
  $('admin-stats').querySelector('small').textContent='Pedidos recentes';
  for(const button of $('admin-content').querySelectorAll('[data-order]')){
   const order=orders.find(o=>o.id===button.dataset.order);if(!order)continue;
   const stage=order.status==='preparando'?'preparando':'entrega',state=order.notifications?.[stage]?.state;
   if(state)button.parentElement.insertAdjacentHTML('beforeend',`<small class="notification-state">WhatsApp: ${esc(notificationLabels[state]||state)}</small>`);
  }
 };
 const reportKey=()=>reportPeriod+':'+$('report-date').value;
 currentReport=()=>reports.get(reportKey())||R.orderReport([],{period:reportPeriod,value:$('report-date').value});
 renderReport=function(){
  if(!owner())return;
  baseRenderReport();copyLive($('report-dialog'));
  const request=++reportRequest,key=reportKey();
  $('report-sync').hidden=false;$('report-sync').textContent='Atualizando resultados...';$('report-print').disabled=true;
  CLOUD.report({period:reportPeriod,value:$('report-date').value}).then(result=>{
   if(request!==reportRequest||key!==reportKey())return;
   reports.set(key,result);baseRenderReport();copyLive($('report-dialog'));$('report-sync').textContent='Período completo, sincronizado com a loja.';
  }).catch(error=>{if(request===reportRequest){$('report-sync').textContent='Não foi possível atualizar. Tente outra vez.';cloudError(error);}});
 };
 function withKnownOrder(id,callback){
  const original=orders;
  if(!orders.some(o=>o.id===id)&&owner()){
   const found=[...reports.values()].flatMap(report=>report.orders).find(o=>o.id===id);
   if(found)orders=[found,...orders];
  }
  try{return callback();}finally{orders=original;}
 }
 const baseOpenDetail=openDetail;openDetail=function(id,ownerMode=false){withKnownOrder(id,()=>baseOpenDetail(id,ownerMode&&owner()));copyLive($('detail-dialog'));};
 openPrint=function(id){withKnownOrder(id,()=>baseOpenPrint(id));copyLive($('print-preview'));copyLive($('print-area'));};
 const baseOpenReportPrint=openReportPrint;openReportPrint=function(){baseOpenReportPrint();copyLive($('print-preview'));copyLive($('print-area'));};
 const baseOpenCashPrint=openCashPrint;openCashPrint=function(id){baseOpenCashPrint(id);copyLive($('print-preview'));copyLive($('print-area'));};
 const baseRenderClub=renderClub;renderClub=function(){baseRenderClub();$('club-content').querySelector('.help-text').textContent='Seu cartão fidelidade TropiSertão. Cada pedido elegível aproxima você do próximo presente.';};
 const baseStartCheckout=startCheckout;startCheckout=async function(){try{await CLOUD.ready;baseStartCheckout();}catch(e){cloudError(e);}};
 submitOrder=async function(e){
  e.preventDefault();if(submitting)return;
  const error=R.validateCheckout(cart,loyalty());if(error){toast(error);return;}
  const values=new FormData(e.currentTarget),payment=values.get('payment');
  const parsed=R.parseMoney(values.get('change')),change=payment==='Dinheiro'&&values.get('change')?parsed:0;
  if(change===null){toast('Confira o valor para troco.');return;}
  const selected=e.currentTarget.querySelector('input[name="payment"]:checked');
  const data={name:String(values.get('customer')||'').trim(),phone:String(values.get('phone')||''),payment,cardType:selected?.dataset.cardType||'',change,
   delivery:values.get('delivery')==='entrega'?'Entrega':'Retirada',neighborhood:String(values.get('neighborhood')||''),address:String(values.get('address')||''),reference:String(values.get('reference')||''),
   whatsappOptIn:values.get('whatsappOptIn')==='on',lines:cart.map(l=>({...l,extras:[...l.extras]}))};
  const button=e.currentTarget.querySelector('[type="submit"]');submitting=true;button.disabled=true;
  const whatsappTab=beginWhatsAppHandoff();
  try{
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));
   const fingerprint=[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
   let pending=read('tropisertao-live-checkout-key',null);
   if(pending?.fingerprint!==fingerprint)pending={fingerprint,key:uid()};
   save('tropisertao-live-checkout-key',pending);
   const result=await CLOUD.createOrder({...data,requestKey:pending.key}),order=result.order;
   if(order.customer.id!==cloudSession?.uid){whatsappTab?.close();toast('Pedido registrado na conta anterior. Entre nela para acompanhar.');return;}
   cloudLoyalty=result.loyalty;profile={id:order.customer.id,name:order.customer.name,phone:order.customer.phone};
   orders=[order,...orders.filter(o=>o.id!==order.id)];cart=[];updateCart();
   localStorage.removeItem('tropisertao-live-checkout-key');$('checkout-form').reset();deliveryFields();paymentFields();
   $('success-receipt').innerHTML=`<span>${esc(order.id)}</span><strong>${money(order.payableTotal??order.total)}</strong>`;
   $('success-loyalty').innerHTML=loyaltyMarkup(!order.reward);
   finishWhatsAppHandoff(order,whatsappTab);
  }catch(error){whatsappTab?.close();cloudError(error);}finally{submitting=false;button.disabled=false;}
 };
 cashFormSubmit=async function(e){
  const form=e.target;if(!['cash-open-form','cash-movement-form','cash-close-form'].includes(form.id))return;
  e.preventDefault();if(!owner()||form.dataset.busy)return;
  const actor=cloudSession.uid,values=new FormData(form),session=currentCash(),requestKey=form.dataset.requestKey||uid();form.dataset.requestKey=requestKey;
  let data={requestKey};
  if(form.id==='cash-open-form')data={...data,action:'open',openingCents:R.parseMoney(values.get('opening'))};
  if(form.id==='cash-movement-form')data={...data,action:'movement',id:session?.id,type:values.get('type'),amountCents:R.parseMoney(values.get('amount')),reason:String(values.get('reason')||'')};
  if(form.id==='cash-close-form')data={...data,action:'close',id:session?.id,countedCents:R.parseMoney(values.get('counted'))};
  const button=form.querySelector('[type="submit"]');button.disabled=true;form.dataset.busy='true';
  try{const result=await CLOUD.cashAction(data);if(cloudSession?.uid!==actor||!owner())return;cashSessions=[result.session,...cashSessions.filter(s=>s.id!==result.session.id)];renderCash();copyLive($('cash-dialog'));toast('Caixa atualizado na loja.');}
  catch(error){cloudError(error);}finally{button.disabled=false;delete form.dataset.busy;}
 };
 document.addEventListener('click',async e=>{
  const status=e.target.closest('[data-status]');
  if(status){
   e.stopImmediatePropagation();e.preventDefault();if(!owner()||status.disabled)return;
   const actor=cloudSession.uid,order=orders.find(o=>o.id===status.dataset.order);if(!order)return;
   status.disabled=true;
   try{
    const result=await CLOUD.updateStatus({id:order.id,status:status.dataset.status,expectedStatus:order.status});
    if(cloudSession?.uid!==actor||!owner())return;
    orders=orders.map(o=>o.id===result.order.id?result.order:o);refreshVisible();
    toast(states[result.order.status]+'. '+(result.order.notifications?.[result.order.status]?'WhatsApp: '+(notificationLabels[result.order.notifications[result.order.status].state]||'atualizado')+'.':''));
   }catch(error){cloudError(error);}finally{status.disabled=false;}return;
  }
  const page=e.target.closest('[data-cloud-auth-page]');if(page){e.preventDefault();e.stopImmediatePropagation();authPage=page.dataset.cloudAuthPage;renderAccount();return;}
  const logout=e.target.closest('[data-cloud-logout]');if(logout){e.stopImmediatePropagation();try{await CLOUD.logout();renderAccount();}catch(error){cloudError(error);}return;}
  if(e.target.closest('[data-action="sample-orders"]')){e.stopImmediatePropagation();toast('Pedidos de exemplo ficam apenas na apresentação.');}
 },true);
 document.addEventListener('submit',async e=>{
  if(e.target.id!=='cloud-auth-form')return;e.preventDefault();
  const form=e.target,data=new FormData(form),buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  try{
   const method=form.dataset.mode==='register'?'register':'login';await CLOUD[method](String(data.get('phone')).trim(),String(data.get('password')));
   form.reset();authPage='login';renderAccount();toast(method==='register'?'Conta criada. Bem-vindo!':'Você entrou na sua conta.');
  }catch(error){cloudError(error);}finally{buttons.forEach(b=>b.disabled=false);}
 });
 const checkoutButton=$('checkout-form').querySelector('[type="submit"]');
 checkoutButton.innerHTML=svg('whatsapp')+' Enviar pedido para WhatsApp';
 $('checkout-form').querySelector('.checkout-summary').insertAdjacentHTML('beforeend','<p class="help-text">O pedido será registrado quando você tocar em Enviar pedido para WhatsApp. Confira e envie a mensagem no aplicativo para avisar a loja.</p>');
 $('customer-phone').required=true;$('customer-phone').previousElementSibling.querySelector('small').textContent='com DDD';
 $('whatsapp-consent').hidden=false;
 CLOUD.start({
  onSession(session){
   if(cloudSession?.uid!==session?.uid||cloudSession?.owner!==session?.owner){
    for(const id of ['admin-dialog','report-dialog','cash-dialog','detail-dialog','print-dialog','success-dialog','club-dialog','orders-dialog'])if($(id).open)$(id).close();
    for(const id of ['admin-content','report-content','cash-content','detail-content','detail-actions','print-preview','print-area','success-receipt','success-loyalty','orders-content','club-content'])$(id).innerHTML='';
    detailOwner=false;
   }
   cloudSession=session;connection=null;reports.clear();reportRequest++;
   profile={id:session?.uid||'',name:'',phone:''};cloudLoyalty=null;refreshVisible();
   if(session?.owner)CLOUD.connection().then(value=>{if(cloudSession?.uid!==session.uid||!owner())return;connection=value;if($('account-dialog').open)renderAccount();}).catch(cloudError);
  },
  onOrders(value){orders=value;refreshVisible();},
  onCash(value){cashSessions=value;if($('cash-dialog').open){renderCash();copyLive($('cash-dialog'));}},
  onProfile(value){if(value){profile={id:value.id,name:value.name||'',phone:value.phone||''};const counts=value.loyalty||{};
   const qualifying=counts.qualifying||0,redeemed=counts.redeemed||0,earned=Math.floor(qualifying/10),available=Math.max(0,earned-redeemed),rest=qualifying%10;
   cloudLoyalty={qualifying,redeemed,earned,available,stamps:rest===0&&available>0?10:rest,remaining:10-rest};
  }else cloudLoyalty=null;if($('club-dialog').open)renderClub();},
  onError:cloudError
 });
 copyLive(document.body);
}
