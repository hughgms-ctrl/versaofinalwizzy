# Projeto: Automacao Instagram tipo ManyChat

Documento vivo para registrar ideias, decisoes e requisitos do futuro modulo de automacao do Instagram na Wizzy.

Sempre que conversarmos sobre esse projeto, atualizar este arquivo. Quando chegar a hora de implementar, usar este documento como base do escopo.

## Objetivo

Criar o Instagram como um canal de comunicacao dentro da Wizzy, usando a API oficial da Meta.

O usuario deve conseguir gerenciar conversas do Instagram e do WhatsApp no mesmo painel de Conversas, com identificacao clara do canal.

O motor de automacoes/fluxos da Wizzy deve funcionar para WhatsApp e Instagram. Na criacao do fluxo, o usuario deve escolher onde ativar:

- WhatsApp.
- Instagram.
- Ambos, quando a regra fizer sentido para os dois canais.

O projeto deve permitir automacoes parecidas com ManyChat, especialmente automacoes disparadas por comentarios.

## Principio Importante

Nao usar scraping, automacao por navegador, extensoes ou login/senha do Instagram.

O projeto deve usar a API oficial da Meta:

- Instagram Professional Account, Business ou Creator.
- Conta conectada a uma Pagina do Facebook.
- App no Meta Developers.
- OAuth oficial.
- Webhooks oficiais.
- Permissoes revisadas/aprovadas pela Meta quando necessario.

## Fluxos Desejados

### Inbox unificado

As conversas do Instagram devem aparecer dentro do painel Conversas, junto com WhatsApp.

Requisitos:

- Mostrar canal da conversa: WhatsApp ou Instagram.
- Filtrar por canal.
- Manter historico por contato/conversa.
- Permitir atendimento humano.
- Permitir uso de IA.
- Permitir tags, etapa de pipeline, anotacoes e atribuicao de responsavel.
- Evitar misturar identidades sem confirmacao: o mesmo cliente pode existir no WhatsApp e no Instagram, mas a unificacao deve ser feita com cuidado.

### Fluxos multi-canal

Ao criar um fluxo, o usuario deve escolher em quais canais ele sera ativado.

Ideia inicial:

- Configuracao do fluxo: canais ativos.
- Cada gatilho informa os canais compativeis.
- Cada acao informa os canais compativeis.
- Mensagens podem ter variacoes por canal, porque WhatsApp e Instagram possuem limites e formatos diferentes.

Exemplo:

- Fluxo "Captar lead do post":
  - Canal: Instagram.
  - Gatilho: comentario com palavra-chave.
  - Acoes: curtir comentario, responder comentario, enviar DM, criar contato, iniciar IA.

- Fluxo "Atendimento inicial":
  - Canais: WhatsApp e Instagram.
  - Gatilho: primeira mensagem recebida.
  - Acoes: IA qualifica lead, adiciona tag, envia para pipeline.

### Comentario com palavra-chave

Quando uma pessoa comentar uma palavra-chave em um post, reel ou anuncio:

- Capturar comentario via webhook.
- Verificar regra ativa.
- Curtir o comentario, se a API oficial permitir para aquele tipo de comentario/conteudo.
- Responder abaixo do comentario com uma mensagem publica.
- Enviar uma mensagem privada inicial.
- Criar ou atualizar contato na Wizzy.
- Adicionar tag/origem/campanha.
- Se a pessoa responder a DM, continuar fluxo automatizado ou encaminhar para atendimento humano.

Exemplo:

- Comentario: "quero"
- Resposta por DM: "Oi, vi que voce comentou no nosso post. Quer receber as informacoes?"

### DM com palavra-chave

Quando a pessoa enviar mensagem direta:

- Identificar palavra-chave/intencao.
- Responder automaticamente.
- Acionar fluxo Wizzy.
- Criar conversa no inbox.
- Permitir transferencia para humano.

### Resposta a story

Quando a pessoa responder um story:

