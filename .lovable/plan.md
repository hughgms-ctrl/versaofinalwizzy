

## Acesso Granular a Leads Específicos

### Problema
Hoje, o sistema permite filtrar por: atribuição, tags, ou pipelines permitidos. Mas não há como dar acesso a **um lead específico** sem liberar todo o pipeline ou tag onde ele está.

### Solução: Tabela de Compartilhamento de Conversas

Criar uma tabela `conversation_shares` que funciona como uma lista de exceções — leads explicitamente compartilhados com um usuário, independente das demais restrições.

```text
┌─────────────────────────┐
│   conversation_shares   │
├─────────────────────────┤
│ id (uuid)               │
│ conversation_id (uuid)  │
│ user_id (uuid)          │
│ shared_by (uuid)        │
│ organization_id (uuid)  │
│ note (text, opcional)   │
│ created_at              │
└─────────────────────────┘
```

### Como funciona

1. **Lógica de filtragem atualizada**: Um lead é visível se passa nos filtros normais (tags, atribuição, pipeline) **OU** se está na tabela `conversation_shares` para aquele usuário.

2. **Pipeline**: Se o lead compartilhado está no Pipeline Comercial, o Múcio vê **apenas aquele lead** no Comercial — sem ver os demais. O pipeline aparece no seletor apenas se tiver leads compartilhados nele.

3. **UI para compartilhar**: Na conversa ou no pipeline, um botão "Compartilhar com membro" permite selecionar o usuário da equipe. Admins/owners podem compartilhar qualquer lead.

4. **UI de permissões**: Na tela de edição de permissões do membro, uma nova seção mostra os leads compartilhados manualmente, permitindo revogar.

### Implementação

1. **Migração SQL**: Criar tabela `conversation_shares` com RLS e índice único `(conversation_id, user_id)`.

2. **Hook `useConversationShares`**: CRUD para compartilhamentos.

3. **Atualizar `ConversationsPage.tsx`**: Na lógica de filtragem, adicionar:
   ```
   if (isSharedWithUser(conv.id)) return true; // sempre visível
   ```

4. **Atualizar `PipelinePage.tsx`**: Mesma lógica — leads compartilhados aparecem mesmo em pipelines não permitidos.

5. **Componente de compartilhamento**: Dialog simples no menu de ações da conversa para selecionar membros.

6. **Seção em `EditPermissionsDialog`**: Listar leads compartilhados com aquele membro, com opção de remover.

### Resultado
- Múcio tem acesso apenas ao Pipeline Operacional
- Você compartilha um lead do Comercial com ele
- Ele vê esse lead específico na lista de conversas e no Pipeline Comercial (só aquele card)
- Sem acesso aos demais leads do Comercial

