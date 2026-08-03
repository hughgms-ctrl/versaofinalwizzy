# syntax=docker/dockerfile:1
#
# Wizzy frontend (Vite/React SPA) -> Nginx.
# O backend NAO esta aqui: Supabase (banco, auth, storage, 112 edge functions)
# continua na nuvem. Esta imagem so serve os arquivos estaticos do build.

# ---------- dependencias ----------
# Instalacao com bun, nao npm: `bun.lock` e o lockfile que o projeto mantem de
# verdade (sobe junto com package.json a cada mudanca de dependencia, e e o que
# o Lovable usa pra buildar). O `package-lock.json` esta defasado — `npm ci`
# recusa a instalar com ele.
# So package.json + bun.lock nesta camada: reinstala apenas quando o lock muda.
# Nao copiamos bun.lockb (legado e desatualizado) de proposito.
FROM oven/bun:1-debian AS deps

# A imagem oven/bun termina com `USER bun`; sem voltar pra root, o /app criado
# pelo WORKDIR fica sem permissao de escrita e o install falha com EACCES.
# Stage descartavel, entao root aqui nao vai pra imagem final.
USER root
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---------- build ----------
# Imagem debian (glibc), nao alpine: os binarios nativos de SWC/esbuild e o
# postinstall do pacote `supabase` quebram com facilidade em musl. O peso extra
# fica so no stage de build, que e descartado.
FROM node:22-bookworm-slim AS build

WORKDIR /app

# node_modules vem do stage do bun; ambos sao linux/glibc, entao os binarios
# por plataforma servem nos dois.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# As variaveis VITE_* sao embutidas no bundle EM TEMPO DE BUILD.
# Nao existe jeito de trocar depois sem rebuildar a imagem.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_ENABLE_CNIS_RUNNER=false
ARG VITE_CNIS_RUNNER_URL
ARG VITE_CNIS_RUNNER_PROTOCOL_URL
ARG VITE_CNIS_RUNNER_WINDOWS_INSTALLER_URL
ARG VITE_CNIS_RUNNER_MACOS_INSTALLER_URL
ARG VITE_CNIS_RUNNER_INSTALLER_URL

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_ENABLE_CNIS_RUNNER=$VITE_ENABLE_CNIS_RUNNER \
    VITE_CNIS_RUNNER_URL=$VITE_CNIS_RUNNER_URL \
    VITE_CNIS_RUNNER_PROTOCOL_URL=$VITE_CNIS_RUNNER_PROTOCOL_URL \
    VITE_CNIS_RUNNER_WINDOWS_INSTALLER_URL=$VITE_CNIS_RUNNER_WINDOWS_INSTALLER_URL \
    VITE_CNIS_RUNNER_MACOS_INSTALLER_URL=$VITE_CNIS_RUNNER_MACOS_INSTALLER_URL \
    VITE_CNIS_RUNNER_INSTALLER_URL=$VITE_CNIS_RUNNER_INSTALLER_URL

# `npm run build` monta o instalador de 347MB do CNIS runner antes do vite build.
# Na VPS isso e opcional: por padrao pulamos e chamamos o vite direto.
# Para embutir o instalador: liberar tools/cnis-runner/installer-parts no
# .dockerignore e passar --build-arg INCLUDE_CNIS_INSTALLER=true.
ARG INCLUDE_CNIS_INSTALLER=false
RUN if [ "$INCLUDE_CNIS_INSTALLER" = "true" ]; then \
      node scripts/assemble-runner-installer.mjs; \
    else \
      echo "Pulando montagem do instalador CNIS (INCLUDE_CNIS_INSTALLER=false)"; \
    fi

RUN npx vite build

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
