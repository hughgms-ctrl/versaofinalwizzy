# Wizzy Engage — plano de produto (paridade ManyChat)

> Escrito em 2026-08-12, depois do primeiro teste real funcionando ponta a ponta.
> Avaliação do dono: *"está bem fraquinho"* — quer fluxos visuais e preview da
> mensagem, com o ManyChat como parâmetro.
>
> **Estado em 2026-08-12:** Fases A, B e a fundação da C estão feitas. O placar
> abaixo está atualizado; o que continua ❌ é o que falta.

## Primeiro: respondendo à pergunta

**"O prompt que mandei falava como deveria ser por dentro?"**

Não. O prompt do produto-referência (`WIZZY_ENGAGE_SPEC.md`) era uma lista de
**capacidades técnicas de API** — private reply, janela de 24h, rate limit,
quick replies, refresh de token. Nenhuma linha sobre interface, construtor
visual ou experiência de uso. Por isso o módulo tem hoje um motor correto e uma
tela pobre: consertamos o que aquela spec cobria, e ela não cobria isto.

**Mas o seu briefing original já pedia exatamente o que você está pedindo
agora.** Em `INSTAGRAM_AUTOMATION_PROJECT.md`, escrito em junho de 2026:

> "O motor de automacoes/fluxos da Wizzy deve funcionar para WhatsApp e
> Instagram. Na criacao do fluxo, o usuario deve escolher onde ativar."
>
> "Mensagens podem ter variacoes por canal, porque WhatsApp e Instagram possuem
> limites e formatos diferentes."

E em 2026-07-09 ficou registrada a decisão de adiar:

> "Decisao registrada: manter essa sequencia dentro do Wizzy Engage por
> enquanto; integrar ao construtor de fluxos visual completo (Fase 3 do roadmap
> original) fica para depois."

Ou seja: a tela de regras que existe hoje **sempre foi um provisório**. O que
você está sentindo como "fraquinho" é a Fase 3 nunca feita.

---

## Segundo: o Wizzy já tem quase tudo

O achado que muda o tamanho do trabalho: **o construtor de fluxos visual já
existe e é maduro** — `FlowCanvas`, React Flow, drag-and-drop, painel de
propriedades, teste, histórico de execução. São **20 tipos de nó** hoje:

| Categoria | Nós existentes |
|---|---|
| Conteúdo | `content-block`, `message-buttons`, `message-list` |
| Ações | `action-tag`, `action-pipeline`, `action-transfer`, `action-delay`, `action-webhook`, `action-flow`, `action-department`, `action-document`, `action-workspace`, `action-whatsapp-group` |
| Lógica | `condition`, `user-input`, `randomizer`, `smart-delay` |
| IA | `ai-handoff`, `ai-return` |

O motor (`flow-execute`, 2.714 linhas) já resolve o difícil: espera de resposta,
delays, ramificação, sub-fluxos, variáveis, retomada por cron.

**O problema é que ele é 100% WhatsApp.** `flow_executions.conversation_id`
aponta para `conversations` (tabela do WhatsApp), e o motor importa
`sendWhatsAppMessage` direto. O Instagram tem tabelas próprias
(`instagram_conversations`, `instagram_messages`).

Então a pergunta não é "construir um builder" — é **"como fazer o builder que
existe falar Instagram"**.

---

## Terceiro: o que o ManyChat tem, e onde estamos

Levantado da documentação oficial e material de produto (fontes no fim).

### Gatilhos

| # | Gatilho | ManyChat | Wizzy Engage hoje |
|---|---|---|---|
| G1 | Comentário em post/reel com palavra-chave | ✅ | ✅ **tem** |
| G2 | Comentário em post específico vs. todos | ✅ | ✅ **tem** (media_ids) |
| G3 | DM com palavra-chave | ✅ | ✅ feito |
| G4 | Resposta a story | ✅ | ✅ feito |
| G5 | Menção em story | ✅ | ✅ feito |
| G6 | Comentário em Live | ✅ | ❌ ⚠️ |
| G7 | Ice breakers (perguntas no início da conversa) | ✅ | ❌ |
| G8 | Link direto que abre a DM já num fluxo (ref URL) | ✅ | ❌ |
| G9 | Primeira mensagem / novo contato | ✅ | ✅ feito |

### Blocos de conteúdo

