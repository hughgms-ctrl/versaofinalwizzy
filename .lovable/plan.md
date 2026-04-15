

## Reorganização da Sidebar

Atualmente a sidebar tem **14 itens** em lista plana, o que dificulta a navegação. A proposta é agrupar em **4 seções colapsáveis** com submenus:

```text
PRINCIPAL
  ├── Dashboard
  ├── Conversas
  └── Contatos

AUTOMAÇÃO
  ├── Fluxos
  ├── Campanhas
  ├── Agendamentos
  └── Agentes IA

GESTÃO
  ├── Pipeline
  ├── Agenda
  ├── Ferramentas
  └── Relatórios

ADMINISTRAÇÃO
  ├── Equipe
  ├── Integrações
  └── Configurações
```

- Cada grupo terá um label e seta para expandir/colapsar
- Grupos ficam abertos por padrão se contêm a rota ativa
- No modo collapsed (sidebar recolhida), exibe apenas os ícones sem agrupamento (comportamento atual)
- Planos, Sair e perfil permanecem fixos no rodapé

### Mudanças técnicas

- **`Sidebar.tsx`**: Reorganizar o array `navigation` em grupos com `{ label, items[] }`. Renderizar cada grupo com um label clicável + chevron para expandir/colapsar. Usar estado local para controlar quais grupos estão abertos.
- Nenhum arquivo novo necessário, apenas reestruturação do componente existente.

