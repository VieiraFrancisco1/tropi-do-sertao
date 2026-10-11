# Tropi do Sertão — ativar pedidos e WhatsApp sem Blaze

**Situação em 11/10/2026:** código de adaptação preparado e testes unitários locais executados. **Não foi publicado** no Firebase, Cloudflare ou Meta; não foram configurados segredos nem enviados pedidos/mensagens reais. O site Vercel continua como demonstração. A estrutura `functions/` anterior foi conservada para referência, mas **não deve ser publicada no plano Spark**.

## Arquitetura

- **Firebase Spark:** Firebase Hosting (interface), Authentication (login/anônimo), Firestore (pedidos, clientes, caixa, fidelidade) e App Check. Sem Cloud Functions, Cloud Run ou Blaze.
- **Cloudflare Workers Free:** cinco endpoints autenticados para pedidos/status/caixa/relatórios/conexão; valida os tokens Firebase Auth + App Check; processa a fila e o webhook oficial Meta; guarda as credenciais apenas no Worker.
- **WhatsApp Business Platform (Cloud API):** dois modelos utilitários aprovados pela Meta. Somente para clientes que marcaram o consentimento específico durante a compra; SAIR/PARAR/STOP bloqueia novos envios. **Mensagens podem ter custo de cobrança da Meta.**

**Não é automação pelo WhatsApp Web.** O sistema exige um número apto a usar a API oficial da Meta. Não coloque credenciais Meta, chave de conta de serviço ou token no frontend ou no repositório.

## Passo 1 — Firebase Spark

