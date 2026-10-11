import workerApp from './app.cjs';
let lastEnv,app;
function create(env){if(lastEnv!==env){app=workerApp.configure(env);lastEnv=env;}return app;}
export default {
  async fetch(request,env,ctx){return create(env).handle(request,ctx);},
  async scheduled(controller,env,ctx){if(env.WHATSAPP_ENABLED==='true')ctx.waitUntil(create(env).scheduled());}
};
