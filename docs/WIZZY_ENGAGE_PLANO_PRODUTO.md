# Wizzy Engage — plano de produto (paridade ManyChat)

> Escrito em 2026-08-12, depois do primeiro teste real funcionando ponta a ponta.
> Avaliação do dono: *"está bem fraquinho"* — quer fluxos visuais e preview da
> mensagem, com o ManyChat como parâmetro.
>
> **Este documento é para decidir escopo, não é registro de trabalho feito.**
> Nada aqui foi implementado.

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
| G3 | DM com palavra-chave | ✅ | ❌ |
| G4 | Resposta a story | ✅ | ❌ (webhook detecta, não automatiza) |
| G5 | Menção em story | ✅ | ❌ |
| G6 | Comentário em Live | ✅ | ❌ ⚠️ |
| G7 | Ice breakers (perguntas no início da conversa) | ✅ | ❌ |
| G8 | Link direto que abre a DM já num fluxo (ref URL) | ✅ | ❌ |
| G9 | Primeira mensagem / novo contato | ✅ | ❌ |

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
| P1 | **Preview da mensagem** enquanto edita | ✅ | ❌ ← *você pediu* |
| P2 | Construtor visual de fluxo | ✅ | ✅ (só WhatsApp) |
| P3 | Templates prontos | ✅ 50+ | ❌ |
| P4 | Seletor visual de post (escolher o post numa grade) | ✅ | ❌ (digita ID à mão) |
| P5 | Analytics por fluxo (taxa de resposta, clique) | ✅ | ⚠️ logs crus |
| P6 | Broadcast / disparo | ✅ | ❌ ⚠️ |
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

### Fase C — Instagram no construtor de fluxos (grande)

A Fase 3 do seu roadmap original. É aqui que mora a decisão difícil, porque
`flow_executions` hoje aponta para a tabela de conversas do WhatsApp.

Três caminhos possíveis — **preciso da sua decisão**, está no fim do documento.

Junto vêm os blocos que faltam para o Instagram: imagem, vídeo, arquivo (C4–C7),
card e carrossel (C8–C9), delay de digitação (C10) e coleta validada (C11).

### Fase D — Biblioteca e medição (média)

P3 (templates prontos: "captar lead do post", "entregar material", "agendar"),
P5 (analytics por fluxo: quantos entraram, responderam, clicaram, viraram
conversa). Templates são o que faz o cliente novo ter sucesso na primeira
semana em vez de olhar para uma tela em branco.

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
