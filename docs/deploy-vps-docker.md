# Deploy do Wizzy na VPS com Docker

## O que sobe e o que nao sobe

Este deploy coloca **apenas o frontend** (SPA Vite/React) na VPS, dentro de um
container Nginx. O resto continua onde esta:

| Peca | Onde roda | Como e atualizada |
| --- | --- | --- |
| Frontend (este repo, `src/`) | **VPS, container `wizzy-web`** | `docker compose up -d --build` |
| Banco, Auth, Storage, Realtime | Supabase nuvem (`zaobtetbjpuzibjymhzw`) | inalterado |
| 112 edge functions (`supabase/functions`) | Supabase nuvem | GitHub Actions (`.github/workflows/deploy-*`) |
| Migrations (`supabase/migrations`) | Supabase nuvem | sync do Lovable — **nunca** `supabase db push` |
| CNIS runner | Windows do usuario final (127.0.0.1:8787) | instalador `.exe` |

Ou seja: a VPS serve arquivos estaticos. Nenhum dado da aplicacao passa por ela —
o navegador fala direto com `https://zaobtetbjpuzibjymhzw.supabase.co`.

## Arquivos deste setup

- `Dockerfile` — build multi-stage: `oven/bun:1-debian` instala as dependencias
  (pelo `bun.lock`), `node:22-bookworm-slim` roda o `vite build`, e
  `nginx:1.27-alpine` serve o resultado.
- `docker/nginx.conf` — fallback de SPA, gzip, cache de assets, `/healthz`.
- `docker-compose.yml` — publica `127.0.0.1:8080` -> porta 80 do container.
- `.dockerignore` — corta ~700MB de contexto (node_modules, .git, instalador CNIS).
- `.env.docker.example` — variaveis de build.

## Pre-requisitos na VPS

- Docker Engine + plugin Compose (`docker compose version`).
- Git (ou `scp` do projeto).
- Nginx Proxy Manager ja rodando, e DNS do dominio apontando pra VPS.
- ~3GB livres de disco para o build (node_modules + cache do Docker).

## Passo a passo

### 1. Colocar o codigo na VPS

```bash
git clone <seu-remote> /opt/wizzy
cd /opt/wizzy
```

### 2. Definir as variaveis de build

As `VITE_*` sao **embutidas no bundle durante o build** — nao existe como trocar
depois sem rebuildar. Hoje o `.env` esta versionado no repo com as chaves
publicas, entao o `docker compose` ja acha os valores sozinho (ele le `.env` por
padrao). Para ser explicito:

```bash
cp .env.docker.example .env.docker
nano .env.docker            # cole a VITE_SUPABASE_PUBLISHABLE_KEY
```

E use `--env-file .env.docker` nos comandos do compose.

### 3. Subir

```bash
docker compose up -d --build          # ou: docker compose --env-file .env.docker up -d --build
docker compose ps                     # deve ficar "healthy" em ~30s
curl -i http://127.0.0.1:8080/healthz # -> 200 ok
curl -s http://127.0.0.1:8080/ | head -5
```

O build leva alguns minutos (npm ci + vite build). Imagem final: ~60MB.

### 4. Apontar o Nginx Proxy Manager

Novo **Proxy Host**:

- Domain Names: seu dominio (ex. `app.wizzybr.com`)
- Scheme: `http`
- Forward Hostname / IP:
  - NPM **em container**: use rede compartilhada — descomente o bloco `networks`
    no `docker-compose.yml`, apague o `ports:`, e aponte para `wizzy-web` porta `80`.
    (`127.0.0.1` de dentro do container do NPM e o proprio NPM, nao a VPS.)
  - NPM **fora de container**: `127.0.0.1` porta `8080`.
- Cache Assets: **off** (o nginx interno ja manda os headers certos).
- Block Common Exploits: on. Websockets: nao precisa (o Realtime vai direto pro
  Supabase, nao passa pelo proxy).
- Aba SSL: certificado Let's Encrypt + **Force SSL** + HTTP/2.

### 5. Ajustar o Supabase pro novo dominio

No dashboard do Supabase -> **Authentication -> URL Configuration**:

- **Site URL**: `https://seu-dominio`
- **Redirect URLs**: adicione `https://seu-dominio/**`

