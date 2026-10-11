# TropiSertão — Firebase e WhatsApp

Preparação concluída em 11/10/2026. O pacote contém o site e o backend para ativação posterior. Nenhum projeto Firebase foi criado, nenhum plano foi contratado e nenhuma mensagem real foi enviada. A proposta publicada no Vercel continua na versão demonstrativa anterior.

## O que já está implementado

- Firebase Hosting para o site, Authentication para clientes/dono e Firestore para pedidos, fidelidade e caixa.
- Cliente acessa seus pedidos; o dono autorizado acessa gestão, impressão e relatórios diário, semanal e mensal.
- Preços e adicionais são conferidos no servidor. Solicitações repetidas não criam outro pedido nem outro carimbo.
- Aceitar pedido → em preparo → saiu para entrega → finalizado. Retirada pula a etapa de entrega.
- Caixa com abertura, entradas, retiradas, fechamento, diferença e histórico. A finalização registra a venda uma vez; Pix/cartão ficam separados do dinheiro físico.
- Dois modelos de WhatsApp, fila de envio, tentativas controladas, confirmação por webhook e opção de parar respondendo SAIR.
- Credenciais do WhatsApp somente no Secret Manager, fora do site.

## Instalar o projeto

Extraia o ZIP e abra o terminal na pasta `tropisertao`. Use Node.js 22. Os testes com emuladores também precisam de Java 21 ou superior.

```powershell
npm ci
npm ci --prefix functions
npm test
```

Para apresentar a demonstração atual, abra `index.html`. Para reconstruí-la, use `npm run build` ou `python build.py` — ambos deixam o modo de demonstração ativo, sem envio de pedidos/mensagens.

## Configurar o Firebase quando for ativar

