# GitHub — deploy automatico (Tropi do Sertão)

**Destino:** site `tropidosertao.web.app` e API `tropisertao-api`.

O workflow testa o projeto em cada alteração na branch `main`. O deploy fica inicialmente **desligado** e será habilitado somente quando as credenciais forem configuradas no GitHub.

## Configuração única (Settings → Secrets and variables → Actions)

**Repository secrets:**
- `CLOUDFLARE_API_TOKEN` — token restrito a Workers Scripts Edit na conta do Worker;
- `CLOUDFLARE_ACCOUNT_ID` — ID da conta Cloudflare;
- `FIREBASE_HOSTING_DEPLOY_JSON` — credencial de conta de serviço exclusiva para publicar Hosting no projeto `tropisertao-854d3`. Não reutilizar a conta de serviço do servidor que acessa o Firestore.

**Repository variables:**
- `TROPI_APP_CHECK_SITE_KEY` — chave pública do reCAPTCHA Enterprise já registrado.
- `TROPI_DEPLOY_READY` — manter `false` até que os testes, a configuração e as permissões do ambiente de produção estejam confirmados; mudar para `true` para ativar deploys de `main`.

## Segurança

O pipeline não publica regras do Firestore nem Cloud Functions; apenas Hosting e o Worker existente. Não ativar envios de WhatsApp por esse fluxo. O segredo `GOOGLE_SERVICE_ACCOUNT_JSON` permanece no Cloudflare, e **não** deve ir ao GitHub.

`config/firebase.local.json`, `dist/`, `node_modules/` e segredos devem ficar fora do controle de versão. O próprio workflow gera o arquivo de configuração pública necessário em tempo de build.

## Carga inicial

Envie o código atual do projeto a partir do computador onde o usuário fez as alterações recentes. Depois disso, alterações futuras podem ser feitas diretamente no GitHub e publicadas via Actions.
