# Tropi do Sertão

Código do site de pedidos e painel da loja.

- **Site Firebase:** https://tropidosertao.web.app/
- **API Cloudflare:** https://tropisertao-api.0vieira-francisco0.workers.dev
- **Firebase project:** `tropisertao-854d3`
- **Worker:** `tropisertao-api`

## Publicação automática

O GitHub Actions executará os testes em cada mudança para `main`. A publicação de **Hosting** e **Worker** só será habilitada depois da configuração de credenciais e da variável `TROPI_DEPLOY_READY=true`.

As credenciais devem ser cadastradas em **Settings → Secrets and variables → Actions**, nunca nos arquivos do repositório.

O deploy automatizado não alterará as regras do Firestore, para evitar publicar mudanças de permissão sem revisão. Também não publicará Cloud Functions nem ativará as mensagens de WhatsApp.

**Atenção:** esta é a estrutura inicial. O código completo ainda precisa ser enviado da pasta local do projeto para este repositório. Não compartilhe credenciais privadas nem envie `config/firebase.local.json`.