- Criar conversa.
- Aplicar regra especifica para stories.
- Permitir resposta automatica, qualificar lead ou transferir para humano.

### Mencoes

Quando a conta for mencionada:

- Registrar evento.
- Opcionalmente criar contato/conversa.
- Permitir acionar fluxo conforme regra.

## Regras e Limitacoes da Meta

Pontos a validar sempre na documentacao oficial antes da implementacao:

- Nao pode enviar DM fria sem acao previa do usuario.
- Private Replies para comentarios permitem uma primeira mensagem privada.
- Se a pessoa responder, a conversa pode continuar dentro das regras da janela de mensagens.
- Existem limites e politicas da Messenger Platform/Instagram Messaging.
- Permissoes podem exigir revisao da Meta.
- Curtir comentarios via API precisa ser confirmado na documentacao oficial vigente antes da implementacao.
- Responder comentario publicamente e enviar DM privada devem ser tratados como acoes separadas, com logs separados.

## Permissoes Provaveis

Lista inicial a confirmar:

- `instagram_basic`
- `instagram_manage_messages`
- `instagram_manage_comments`
- `pages_show_list`
- `pages_read_engagement`
- `pages_messaging`
- `business_management`, se necessario para contas Business/ativos.

## Arquitetura Inicial

### Frontend

Adicionar area em Integracoes:

- Conectar Instagram.
- Mostrar conta conectada.
- Status das permissoes.
- Desconectar/reconectar.

Adicionar tela de automacoes:

- Criar regra.
- Escolher gatilho.
- Escolher canal de ativacao: WhatsApp, Instagram ou ambos.
- Definir palavra-chave.
- Definir resposta/fluxo.
- Ativar/desativar.
- Ver logs de execucao.

Atualizar painel Conversas:

- Mostrar conversas de WhatsApp e Instagram no mesmo painel.
- Adicionar filtro por canal.
- Mostrar icone/label do canal em cada conversa.
- Permitir que mensagens enviadas usem o provedor correto conforme o canal.

### Supabase / Backend

Possiveis Edge Functions:

- `meta-instagram-oauth`
- `meta-instagram-webhook`
- `instagram-send-message`
- `instagram-reply-comment`
- `instagram-like-comment`
- `instagram-sync-account`

Possiveis tabelas:

- `instagram_accounts`
- `instagram_conversations`
- `instagram_messages`
- `instagram_contacts`
- `instagram_automation_rules`
- `instagram_webhook_events`
- `instagram_rule_executions`

Possivel ajuste em tabelas existentes:

- Tornar conversas/mensagens multi-canal, com campo `channel`.
- Suportar identificadores externos por canal.
- Separar `whatsapp_instance_id` de um modelo mais generico de `channel_account_id`, se fizer sentido na implementacao.
- Preservar compatibilidade com WhatsApp atual.

## Modelo de Regras

Cada regra pode ter:

- Organizacao.
- Conta Instagram.
- Canal ou canais ativos.
- Tipo de gatilho.
- Palavra-chave ou condicao.
- Escopo: todos posts, post especifico, reel especifico, anuncio, story.
- Acao: curtir comentario, responder comentario, enviar DM, enviar mensagem de WhatsApp, iniciar fluxo, criar contato, adicionar tag, notificar atendente.
- Status ativo/inativo.
- Limites anti-spam.

## Integracao com Wizzy

Ideias para integrar com o produto atual:

- Criar contato automaticamente.
- Criar conversa no inbox unificado.
- Permitir atendimento humano.
- Usar agentes de IA para responder.
- Usar fluxos existentes da Wizzy.
- Adicionar tags, origem e campanhas.
- Enviar lead para pipeline/CRM.
- Medir conversao por regra/campanha.

## MVP Proposto

Primeira versao minima:

1. Conectar Instagram via Meta OAuth.
2. Receber webhooks de comentarios e DMs.
3. Criar regra de palavra-chave em comentario.
4. Responder comentario publicamente.
5. Enviar Private Reply por DM.
6. Se a pessoa responder, criar conversa na Wizzy.
7. Mostrar conversa do Instagram no painel Conversas.
8. Registrar contato e tag de origem.
9. Tela simples de logs.

