

## Plano: Card único por pipeline + Transferência entre departamentos

### Situação Atual
- A tabela `conversation_pipeline_positions` permite múltiplas entradas por conversa em pipelines diferentes (sem constraint unique por conversation_id cross-pipeline)
- Já existe 1 conversa duplicada em 2 pipelines no banco

### O que vamos fazer

**1. Migração de banco: Garantir 1 pipeline por conversa**
- Limpar duplicatas existentes (manter a posição mais recente)
- Adicionar constraint UNIQUE em `(conversation_id)` na tabela `conversation_pipeline_positions` (não por pipeline, mas globalmente — uma conversa só pode ter UMA posição em UM pipeline)

**2. Ação "Transferir para departamento" no card**
- No menu de ações do card (`ConversationCardActions.tsx`), adicionar opção **"Transferir para..."** com submenu listando os outros pipelines
- Ao transferir: deleta posição antiga, insere na primeira coluna do pipeline destino
- Registra no `conversation_stage_history` com `changed_by_type: 'transfer'`

**3. PipelineBoardV2 — Mover entre pipelines via drag (opcional)**
- Não implementar drag cross-pipeline agora (complexo demais). Apenas o botão de transferência no menu.

**4. Limpeza visual**
- No `PipelineBoardV2.tsx`, nenhuma mudança necessária pois já filtra por `pipeline_id`

### Arquivos afetados
- **Migração SQL**: Limpar duplicatas + adicionar unique constraint em `conversation_pipeline_positions(conversation_id)`
- **`src/components/conversations/ConversationCardActions.tsx`**: Adicionar botão "Transferir para..." com lista de pipelines
- **`src/hooks/usePipelines.ts`**: Adicionar mutation `useTransferConversation` que faz delete + insert + history

### Resultado
Cada card aparece em apenas 1 pipeline. Para mover entre departamentos, o atendente usa "Transferir para [Departamento]".