1. Crie/escolha um projeto em [Firebase Console](https://console.firebase.google.com/). Para publicar este backend de Cloud Functions, o projeto precisa do plano Blaze. Hosting estático sozinho não ativa pedidos, caixa ou automação.
2. Crie o Firestore em modo de produção; prefira a região de São Paulo para acompanhar `southamerica-east1`, usada pelas funções. Este pacote já contém regras e índices; não execute `firebase init` sobre os arquivos existentes.
3. Em Authentication, habilite **Email/senha** e **Anônimo**. Clientes podem pedir sem cadastro; criar uma conta vincula o usuário anônimo e preserva seus pedidos/cartão. Uma conta cadastrada permite acesso em outros dispositivos.
4. Cadastre um aplicativo Web e copie a configuração pública para `config/firebase.local.json`, usando `config/firebase.example.json` como modelo. Preencha `apiKey`, `authDomain`, `projectId` e `appId`. Mantenha `emulators: false` e `functionsRegion: southamerica-east1`.
5. Configure App Check com **reCAPTCHA Enterprise** para esse aplicativo e preencha a chave pública em `appCheckSiteKey`. Cadastre os domínios que servirão o site. Os endpoints de pedidos e gestão exigem App Check em produção.
6. Em Authentication → domínios autorizados, confirme `PROJECT_ID.web.app`, `PROJECT_ID.firebaseapp.com` e o domínio próprio, se houver.
7. Copie `functions/.env.example` para `functions/.env.PROJECT_ID`, substituindo `PROJECT_ID` pelo ID real. Deixe `WHATSAPP_ENABLED=false`. Os outros campos podem permanecer vazios nessa primeira publicação.

Os dados de configuração do aplicativo Web são públicos. Token de WhatsApp, App Secret e credenciais administrativas nunca devem entrar nesse JSON, no HTML ou no Git.

### Cadastrar o dono

Crie o usuário do dono em Authentication ou use o cadastro no site. Copie seu UID. Em um computador autorizado, instale/configure o Google Cloud CLI e autentique credenciais administrativas locais:

```powershell
gcloud auth application-default login
node scripts/set-admin.cjs --project PROJECT_ID --uid UID_DO_DONO
```

Substitua os dois valores pelos reais. A conta Google precisa de permissão para administrar usuários desse projeto. O login do Firebase CLI para publicar não substitui essas credenciais do Admin SDK. Não inclua arquivo de conta de serviço no pacote/site. O dono deve sair e entrar novamente após receber a permissão `tropiAdmin`.

### Primeira publicação, com WhatsApp desativado

```powershell
npx firebase login
npm run build:firebase
npm run deploy -- --project PROJECT_ID --core-only
```

O modo `--core-only` publica Hosting, regras/índices e as cinco APIs de pedidos, caixa, relatórios e conexão. Ele usa uma entrada de funções sem segredos ou disparadores do WhatsApp. Durante a publicação, o script troca temporariamente a entrada do backend e restaura o arquivo ao terminar. Se o processo for encerrado à força, confira que `functions/package.json` voltou a `"main": "index.cjs"` antes de publicar novamente.

O build rejeita configuração vazia. A publicação rejeita modo demo, emuladores e ID de projeto diferente do build. Aguarde os índices ficarem prontos antes de testar as consultas. O endereço resultante será `https://PROJECT_ID.web.app/`.

## Ativar o WhatsApp posteriormente

Use a **WhatsApp Business Platform / Cloud API oficial da Meta**. Não há automação de WhatsApp Web ou envio pelo navegador do cliente.

São necessários: portfólio empresarial da Meta, aplicativo com WhatsApp, conta empresarial WhatsApp (WABA), número registrado na API, ID desse número e token apropriado para envio. Confira no painel Meta os requisitos e permissões da conta. Se o número já está em uso, confirme com a Meta/provedor o processo de registro e eventual coexistência antes de alterar a operação da loja.

1. Envie os dois rascunhos de `docs/whatsapp-templates.json` para aprovação como modelos **UTILITY**, idioma `pt_BR`, com dois parâmetros no corpo: primeiro nome e número do pedido. A Meta determina a aprovação e a classificação final.
2. Em `functions/.env.PROJECT_ID`, preencha `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID` e `WHATSAPP_GRAPH_API_VERSION` com uma versão suportada no aplicativo Meta. Preserve os nomes dos modelos ou ajuste-os aos nomes aprovados.
3. Cadastre os segredos por terminal. Cada comando pede o valor de forma interativa; não cole tokens na conversa nem os escreva no frontend:

```powershell
npx firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN --project PROJECT_ID
npx firebase functions:secrets:set WHATSAPP_APP_SECRET --project PROJECT_ID
npx firebase functions:secrets:set WHATSAPP_VERIFY_TOKEN --project PROJECT_ID
```

`WHATSAPP_APP_SECRET` é o segredo do aplicativo Meta. `WHATSAPP_VERIFY_TOKEN` é um valor aleatório forte que você escolhe e repete na configuração de verificação do webhook.

4. Com modelos aprovados e credenciais corretas, altere `WHATSAPP_ENABLED=true`, reconstrua e publique o conjunto completo:

```powershell
npm run build:firebase
npm run deploy -- --project PROJECT_ID
```

5. No aplicativo Meta, configure o callback `https://PROJECT_ID.web.app/api/whatsapp/webhook`, com o mesmo verify token. Assine o campo `messages` e conecte/assine a WABA do número. O backend valida `X-Hub-Signature-256`, WABA e ID do número antes de processar eventos.
6. Faça um pedido de teste autorizado, com seu próprio telefone e a caixa de consentimento marcada. Aceite-o como dono e depois marque saída para entrega. Confira os estados na gestão: na fila → aceita pelo WhatsApp → enviada/entregue/lida conforme os callbacks. Em retirada, existe somente a mensagem de preparo.

| Ação do dono | Modelo preparado |
| --- | --- |
| Aceitar pedido / em preparo | `tropi_pedido_em_preparo` |
| Saiu para entrega | `tropi_pedido_saiu_entrega` |
| Finalizado ou cancelado | Sem mensagem automática nesta versão |

O consentimento é opcional, explícito e registrado com data, origem e texto. Informar telefone não autoriza mensagens. SAIR, PARAR ou STOP recebidos pelo webhook interrompem novos envios; uma nova autorização explícita no checkout permite retomá-los. Não são enviadas campanhas ou mensagens promocionais.

Uma fila por pedido/etapa evita duplicações concorrentes. Rejeições explícitas de limite recebem até cinco tentativas. Um timeout pode acontecer depois de a Meta aceitar a mensagem; nesse caso o estado fica **Envio a conferir**, sem repetição automática. Verifique o resultado no provedor antes de qualquer reenvio operacional. Callback assinado pode atualizar o estado mesmo após um timeout. Não há promessa de entrega em caso de telefone inválido ou indisponibilidade externa.

## Conferência antes de receber pedidos reais

Faça um pedido de teste no site publicado, veja-o chegar à conta do dono, percorra os status e imprima a comanda. Abra o caixa, finalize uma venda, confira dinheiro/Pix/cartão no relatório, conte o dinheiro e feche o caixa. Teste também um cliente sem consentimento: nenhum envio deve ocorrer.

Confirme com a loja horário, pedido mínimo, telefone, preços, taxa e área de entrega. Pagamento continua combinado diretamente com a loja; não há Pix automático ou cobrança por cartão integrada. Fidelidade mantém a regra da proposta: um carimbo na criação do pedido elegível e reversão no cancelamento. Antes da operação, confirme se o dono prefere liberar o carimbo somente após finalizar/receber o pagamento.

Pedidos fictícios e dados locais da demonstração não são importados automaticamente. A listagem mostra até 1.000 pedidos recentes para o dono e 200 para o cliente; relatórios consultam todo o período solicitado no servidor. Caixa carrega as 100 sessões mais recentes. Esses limites de listagem não reduzem o faturamento dos relatórios.

Custos de Firebase e WhatsApp dependem do uso, da conta e das regras vigentes. A preparação não contratou esses serviços nem pressupõe uma franquia gratuita de mensagens.

## Testes locais

```powershell
npm test
npm run test:integration
npm run build:firebase -- --config config/firebase.emulator.example.json
npm run emulators
```

O último comando inicia a versão local em `http://127.0.0.1:5000`, usando somente as APIs de pedidos/caixa/relatórios. O WhatsApp é testado com transporte simulado nos testes de integração, sem usar um número real. Use somente dados fictícios. O exemplo usa o projeto `demo-tropisertao` e não acessa produção; não serve para publicação. Para encerrar, pressione Ctrl+C. Depois use `npm run build` para voltar à demonstração ou `npm run build:firebase` com a configuração real para preparar a publicação.

O emulador também troca temporariamente a entrada para `core.cjs`. Se encerrar o processo à força, restaure `"main": "index.cjs"` em `functions/package.json` antes de uma nova publicação.

Foram aprovados os testes existentes de catálogo/fidelidade/caixa/relatórios, nove testes unitários do backend e oito testes de integração com Auth/Firestore emulados. A versão Firebase também foi compilada com configuração local fictícia, e os emuladores das cinco APIs iniciaram. O navegador deste ambiente não alcança o servidor local; o fluxo visual completo deve ser conferido no site ativado. Publicação real, credenciais Meta e entrega de mensagens precisam da ativação descrita acima.

## Referências oficiais

- [Firebase: Hosting e Cloud Functions, incluindo exigência do Blaze](https://firebase.google.com/docs/hosting/functions)
- [Firebase: configuração e segredos](https://firebase.google.com/docs/functions/config-env)
- [Firebase: permissões por custom claims](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Meta: coleção oficial da WhatsApp Cloud API](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api)
- [WhatsApp: política de mensagens](https://business.whatsapp.com/policy)