Sem isso, confirmacao de email, convite de equipe e reset de senha redirecionam
pro dominio antigo.

## Deploys seguintes

```bash
cd /opt/wizzy && git pull
docker compose up -d --build
docker image prune -f
```

Nao precisa limpar cache de navegador: os assets tem hash no nome e o
`index.html` vai com `no-store`.

Rollback: marque a imagem antes de trocar (`docker tag wizzy-web:latest wizzy-web:ok`)
e volte apontando o `image:` pra essa tag.

## Pontos de atencao

1. **`.env` esta versionado no git** (pendencia conhecida, aguardando rotacao de
   chaves). Sao chaves publicas/anon, mas o certo e `git rm --cached .env` depois
   de rotacionar. Nada de `service_role` em variavel `VITE_*` — ela iria pro
   navegador.
2. **Porta 8080 fica so no loopback** (`127.0.0.1:8080:80`). Se trocar para
   `8080:80`, o site fica acessivel em HTTP puro pela internet, sem TLS. Se
   fizer isso, feche a porta no firewall (`ufw deny 8080`).
3. **Dominio diferente de `wizzybr.com`?** Tres lugares tem link fixo e vao
   apontar pro dominio velho:
   - `src/hooks/useDocumentSignatures.ts:134` — `https://wizzyai.lovable.app`
   - `src/components/documents/SignaturesList.tsx:437` e `:761` — `https://wizzybr.com/verificar/...`

   O resto usa `src/lib/publicOrigin.ts`, que em dominio proprio ja adota o
   `window.location.origin` automaticamente.
4. **CSP** vive na meta tag do `index.html` (nao no nginx, de proposito — duas
   politicas se somam pela intersecao e quebrariam o app). Ao adicionar um
   servico externo novo, edite o `index.html`, nao o `nginx.conf`.
5. **Instalador do CNIS runner (347MB)** fica fora da imagem por padrao. Com
   `VITE_ENABLE_CNIS_RUNNER=false` a UI que depende dele nao aparece. Para
   servir o `.exe` pela VPS: libere `tools/cnis-runner/installer-parts` e
   `public/downloads` no `.dockerignore` e passe
   `INCLUDE_CNIS_INSTALLER=true` (imagem passa de ~400MB). Alternativa melhor:
   hospedar o `.exe` em object storage e setar
   `VITE_CNIS_RUNNER_WINDOWS_INSTALLER_URL`.
6. **Webhooks da Evolution** apontam pras edge functions do Supabase, nao pra
   VPS — esse deploy nao os afeta.

## Diagnostico

```bash
docker compose logs -f web          # acessos e erros do nginx
docker compose exec web nginx -t    # valida a config
docker compose exec web ls /usr/share/nginx/html   # o build esta la?
```

- **404 em rota interna (ex. `/conversations`) ao dar F5**: o `try_files ... /index.html`
  nao esta ativo — confira se o `docker/nginx.conf` foi copiado.
- **Tela branca + erro de CSP no console**: dominio novo batendo em `connect-src`;
  ajuste a meta CSP do `index.html`.
- **Login funciona mas redireciona pro dominio antigo**: passo 5.
- **`bun install --frozen-lockfile` falha**: o `bun.lock` nao bate com o
  `package.json`. Rode `bun install` local e commite o `bun.lock` atualizado.

## Pendencia separada: `package-lock.json` defasado

O `package-lock.json` parou em 2026-07-07 enquanto `package.json` e `bun.lock`
seguiram ate 2026-07-18 (drift em `@types/d3-*`, `d3-format`, ...). Consequencia
fora deste deploy: **`.github/workflows/ci.yml` roda `npm ci` e esta quebrando**.

Duas saidas, escolha uma e siga so ela pra nao ficar com dois lockfiles vivos:

- Assumir o bun como padrao: trocar o CI para `oven-sh/setup-bun` +
  `bun install --frozen-lockfile`, e `git rm package-lock.json bun.lockb`.
- Manter o npm no CI: rodar `npm install --package-lock-only` e commitar o
  `package-lock.json` regenerado (precisa repetir a cada mudanca de dependencia).

O `bun.lockb` (binario, de 2026-02-25) esta obsoleto nos dois cenarios — o
Dockerfile ignora ele de proposito.