Funcionalidade desejada para o MVP, mas dependente de confirmacao final da API/permissao:

- Curtir automaticamente o comentario.

## Questoes Abertas

- Como desenhar o filtro por canal no painel Conversas sem poluir a tela?
- As respostas automaticas devem usar fluxo visual, IA, ou ambos?
- O cliente podera escolher post/reel especifico ou apenas palavra-chave global no MVP?
- Como lidar com limite de mensagens e janela de 24h?
- Como precificar esse modulo: addon, plano maior ou limite por mensagens?
- Como exibir erros de permissao da Meta para o cliente?
- Precisa suportar anuncios do Instagram no MVP?
- Como unificar contatos quando a mesma pessoa existe no WhatsApp e no Instagram?
- O fluxo deve ter mensagens diferentes por canal ou uma mensagem unica adaptada automaticamente?

## Decisoes Tomadas

- Usar API oficial da Meta.
- Nao usar scraping nem automacao por navegador.
- Comecar pelo fluxo "comentou palavra-chave -> envia DM", por ser o caso mais parecido com ManyChat.
- Instagram sera tratado como canal de comunicacao dentro do painel Conversas, junto com WhatsApp.
- Os fluxos/automações deverao permitir escolha de canal de ativacao: Instagram, WhatsApp ou ambos.
- Comentarios do Instagram devem poder disparar automacoes com curtida, resposta publica e DM privada quando permitido pela API oficial.

## Referencias

- Meta Private Replies: https://developers.facebook.com/docs/messenger-platform/instagram/features/private-replies
- Meta Messenger Platform Policies: https://developers.facebook.com/docs/messenger-platform/policy

## Historico

