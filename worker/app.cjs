'use strict';
const {createFirestore} = require('./firestore.cjs');
const {verifyFirebaseToken,verifyAppCheck}=require('./auth.cjs');
const {createService}=require('../functions/lib/service.cjs');
const {createWhatsApp}=require('../functions/lib/whatsapp.cjs');
const {requireUser,AppError,digest}=require('../functions/lib/domain.cjs');
const ROUTES={createOrder:'createOrder',updateOrderStatus:'updateStatus',cashAction:'cashAction',getOrderReport:'report',getStoreConnection:'connection',getLoyalty:'getLoyalty'};
const codeToStatus={'invalid-argument':400,unauthenticated:401,'permission-denied':403,'not-found':404,'failed-precondition':409,aborted:409,'resource-exhausted':429};
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
function configure(env, dependency={}) {
  if(!env?.FIREBASE_PROJECT_ID)throw new Error('Missing FIREBASE_PROJECT_ID');
  const serviceAccount=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||'{}');
  const db=dependency.db||createFirestore({projectId:env.FIREBASE_PROJECT_ID,serviceAccount});
  const enabled=env.WHATSAPP_ENABLED==='true' && !!env.WHATSAPP_ACCESS_TOKEN && !!env.WHATSAPP_PHONE_NUMBER_ID && !!env.WHATSAPP_GRAPH_API_VERSION;
  const monthlyCap=Number(env.WHATSAPP_MONTHLY_CAP || 1000);
  if (!Number.isInteger(monthlyCap) || monthlyCap < 1 || monthlyCap > 1000) throw new Error('Invalid WHATSAPP_MONTHLY_CAP (1-1000)');
  const service=createService({db,whatsappEnabled:()=>enabled});
  const whatsapp=createWhatsApp({db,config:()=>({enabled,phoneNumberId:env.WHATSAPP_PHONE_NUMBER_ID,wabaId:env.WHATSAPP_WABA_ID,version:env.WHATSAPP_GRAPH_API_VERSION,token:env.WHATSAPP_ACCESS_TOKEN,appSecret:env.WHATSAPP_APP_SECRET,preparoTemplate:env.WHATSAPP_TEMPLATE_PREPARO||'tropi_pedido_em_preparo',entregaTemplate:env.WHATSAPP_TEMPLATE_ENTREGA||'tropi_pedido_saiu_entrega',language:'pt_BR',monthlyCap,billingTimeZone:env.WHATSAPP_BILLING_TIME_ZONE||'America/Fortaleza'})});
  const expectedOrigins=new Set(String(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean));
  if(!expectedOrigins.size)throw new Error('Missing ALLOWED_ORIGINS');
  const authorize=dependency.authorize||((token)=>verifyFirebaseToken(token,env.FIREBASE_PROJECT_ID));
  if(!dependency.checkApp&&!/^1:\d+:(web|android|ios):[a-zA-Z0-9]+$/.test(env.FIREBASE_APP_ID||''))throw new Error('Missing FIREBASE_APP_ID');
  const check=dependency.checkApp||((token)=>verifyAppCheck(token,env.FIREBASE_APP_ID));
  let databaseCheck=null,databaseCheckAt=0;
  function databaseHealth(){
    if(!databaseCheck||Date.now()-databaseCheckAt>60000){
      databaseCheckAt=Date.now();
      databaseCheck=db.runTransaction(async tx=>{
        // Exercise the checkout reads and roll back without creating any order,
        // changing loyalty, advancing the counter or returning document data.
        await tx.get(db.doc('orderRequests/tropi-health-check'));
        await Promise.all(['controls/orderCounter','customers/tropi-health-check','orderRateLimits/tropi-health-check'].map(path=>tx.get(db.doc(path))));
      }).then(()=>({status:'ok',database:'ok'})).catch(error=>({status:'unavailable',database:'unavailable',diagnostic:{status:Number.isInteger(error.status)?error.status:500,code:/^[A-Z_]{1,50}$/.test(error.code||'')?error.code:'INTERNAL'}}));
    }
    return databaseCheck;
  }
  async function handle(req,ctx={waitUntil:()=>{}}){
    const url=new URL(req.url),path=url.pathname,origin=req.headers.get('origin')||'',allow=expectedOrigins.has(origin);
    const headers=allow?{'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-headers':'Authorization, Content-Type, X-Firebase-AppCheck','access-control-allow-methods':'POST, OPTIONS','access-control-max-age':'600'}:{};
    if(path==='/api/health'){
      const health=await databaseHealth();
      return json({...health,whatsappEnabled:enabled},health.status==='ok'?200:503,headers);
    }
    if(path==='/api/whatsapp/webhook'){
      if(req.method==='GET')return req.headers.get('hub.mode')==='subscribe' && env.WHATSAPP_VERIFY_TOKEN && url.searchParams.get('hub.verify_token')===env.WHATSAPP_VERIFY_TOKEN?new Response(url.searchParams.get('hub.challenge')||'',{status:200}):new Response('Forbidden',{status:403});
      if(req.method!=='POST')return new Response('Method Not Allowed',{status:405});
      if(!env.WHATSAPP_APP_SECRET)return new Response('Webhook not configured',{status:503});
      const bytes=await req.arrayBuffer();if(bytes.byteLength>128000)return new Response('Payload too large',{status:413});
      let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return new Response('Invalid JSON',{status:400});}
      try{const result=await whatsapp.webhook({rawBody:Buffer.from(bytes),signature:req.headers.get('X-Hub-Signature-256'),body});return new Response('',{status:result.status});}catch(e){console.error('Webhook processing failure');return new Response('',{status:500});}
    }
    const name=path.startsWith('/api/')?path.slice(5):'';
    if(!(name in ROUTES))return json({error:'Não encontrado.'},404,headers);
    if(req.method==='OPTIONS')return new Response('',{status:allow?204:403,headers});
    if(req.method!=='POST')return json({error:'Método não permitido.'},405,headers);
    if(!allow)return json({error:'Origem não autorizada.'},403,headers);
    const rawBearer=req.headers.get('authorization')||'';
    if(!/^Bearer [^ ]+$/.test(rawBearer))return json({error:'Entre na sua conta para continuar.',code:'unauthenticated'},401,headers);
    if(Number(req.headers.get('content-length')||0)>60000)return json({error:'Solicitação muito grande.'},413,headers);
    try{
      // Firebase JWT + App Check mandatory even for anonymous purchasers.
      let user;try{user=await authorize(rawBearer.slice(7));}catch(e){return json({error:'Sessão inválida. Entre novamente.',code:'unauthenticated'},401,headers);}
      try{await check(req.headers.get('x-firebase-appcheck'));}catch(e){return json({error:'Não foi possível verificar a segurança desta sessão. Recarregue a página.',code:'permission-denied'},403,headers);}
      if (typeof user?.uid!=='string' || !user.uid)return json({error:'Sessão inválida.',code:'unauthenticated'},401,headers);
      if(env.RATE_LIMIT_PEPPER && req.headers.get('cf-connecting-ip')) user.ipHash=digest(env.RATE_LIMIT_PEPPER+':'+req.headers.get('cf-connecting-ip'));
      let data={};
      const text=await req.text();if(text.length>60000)return json({error:'Solicitação muito grande.'},413,headers);
      try{data=JSON.parse(text||'{}');}catch{return json({error:'Confira os dados enviados.'},400,headers);}
      let result;
      if(name==='getStoreConnection'){requireUser(user,true);result={whatsappEnabled:enabled};}
      else result=await service[ROUTES[name]](user,data);
      if(name==='updateOrderStatus'&&enabled&&result.order?.notifications?.[result.order.status]?.state==='pending'){
        const id=result.order.id+'__'+result.order.status;
        if(!result.duplicate)ctx.waitUntil(whatsapp.process(id).catch(()=>console.error('WhatsApp send failure')));
      }
      return json(result,200,headers);
    }catch(e){
      if(e instanceof AppError)return json({error:e.message,code:e.code},codeToStatus[e.code]||400,headers);
      if(e.status===409)return json({error:'A loja recebeu uma alteração ao mesmo tempo. Tente novamente.',code:'aborted'},409,headers);
      console.error('Tropi API failed',{status:e.status||500,code:e.code||'internal'});
      return json({error:'Não foi possível concluir. Tente novamente.',code:'internal'},500,headers);
    }
  }
  return {handle,async scheduled(){await service.expirePending();if(enabled)await whatsapp.retryDue();},db};
}
module.exports={configure};
