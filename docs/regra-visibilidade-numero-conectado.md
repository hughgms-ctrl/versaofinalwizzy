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
- **Fase 3 — reconnect completo.** ENTREGUE (`docs/fase3-visibilidade-reconnect.sql`). Design (a):
  re-link MANUAL como gatilho (sem phone estável no workspace / reaponte automático — robustez
  futura). RPC `adopt_orphan_conversations_for_workspace(_workspace_id,_instance_id,_dry_run)`
  (SECURITY DEFINER, defesa IDOR: authenticated não-membro → RETURN 0; service_role fura) readota
  órfãs do workspace (inclusive legados source_phone NULL que a readoção por número não alcança),
  reusa `_wz_merge_conversation_pair` na colisão, backfilla source_phone. Chamada nos 3 pontos de
  re-link: `zapi-save-credentials` (connect c/ workspace), `WhatsAppInstancesSettings.tsx`
  (addedIds), `useWorkspaces.ts` (updateWorkspace quando seta whatsapp_instance_id). Trigger da
  Fase 1 des-esconde ao carimbar. Recuperação one-shot do a0a518a0 = PARTE 3 do SQL (dry-run first).
  Subtarefa 1 (source_phone em conversas novas) já vinha resolvida no `findOrCreateConversation`.
- **Limpeza.** Órfãs antigas (source_phone NULL) caem como escondidas pela regra. As do número do
  "comercial"/"geral" recuperam via Fase 3: reconectar o número → re-linkar o workspace no UI
  (código readota), ou rodar a PARTE 3 do SQL manualmente.

## Causa-raiz (por que duplicava)

Connect da Evolution marcava `connected` sem capturar o número (`connectionState` não traz owner;
`fetchInstances` nunca era chamado). `phone_number` NULL → `source_phone` NULL → readoção por
número cega → cada instância fantasma (churn de delete+recria) gera conversa própria por contato.
Ver [[number-connection-visibility-rule]] e limpeza em `docs/unificar-conversas-duplicadas.sql`.
