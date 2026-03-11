

## Onde isso entra e o que fazer

### Resumo

Os prompts de segurança que você detalhou pertencem ao **Governança** (`/admin/governance`), não ao Security. A página de Segurança (`/admin/security`) é apenas um visualizador de logs de auditoria da plataforma. Governança é onde ficam o checklist, registro de prompts, biblioteca e scoring de maturidade.

**O problema atual**: a edge function `admin-governance` nunca foi adicionada ao `config.toml`, então ela falha ao ser chamada. Os dados (checklist + prompts) estão vazios.

### O que será feito

**1. Fix do deploy** -- Adicionar `[functions.admin-governance] verify_jwt = false` no `config.toml` e re-deployar.

**2. Ação `seed_security` na edge function** -- Um endpoint que popula automaticamente todos os dados de uma vez:

- **~20 itens no Checklist** (`governance_checks`) cobrindo as 6 dimensões, com os itens de segurança marcados como Blocker:
  - Roles em tabela separada (user_roles)
  - RLS em todas as tabelas
  - Validação server-side em Edge Functions
  - Service Role Key apenas no servidor
  - Nunca admin via localStorage
  - Validação input com Zod
  - Rate limiting
  - Sanitização HTML (DOMPurify)
  - Tokens rotativos para webhooks
  - Backup automatizado
  - etc.

- **7 Prompts no Registro** (`governance_prompts`) com o conteúdo completo que você enviou:
  1. Proteção contra Escalação de Privilégios
  2. Proteção de Edge Functions
  3. Row Level Security (RLS)
  4. Proteção contra Manipulação de Banco
  5. Proteção de Webhooks e APIs Públicas
  6. Proteção de Secrets e API Keys
  7. Prompt Completo para Outra Ferramenta

- **4 itens na Biblioteca Genérica** com as ameaças reais documentadas:
  - Roubo de Tokens de Acesso
  - Bloqueio e Manipulação de Conteúdo
  - Rastreamento e Exfiltração de Dados
  - Ofuscação de Código

**3. Botão "Popular Checklist de Segurança"** no frontend da aba Checklist para disparar o seed (executa uma vez).

### Arquivos modificados

- `supabase/config.toml` -- adicionar entry da admin-governance
- `supabase/functions/admin-governance/index.ts` -- adicionar action `seed_security`
- `src/components/admin/governance/GovernanceChecklistTab.tsx` -- botão de seed
- Re-deploy da edge function

