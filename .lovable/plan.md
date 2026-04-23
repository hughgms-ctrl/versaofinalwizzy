

## Pacotes da plataforma + Templates privados por workspace

### Conceito final

Dois mundos separados, sem confusão:

| | **Catálogo da plataforma** | **Meus templates (workspace)** |
|---|---|---|
| Cria | Só você (admin) | Só owner/admin da org |
| Vê | Todas as orgs | Só o workspace dono |
| Edita o original | Só você | O dono |
| Pode clonar pra workspace? | Sim, se `is_clonable=true` | Sim, dentro da própria org |

Cliente leigo nem precisa entender a diferença — ele só vê uma tela "Pacotes & Templates" com cards. Os clonáveis ganham botão "Duplicar como meu". Os bloqueados não.

### Banco

```sql
ALTER TABLE platform_packages
  ADD COLUMN is_locked bool DEFAULT false,           -- esconde "duplicar"
  ADD COLUMN is_clonable bool DEFAULT true,          -- libera "duplicar"
  ADD COLUMN allow_post_edit bool DEFAULT true;      -- permite editar materializado

CREATE TABLE workspace_templates (
  id uuid pk,
  organization_id uuid not null,
  workspace_id uuid not null,                        -- privado por workspace
  created_by uuid,
  name text, icon text, color text, description text,
  master_prompt text,
  agents_template jsonb, flows_template jsonb,
  tags_template jsonb, pipeline_template jsonb,
  source text,                                       -- 'scratch' | 'workspace_export' | 'cloned_from_package'
  source_package_id uuid null,                       -- se clonado
  created_at, updated_at
);
-- RLS: só owner/admin da org dona, e workspace_id deve estar nos workspaces do user
```

### Edge functions

- **`activate-package`** ganha parâmetro `source: 'platform' | 'workspace'`. Mesma lógica de materialização (cria agentes, fluxos, tags, colunas). Idempotente.
- **`export-workspace-as-template`** (nova) — recebe `workspace_id` + checkboxes de quais agentes/fluxos/tags incluir → serializa em JSON e cria registro em `workspace_templates`. Usada também por você no `/admin/packages` (com flag `as_platform=true` salvando em `platform_packages`).
- **`clone-package-to-workspace`** (nova) — recebe `package_id` + `workspace_id` → copia template do catálogo pra `workspace_templates` daquele workspace.

### Frontend

**Settings → "Pacotes & Templates"** (renomeia a aba atual). Duas sub-abas:

- **Catálogo da plataforma** — grid de cards. Cada card: ícone, nome, descrição, badges (área/objetivo, "Bloqueado" se locked). Ações: **Ativar** (sempre), **Duplicar como meu** (se clonable + workspace selecionado).
- **Meus templates** — grid dos templates do workspace ativo. Botões topo: **+ Criar do zero**, **+ Salvar workspace atual como template**, **+ Duplicar do catálogo**. Cada card: **Ativar em outro workspace**, **Editar**, **Excluir**.

Componentes:
- `src/components/settings/PackagesAndTemplatesSettings.tsx` — wrapper com sub-abas, substitui a `PackagesSettings` atual.
- `src/components/settings/CatalogTab.tsx`, `MyTemplatesTab.tsx`.
- `src/components/settings/ExportWorkspaceDialog.tsx` — dialog "Salvar workspace atual como template": lista agentes/fluxos/tags do workspace com checkboxes, campo nome/ícone/cor.
- `src/components/settings/CloneFromCatalogDialog.tsx` — escolhe pacote do catálogo e o workspace destino.
- `src/components/settings/TemplateEditorDialog.tsx` — edita campos básicos do template (nome, ícone, master prompt). Edição profunda dos JSONs continua via "Salvar workspace atual" depois de ajustar lá.

Hooks:
- `src/hooks/useWorkspaceTemplates.ts` — list/create/update/delete + clone + export + activate.
- Estender `usePlatformPackages.ts` com mutations `cloneToWorkspace` e `activatePlatform`.

Permissão: `owner` ou `admin` da org. Member não vê a aba "Meus templates" inteira.

**Admin (`/admin/packages`)** ganha 3 toggles ao editar pacote: `is_locked`, `is_clonable`, `allow_post_edit`. E botão **"Importar do workspace de teste"** que lista seus workspaces e usa o mesmo `export-workspace-as-template` com `as_platform=true` — destrava você criar verticais sem JSON na mão.

### Onboarding

Continua igual. Step 3 do wizard só lista pacotes da plataforma publicados (não mostra templates de workspace, óbvio).

### Ordem de entrega

1. Migration: colunas em `platform_packages` + tabela `workspace_templates` + RLS.
2. Edge `export-workspace-as-template` (serve admin e cliente).
3. Edge `clone-package-to-workspace` + ajuste em `activate-package` pra aceitar `source`.
4. Hook `useWorkspaceTemplates`.
5. UI sub-abas Settings + dialogs.
6. Botão "Importar do workspace" no `/admin/packages` (você ganha autonomia pra criar verticais visualmente).

### O que **não** muda

- `ai_agents`, `flows`, `tags`, `master_prompts`, `pipelines` continuam intocados — pacote/template é só uma fábrica que insere registros nessas tabelas.
- Onboarding atual.
- Interpolação `{{empresa.*}}` da Base de Conhecimento.
- `/admin/packages` continua só seu.