| # | Bloco | ManyChat | Wizzy (builder WhatsApp) | Instagram |
|---|---|---|---|---|
| C1 | Texto | ✅ | ✅ | ✅ |
| C2 | Texto com botões de link | ✅ | ✅ | ✅ |
| C3 | Quick replies (chips de resposta) | ✅ | ⚠️ parcial | ✅ **novo ontem** |
| C4 | Imagem | ✅ | ✅ | ❌ |
| C5 | Vídeo | ✅ | ✅ | ❌ |
| C6 | Áudio | ✅ | ✅ | ❌ |
| C7 | Arquivo / PDF | ✅ | ✅ | ❌ |
| C8 | Card (imagem + título + botões) | ✅ | ❌ | ❌ |
| C9 | Carrossel / galeria de cards | ✅ | ❌ | ❌ |
| C10 | Delay de digitação ("está digitando…") | ✅ | ⚠️ | ❌ |
| C11 | Coleta de dado com validação (e-mail, telefone) | ✅ | ⚠️ `user-input` | ❌ |

### Ações e lógica

| # | Recurso | ManyChat | Wizzy |
|---|---|---|---|
| A1 | Adicionar/remover tag | ✅ | ✅ |
| A2 | Campo personalizado do contato | ✅ | ✅ |
| A3 | Notificar atendente | ✅ | ⚠️ existe no WhatsApp, `skipped` no IG |
| A4 | Transferir para humano | ✅ | ✅ |
| A5 | Chamar webhook / API externa | ✅ | ✅ |
| A6 | Ir para outro fluxo | ✅ | ✅ |
| A7 | Condição (ramificar) | ✅ | ✅ |
| A8 | Espera inteligente (smart delay) | ✅ | ✅ |
| A9 | Sorteio / teste A/B | ✅ | ✅ `randomizer` |
| A10 | Sequência agendada (série de mensagens) | ✅ | ⚠️ follow-up simples |

### Produto / operação

| # | Recurso | ManyChat | Wizzy |
|---|---|---|---|
| P1 | **Preview da mensagem** enquanto edita | ✅ | ✅ feito (prévia em celular, publicação + conversa) |
| P2 | Construtor visual de fluxo | ✅ | ✅ WhatsApp e Instagram |
| P2b | **Modo guiado** (formulário de perguntas) | ✅ | ✅ feito |
| P3 | Templates prontos | ✅ 50+ | ✅ 7 modelos |
| P4 | Seletor visual de post (escolher o post numa grade) | ✅ | ✅ feito |
| P5 | Analytics por fluxo (taxa de resposta, clique) | ✅ | ⚠️ logs crus |
| P6 | Broadcast / disparo | ✅ | ✅ feito, com público recortado pela janela de 24h |
| P9 | Lista de contatos do canal | ✅ | ✅ feito (aba própria) |
| P7 | Multi-canal no mesmo fluxo | ✅ | ❌ ← *seu briefing pedia* |
| P8 | Teste do fluxo sem publicar | ✅ | ✅ `FlowTestPanel` |

### O que a API da Meta **não** permite (não é limitação nossa)

- Exigir que a pessoa siga a conta antes de mandar o link — não há como verificar
  seguidor. Só dá para pedir na mensagem.
- Disparo em massa para base fria (P6): proibido e derruba a conta. Broadcast só
  para quem tem janela de 24h aberta.
- ⚠️ **G6 (Live comments)** e **P6**: preciso confirmar disponibilidade na
  *Instagram API with Instagram Login* — parte da documentação do ManyChat se
  refere à API antiga com Página do Facebook. Não prometer antes de checar.

---

## Quarto: como eu faria

Quatro fases, em ordem de valor por esforço. Cada uma entrega algo utilizável
sozinha — nenhuma depende da seguinte para valer a pena.

### Fase A — Preview da mensagem (pequena)

Um componente que desenha a DM como ela chega no Instagram: balão, texto, botão,
chips de quick reply, e o aviso de qual mensagem abre a janela de 24h.

Por que primeiro: você pediu, é isolado, e **o mesmo componente serve depois no
construtor de fluxos** — não é trabalho jogado fora quando a Fase C chegar.

Entra junto o **P4 (seletor visual de post)**: hoje o usuário digita o media ID
à mão, o que é inviável para quem não é técnico. É uma chamada
`GET /{ig-user-id}/media` e uma grade de miniaturas.

### Fase B — Gatilhos que faltam (média)

