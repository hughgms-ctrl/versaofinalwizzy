# Workspace × Org × Número × Conversa × Contato — regras-alvo

Decidido em 2026-08-28 (conversa com o dono do produto). Este documento é a
spec-alvo; o código de hoje NÃO segue tudo isto (ver "Estado atual" no fim).

## Entidades

| Entidade | Dono | Regra |
|---|---|---|
| **Org** | — | Dona de tudo: números, usuários, tags, contatos, workspaces. Isolamento de banco (RLS) é por org. |
| **Workspace** | Org | Time de atendimento (vendas, suporte…). Membros em `workspace_members`; admin/owner enxerga todos. |
| **Número** (instância WhatsApp) | Org | Canal. Pertence a **≥1 workspace sempre**. Pode servir vários workspaces ao mesmo tempo. |
| **Contato** | Org | Uma ficha por `(org, telefone)`. Visível em N workspaces via `workspace_id` + `shared_workspace_ids`. Workspace só vê os seus. Contato NÃO segue número. |
| **Conversa** | Workspace | Pertence a exatamente um workspace. Identidade = `(contato, telefone do número, workspace)`. Pode ser **transferida** (manual) — vai inteira, com histórico. |
| **Dono do contato por número** | — | Para cada `(contato, número)`: qual workspace atende agora. Ponteiro novo. |

## Regras

### R1 — Conversa pertence ao workspace, não ao número
Trocar o número de workspace não move conversa nenhuma. Ex.: número sai de
Suporte e vai para Vendas → Vendas não vê o histórico de Suporte; abre chat
novo (zerado) com o contato. Suporte fica com o histórico só leitura (sem
número, não envia — 409 `WORKSPACE_WITHOUT_NUMBER`).

### R2 — Transferência é explícita e leva o histórico
Seletor "Workspace" na conversa. Move a conversa inteira. Também torna o
destino o **dono** do contato naquele número (R5).

### R3 — Um número em vários workspaces exige regra de roteamento
Ao vincular o **2º** workspace a um número, a UI exige escolher:
- **Tudo para um** workspace (triagem) — os outros recebem por transferência;
- **Divide igual** (round-robin);
- **Divide por porcentagem**.
Vale **só para contato novo** (primeira mensagem, sem dono). Depois manda R5.
Roteamento "por tag" não é um modo: é tudo-para-um + transferência (pode virar
automação depois).

### R4 — Todo número tem ≥1 workspace
Remover o último workspace de um número é bloqueado.

### R5 — Último workspace a falar é o dono
Para número compartilhado: toda mensagem recebida cai no workspace **dono** do
`(contato, número)`. O dono muda quando um workspace **envia qualquer
mensagem** (humano, IA, fluxo, campanha, agendado) ou **transfere** a conversa
para si. Dono é permanente até outro workspace falar; encerrar/arquivar não
libera.
Os outros workspaces veem aviso na conversa: *"Este contato está em
atendimento com {workspace}"* e podem enviar **com confirmação** ("isso vai
trazer o contato para o seu workspace").

### R6 — Números diferentes = chats independentes
Contato que fala com o número X (ws A) e o número Y (ws B) tem dois chats.
O contato "escolheu" ao discar.

### R7 — Reconexão do mesmo número = mesma conversa
Identidade usa o **telefone** do número, não o id da instância (que muda ao
reconectar).

### R8 — Contato: uma ficha por org, visível onde for usado
Criar em B um telefone que existe em A não duplica: reaproveita a ficha e
adiciona B em `shared_workspace_ids` (regra atual de `useContacts.ts`,
mantida). Abrir chat novo em A com contato de B adiciona A automaticamente.

### Exceções mantidas
- `conversation_shares`: compartilhar UMA conversa com UM usuário (por pessoa,
  não por workspace).
- Admin/owner vê todos os workspaces, "Todos" e "Sem Workspace".

## Implementação (2026-08-29)

Migration `supabase/migrations/20260829120000_workspace_conversa_pertence_ao_workspace.sql`
(aplicar À MÃO no SQL Editor; testada em postgres:15):
- guard `trg_guard_conversation_workspace_number` desligado; `wz_workspace_allowed_for_conversation` só checa org;
- índice único vira `(contact_id, org, whatsapp_instance_id, COALESCE(workspace_id))` → R1/R6;
- `whatsapp_instances.routing_mode/routing_config/routing_cursor` → R3;
- `contact_number_owners` (dono por contato+número) + `wz_claim_contact_owner`;
  triggers em `messages` (outbound) e em `conversations` (UPDATE de workspace_id) → R5;
- `wz_route_incoming_conversation(contact, org, instance)` → webhook;
- backfill dos donos pela última mensagem enviada.

Código:
- `zapi-webhook`: `routeIncomingConversation` (rpc; fallback = comportamento antigo se a
  migration não foi aplicada) + `findOrCreateConversation` escopado por workspace +
  `ensureContactVisibleInWorkspace` (R8).
- `zapi-send-message`: 409 `CONTACT_OWNED_BY_OTHER_WORKSPACE` se outro workspace é o dono;
  reenvio com `confirmTakeover: true`.
- `safe-record-actions.set_conversation_workspace`: transferência mescla com o chat
  que já existir no destino (mensagens migram, conversa origem apagada) e compartilha o
  contato em vez de mover.
- Front: aviso "em atendimento com X" + diálogo de confirmação (`ConversationDetail`);
  regra de roteamento ao marcar o 2º workspace e bloqueio de número sem workspace
  (`WhatsAppInstancesSettings`).

Saneamento do caso A/B: `docs/sanear-workspace-numero-movido.sql`.

Pendências conhecidas:
- RLS por workspace continua só no front (decisão adiada).
- `useWorkspaces.useUpdateWorkspace` ainda permite `whatsapp_instance_id: null` (R4 só na UI da instância).
- `types.ts` precisa ser regenerado após aplicar a migration (front usa `as any` nos campos novos).
