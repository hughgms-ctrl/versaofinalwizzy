

## Corrigir: workspace desativado fica inacessível

### O problema

O hook `useWorkspaces` filtra `is_active = true` para todo lugar — inclusive a tela **Settings → Workspaces**. Resultado: ao desativar, o workspace desaparece de todos os lugares, **incluindo da própria tela onde você reativaria**. Beco sem saída — a única forma de voltar hoje é via banco.

### Solução

Separar **dois usos** do hook:

1. **`useWorkspaces()`** (uso geral — sidebar, filtros, seletores) → continua trazendo só os ativos.
2. **`useAllWorkspaces()`** (novo — só para a tela de Settings) → traz ativos **e** inativos.

Na tela de Settings:
- Workspaces inativos aparecem com badge cinza "Inativo" e opacidade reduzida (já tem o badge no `WorkspaceCard`, só não chegam na lista).
- Ordenados: ativos primeiro, depois inativos.
- O diálogo de edição já tem o switch "Workspace ativo" — basta o card aparecer pra você conseguir abrir e religar.

### Bônus pequeno (mesma tela)

- Mostrar contagem no topo: "3 ativos · 1 inativo".
- Texto explicativo no badge "Inativo" via tooltip: "Oculto da operação. Dados preservados. Reative no botão de edição."

### Arquivos

- `src/hooks/useWorkspaces.ts` — adicionar `useAllWorkspaces()` (sem o filtro `is_active`).
- `src/components/settings/WorkspacesSettings.tsx` — usar `useAllWorkspaces`, ordenar ativos→inativos, adicionar contagem e tooltip.

Sem mexer em banco, sem mexer em RLS, sem afetar o resto do app.