G3 (DM com palavra-chave), G4 (resposta a story), G5 (menção em story), G9
(primeira mensagem). O `trigger_type` no banco só aceita `comment_keyword`; o
webhook já **recebe** story reply e DM, só não dispara regra.

Por que antes dos fluxos: multiplica o que o produto faz sem depender da
decisão arquitetural da Fase C. É a diferença entre "automatiza comentário" e
"automatiza Instagram".

### Fase C — Instagram no construtor de fluxos

**Fundação entregue em 2026-08-12**, pela opção C2.

O que existe agora:

| Peça | Onde |
|---|---|
| Tabelas próprias | `instagram_flows`, `instagram_flow_executions` (migration 20260812140000) |
| Motor próprio | `instagram-flow-execute` |
| Retomada por cron | `instagram-flow-timeouts`, a cada minuto |
| Construtor visual | `/tools/wizzy-engage/fluxo`, aba **Fluxos** |

Sete blocos, escolhidos por serem o que o canal suporta hoje: enviar mensagem
(com quick replies ou botão de link), esperar resposta, esperar tempo, se/então,
adicionar etiqueta, passar para atendente e chamar sistema externo.

Três decisões que valem registro:

- **Uma execução viva por conversa**, garantida por índice único parcial no
  banco. Quem comenta três vezes em dois minutos entraria três vezes no mesmo
  fluxo; a checagem no código não bastaria, porque dois webhooks concorrentes
  leriam "não tem nenhuma" ao mesmo tempo.
- **A private reply do comentário é gasta na primeira mensagem** do fluxo, e só
  nela. Da segunda em diante tudo depende da janela de 24h — por isso o bloco de
  espera por resposta é o que destrava fluxos longos.
- **Uma saída leva a um caminho só.** Ligar a mesma saída a dois blocos criaria
  uma bifurcação que o motor não percorre: ele seguiria a primeira aresta e a
  segunda ficaria morta, sem aviso. O canvas substitui a ligação anterior.

**Ainda falta nesta fase:** os blocos de mídia (C4–C7), card e carrossel
(C8–C9), delay de digitação (C10) e coleta validada (C11). Também não há teste
do fluxo sem publicar (o equivalente ao `FlowTestPanel` do WhatsApp) nem tela de
acompanhamento das execuções — o hook `useInstagramFlowExecutions` já existe,
falta a interface.

### Fase D — Biblioteca e medição (média)

**Modo guiado + templates entregues em 2026-08-13.** Falta P5 (analytics).

O ManyChat oferece dois caminhos para montar a mesma automação, e a Wizzy
passou a oferecer os dois:

| Caminho | Para quem | Onde |
|---|---|---|
| **Modelo pronto + formulário guiado** | quem nunca montou automação | aba **Início** |
| **Construtor visual de fluxo** | quem precisa ramificar e esperar | aba **Fluxos** |

O modo guiado é uma sequência de perguntas em português — "quando alguém faz um
comentário…", "e esse comentário possui…", "eles receberão…", "e então, eles vão
receber…" — com a prévia ao lado desenhando a publicação e a conversa. Ele
grava `instagram_automation_rules` comum: não é um terceiro motor, é outra porta
para o mesmo.

O que a Fase D acrescentou ao motor, porque a tela guiada exigia:

| Recurso | Onde |
|---|---|
| Escopo **próxima publicação** | `instagram-bind-next-post` (cron de 5 min) + `trigger_config.scope='next_post'` |
| **Qualquer palavra** no comentário | `trigger_config.keyword_mode='any'` |
| **Coleta de e-mail** na DM | `instagram_pending_collections` + `instagram_contacts.email` |
| Texto da DM do link configurável | `instagram_tracked_links.link_message/link_label` |

Três decisões que valem registro:

- **"Próxima publicação" é resolvida por cron, não no comentário.** O webhook
  recebe o `media_id`, não a data de publicação; descobrir "este post é mais
  novo que a regra?" na hora custaria uma chamada à Meta por comentário — num
  post que viraliza, centenas por minuto, disputando a mesma cota que envia as
  DMs. O vinculador pergunta "saiu post novo?" a cada 5 minutos e grava o id na
  regra. Entre publicar e a automação valer há alguns minutos, e isso está dito
  na tela.
- **Campo de palavra-chave vazio continua não disparando comentário.** Regra de
  comentário sem palavra responderia a todo mundo — inclusive a críticas. Quem
  quer isso agora escolhe "qualquer palavra" de propósito; o campo em branco
  quase nunca era intenção. Em DM e resposta a story, vazio continua valendo
  como "qualquer texto", que lá é o caso comum.