1. Abra [Firebase Console](https://console.firebase.google.com/) e selecione o projeto da loja. Confira o **ID exato**; a documentação antiga mencionava `tropisertao-854d3`, mas o ID deve ser confirmado em Configurações do projeto.
2. Use o plano **Spark**. Ative **Firestore** (modo produção), **Authentication → Email/senha** e **Anônimo**.
3. Cadastre um **aplicativo Web** no Firebase. Copie apenas os campos **públicos** `apiKey`, `authDomain`, `projectId` e `appId` para `config/firebase.local.json`, usando `config/firebase.worker.example.json` como modelo.
4. Ative **App Check** no app Web usando **reCAPTCHA Enterprise** e cole a **chave pública** em `appCheckSiteKey`. Confirme a lista de domínios autorizados (`PROJECT_ID.web.app` e `PROJECT_ID.firebaseapp.com`).
5. NÃO publique `firebase.json` ou Cloud Functions da versão antiga. Use `firebase.spark.json`, próprio desta versão.

## Passo 2 — serviço privado para Firestore e App Check

No **Google Cloud Console** do mesmo projeto, crie **uma conta de serviço dedicada** e atribua somente as permissões necessárias:

- **Cloud Datastore User** (`roles/datastore.user`) para acessar o Firestore via REST;
- **Firebase App Check Token Verifier** (`roles/firebaseappcheck.appCheckTokenVerifier`) para validar App Check no backend.

A conta deve acessar o projeto correto; configure-a apenas com a credencial autorizada dessa conta. Crie uma chave JSON **somente se o ambiente/política permitir**, armazene localmente fora do repositório e guarde seu conteúdo como segredo do Worker (mais abaixo). **Não copie o arquivo para `src`, `dist`, `assets`, GitHub ou Firebase Hosting.** Se a política proibir chaves de contas de serviço, é necessária outra forma de identidade/backend antes de ativar; não contorne essa política.

As chamadas autenticadas por conta de serviço **contornam as Firestore Security Rules**, portanto o Worker valida token Firebase, permissões de dono, App Check, preços, transições e limites antes de modificar dados. Em `firestore.rules`, clientes não podem gravar pedidos/caixa diretamente.

## Passo 3 — publicar o Cloudflare Worker

1. Crie conta [Cloudflare](https://dash.cloudflare.com/) e mantenha o plano **Workers Free**.
2. Na pasta do projeto, edite `worker/wrangler.toml` preenchendo `FIREBASE_PROJECT_ID` e `ALLOWED_ORIGINS` com as URLs reais do Firebase Hosting (e domínio personalizado, se houver). **Não coloque segredos no TOML**.
3. Instale o Node.js e faça login pelo terminal: `npx wrangler login`.
4. Configure os seguintes segredos com `npx wrangler secret put NOME_DO_SEGREDO --config worker/wrangler.toml` (o terminal solicitará o valor sem escrevê-lo no código):

   - `GOOGLE_SERVICE_ACCOUNT_JSON`: JSON completo da conta de serviço; **segredo obrigatório**.
   - `RATE_LIMIT_PEPPER`: uma string aleatória longa (opcional, mas recomendado); serve para armazenar apenas hash do IP em controle de abuso.

5. Rode `npx wrangler deploy --config worker/wrangler.toml` para publicar o Worker inicialmente **com `WHATSAPP_ENABLED="false"`**.
6. O endereço ficará no formato `https://tropisertao-api.SEUSUBDOMINIO.workers.dev`. Consulte `/api/health` para confirmar o funcionamento básico; esse teste **não valida acesso ao Firestore**.

Os endpoints usados pelo site são `POST /api/createOrder`, `updateOrderStatus`, `cashAction`, `getOrderReport` e `getStoreConnection`. São protegidos por **Firebase ID token**, **App Check**, CORS da origem permitida e controle de autorização do dono. O consentimento para WhatsApp é gravado junto ao pedido. O Worker utiliza a API REST oficial do Firestore e transações.

## Passo 4 — publicar site no Firebase Hosting

Edite `config/firebase.local.json` adicionando `workerApiUrl` com a URL HTTPS do Worker publicado, **sem barra final**.

No PowerShell, na pasta raiz do projeto:

```powershell
npm ci
npm test
npm run test:worker
npm run build:worker
npm run deploy:spark -- --project SEU_ID_FIREBASE
```

Esse comando de publicação utiliza **apenas Hosting e Firestore (regras + índices)**. Não publica Cloud Functions e não altera o site de demonstração da Vercel. O comando `build:worker` recusa publicar com configurações Firebase vazias.

**Conta do dono:** crie uma conta Firebase Authentication com e-mail/senha, obtenha o UID e siga o procedimento do `scripts/set-admin.cjs`/seção "Cadastrar o dono" de `PREPARAR_FIREBASE.md`. Use a conta Google administradora e credenciais de desenvolvedor locais com permissões adequadas; a permissão `tropiAdmin` é uma **custom claim** assinada pelo Firebase Admin SDK. Após atribuir a permissão, o dono deve sair e entrar novamente. Não existe senha administrativa embutida.

## Passo 5 — ligar o WhatsApp oficial

Depois que os pedidos reais **estiverem validados com WhatsApp desativado**:

1. Configure o portfólio empresarial, WABA, número de telefone, token de acesso permanente/autorizado e o aplicativo Meta. Confira coexistência/migração do número com seu fornecedor.
2. Cadastre para aprovação os modelos em `docs/whatsapp-templates.json`: `tropi_pedido_em_preparo` e `tropi_pedido_saiu_entrega`, idioma `pt_BR`. O WhatsApp/Meta decide categoria, aprovação e preço aplicáveis. Não habilite os envios sem modelos aprovados.
3. Preencha `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_GRAPH_API_VERSION` no `worker/wrangler.toml` com IDs/versão válidos.
4. Execute (cada um pede seu segredo no terminal):

```powershell
npx wrangler secret put WHATSAPP_ACCESS_TOKEN --config worker/wrangler.toml
npx wrangler secret put WHATSAPP_APP_SECRET --config worker/wrangler.toml
npx wrangler secret put WHATSAPP_VERIFY_TOKEN --config worker/wrangler.toml
```

5. Coloque `WHATSAPP_ENABLED = "true"` no `worker/wrangler.toml` e publique novamente com `npx wrangler deploy --config worker/wrangler.toml`.
6. Na Meta, configure o webhook como `https://tropisertao-api.SEUSUBDOMINIO.workers.dev/api/whatsapp/webhook`. Use o mesmo `WHATSAPP_VERIFY_TOKEN` e assine `messages`/WABA. O webhook confere a assinatura HMAC com o **App Secret**. O callback **não fica em `firebase.web.app`** nesta versão.
7. Teste o pedido com seu próprio telefone e consentimento marcado. Teste também sem consentimento (não pode enviar); confirme preparo, saída para entrega, cancelamento, status de entrega e texto SAIR. Em retirada, não há mensagem de saída para entrega. O Worker tenta o envio após a mudança de status; um cron faz nova verificação a cada 2 minutos.

Os casos de rede ambígua são marcados `unknown` e exigem conferência no painel Meta; não são reenviados automaticamente, reduzindo risco de mensagens duplicadas. Os estados podem ser atualizados pelo webhook; a Meta não garante entrega a todos os telefones.

## Testes executados / pendências

- Verificados localmente: 9 testes unitários do backend existente, cálculos de preço e caixa, 7 testes do Worker (autenticação/CORS/permissão, dados Firestore e criação transacional). **Não constituem homologação de produção.**
- **Não executados nesta sessão:** deploy real do Worker, deploy Firebase, teste com chave/Firestore/App Check verdadeiros, compilação completa do frontend (dependências npm indisponíveis no ambiente), autorização de conta de serviço em projeto real, testes reais do WhatsApp e conferência visual no navegador.
- Antes de receber pedidos: validar token do dono, App Check, regras do Firestore, índice composto, consistência do caixa, idempotência do pedido, fila e webhook, cálculos dos preços e taxas, custos Meta e política de privacidade. Há limite por usuário de cinco pedidos em 10 minutos; se `RATE_LIMIT_PEPPER` estiver definido, há limite adicional de 12 pedidos por IP em 10 minutos (cuidado com Wi-Fi compartilhado).
- Horários, produtos, preços, entrega, mínimo e política de carimbos são os da proposta e devem ser conferidos com a loja. Não há integração automática de Pix/cartão nesta entrega.

## Referências

- Firebase Spark: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Firestore REST + IAM: https://firebase.google.com/docs/firestore/use-rest-api
- Verificação Firebase ID token: https://firebase.google.com/docs/auth/admin/verify-id-tokens
- App Check para backend próprio: https://firebase.google.com/docs/app-check/custom-resource-backend
- Workers Free: https://developers.cloudflare.com/workers/platform/limits/
- WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api/

## Verificação rápida adicionada em 11/10/2026

Antes de publicar, execute `npm run preflight` na raiz. Ele confere **apenas dados públicos**: projeto Firebase, origem permitida, URL do Worker, App Check e se `firebase.spark.json` evita Cloud Functions. Não envia segredos, não grava pedidos e não publica nada. Um resultado `PENDENTE` indica que a ativação está bloqueada por falta de configuração.

Depois de publicar o Worker, confirme seu endpoint HTTPS e o domínio Firebase Hosting com:

```powershell
npm run test:worker:live -- https://tropisertao-api.SUACONTA.workers.dev https://SEU-PROJETO.web.app
```

O teste verifica saúde do Worker e CORS, **não** autenticidade das credenciais nem gravação real. Faça pedido de teste, aceite e conclua com a conta de dono antes de liberar clientes. As dependências Firebase atuais exigem **Node.js 24.12 ou superior**; instale essa versão antes de executar `npm ci` e o deploy.

### O que é necessário para concluir a publicação

Confirme dentro do próprio console do Firebase (ou autorize o acesso via conexão Firebase) qual projeto será usado e seus parâmetros **públicos** do aplicativo Web. Também será necessário autorizar a conta Cloudflare Workers e configurar lá os segredos privados, sem enviá-los pelo chat. A publicação na Vercel fica intacta até a migração ser validada. Não utilize o número do WhatsApp Business em automação não oficial.
