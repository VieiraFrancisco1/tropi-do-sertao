# Tropi do Sertao — cadastro Web concluido (11/10/2026)

O Firebase Web app foi registrado no projeto **tropisertao-854d3**. Os campos publicos `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId` e `appId` foram preenchidos em `config/firebase.local.json`, a partir da tela de configuracao fornecida pelo dono do projeto. Esse objeto nao contem credenciais administrativas nem segredos de WhatsApp.

## O que fazer agora no Firebase Console

1. Clique em **Continuar no console**.
2. Em **Authentication > Metodo de login > Adicionar novo fornecedor**, habilite **Anonimo**. O site usa um usuario anonimo para identificar visitantes antes do registro por e-mail.
3. Mantenha **E-mail/senha** habilitado. Nao ative SMS ou MFA por enquanto.
4. Nao abra o Firestore no modo de teste e nao altere as regras para `allow read, write: if true`.
5. Para a fase de publicacao, sera preciso configurar Firebase App Check com uma chave publica do provedor apropriado e adicionar o dominio do site nas configuracoes de autorizacao do Authentication, caso nao apareca.

## Pendente antes de publicar pedidos reais

- Criar/configurar conta Cloudflare Workers e publicar a API segura.
- Preencher a URL HTTPS em `config/firebase.local.json` -> `workerApiUrl`.
- Configurar Firebase App Check e preencher `appCheckSiteKey`.
- Configurar o segredo administrativo do Worker pela interface/CLI Cloudflare (nunca no codigo nem nesta conversa).
- Configurar o dono no Firebase Authentication com uma custom claim `tropiAdmin` usando a ferramenta do backend e credenciais locais autorizadas.
- Instalar dependencias, executar `npm run preflight`, `npm test` e `npm run test:worker`, compilar e homologar o fluxo real antes do deploy de producao.
- Fazer teste controlado com pedido ficticio; somente depois habilitar o WhatsApp mediante conta Meta e modelos aprovados.

**Importante:** `config/firebase.local.json` esta deliberadamente incompleto em `appCheckSiteKey` e `workerApiUrl`. Os scripts de build devem bloquear a publicacao real ate esses dados existirem. Nao foi alterado o Firestore remoto, nao foi implantado Worker, nao foi publicado Hosting e nao foi ativado WhatsApp. O pacote e de preparacao.

Leia tambem `ATIVAR_SEM_BLAZE.md` para os comandos de deploy e seguranca. Use `npm run deploy:spark -- --project tropisertao-854d3` **somente depois** de configurar e testar a API e os usuarios.
