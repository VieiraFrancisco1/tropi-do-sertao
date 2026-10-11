# Tropi do Sertão

Cardápio, carrinho, fidelidade, pedidos, caixa e painel do estabelecimento.

**Site principal:** https://tropidosertao.web.app/
**API de pedidos:** https://tropisertao-api.0vieira-francisco0.workers.dev
**Projeto Firebase:** `tropisertao-854d3`
**Worker:** `tropisertao-api`

## Estado atual

- Código da última versão importado para o GitHub em outubro de 2026.
- Interface de login e cadastro com telefone e senha; cliente e dono têm áreas diferentes.
- Telefone funciona como identificador interno da autenticação por e-mail e senha do Firebase: **não existe verificação de posse por SMS** neste fluxo.
- Firebase Hosting e Cloudflare Worker já existem. **Autenticação, permissões de dono e pedidos em produção ainda exigem testes ponta a ponta.**
- WhatsApp automático fica desativado até configuração e validação.
- Nunca divulgar o site para pedidos reais sem validar o processamento no Firestore e a atribuição segura do papel de dono.

## Desenvolver e testar

Requer Node.js 24.12 ou mais recente.

```sh
npm ci
npm run test:worker
node --test client/phone-login.test.mjs
npm run build:worker
```

Para `build:worker`, a configuração local `config/firebase.local.json` deve existir e não pode ser adicionada ao Git. Ela é gerada automaticamente no GitHub Actions usando **somente informações públicas**.

Edite o visual em `src.html`, `style.css` e `app.js`. O processo de build gera `dist/`.

## Publicar sem precisar baixar ZIP

O workflow em `.github/workflows/deploy.yml` roda testes e prepara a publicação a cada push para `main`. O deploy real só é ativado quando `TROPI_DEPLOY_READY=true`, após a configuração de Secrets. Leia [GITHUB_DEPLOY.md](GITHUB_DEPLOY.md).

O pipeline publica **somente** o Hosting `tropidosertao` e o Worker `tropisertao-api`. Não publica Cloud Functions, regras do Firestore ou índices automaticamente.

**Segurança:** não envie arquivos de conta de serviço, JSONs privados, `config/firebase.local.json`, `dist/` ou `node_modules/` ao GitHub. O projeto Firebase é Spark (sem Blaze); a API roda no Cloudflare Workers.
