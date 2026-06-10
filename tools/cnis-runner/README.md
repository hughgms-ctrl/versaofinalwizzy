# Wizzy CNIS Runner

Runner local que substitui a extensao Chrome para a automacao CNIS.

Ele abre um Chromium controlado com Playwright, injeta o painel CNIS antigo dentro do site do INSS e expoe uma API local para a Wizzy em `http://localhost:8787`.

## Instalar

```bash
cd tools/cnis-runner
npm install
npx playwright install chromium
```

Para uso em computador de atendimento, registre o launcher uma vez executando `install-protocol.cmd`.
Depois disso, a Wizzy publicada pode chamar `wizzy-cnis-runner://...`: ao clicar em `Login certificado` ou `Abrir runner`, o navegador aciona o runner local em segundo plano e a tela tenta reconectar automaticamente em `http://127.0.0.1:8787`.

## Rodar

```bash
npm start
```

API:

- `GET /health`
- `GET /sessions`
- `POST /sessions`
- `POST /sessions/:id/show`
- `GET /sessions/:id/screenshot`
- `POST /sessions/:id/click`
- `POST /sessions/:id/keyboard`
- `POST /sessions/:id/cancel`

Quando o painel CNIS antigo salva o historico, o runner captura a entrada e passa a devolver `session.result` em `GET /sessions`. O painel `/tools/cnis` da Wizzy faz polling desse endpoint e importa o resultado para o historico local.

## Como funciona

- O runner abre um Chromium controlado por Playwright.
- O Chromium usa perfil persistente em `.cnis-chromium-profile`, para reaproveitar login/cookies do INSS entre consultas.
- Cada consulta cria uma aba/pagina controlada dentro desse perfil persistente.
- O runner limita consultas simultaneas por `WIZZY_CNIS_MAX_RUNNING` (padrao: 5).
- Por padrao, o Chromium roda invisivel (`WIZZY_CNIS_HEADLESS=true`) e a interacao acontece pelo espelhamento dentro da Wizzy. Para depurar com janela visivel, rode com `WIZZY_CNIS_HEADLESS=false`.
- Para login com certificado digital, use o botao `Login certificado` na Wizzy. Se o runner ja estiver online, ele abre temporariamente um Chromium visivel com o mesmo perfil local. Se estiver fechado e o protocolo tiver sido instalado, o navegador aciona o runner automaticamente. Depois de selecionar o certificado e concluir o GERID, clique em `Concluir login` para fechar a janela visivel e voltar as consultas invisiveis com a sessao salva.
- Consultas acima do limite ficam em fila.
- O painel CNIS e injetado com um shim de `chrome.*`, reaproveitando `content.js` e `style.css` da pasta `Wizzy Cnis Leitura/cnis-checker`.
- A Wizzy pode espelhar a tela por screenshot e enviar clique/teclado para a aba controlada.

## Estado atual

O runner ja:

- abre Chromium;
- mantem perfil persistente para preservar login do INSS;
- acessa `https://atendimento.inss.gov.br/`;
- injeta o painel lateral CNIS;
- preenche nome, CPF, data da prisao e data base quando enviados pela Wizzy;
- permite multiplas sessoes/abas controladas, ainda pendente de validacao operacional forte;
- expoe screenshot, clique e teclado para espelhamento dentro da Wizzy;
- captura o relatorio final salvo pelo painel antigo;
- envia o resultado estruturado de volta para a Wizzy via `GET /sessions`.

## Observacoes importantes

Esta implementacao ainda e experimental. Em 2026-06-07, uma consulta real foi executada e capturada com sucesso, mas a experiencia ainda nao esta confiavel o bastante para considerar pronta.

Pontos pendentes:

- estabilizar vinculo entre consulta local da Wizzy e `runnerSessionId`;
- melhorar estado visual de runner online/offline;
- limpar sessoes antigas que foram criadas sem runner;
- validar varias consultas usando o mesmo login persistente;
- validar consultas simultaneas;
- trocar o historico local por persistencia em Supabase quando o modelo de dados definitivo estiver pronto.