- **Pedir para seguir antes do link é cortesia, não condição.** A Meta não expõe
  quem segue a conta. O ManyChat funciona igual: o pedido está no texto, e quem
  toca no botão recebe o link de qualquer forma. A tela diz isso em vez de
  prometer o que a API não faz.

Falta em P5: quantos entraram, responderam, clicaram e viraram conversa, por
automação. Hoje só há o log cru por execução.

---

## Contatos e disparo em massa no Instagram

> Analisado em 2026-08-13, **implementado em 2026-08-14** depois de o dono
> aprovar os dois caminhos recomendados: aba própria e público recortado.

Pergunta do dono: mostrar os contatos do Instagram na aba **Contatos** da Wizzy
e permitir disparo (em massa ou individual) para eles em **Campanhas**.

**As duas coisas esbarram em regras diferentes, e só uma delas é nossa.**

### Contatos: barrado por uma regra da Wizzy, contornável

`contacts.phone` é `NOT NULL` — a tabela de contatos da Wizzy é, por definição,
uma lista de telefones. Um contato do Instagram tem IGSID e @, e pode nunca
revelar um telefone. Jogá-lo em `contacts` exigiria telefone falso (que
contaminaria disparo de WhatsApp, deduplicação e pipeline) ou afrouxar a coluna
(que mexe na tabela mais usada do produto).

A separação, aliás, foi deliberada — está escrita na migration original do canal:
*"keeping Instagram contacts fully separate from WhatsApp contacts (no auto-merge
across channels)"*. Duas pessoas diferentes podem ser o mesmo humano, e a Wizzy
não tem como saber.

**Caminho recomendado:** uma aba **Contatos** dentro do próprio Wizzy Engage,
lendo `instagram_contacts` — com @, foto, etiquetas, e-mail coletado, última
conversa e origem. Depois, opcionalmente, um botão explícito de "vincular a um
contato da Wizzy" quando o telefone aparecer na conversa. Vínculo por ação
humana, nunca automático.

### Disparo em massa: barrado pela Meta, não por nós

A Meta só permite mensagem fora da janela de 24 horas em casos etiquetados
(`HUMAN_AGENT`, entre outros) — disparo promocional para base fria não é um
deles. Fazer isso derruba a conta do cliente, e é a conta dele, não a nossa.

**O que é possível, e é bastante:**

- envio individual para uma conversa aberta (a tela de conversas já faz);
- envio para o grupo de contatos com janela de 24h aberta — na prática, quem
  interagiu no último dia. É o "broadcast" real do ManyChat;
- sequências disparadas por interação, que é o que as automações já fazem.

Ou seja: cabe em **Campanhas** como um tipo de campanha com público próprio
("contatos do Instagram com janela aberta"), com o contador de elegíveis visível
antes do envio — para a pessoa entender por que 2.000 contatos viram 80
destinatários. O que não cabe é a lista inteira.

### O que foi construído (2026-08-14)

Migration `20260814120000`. Duas abas novas dentro do Wizzy Engage:

**Contatos** (`InstagramContactsTab`) — lê `instagram_contacts` com @, foto,
e-mail coletado, etiquetas e o **alcance**: quem respondeu nas últimas 24h pode
receber mensagem hoje, quem não respondeu só volta a ser alcançável se escrever
de novo. Filtros por alcançáveis, com e-mail e vinculados; busca por @, nome e
e-mail.

O vínculo com o contato da Wizzy existe (`instagram_contacts.linked_contact_id`)
e é **sempre manual**. Nunca automático: dois cadastros com o mesmo nome não
provam ser o mesmo humano, e unir os errados só aparece quando a mensagem vai
para quem não devia.

**Disparos** (`InstagramBroadcastTab`) — o número de alcançáveis aparece grande,
ao lado do total, **antes** de escrever a mensagem. Esse contraste é o ponto
principal da tela: sem ele o cliente monta o disparo, vê 80 de 2.000 e conclui
que a ferramenta falhou.

Três decisões que valem registro:

- **O público é calculado no servidor, não no navegador.** A RLS não dá INSERT
  em `instagram_broadcasts` a ninguém; a lista sai de
  `instagram-broadcast-create`. Aceitar uma lista pronta da tela permitiria
  montar qualquer conjunto no console e mandar para base fria — e a conta
  derrubada seria a do cliente.
