# Regra: visibilidade de conversa por NÚMERO conectado

Status: **em implementação** (2026-07-07). Deploy via Lovable (aplicação manual de SQL no
SQL Editor). Sem teste local full-stack — validar em produção fase a fase.

## Regra de negócio (confirmada pelo usuário)

- Identidade estável = **o número de telefone real (E.164)**, capturado no connect. A conversa
  fica presa ao NÚMERO, não à instância (instância é encanamento; reconectar cria UUID novo).
- **Deletar a instância → esconde** todas as conversas daquele número.
- Conversa escondida (número não conectado) **NÃO pode chegar ao front-end** — o filtro é
  responsabilidade do BACK-END (RLS + RPCs), não do JS.
- **Reconectar** (mesmo número, instância nova) → captura número → **readota** as conversas
  daquele número (ganham a instância nova) e reaparecem.
- **Anti-piscar:** esconder só quando o número sai de verdade (instância deletada / inatividade
  prolongada), NÃO em queda momentânea de rede.
- Vale para **todas as orgs**. Some em tudo: lista de conversas, dashboard, relatórios, busca.

## Decisão de arquitetura

- **Coluna mantida** `conversations.hidden_by_disconnect boolean` (default false) — filtro barato
  em todo lugar — **imposta no back** via RLS (usuário autenticado só vê `hidden = false`) +
  `AND NOT hidden_by_disconnect` nas RPCs SECURITY DEFINER (dashboard/busca). `service_role`
  (webhook/edge) continua vendo tudo, pra readotar.
- **Chave de visibilidade = existência de instância para o número.** `hidden = true` se NÃO existe
  instância na org cujo `phone_number` (match key) == `source_phone` (match key) da conversa.
  - Delete da instância → linha some → esconde. ✅ gatilho do usuário.
  - Queda de rede → linha continua existindo → não esconde. ✅ anti-piscar de graça (sem timer).
- Mantida por **trigger em `whatsapp_instances`** (AFTER INSERT/UPDATE OF phone_number/DELETE) —
  único ponto que pega até o delete feito pelo client. Reaproveita
  `adopt_orphan_conversations_for_instance` (já existe) para a readoção por número.
- Por que NÃO repetir a RLS antiga (removida em 20260522170000): aquela filtrava por
  `whatsapp_instance_id` (zera no churn) → sumia tudo. A nova filtra pelo NÚMERO (`source_phone`),
  que é estável.

## Fases

- **Fase 0 — captura do número no connect (fundação).** FEITO no path Evolution do
  `zapi-check-status/index.ts` (`checkEvolutionInstance`): quando conectado e sem número,
  busca `/instance/fetchInstances` para pegar `ownerJid` e gravar `phone_number`; removido
  `profileName` da extração. Falta: backfill de `source_phone` das conversas quando o número é
  (re)capturado. **VALIDAR EM PRODUÇÃO antes das fases seguintes** — se ligar o filtro com
  phone_number NULL, some tudo.
- **Fase 1 — coluna + trigger.** `hidden_by_disconnect` + índice; trigger de manutenção que
  recomputa por número no connect/disconnect/delete e chama a readoção.
- **Fase 2 — ligar o filtro.** RLS SELECT em conversations (`hidden_by_disconnect = false`) +
  `AND NOT hidden_by_disconnect` em `get_dashboard_metrics`, `get_team_performance`,
  `search_messages`, e contagens de pipeline. (Read-paths mapeados: useConversations.ts,
  20260617120000_fase4_dashboard_rpcs.sql, 20260618120100_fase5b_...rpc.sql.)
- **Fase 3 — reconnect completo.** Reapontar `workspaces.whatsapp_instance_id` para a instância
  nova do número (hoje fica NULL — FK ON DELETE SET NULL, nunca re-linka).
- **Limpeza.** Órfãs antigas (source_phone NULL) caem como escondidas pela regra. As do número do
  "comercial" tentar recuperar via `conversations.workspace_id` → número do workspace.

## Causa-raiz (por que duplicava)

Connect da Evolution marcava `connected` sem capturar o número (`connectionState` não traz owner;
`fetchInstances` nunca era chamado). `phone_number` NULL → `source_phone` NULL → readoção por
número cega → cada instância fantasma (churn de delete+recria) gera conversa própria por contato.
Ver [[number-connection-visibility-rule]] e limpeza em `docs/unificar-conversas-duplicadas.sql`.
