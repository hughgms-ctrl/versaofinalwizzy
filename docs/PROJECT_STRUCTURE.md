# Project Structure

## Boundaries

- `apps/web`: frontend React. Nao deve conter Edge Functions, migrations ou scripts operacionais.
- `apps/api`: backend Supabase. Nao deve conter componentes React ou codigo de UI.
- `tools/diagnostics`: scripts manuais para investigacao, backfills e verificacoes pontuais.
- `docs`: documentacao tecnica e produto.

## Shared Configuration

The repository keeps shared tooling at the root so commands can still run from one place:

- `vite.config.ts`: uses `apps/web` as the Vite root.
- `vitest.config.ts`: scans tests under `apps/web/src`.
- `tailwind.config.ts`: scans frontend source under `apps/web/src`.
- `tsconfig*.json`: maps `@/*` to `apps/web/src/*`.
- `components.json`: points shadcn/ui to `apps/web/src`.

## Import Rules

- Frontend imports should use `@/` for code inside `apps/web/src`.
- Supabase Edge Functions should keep shared backend helpers in `apps/api/supabase/functions/_shared`.
- Diagnostics scripts should stay in `tools/diagnostics` and avoid being imported by app code.