- 2026-06-06: Documento criado para registrar o planejamento do futuro modulo de automacao do Instagram.
- 2026-06-06: Definido que Instagram deve ser canal do painel Conversas, com suporte a fluxos multi-canal e automacoes por comentario estilo ManyChat.
- 2026-07-08: Implementada a Fase 1 (fundacao): OAuth via Meta, webhook oficial, automacao "comentario com palavra-chave -> curtir/responder/DM", inbox do Instagram separado do WhatsApp (sem unificacao de contatos), tela de automacoes + logs. Tabelas novas: `instagram_accounts`, `instagram_contacts`, `instagram_contact_tags`, `instagram_conversations`, `instagram_messages`, `instagram_webhook_events`, `instagram_automation_rules`, `instagram_rule_executions` (migration `20260708120000_instagram_channel.sql`). Edge functions novas: `instagram-oauth-start`, `instagram-oauth-callback`, `instagram-webhook`, `instagram-send-message`, `instagram-comment-actions`, `instagram-check-status`, `instagram-disconnect`, `instagram-rule-execute`, mais `_shared/instagramProvider.ts`. Pendente do lado do usuario: configurar o app em developers.facebook.com (produto Instagram, Pagina do Facebook vinculada, Webhook, permissoes) antes de conseguir testar ponta a ponta — app ainda estava vazio no inicio desta fase. Fases 2-4 (DM/story/mention triggers, motor de fluxos multi-canal, paridade completa com ManyChat) permanecem como roadmap, nao implementadas.
- 2026-07-08: Testado ponta a ponta com o app real ("Wizzy-IG", usando Instagram API with Instagram Login — sem Pagina do Facebook, diferente do fluxo Facebook Login originalmente assumido; codigo de OAuth/token/webhook subscribe foi ajustado para `graph.instagram.com`/`api.instagram.com` e escopos `instagram_business_*`). Descoberto e documentado: em modo Development, a Meta nao entrega webhooks (nem leitura de comentarios) sem Advanced Access — so o OAuth/conexao funciona antes do App Review. Paginas publicas de Politica de Privacidade, Termos de Uso e Exclusao de Dados criadas (`/privacidade`, `/termos`, `/exclusao-de-dados`) como pre-requisito do App Review.
- 2026-08-11: Adotada uma spec-alvo para o modulo (docs/WIZZY_ENGAGE_SPEC.md), a partir de um produto real de automacao de Instagram tomado como parametro pelo dono. Auditoria contra ela achou um BUG no fluxo central, nao uma feature faltando: o comentario->DM endereçava a mensagem por `recipient:{id}` (DM comum, so valida dentro da janela de 24h) em vez de `recipient:{comment_id}` (private reply, permitida justamente porque a pessoa comentou — 7 dias, uma vez por comentario). Quem so comentou nunca teve janela aberta, entao a Meta recusava; e como nao havia controle de janela, a recusa virava `error` generico. Corrigido, com o tipo `InstagramRecipient` tornando a escolha explicita. Junto: trava atomica na fila de follow-ups (`claim_instagram_followups`, UPDATE ... FOR UPDATE SKIP LOCKED — validado com 4 processos concorrentes sobre 100 linhas: 100 reservadas, 100 unicas; antes, um lote que passasse de 60s era reenviado inteiro pelo cron seguinte), coluna `last_inbound_at` + checagem da janela de 24h (follow-up fora da janela agora e `skipped`, nao `error`), renovacao semanal do token de 60 dias (`instagram-refresh-tokens` + status novo `expired`; antes toda conexao morria em 2 meses sem aviso), versao da API fixada em v25.0 (path sem versao resolve para a mais antiga suportada, que muda sem aviso) e os cron jobs versionados em migration (o do process-followups existia so como COMENTARIO na edge function, para aplicacao manual — nao havia como saber se algum dia foi agendado). Migrations `20260811145000` e `20260811150000`. Pendente da spec: gatilho por DM/story, rate limit de envio por conta, quick replies, variacoes de resposta publica, seletor visual de posts.
- 2026-08-11: Preparacao do App Review da Meta (o bloqueio real do modulo: em Development a Meta nao entrega webhook nem leitura de comentario, entao nenhuma automacao dispara para cliente real). Auditoria dos pre-requisitos contra o repo: politica de privacidade, termos, instrucoes de exclusao de dados e verificacao de assinatura do webhook ja existiam; faltavam os DOIS callbacks obrigatorios do Business Login. Implementados `instagram-deauthorize` (revogacao feita fora do produto deixava a conta como 'connected' para sempre, com token morto) e `instagram-data-deletion` (apaga o contato + cascata, devolve `{url, confirmation_code}` e serve a pagina de status por GET), mais `parseSignedRequest` no `_shared/instagramProvider.ts` (HMAC-SHA256, base64url, fail-closed sem app secret — ao contrario do verificador de webhook, que falha aberto de proposito). Migration `20260811140000_instagram_data_deletion_requests.sql`. Guia completo da submissao em `META_APP_REVIEW_INSTAGRAM.md` (ordem obrigatoria: Verificacao de Negocio -> Live Mode -> App Review; justificativas por permissao; roteiro de screencast). Achado: `instagram_business_content_publish` e pedida no OAuth mas nenhuma funcao publica conteudo — recomendado remover da submissao, porque permissao que nao da para demonstrar no screencast e motivo comum de rejeicao.
- 2026-07-09: Implementada a Fase 2 (parcial): sequencia de DM dentro do proprio Wizzy Engage (sem integrar ao construtor de fluxos visual) — a acao `send_dm` agora aceita um botao de link rastreado (`instagram_tracked_links` + `instagram-link-redirect`, um redirect proprio que registra o clique) e um follow-up agendado que varia a mensagem conforme o clique (`instagram_pending_followups` + `instagram-process-followups`, varredura por cron a cada minuto, espelhando o padrao de `process-flow-timeouts`). Migration `20260709120000_instagram_dm_sequences.sql`. Decisao registrada: manter essa sequencia dentro do Wizzy Engage por enquanto; integrar ao construtor de fluxos visual completo (Fase 3 do roadmap original) fica para depois.
