> **NOVO — Plano Spark, sem Blaze:** para preparar Firebase Hosting + Cloudflare Worker e WhatsApp oficial, consulte **`ATIVAR_SEM_BLAZE.md`**. A pasta `functions/` e `PREPARAR_FIREBASE.md` documentam a alternativa anterior, que **exige Blaze** e não é publicada com `deploy:spark`.

# TropiSertão — proposta de cardápio

**Atualização de 11/10/2026:** o código agora inclui preparação para Firebase Hosting, Authentication, Firestore, backend de pedidos/caixa/relatórios e WhatsApp Cloud API. A ativação e os comandos estão em [PREPARAR_FIREBASE.md](PREPARAR_FIREBASE.md). A publicação Vercel permanece demonstrativa; os recursos reais ainda dependem das contas e configurações do guia.

Uma demonstração responsiva em HTML, CSS e JavaScript, com a marca e os preços dos prints fornecidos.

Proposta publicada: https://tropisertao-proposta.vercel.app/

O projeto `tropisertao-proposta` está na conta Francisco do Vercel. Os identificadores da publicação estão em `deployment.json`.

O endereço tem acesso público, sem login, para apresentação ao cliente. Última atualização: 09/10/2026.

## O que está disponível

- Cardápio com saladas de 300 ml (R$ 6,00) e 500 ml (R$ 12,00).
- Cremes de Ninho, morango e maracujá (R$ 4,00 cada).
- Morango e kiwi (R$ 3,00 cada).
- Iogurte grego de morango e iogurte natural (R$ 2,00 cada).
- Sanduíche natural (R$ 7,00), sucos naturais de laranja, abacaxi com hortelã e maracujá de 300 ml (R$ 7,00 cada).
- Combo Tropi Lanche (R$ 17,00): 1 sanduíche natural, 1 suco de 300 ml (escolha obrigatória entre os três sabores) e 1 salada de frutas de 145 ml.
- Cinco fotos geradas antes da inclusão, com cenário de bancada de madeira, fundo verde e luz natural. Assets otimizados em `assets/*.webp`; prompts e modo de geração em `image-prompts.json`.
- Busca, categorias, seleção de adicionais, quantidades, observações e sacola.
- Topo com logo centralizada e card animado de horário.
- Banner compacto, quadrado, de ponta a ponta, com carrossel de fidelidade e salada.
- Página inicial compacta, sem o card de três etapas, com bordas neon e fotos fornecidas pelo usuário.
- Minha conta exclusivamente com a visão do dono: pedidos, caixa, relatórios diário, semanal e mensal e informações da loja.
- Cartão fidelidade do cliente separado no Clube Tropi.
- A cada 10 pedidos pagos, um copo de 500 ml com até 5 adicionais grátis. Um pedido conta um carimbo, independentemente da quantidade de copos.
- Resgate do presente, limite de adicionais e atualização da fidelidade quando uma simulação é cancelada.
- Painel demonstrativo da loja com busca, filtros, detalhes completos e botões nos cards: Aceitar pedido (Em preparo) → Saiu para entrega → Finalizado. Retirada passa de Em preparo para Finalizado.
- Relatórios por dia, semana (segunda a domingo) e mês no fuso de Fortaleza, com total dos produtos finalizados, ticket médio, quantidade e pedidos do período. Cancelados e em andamento ficam fora das vendas finalizadas.
- Impressão dos três relatórios, ranking de produtos e adicionais pagos e separação das vendas por Dinheiro, Pix e Cartão.
- Controle demonstrativo de caixa: saldo inicial, uma sessão aberta por vez, entrada e retirada em dinheiro com descrição, fechamento com dinheiro contado, diferença e histórico imprimível. Vendas finalizadas durante a sessão são registradas uma vez; vendas anteriores à abertura não entram retroativamente. Pix e cartão não alteram o dinheiro físico.
- Prévia de mensagem de WhatsApp ao aceitar o pedido e marcar saída para entrega, sem envio real.
- Pedidos pendentes separados dos finalizados.
- Botão opcional para carregar seis pedidos fictícios e apresentar o funcionamento sem misturar com dados existentes.
- Botão de impressão com comanda: cliente, telefone, entrega/retirada, endereço, referência, pagamento, troco, tamanhos, adicionais, observações e valores.
- Imagens e fontes incorporadas no `index.html`, sem dependências externas.

O horário informado é 14h–17h e o pedido mínimo é R$ 5,00. Estes dados foram transcritos dos prints e precisam ser confirmados antes de uso comercial.

As fotos originais de saladas e adicionais foram extraídas dos prints. As cinco novas fotos de sanduíche, sucos e combo foram geradas com a ferramenta integrada de geração de imagens, conforme os ingredientes dos prints, e são ilustrativas. Substituir por arquivos originais da loja melhora a qualidade das fotos em telas maiores.

## Usar e publicar

O arquivo `index.html` pode ser aberto diretamente no navegador ou publicado como site estático no Vercel. Não é preciso instalar pacotes.

O arquivo `preview.html` permite visualizar o site em larguras de 320, 390 e 1280 pixels para apresentações no computador.

Para editar, altere `src.html`, `style.css`, `logic.js` e `app.js`. Instale as dependências com `npm ci`; depois execute `npm run build` ou `python3 build.py` para gerar novamente a demonstração com os recursos incorporados. A pasta `assets` contém os recursos usados na montagem. Rode `npm test` para conferir as regras do site e do backend. `client/` conecta a interface ao Firebase somente no build Firebase; `functions/` contém o backend.

O painel da loja está em **Minha conta → Controle de pedidos**. As informações da loja também estão no perfil. O Clube Tropi abre o cartão do cliente em uma tela separada. O Clube Tropi aparece como um card compacto ao lado do pedido mínimo. O rodapé contém logo, WhatsApp, Instagram e direitos reservados. O WhatsApp foi transcrito do cartão fornecido: (88) 99686-2960. A impressão usa a janela de impressão do navegador, que permite imprimir ou salvar um PDF. A comanda é adequada para largura de até 80 mm.

## Limites da proposta

Nenhum pedido é enviado ao estabelecimento e nenhum pagamento é cobrado. Sacola, perfil, pedidos, caixa e fidelidade ficam salvos em `localStorage`, apenas neste navegador e nesta origem. Use dados fictícios ao demonstrar.

“Minha conta” apresenta a visão do dono em demonstração: não há autenticação, recuperação de conta ou sincronização entre dispositivos. O painel da loja é demonstrativo e acessível em Minha conta; não é uma área administrativa protegida. Os status e movimentos de caixa são simulações locais. As mensagens de WhatsApp são apenas prévias; não existe integração de envio automático configurada. Taxa de entrega e pagamento não são processados.

Para receber pedidos reais, confirme os dados comerciais e ative a estrutura preparada conforme `PREPARAR_FIREBASE.md`. A demonstração acima usa dados locais; o build Firebase usa o banco e acesso por conta. Integração de pagamento e cálculo de taxa de entrega não fazem parte desta preparação. A regra de fidelidade deve ser confirmada com o dono antes do uso comercial.
