# Wizzy

Plataforma SaaS para atendimento via WhatsApp com IA, CRM, automacoes, documentos e integracoes.

## Estrutura

```text
apps/
  web/                 React + Vite + TypeScript
    src/               Codigo do frontend
    public/            Assets publicos do frontend
    index.html         Entrada da SPA
  api/
    supabase/          Backend Supabase
      functions/       Edge Functions em Deno
      migrations/      Migrations SQL
      config.toml      Configuracao do projeto Supabase
docs/                  Documentacao tecnica
tools/diagnostics/     Scripts manuais de diagnostico e manutencao
```

As configuracoes compartilhadas continuam na raiz: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tailwind.config.ts`, `tsconfig*.json`, `eslint.config.js` e `components.json`.

## Desenvolvimento

```sh
npm install
npm run dev
```

O frontend roda pelo Vite a partir de `apps/web`, mas os comandos continuam sendo executados na raiz.

## Scripts

- `npm run dev`: inicia o frontend.
- `npm run build`: gera o build do frontend em `dist`.
- `npm run test`: executa os testes do frontend.
- `npm run lint`: executa ESLint no repositorio.
- `npm run api:start`: inicia o Supabase local em `apps/api`.
- `npm run api:stop`: para o Supabase local.
- `npm run api:functions:serve`: serve as Edge Functions localmente.

## Backend Supabase

O backend fica em `apps/api/supabase`. Para comandos diretos da CLI:

```sh
cd apps/api
supabase functions serve
supabase functions deploy --project-ref <PROJECT_REF>
```

Os workflows de deploy tambem apontam para `apps/api`.
