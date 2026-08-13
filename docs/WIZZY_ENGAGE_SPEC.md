# Wizzy Engage — especificação-alvo

> Definida em 2026-08-11. A referência é um produto real de automação de
> Instagram (substituto de ManyChat); o dono do Wizzy adotou aquela lista de
> capacidades como o padrão que o Engage deve atingir.
>
> Diferença de contexto que vale manter em mente: a referência é um app
> single-tenant (uma conta, Next.js/Vercel). O Engage é multi-tenant dentro do
> SaaS. As **capacidades** são o alvo; a arquitetura (React + Supabase Edge
> Functions) continua sendo a do Wizzy.

## Placar

| # | Capacidade | Estado |
|---|---|---|
| 1 | Versão da API fixada (`v25.0`) | ✅ feito |
| 2 | **Private reply** (`recipient.comment_id`) no comentário→DM | ✅ feito |
| 3 | Fila com trava atômica (sem envio duplicado) | ✅ feito |
| 4 | Janela de 24h respeitada antes de DM comum | ✅ feito |
| 5 | Refresh automático do token de 60 dias | ✅ feito |
| 6 | Cron versionado em migration | ✅ feito |
| 7 | Follow-up por tempo + detecção de clique | ✅ já existia |
| 8 | `subscribed_apps` no callback do OAuth | ✅ já existia |
| 9 | Gatilho por DM com palavra-chave | ❌ pendente |
| 10 | Gatilho por resposta a story | ❌ pendente (webhook detecta, não automatiza) |
| 11 | Rate limit de envio (~2/s, ~200 DM/h por conta) | ✅ feito |
| 12 | Variações de resposta pública (sorteio) | ❌ pendente |
| 13 | Quick replies (botão que abre a janela de 24h) | ✅ feito |
| 14 | Seletor visual de posts (`GET /{id}/media`) | ❌ pendente |

---

## O que foi corrigido em 2026-08-11

### 1. Private reply — era um bug, não uma feature faltando

O fluxo central do produto ("comentou → recebeu DM") endereçava a mensagem por
`recipient: { id: <IGSID> }`, que é DM comum e **só vale dentro da janela de 24
horas**. Quem apenas comentou num post nunca teve janela aberta, então a Meta
recusava o envio. Como não havia controle de janela nenhum (item 4), a recusa era
gravada como `error` genérico — indistinguível de falha técnica.

Agora usa `recipient: { comment_id }` (private reply), que é permitida
justamente *porque* a pessoa comentou. Regras da Meta que o código passa a
respeitar:

- até **7 dias** após o comentário;
- **uma única vez por comentário**, para sempre.

A distinção está tipada em `InstagramRecipient` (`_shared/instagramProvider.ts`),
para que a escolha entre os dois modos seja explícita em cada chamada em vez de
implícita num parâmetro `string`.

Efeito colateral encontrado no caminho: `instagram-send-message` (resposta manual
do atendente pela inbox) também passava o IGSID cru. Continua sendo DM comum — o
correto ali —, mas agora verifica a janela antes e devolve 409 com motivo claro,
em vez de deixar a Meta recusar com erro opaco.

### 2. Fila de follow-ups: envio duplicado

A drenagem fazia `SELECT status='pending'` e só marcava `sent` **depois** do
envio, com um fetch de rede por linha, em série. O cron roda a cada minuto: um
lote de 50 que passasse de 60s era relido inteiro pela execução seguinte e
enviado de novo.

Agora `claim_instagram_followups()` reserva as linhas atomicamente
(`UPDATE ... FOR UPDATE SKIP LOCKED` numa instrução só) antes de qualquer
trabalho de rede.

Verificado num Postgres real com 4 processos concorrentes sobre 100 linhas:
**100 reservadas, 100 únicas** — nenhuma linha saiu duas vezes. Com o código
anterior, os quatro teriam pego as mesmas 50.

Também ganhou: recuperação de linhas presas em `sending` há mais de 5 minutos
(função que morreu no meio), teto de 3 tentativas, e retorno a `pending` em falha
transitória em vez de descarte.

### 3. Janela de 24h

`instagram_conversations.last_inbound_at` registra a última mensagem **recebida**
— o único evento que abre a janela (mensagem nossa não abre, por isso não dá para
usar `last_message_at`). Alimentada pelo webhook, com backfill para conversas
existentes.

O follow-up agora checa a janela e marca `skipped` quando ela está fechada, não
`error`: a pessoa simplesmente não respondeu, e tratar isso como erro esconderia
as falhas reais no meio das rotineiras.

### 4. Token de 60 dias

Nada renovava o token, então **toda conexão morria em dois meses** e o cliente
precisava refazer o OAuth — sem aviso, parecendo "a automação parou".

