# Tropi do Sertão — publicar a API no Cloudflare

Este pacote foi preparado para atualizar **somente** o Worker `tropisertao-api`, que você criou no Cloudflare. O segredo `GOOGLE_SERVICE_ACCOUNT_JSON` é mantido no painel da Cloudflare e **não vem neste ZIP**.

## Primeiro: preparar o computador

1. Extraia este ZIP no Windows.
2. Instale **Node.js 24.12 ou superior** pelo site oficial https://nodejs.org/. Se já tiver, confira com `node -v`.
3. Abra a pasta `tropisertao` no Explorador de Arquivos. Na barra de endereço, digite `powershell` e pressione Enter.
4. Execute `npm ci` e aguarde a instalação (requer internet).
5. Execute `npm run test:worker` para os testes locais.

## Publicação da API (somente depois de verificar a conta correta)

1. Execute `npx wrangler login` e autorize a conta Cloudflare que possui o Worker.
2. Confirme que `worker/wrangler.toml` usa `name = "tropisertao-api"`, `WHATSAPP_ENABLED = "false"`, `FIREBASE_PROJECT_ID = "tropisertao-854d3"`.
3. Execute `npx wrangler deploy --config worker/wrangler.toml`. Isso substitui o código Hello World no Worker de mesmo nome **e atualiza variáveis públicas** pelo TOML. Não envia o site Firebase/Vercel.
4. Abra `https://<endereco-real-do-worker>/api/health` e confirme resposta de status `ok`. O teste de saúde **não comprova** que o Firebase/Firestore já estão conectados.

**Não execute ainda** `npm run deploy:spark`: faltam a chave pública do App Check e a URL HTTPS final em `config/firebase.local.json`, configuração do administrador, testes completos e autorização de uso de dados reais.

Nenhuma chave JSON privada deve ser copiada para esta pasta nem enviada em chat/GitHub. Os segredos são guardados apenas como Secrets no painel Cloudflare. Se um deploy mudar o nome ou a conta, pare e confirme o destino antes de publicar.
