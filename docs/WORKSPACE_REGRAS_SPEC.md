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

## Estado atual (2026-08-28) — o que contraria a spec

- Índice único `idx_conversations_contact_org_instance_unique` =
  `(contact_id, org, whatsapp_instance_id)` — **sem workspace**. Impede R1
  (chat novo no A) e usa id da instância (contraria R7).
- Migration `20260818120000_workspace_conversa_pertence_ao_numero` + guard
  `wz_workspace_allowed_for_conversation` / `trg_guard_conversation_workspace_number`
  codificam "conversa pertence ao número" — bloqueiam a transferência (R2)
  em silêncio.
- Webhook (`zapi-webhook` ~2084): 1 workspace → carimba; ≥2 → `NULL`
  ("Sem Workspace"). Não existe roteamento (R3) nem dono (R5).
- `whatsapp_instances` não tem workspace; o vínculo é `workspaces.whatsapp_instance_id`
  (N ws → 1 número). Não há tabela de roteamento.
- Isolamento por workspace é só filtro no front (`useConversations.ts:113`);
  RLS é por org.
- Nada impede número sem workspace (contraria R4).
