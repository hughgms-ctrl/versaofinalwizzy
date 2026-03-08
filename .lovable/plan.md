# Pipeline = Departamento + Transição Automática

## Conceito

Cada pipeline funciona como um departamento. Ao atingir a última coluna, o lead é automaticamente transferido para a primeira coluna do próximo pipeline configurado.

## 1. Migration SQL

Adicionar coluna `next_pipeline_id` na tabela `pipelines`:

```sql
ALTER TABLE public.pipelines ADD COLUMN IF NOT EXISTS next_pipeline_id uuid;
```

## 2. `src/hooks/usePipelines.ts`

- Atualizar interface `Pipeline` para incluir `next_pipeline_id: string | null`
- Atualizar `useUpdatePipeline` para aceitar `next_pipeline_id`
- Atualizar `useMoveConversation`: após mover para a última coluna de um pipeline, verificar se `next_pipeline_id` está configurado. Se sim, buscar as colunas do próximo pipeline e mover a conversa para a primeira coluna automaticamente. Registrar ambas as movimentações no histórico.

## 3. `src/components/conversations/ConversationAttributesPanel.tsx`

- Mostrar **seletor de pipeline** (dropdown) em vez de usar apenas o primeiro pipeline
- Buscar as posições da conversa em todos os pipelines para determinar em qual ela está
- Permitir mudar manualmente de pipeline pelo dropdown (move para  coluna configurada do novo pipeline, ou seja, abrir possibilidade de escolher qual coluna do novo pipeline. )

## 4. `src/components/pipeline/PipelineSettingsDialog.tsx`

- Adicionar na aba "Geral" um campo **"Ao concluir, enviar para:"** com dropdown dos outros pipelines
- Opção "Nenhum" para não ter transição automática

## 5. Timeline (`ContactLogsSection.tsx`)

- Já suporta `stage_changed` — a transição automática aparecerá naturalmente pois registramos no `conversation_stage_history` com `changed_by_type: 'auto'`

## 6. `src/integrations/supabase/types.ts`

- Será atualizado automaticamente após a migration para incluir `next_pipeline_id`

## Resumo de Arquivos


| Ação      | Arquivo                                                                            |
| --------- | ---------------------------------------------------------------------------------- |
| Migration | `next_pipeline_id` na tabela `pipelines`                                           |
| Editar    | `src/hooks/usePipelines.ts` — interface + auto-transition logic                    |
| Editar    | `src/components/conversations/ConversationAttributesPanel.tsx` — pipeline selector |
| Editar    | `src/components/pipeline/PipelineSettingsDialog.tsx` — config "Ao concluir"        |
| Editar    | `src/integrations/supabase/types.ts` — novo campo                                  |