- **A janela é reconferida no momento do envio.** A lista foi montada quando o
  disparo começou; num lote de mil pessoas a última é alcançada muitos minutos
  depois, e nesse intervalo a janela de alguém fecha. Quem fechou vira
  `skipped`, não `failed` — não falhou nada, a pessoa parou de responder. A tela
  chama isso de "saíram da janela antes da vez", não de "pulados".
- **O disparo consome a mesma cota das automações** (`source='broadcast'` no
  ledger). Um disparo grande e um post viral acontecem no mesmo dia; sem
  compartilhar o teto, o disparo comeria a cota e as automações parariam de
  responder sem que ninguém entendesse por quê.

Conversa arquivada fica de fora do público: é o sinal mais próximo de "não quero
mais falar com esta pessoa" que existe hoje no produto.

**Ainda não há:** opt-out explícito (hoje o sinal é arquivar a conversa),
relatório de cliques por disparo (o link é rastreado, falta a tela) e agendamento
— todo disparo começa na hora.

---

## Decisões tomadas (2026-08-12)

**Arquitetura da Fase C: opção C2** — builder compartilhado, motor separado. A
UI do construtor é reusada; o Instagram ganha um `instagram-flow-execute`
próprio. O motor do WhatsApp não é tocado. Fluxo multi-canal fica para uma
unificação futura, quando o Instagram estiver maduro.

**Ritmo: Fases A + B juntas.** Preview, seletor visual de post e os gatilhos que
faltam, numa entrega só.

O restante desta seção é o registro do que foi decidido e por quê.

### 1. Arquitetura da Fase C

| Opção | Como | A favor | Contra |
|---|---|---|---|
| **C1. Motor único multi-canal** | `flow_executions` ganha `channel` + `instagram_conversation_id`; o motor escolhe o provider na hora de enviar | Um fluxo serve os dois canais, como seu briefing pedia; uma base de código | Mexe no motor que hoje roda a produção do WhatsApp — risco no que já funciona |
| **C2. Builder compartilhado, motor separado** | Reusa a UI (canvas, nós, painel); um `instagram-flow-execute` próprio | Não toca no motor do WhatsApp; risco isolado | Duas engines para manter; fluxo multi-canal fica de fora |
| **C3. Manter regras, só enriquecer** | Sem fluxos: mais ações, mais gatilhos, preview | Menor esforço | Não é o que você pediu; teto baixo |

**Minha recomendação: C2 agora, C1 depois se valer.** O motor do WhatsApp move
dinheiro hoje; a Fase C já é grande sem carregar o risco de refatorá-lo. C2
entrega o construtor visual para o Instagram sem tocar no que funciona, e deixa
a porta aberta para unificar quando o Instagram estiver maduro. O custo é
honesto: fluxo que roda nos dois canais ao mesmo tempo fica para a unificação.

### 2. Escopo do "quero todas"

A lista tem ~35 itens. Fazer tudo é um projeto de semanas, não de uma sessão.
Preciso saber se quer que eu:

- entregue **fase por fase**, você testa cada uma e decide a seguinte; ou
- ataque **um bloco maior de uma vez** (ex.: A+B juntas), aceitando um período
  sem nada testável no meio.

### 3. Sobre o App Review

Nada da Fase B (gatilhos novos de DM/story) é testável sem as permissões
aprovadas — e nem demonstrável no screencast. Se o review ainda não foi
submetido, a Fase A tem uma vantagem prática: é 100% visível sem depender da
Meta.

---

## Fontes

- [ManyChat — Block Types](https://help.manychat.com/hc/en-us/articles/14281196200604-Content-Block-types)
- [ManyChat — Instagram Story Reply Trigger](https://help.manychat.com/hc/en-us/articles/13556930006428-Instagram-Story-Reply-Trigger)
- [ManyChat — Instagram Post and Reel Comments trigger](https://help.manychat.com/hc/en-us/articles/14281316989724-Instagram-Post-and-Reel-Comments-trigger)
- [ManyChat — Instagram Live Comments Trigger](https://help.manychat.com/hc/en-us/articles/14281275933724-Instagram-Live-Comments-Trigger)
- [ManyChat — Flow Builder](https://manychat.com/blog/manychat-flow-builder-messenger-marketing/)
- [ManyChat — Data Collection Block](https://help.manychat.com/hc/en-us/articles/18362925739932-Data-Collection-Block)
