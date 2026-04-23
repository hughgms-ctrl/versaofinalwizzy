

## Simplificar status de conversa: só "Aberto" e "Em andamento"

### Conceito atual (confuso)
Hoje a conversa tem **dois eixos sobrepostos** que se confundem:

1. **`status`** (modelo de helpdesk): `open` / `pending` / `resolved` / `archived` — herdado de sistemas de ticket.
2. **`service_mode`** (quem controla): `pendente` (Fila) / `ativo` (Humano) / `ia` (IA).

Resultado: aparecem badges como "Aberto", "Pendente", "Resolvido" e ações tipo *"Resolver/Finalizar"* que não fazem sentido em um chat contínuo de WhatsApp.

### Conceito novo (proposto)
Manter **apenas dois status reais** baseados no que importa: *já foi atendido ou não?*

| Status | Quando aplicar | Cor sugerida |
|---|---|---|
| **Aberto** | Última mensagem é do contato (inbound) e ninguém respondeu ainda. É um lead/atendimento ainda não tocado. | Vermelho/laranja (chama atenção) |
| **Em andamento** | Já houve pelo menos uma resposta (humano ou IA) após a última inbound. Está sendo conduzido. | Verde |
| **Arquivado** *(mantido à parte)* | Conversa removida da caixa principal manualmente. Não é status de fluxo, é uma "gaveta". | Cinza |

**Eliminados:** `pending` e `resolved` da camada de status. Quem quiser marcar conclusão usa **arquivar** ou as **etapas do Pipeline** (que já existem para isso).

**"Não lidas"** continua como filtro rápido independente — refere-se a `unread_count > 0` (mensagens que o operador ainda não abriu), não ao status do atendimento.

### Como o status será calculado
Status passa a ser **derivado automaticamente** da última mensagem, sem campo manual:

```text
última msg = inbound (do contato)  → "Aberto"
última msg = outbound (humano/IA)  → "Em andamento"
status = 'archived' no banco       → "Arquivado"
```

Isso resolve o problema central: você consegue ver na hora **quem ainda não foi atendido**.

### Mudanças na interface

1. **Badge na lista de conversas (`ConversationList.tsx`)**
   - Remover badges "Pendente" e "Resolvido".
   - Mostrar **"Aberto" (vermelho)** quando última mensagem for inbound sem resposta.
   - Mostrar **"Em andamento" (verde)** quando já houve resposta.
   - Manter **"Arquivado"** quando aplicável.

2. **Filtros (`ConversationFilters.tsx`)**
   - Submenu "Status" agora só lista: **Todos / Aberto / Em andamento / Arquivado**.
   - Filtro funciona em cima do status derivado, não do campo bruto.

3. **Menu de ações da conversa (`ConversationActionsMenu.tsx` e `ConversationCardActions.tsx`)**
   - Remover item *"Resolver/Finalizar"* e *"Marcar resolvida"*.
   - Manter apenas: **Arquivar** / **Desarquivar**.
   - Reabrir conversa arquivada volta o status para o derivado natural (Aberto ou Em andamento).

4. **Painel de contato (`ContactProfilePanel.tsx`) e detalhe (`ConversationDetail.tsx`)**
   - Badge no cabeçalho passa a usar o status derivado.

5. **Dashboard (`useDashboardData.ts`)**
   - Métricas que usavam `status='resolved'` (ex.: "Resolvidos hoje") passam a usar `status='archived'` arquivados hoje, OU são removidas se redundantes com o pipeline.
   - Gráfico de Resolução (`ResolutionChart`) muda para "Aberto vs. Em andamento vs. Arquivado".

### Compatibilidade com dados antigos
Conversas existentes com `status='resolved'` ou `status='pending'` no banco serão tratadas no front como se fossem `'open'` (entram no cálculo derivado). Não precisa migrar dados — o campo continua existindo, mas a UI ignora esses dois valores. Os Edge Functions que escrevem `status:'open'` continuam corretos.

### Arquivos a modificar
- `src/components/conversations/ConversationList.tsx` — badge derivado
- `src/components/shared/ConversationFilters.tsx` — opções de status
- `src/components/conversations/ConversationActionsMenu.tsx` — remover "Resolver"
- `src/components/conversations/ConversationCardActions.tsx` — remover "Marcar resolvida"
- `src/components/conversations/ContactProfilePanel.tsx` — badge derivado
- `src/components/conversations/ConversationDetail.tsx` — badge derivado
- `src/pages/ConversationsPage.tsx` — lógica do filtro statusFilter usar status derivado
- `src/hooks/useDashboardData.ts` — ajustar contagens
- `src/components/dashboard/ResolutionChart.tsx` — novos rótulos

Pequeno helper novo `src/lib/conversationStatus.ts` exportando `getDerivedStatus(conv)` para reaproveitar a regra em todos os lugares.