`instagram-refresh-tokens` roda semanalmente e renova tudo que vence nos próximos
21 dias (folga suficiente para uma execução perdida não deixar nada vencer).
Token já vencido não é renovável: a conta passa ao novo status `expired`, para a
tela poder pedir reconexão em vez de mostrar uma conta que parece conectada mas
não envia.

### 5. Versão da API fixada

As chamadas iam sem versão no path, o que faz a Meta resolver para a **mais
antiga ainda suportada** — que muda sem aviso. Fixado em `v25.0`
(`GRAPH_API_VERSION`), tornando a atualização uma decisão deliberada.

### 6. Cron versionado

O agendamento do `process-followups` existia **apenas como comentário** no fim da
edge function, para aplicação manual. Não havia como saber, lendo o repositório,
se algum dia foi agendado — e se não foi, nenhum follow-up jamais saiu. Agora
está em migration, junto com o cron novo de refresh de token.

---

## O que foi feito em 2026-08-11 (segunda parte)

### 7. Rate limit por conta

O único limite que existia era `max_per_contact_per_day` — quantas vezes o
**mesmo** contato pode ser atingido. Isso não protege o que de fato derruba a
conta do cliente: o **volume total** que ela dispara. Um post que viraliza traz
centenas de comentários em minutos e o Engage respondia a todos em rajada.

`reserve_instagram_send_slot()` reserva a vaga na mesma instrução que conta, com
um advisory lock por conta. Checar-e-depois-enviar em duas etapas não resolveria:
execuções concorrentes do webhook leriam a mesma contagem e todas passariam.

Tetos configuráveis por conta em `instagram_accounts.send_rate_limit`, com
default de 2/s e 200/h. A Meta não publica o número exato e ele varia por conta,
por isso é ajustável.

Os **três** caminhos de envio passam pela mesma conta corrente
(`instagram_send_ledger`), incluindo a resposta manual da inbox — uma inbox
movimentada durante um post viral estouraria justamente o teto que a automação
está tentando respeitar. A coluna `source` responde "quem comeu a cota".

Comportamento em cada caminho, deliberadamente diferente:

| Caminho | Sem cota |
|---|---|
| Automação (regra) | passo `skipped` com motivo — o comentário não volta |
| Follow-up (fila) | volta a `pending`, tenta no minuto seguinte |
| Inbox (manual) | 429 com mensagem clara — o atendente está na tela |

Verificado em Postgres real: 10 chamadas concorrentes contra teto de 2/s →
exatamente 2 concedidas e 2 linhas no ledger. Também testados o deslizar da
janela, o teto horário, conta inexistente e o isolamento entre contas.

### 8. Quick replies

O botão de link era `web_url`: clicar abre o navegador, o que **não** conta como
resposta. A janela de 24h seguia fechada e todo follow-up agendado depois dele
caía em `skipped` — o recurso existia e quase nunca entregava.

O quick reply é uma chip que, ao ser tocada, envia uma mensagem **da pessoa**.
Isso abre a janela. O link então sai numa segunda mensagem, já dentro da janela,
pelo handler novo no webhook (`messaging_postbacks` já era assinado no OAuth mas
nenhum handler o consumia).

Duas proteções que o caminho exige:

- A chip continua na conversa depois de tocada. Sem marca, cada toque mandaria
  outro link — o comportamento de spam que o resto deste trabalho evita.
  `claim_instagram_link_send()` garante um envio só (8 toques simultâneos → 1
  envio, verificado). Falha de envio ou falta de cota revertem a marca, senão o
  link ficaria "enviado" sem nunca ter saído.
- A triagem do payload só reage ao que nós emitimos: texto livre, JSON de outra
  ferramenta e payload malformado são ignorados (10 casos testados).

Na UI é uma caixa dentro do bloco do botão, ligada por padrão em regra nova.
Regra **já existente** mantém o comportamento com que foi salva — herdar o
default mudaria automações em produção sozinho. O texto explica a consequência
de desligar, em vez de só nomear o recurso.

---

## Pendências, em ordem sugerida

1. **Gatilho por DM com palavra-chave** (9) e **resposta a story** (10) — hoje o
   CHECK do banco só aceita `trigger_type = 'comment_keyword'`; ampliar o enum,
   o webhook e a UI. O webhook já detecta `story_reply`, só não automatiza.
2. **Variações de resposta pública** (12) — resposta pública idêntica repetida é
   sinal de spam para a Meta.
3. **Seletor visual de posts** (14) — hoje o usuário digita o media ID à mão, o
   que na prática é inviável para quem não é técnico.

## Limites reais (do prompt de referência — confirmados, não contornáveis)

- Não dá para exigir que a pessoa siga a conta antes de mandar o link: a API não
  permite verificar seguidor. Só dá para pedir na mensagem.
- Não dá para saber se a pessoa abriu o link fora do nosso redirect próprio (o
  Engage já resolve isso com `instagram_tracked_links`).
- Disparo em massa para base fria é proibido e derruba a conta.
