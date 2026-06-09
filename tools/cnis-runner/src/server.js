import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runnerRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(runnerRoot, "..", "..");
const extensionRoot = path.resolve(repoRoot, "Wizzy Cnis Leitura", "cnis-checker");
const contentPath = path.join(extensionRoot, "content.js");
const stylePath = path.join(extensionRoot, "style.css");
const chromiumProfilePath = path.join(runnerRoot, ".cnis-chromium-profile");

const PORT = Number(process.env.WIZZY_CNIS_RUNNER_PORT || 8787);
const INSS_HOME_URL = "https://atendimento.inss.gov.br/";
const MAX_RUNNING = Number(process.env.WIZZY_CNIS_MAX_RUNNING || 5);
const HEADLESS = process.env.WIZZY_CNIS_HEADLESS !== "false";

let browser = null;
let browserContext = null;
const sessions = new Map();

const chromeShim = `
(() => {
  if (window.__WIZZY_CNIS_CHROME_SHIM) return;
  window.__WIZZY_CNIS_CHROME_SHIM = true;
  const listeners = [];
  const storagePrefix = "cnisRunner:";
  const memoryStorage = new Map();
  const readStorage = (key) => {
    try { return window.sessionStorage.getItem(key); } catch { return memoryStorage.get(key) ?? null; }
  };
  const writeStorage = (key, value) => {
    memoryStorage.set(key, value);
    try { window.sessionStorage.setItem(key, value); } catch {}
  };
  const normalizeKeys = (keys) => {
    if (Array.isArray(keys)) return { keys, defaults: {} };
    if (typeof keys === "string") return { keys: [keys], defaults: {} };
    if (keys && typeof keys === "object") return { keys: Object.keys(keys), defaults: keys };
    return { keys: [], defaults: {} };
  };
  const storageGet = (keys) => {
    const normalized = normalizeKeys(keys);
    const result = { ...normalized.defaults };
    normalized.keys.forEach((key) => {
      const raw = readStorage(storagePrefix + key);
      if (raw !== null) {
        try { result[key] = JSON.parse(raw); } catch { result[key] = raw; }
      }
    });
    return result;
  };
  const storageSet = (values) => {
    Object.entries(values || {}).forEach(([key, value]) => {
      writeStorage(storagePrefix + key, JSON.stringify(value));
    });
  };
  window.chrome = window.chrome || {};
  window.chrome.runtime = {
    id: "wizzy-cnis-runner",
    lastError: null,
    getURL: (file) => file,
    onMessage: {
      addListener(fn) { listeners.push(fn); }
    },
    sendMessage(message, callback) {
      const done = (payload) => callback && callback(payload);
      try {
        if (message?.type === "CNIS_STORAGE_GET") {
          done({ ok: true, result: storageGet(message.keys) });
          return;
        }
        if (message?.type === "CNIS_STORAGE_SET") {
          storageSet(message.values || {});
          done({ ok: true });
          return;
        }
        if (message?.type === "CNIS_HISTORY_ADD") {
          const key = "cnisHistoryV2";
          const current = storageGet({ [key]: [] })[key] || [];
          current.unshift(message.entry);
          storageSet({ [key]: current.slice(0, 100) });
          window.__CNIS_RUNNER_LAST_RESULT = message.entry;
          done({ ok: true, total: Math.min(current.length, 100) });
          return;
        }
        if (message?.type === "CNIS_HISTORY_UPDATE") {
          const key = "cnisHistoryV2";
          const current = storageGet({ [key]: [] })[key] || [];
          const index = current.findIndex((entry) => entry.id === message.entry?.id);
          if (index < 0) {
            done({ ok: false, error: "Relatorio nao encontrado no historico." });
            return;
          }
          current[index] = { ...current[index], ...message.entry };
          storageSet({ [key]: current });
          window.__CNIS_RUNNER_LAST_RESULT = current[index];
          done({ ok: true, index });
          return;
        }
        if (message?.type === "CNIS_OPEN_HISTORY") {
          window.open("about:blank", "_blank");
          done({ ok: true });
          return;
        }
        if (message?.type === "CNIS_DOWNLOAD_REPORT") {
          done({ ok: false, error: "Download pelo runner ainda nao implementado." });
          return;
        }
        done({ ok: true });
      } catch (error) {
        done({ ok: false, error: error?.message || String(error) });
      }
    }
  };
  window.chrome.storage = {
    local: {
      get(keys, callback) {
        const result = storageGet(keys);
        if (callback) callback(result);
        return Promise.resolve(result);
      },
      set(values, callback) {
        storageSet(values);
        if (callback) callback();
        return Promise.resolve();
      }
    }
  };
  window.__CNIS_RUNNER_SEND_MESSAGE = (message) => {
    listeners.forEach((listener) => {
      try { listener(message, {}, () => {}); } catch (error) { console.error(error); }
    });
  };
})();
`;

async function ensureBrowser() {
  if (browserContext?.browser()?.isConnected()) return browserContext;
  browserContext = await chromium.launchPersistentContext(chromiumProfilePath, {
    headless: HEADLESS,
    viewport: { width: 1440, height: 920 },
    locale: "pt-BR",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--window-position=-32000,-32000",
      "--window-size=1440,920",
    ],
  });
  browser = browserContext.browser();
  return browserContext;
}

function sessionToJSON(session) {
  return {
    id: session.id,
    status: session.status,
    demo: Boolean(session.demo),
    nome: session.nome,
    cpf: session.cpf,
    prisonDate: session.prisonDate,
    todayDate: session.todayDate,
    progressLabel: session.progressLabel,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    errorMessage: session.errorMessage,
    url: session.url,
    result: session.result || null,
  };
}

function runningCount() {
  return Array.from(sessions.values()).filter((session) => ["starting", "running", "waiting_user"].includes(session.status)).length;
}

async function createSession(payload) {
  const now = new Date().toISOString();
  const session = {
    id: crypto.randomUUID(),
    status: runningCount() >= MAX_RUNNING ? "queued" : "starting",
    nome: payload.nome || "Nova consulta CNIS",
    cpf: payload.cpf || "",
    prisonDate: payload.prisonDate || "",
    todayDate: payload.todayDate || new Date().toISOString().slice(0, 10),
    demo: Boolean(payload.demo),
    progressLabel: "Sessao criada no runner.",
    createdAt: now,
    updatedAt: now,
    context: null,
    page: null,
    url: INSS_HOME_URL,
    result: null,
    resultWatcher: null,
    injectTimer: null,
    demoResultTimer: null,
  };

  sessions.set(session.id, session);
  if (session.status === "starting") {
    startSession(session.id).catch((error) => failSession(session, error));
  }
  return session;
}

async function startSession(id) {
  const session = sessions.get(id);
  if (!session || session.status === "cancelled") return;

  session.status = "starting";
  session.progressLabel = "Abrindo navegador controlado...";
  touch(session);

  const context = await ensureBrowser();
  const page = await context.newPage();
  session.context = null;
  session.page = page;

  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    session.url = page.url();
    touch(session);
    schedulePanelInjection(session);
  });
  page.on("domcontentloaded", () => schedulePanelInjection(session));
  page.on("load", () => schedulePanelInjection(session));
  page.on("close", () => {
    if (["completed", "failed", "cancelled"].includes(session.status)) return;
    session.status = "waiting_user";
    session.progressLabel = "Janela fechada ou desconectada. Reabra ou cancele a consulta.";
    touch(session);
  });

  await page.addInitScript(chromeShim);
  await page.addInitScript((sessionId) => {
    window.__CNIS_RUNNER_SESSION_ID = sessionId;
    try { window.sessionStorage.setItem("cnisRunnerSessionId", sessionId); } catch {}
  }, session.id);
  if (session.demo) {
    await page.setContent(buildDemoPageHtml(session), { waitUntil: "domcontentloaded", timeout: 30000 });
    await injectCnisPanel(session);
    startResultWatcher(session);
    scheduleDemoResult(session);

    session.status = "waiting_user";
    session.url = "http://localhost:8787/cnis-demo";
    session.progressLabel = "Demo CNIS aberta. A pesquisa sera concluida automaticamente em alguns segundos.";
    touch(session);
    return;
  }

  try {
    await page.goto(INSS_HOME_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (error) {
    if (!String(error?.message || error).includes("ERR_ABORTED")) throw error;
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  }
  await page.evaluate((sessionId) => {
    delete window.__CNIS_RUNNER_LAST_RESULT;
    try {
      window.sessionStorage.removeItem("cnisRunner:cnisHistoryV2");
      window.sessionStorage.removeItem("cnisChecker:cnisHistoryV2");
      window.sessionStorage.setItem("cnisRunner:cnisAutomationState", JSON.stringify({
        running: false,
        sessionId,
        updatedAt: new Date().toISOString(),
      }));
    } catch {}
  }, session.id).catch(() => {});
  await injectCnisPanel(session);
  startResultWatcher(session);

  session.status = "waiting_user";
  session.progressLabel = "Painel Wizzy CNIS aberto. Entre no INSS e continue a consulta pela lateral.";
  touch(session);
}

function buildDemoPageHtml(session) {
  const nome = escapeHTML(session.nome || "Maria Demo Previdenciaria");
  const cpf = escapeHTML(session.cpf || "123.456.789-09");
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Wizzy CNIS Demo</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Arial, sans-serif; background: #f5f7fb; color: #111827; }
    body { margin: 0; min-height: 100vh; background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%); }
    header { display: flex; align-items: center; justify-content: space-between; padding: 18px 28px; background: #ffffff; border-bottom: 1px solid #dbe3ef; }
    main { max-width: 980px; padding: 28px; }
    h1 { margin: 0; font-size: 24px; }
    .badge { border: 1px solid #f59e0b; background: #fff7ed; color: #9a3412; border-radius: 999px; padding: 6px 12px; font-size: 13px; font-weight: 700; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 18px 0; }
    .card { background: #ffffff; border: 1px solid #dbe3ef; border-radius: 8px; padding: 16px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
    .label { color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .value { margin-top: 8px; font-size: 17px; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 8px; background: #ffffff; border: 1px solid #dbe3ef; }
    th, td { padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: left; }
    th { background: #f8fafc; color: #475569; font-size: 12px; text-transform: uppercase; }
    .progress { margin-top: 18px; height: 12px; overflow: hidden; border-radius: 999px; background: #e2e8f0; }
    .progress span { display: block; height: 100%; width: 74%; border-radius: inherit; background: linear-gradient(90deg, #ec4899, #fb6a3d); animation: load 4.8s linear forwards; }
    @keyframes load { from { width: 8%; } to { width: 100%; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Meu INSS - Extrato CNIS</h1>
      <div style="margin-top:4px;color:#64748b">Ambiente de demonstracao local do runner Wizzy CNIS</div>
    </div>
    <span class="badge">Processando consulta</span>
  </header>
  <main>
    <section class="grid">
      <div class="card"><div class="label">Segurado</div><div class="value">${nome}</div></div>
      <div class="card"><div class="label">CPF</div><div class="value">${cpf}</div></div>
      <div class="card"><div class="label">Data base</div><div class="value">${escapeHTML(session.todayDate || "")}</div></div>
    </section>
    <div class="card">
      <div class="label">Vinculos encontrados</div>
      <table style="margin-top:12px">
        <thead><tr><th>Vinculo</th><th>Tipo</th><th>Inicio</th><th>Fim</th><th>Competencias</th></tr></thead>
        <tbody>
          <tr><td>EMPRESA ALFA LTDA</td><td>Empregado</td><td>01/01/2020</td><td>31/12/2022</td><td>36</td></tr>
          <tr><td>CONTRIBUINTE INDIVIDUAL</td><td>Contribuinte Individual</td><td>01/02/2023</td><td>31/12/2025</td><td>35</td></tr>
          <tr><td>FACULTATIVO BAIXA RENDA</td><td>Facultativo</td><td>01/01/2026</td><td>30/04/2026</td><td>4</td></tr>
        </tbody>
      </table>
      <div class="progress"><span></span></div>
    </div>
  </main>
</body>
</html>`;
}

function scheduleDemoResult(session) {
  if (session.demoResultTimer) clearTimeout(session.demoResultTimer);
  session.demoResultTimer = setTimeout(async () => {
    try {
      if (!session.page || session.page.isClosed() || ["cancelled", "failed"].includes(session.status)) return;
      const now = new Date().toISOString();
      const entry = {
        id: crypto.randomUUID(),
        nome: session.nome || "Maria Demo Previdenciaria",
        cpf: session.cpf || "123.456.789-09",
        prisonDate: session.prisonDate || "2026-05-15",
        todayDate: session.todayDate || new Date().toISOString().slice(0, 10),
        vinculos: buildDemoVinculos(),
        createdAt: now,
        updatedAt: now,
      };
      await session.page.evaluate((demoEntry) => {
        window.__CNIS_RUNNER_LAST_RESULT = demoEntry;
        const key = "cnisRunner:cnisHistoryV2";
        try { window.sessionStorage.setItem(key, JSON.stringify([demoEntry])); } catch {}
        document.querySelector(".badge").textContent = "Consulta concluida";
        document.querySelector(".badge").style.borderColor = "#10b981";
        document.querySelector(".badge").style.background = "#ecfdf5";
        document.querySelector(".badge").style.color = "#047857";
      }, entry);
      session.progressLabel = "Demo CNIS concluiu a pesquisa e disponibilizou o resultado.";
      touch(session);
    } catch (error) {
      session.progressLabel = `Demo aguardando captura do resultado. ${error?.message || ""}`.trim();
      touch(session);
    }
  }, 6500);
}

function buildDemoVinculos() {
  return [
    buildDemoVinculo("EMPRESA ALFA LTDA", "Empregado", "01/01/2020", "31/12/2022"),
    buildDemoVinculo("CONTRIBUINTE INDIVIDUAL", "Contribuinte Individual", "01/02/2023", "31/12/2025"),
    buildDemoVinculo("FACULTATIVO BAIXA RENDA", "Facultativo", "01/01/2026", "30/04/2026"),
  ];
}

function buildDemoVinculo(nome, tipo, inicio, fim) {
  const inicioDate = parseBrDate(inicio);
  const fimDate = parseBrDate(fim);
  return {
    nome,
    tipo,
    inicio,
    fim,
    inicioDate: inicioDate.toISOString(),
    fimDate: fimDate.toISOString(),
    competencias: listCompetencias(inicioDate, fimDate),
  };
}

function parseBrDate(value) {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year, month - 1, day);
}

function listCompetencias(inicioDate, fimDate) {
  const competencias = [];
  const cursor = new Date(inicioDate.getFullYear(), inicioDate.getMonth(), 1);
  const limit = new Date(fimDate.getFullYear(), fimDate.getMonth(), 1);
  while (cursor <= limit) {
    competencias.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return competencias;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

async function injectCnisPanel(session) {
  if (!session.page) return;
  const [content, style] = await Promise.all([
    readFile(contentPath, "utf8"),
    readFile(stylePath, "utf8"),
  ]);
  await session.page.evaluate(() => {
    const sidebar = document.getElementById("cnisSidebar");
    if (!sidebar) {
      document.body.style.marginRight = "";
      document.body.removeAttribute("data-cnis-original-margin-right");
    }
  }).catch(() => {});
  await session.page.addStyleTag({ content: style }).catch(() => {});
  await session.page.evaluate(() => {
    if (!document.getElementById("cnisSidebar")) {
      delete window.__CNIS_CHECKER_LOADED;
    }
  }).catch(() => {});
  await session.page.addScriptTag({ content }).catch(async () => {
    await session.page.evaluate((scriptContent) => {
      const script = document.createElement("script");
      script.textContent = scriptContent;
      document.documentElement.appendChild(script);
      script.remove();
    }, content);
  });
  await session.page.evaluate((data) => {
    const applySidebarFrame = (sidebar) => {
      const set = (property, value) => sidebar.style.setProperty(property, value, "important");
      set("position", "fixed");
      set("top", "0");
      set("right", "0");
      set("bottom", "0");
      set("left", "auto");
      set("inset", "0 0 0 auto");
      set("width", "430px");
      set("max-width", "430px");
      set("height", "100vh");
      set("box-sizing", "border-box");
      set("padding", "20px");
      set("overflow-y", "auto");
      set("color", "#f4f7fb");
      set("background", "#111317");
      set("border-left", "1px solid #303640");
      set("box-shadow", "-16px 0 40px rgba(0,0,0,.36)");
      set("font-family", "Segoe UI,Arial,sans-serif");
      set("margin", "0");
      set("transform", "none");
      set("z-index", "2147483647");
    };

    const ensurePanelDocking = () => {
      const sidebar = document.getElementById("cnisSidebar");
      if (!sidebar) {
        document.body.style.marginRight = "";
        document.body.removeAttribute("data-cnis-original-margin-right");
        return;
      }

      applySidebarFrame(sidebar);
      document.body.style.marginRight = "";
      document.body.removeAttribute("data-cnis-original-margin-right");
    };

    const createEmergencyPanel = () => {
      if (document.getElementById("cnisSidebar")) return;
      const aside = document.createElement("aside");
      aside.id = "cnisSidebar";
      applySidebarFrame(aside);
      aside.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #303640;padding-bottom:16px;margin-bottom:16px">
          <div>
            <div style="color:#22d3ee;font-size:11px;font-weight:700;text-transform:uppercase">Analise previdenciaria</div>
            <h2 style="margin:4px 0 0;font-size:22px;color:#f4f7fb">CNIS Checker</h2>
            <small style="color:#aab4c0">Painel injetado pelo runner</small>
          </div>
          <button id="closeSidebar" type="button" style="width:32px;height:32px;border:1px solid #303640;background:#20242b;color:#aab4c0;border-radius:6px">x</button>
        </div>
        <label style="display:block;margin:12px 0 6px;color:#aab4c0;font-size:12px;font-weight:700">Nome</label>
        <input id="nomePessoa" value="${String(data.nome || "").replace(/"/g, "&quot;")}" style="width:100%;height:40px;background:#0d0f12;color:#f4f7fb;border:1px solid #303640;border-radius:6px;padding:0 11px;box-sizing:border-box">
        <label style="display:block;margin:12px 0 6px;color:#aab4c0;font-size:12px;font-weight:700">CPF</label>
        <input id="cpfPessoa" value="${String(data.cpf || "").replace(/"/g, "&quot;")}" style="width:100%;height:40px;background:#0d0f12;color:#f4f7fb;border:1px solid #303640;border-radius:6px;padding:0 11px;box-sizing:border-box">
        <label style="display:block;margin:12px 0 6px;color:#aab4c0;font-size:12px;font-weight:700">Data da prisao</label>
        <input id="prisonDate" type="date" value="${String(data.prisonDate || "")}" style="width:100%;height:40px;background:#0d0f12;color:#f4f7fb;border:1px solid #303640;border-radius:6px;padding:0 11px;box-sizing:border-box">
        <label style="display:block;margin:12px 0 6px;color:#aab4c0;font-size:12px;font-weight:700">Data de hoje</label>
        <input id="todayDate" type="date" value="${String(data.todayDate || "")}" style="width:100%;height:40px;background:#0d0f12;color:#f4f7fb;border:1px solid #303640;border-radius:6px;padding:0 11px;box-sizing:border-box">
        <button id="analyzeBtn" type="button" style="width:100%;height:44px;margin-top:16px;background:#22d3ee;color:#071014;border:0;border-radius:6px;font-weight:800">Analisar CNIS</button>
        <div id="automationStatus" style="display:block;margin-top:12px;padding:10px;border:1px solid #303640;border-radius:6px;color:#aab4c0">Painel emergencial aberto. Se o botao nao iniciar, use Abrir runner para reinjetar o painel completo.</div>
        <div id="loading" style="display:none"></div>
        <div id="report"></div>
      `;
      document.documentElement.appendChild(aside);
      document.body.style.marginRight = "";
      document.body.removeAttribute("data-cnis-original-margin-right");
      aside.querySelector("#closeSidebar")?.addEventListener("click", () => {
        document.body.style.marginRight = "";
        aside.remove();
      });
    };

    const openPanel = () => {
      window.__CNIS_RUNNER_SESSION_ID = data.sessionId;
      try { window.sessionStorage.setItem("cnisRunnerSessionId", data.sessionId); } catch {}
      if (typeof window.__CNIS_RUNNER_OPEN_PANEL === "function") {
        window.__CNIS_RUNNER_OPEN_PANEL({ ...data, autoAnalyze: true });
      } else {
        window.__CNIS_RUNNER_SEND_MESSAGE?.({ type: "CNIS_FORCE_RESUME_AUTOMATION", data: { ...data, autoAnalyze: true } });
      }
    };

    openPanel();
    ensurePanelDocking();
    window.setTimeout(openPanel, 400);
    window.setTimeout(ensurePanelDocking, 700);
    window.setTimeout(openPanel, 1400);
    window.setTimeout(() => {
      if (!document.getElementById("cnisSidebar")) createEmergencyPanel();
      ensurePanelDocking();
    }, 2200);
    window.setTimeout(() => {
      const button = document.getElementById("analyzeBtn");
      const cpf = document.getElementById("cpfPessoa")?.value || "";
      if (button && /\d{6,}/.test(cpf) && window.__CNIS_RUNNER_DIRECT_CLICKED !== data.sessionId) {
        window.__CNIS_RUNNER_DIRECT_CLICKED = data.sessionId;
        button.click();
      }
    }, 1200);
  }, {
    sessionId: session.id,
    nome: session.nome,
    cpf: session.cpf,
    prisonDate: session.prisonDate,
    todayDate: session.todayDate,
  });
}

function schedulePanelInjection(session) {
  if (!session.page || session.page.isClosed() || ["completed", "failed", "cancelled"].includes(session.status)) return;
  if (session.injectTimer) clearTimeout(session.injectTimer);
  session.injectTimer = setTimeout(async () => {
    session.injectTimer = null;
    try {
      await session.page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
      await injectCnisPanel(session);
      if (!["completed", "failed", "cancelled"].includes(session.status)) {
        session.status = "waiting_user";
        session.progressLabel = "Painel Wizzy CNIS sincronizado com a pagina atual.";
        touch(session);
      }
    } catch (error) {
      if (["completed", "failed", "cancelled"].includes(session.status)) return;
      session.progressLabel = `Aguardando pagina do INSS para reinjetar painel. ${error?.message || ""}`.trim();
      touch(session);
    }
  }, 600);
}

async function forceInjectSession(id) {
  const session = sessions.get(id);
  if (!session?.page || session.page.isClosed()) return null;
  await injectCnisPanel(session);
  await session.page.waitForTimeout(700).catch(() => {});
  const hasSidebar = await session.page.evaluate(() => Boolean(document.getElementById("cnisSidebar"))).catch(() => false);
  session.progressLabel = hasSidebar ? "Painel CNIS forcado e colado na lateral direita." : "Comando de painel enviado; aguardando a pagina aceitar a injecao.";
  touch(session);
  return session;
}

function startResultWatcher(session) {
  if (session.resultWatcher) return;

  session.resultWatcher = setInterval(async () => {
    try {
      if (!session.page || session.page.isClosed() || ["cancelled", "failed"].includes(session.status)) return;

      const entry = await session.page.evaluate(() => {
        const parse = (raw) => {
          if (!raw) return null;
          try {
            const value = JSON.parse(raw);
            return Array.isArray(value) ? value[0] : value;
          } catch {
            return null;
          }
        };
        const readSessionStorage = (key) => {
          try { return window.sessionStorage.getItem(key); } catch { return null; }
        };
        return window.__CNIS_RUNNER_LAST_RESULT
          || parse(readSessionStorage("cnisRunner:cnisHistoryV2"))
          || parse(readSessionStorage("cnisChecker:cnisHistoryV2"))
          || parse(window.localStorage.getItem("cnisRunner:cnisHistoryV2"))
          || parse(window.localStorage.getItem("cnisChecker:cnisHistoryV2"));
      });

      if (!entry?.id || session.result?.id === entry.id) return;
      const entryCreatedAt = entry.createdAt ? new Date(entry.createdAt).getTime() : Date.now();
      const sessionCreatedAt = new Date(session.createdAt).getTime();
      if (Number.isFinite(entryCreatedAt) && entryCreatedAt < sessionCreatedAt - 1000) return;

      session.result = normalizeRunnerResult(entry);
      session.status = "completed";
      session.progressLabel = "Consulta concluida e resultado capturado pelo runner.";
      touch(session);
    } catch (error) {
      if (session.status === "completed") return;
      const message = error?.message || String(error);
      if (message.includes("Execution context was destroyed") || message.includes("navigation")) return;
      session.progressLabel = `Aguardando resultado do painel CNIS. ${error?.message || ""}`.trim();
      touch(session);
    }
  }, 2500);
}

function normalizeRunnerResult(entry) {
  return {
    id: entry.id,
    nome: entry.nome || "",
    cpf: entry.cpf || "",
    prisonDate: entry.prisonDate || "",
    todayDate: entry.todayDate || "",
    vinculos: Array.isArray(entry.vinculos) ? entry.vinculos : [],
    summary: entry.summary || null,
    reportHtml: entry.reportHTML || entry.reportHtml || "",
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
}

async function showSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  if (!session.page || session.page.isClosed()) {
    await startSession(id);
  } else {
    await session.page.bringToFront();
    await injectCnisPanel(session).catch(() => {});
  }
  return session;
}

async function screenshotSession(id) {
  const session = sessions.get(id);
  if (!session?.page || session.page.isClosed()) return null;
  return session.page.screenshot({ type: "jpeg", quality: 72, fullPage: false });
}

async function streamScreenshotSession(id, req, res) {
  const session = sessions.get(id);
  if (!session?.page || session.page.isClosed()) return false;

  let closed = false;
  const stop = () => {
    closed = true;
  };

  req.on("close", stop);
  res.on("close", stop);
  res.writeHead(200, {
    "content-type": "multipart/x-mixed-replace; boundary=wizzy-cnis-frame",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-private-network": "true",
    "cache-control": "no-store",
    "connection": "keep-alive",
  });

  const sendFrame = async () => {
    if (closed) return;

    const current = sessions.get(id);
    if (!current?.page || current.page.isClosed()) {
      if (!closed) res.end();
      return;
    }

    try {
      const buffer = await current.page.screenshot({ type: "jpeg", quality: 58, fullPage: false });
      if (closed) return;
      res.write("--wizzy-cnis-frame\r\n");
      res.write("Content-Type: image/jpeg\r\n");
      res.write(`Content-Length: ${buffer.length}\r\n\r\n`);
      res.write(buffer);
      res.write("\r\n");
    } catch (error) {
      if (!closed) console.warn("Falha ao gerar frame do espelhamento:", error?.message || error);
    }

    if (!closed) setTimeout(sendFrame, 900);
  };

  sendFrame();
  return true;
}

async function clickSession(id, payload) {
  const session = sessions.get(id);
  if (!session?.page || session.page.isClosed()) return null;
  const viewport = session.page.viewportSize() || { width: 1440, height: 920 };
  const sourceWidth = Number(payload.sourceWidth || viewport.width);
  const sourceHeight = Number(payload.sourceHeight || viewport.height);
  const x = Math.max(0, Math.min(viewport.width, Number(payload.x || 0) * viewport.width / sourceWidth));
  const y = Math.max(0, Math.min(viewport.height, Number(payload.y || 0) * viewport.height / sourceHeight));
  await session.page.mouse.click(x, y);
  return session;
}

async function keyboardSession(id, payload) {
  const session = sessions.get(id);
  if (!session?.page || session.page.isClosed()) return null;
  if (payload.key) {
    await session.page.keyboard.press(String(payload.key));
  } else if (payload.text) {
    await session.page.keyboard.insertText(String(payload.text));
  }
  return session;
}

async function cancelSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  session.status = "cancelled";
  session.progressLabel = "Consulta cancelada.";
  touch(session);
  await session.page?.close().catch(() => {});
  if (session.resultWatcher) clearInterval(session.resultWatcher);
  session.resultWatcher = null;
  if (session.injectTimer) clearTimeout(session.injectTimer);
  session.injectTimer = null;
  if (session.demoResultTimer) clearTimeout(session.demoResultTimer);
  session.demoResultTimer = null;
  session.context = null;
  session.page = null;
  drainQueue();
  return session;
}

function failSession(session, error) {
  session.status = "failed";
  session.errorMessage = error?.message || String(error);
  session.progressLabel = "Falha ao iniciar o runner.";
  if (session.resultWatcher) clearInterval(session.resultWatcher);
  session.resultWatcher = null;
  if (session.injectTimer) clearTimeout(session.injectTimer);
  session.injectTimer = null;
  if (session.demoResultTimer) clearTimeout(session.demoResultTimer);
  session.demoResultTimer = null;
  touch(session);
  drainQueue();
}

function touch(session) {
  session.updatedAt = new Date().toISOString();
}

function drainQueue() {
  while (runningCount() < MAX_RUNNING) {
    const next = Array.from(sessions.values()).find((session) => session.status === "queued");
    if (!next) return;
    startSession(next.id).catch((error) => failSession(next, error));
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-private-network": "true",
  });
  res.end(JSON.stringify(payload));
}

function sendBinary(res, statusCode, contentType, buffer) {
  res.writeHead(statusCode, {
    "content-type": contentType,
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-private-network": "true",
    "cache-control": "no-store",
  });
  res.end(buffer);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "OPTIONS") {
      send(res, 204, {});
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      send(res, 200, { ok: true, runner: "wizzy-cnis-runner", maxRunning: MAX_RUNNING, headless: HEADLESS, sessions: sessions.size });
      return;
    }

    if (req.method === "GET" && url.pathname === "/sessions") {
      send(res, 200, { ok: true, sessions: Array.from(sessions.values()).map(sessionToJSON) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/sessions") {
      const session = await createSession(await readBody(req));
      send(res, 201, { ok: true, session: sessionToJSON(session) });
      return;
    }

    const showMatch = url.pathname.match(/^\/sessions\/([^/]+)\/show$/);
    if (req.method === "POST" && showMatch) {
      const session = await showSession(showMatch[1]);
      send(res, session ? 200 : 404, session ? { ok: true, session: sessionToJSON(session) } : { ok: false, error: "Sessao nao encontrada." });
      return;
    }

    const injectMatch = url.pathname.match(/^\/sessions\/([^/]+)\/inject$/);
    if (req.method === "POST" && injectMatch) {
      const session = await forceInjectSession(injectMatch[1]);
      send(res, session ? 200 : 404, session ? { ok: true, session: sessionToJSON(session) } : { ok: false, error: "Sessao sem pagina ativa." });
      return;
    }

    const screenshotStreamMatch = url.pathname.match(/^\/sessions\/([^/]+)\/screenshot-stream$/);
    if (req.method === "GET" && screenshotStreamMatch) {
      const started = await streamScreenshotSession(screenshotStreamMatch[1], req, res);
      if (!started) send(res, 404, { ok: false, error: "Sessao sem pagina ativa." });
      return;
    }

    const screenshotMatch = url.pathname.match(/^\/sessions\/([^/]+)\/screenshot$/);
    if (req.method === "GET" && screenshotMatch) {
      const buffer = await screenshotSession(screenshotMatch[1]);
      if (!buffer) {
        send(res, 404, { ok: false, error: "Sessao sem pagina ativa." });
        return;
      }
      sendBinary(res, 200, "image/jpeg", buffer);
      return;
    }

    const clickMatch = url.pathname.match(/^\/sessions\/([^/]+)\/click$/);
    if (req.method === "POST" && clickMatch) {
      const session = await clickSession(clickMatch[1], await readBody(req));
      send(res, session ? 200 : 404, session ? { ok: true, session: sessionToJSON(session) } : { ok: false, error: "Sessao sem pagina ativa." });
      return;
    }

    const keyboardMatch = url.pathname.match(/^\/sessions\/([^/]+)\/keyboard$/);
    if (req.method === "POST" && keyboardMatch) {
      const session = await keyboardSession(keyboardMatch[1], await readBody(req));
      send(res, session ? 200 : 404, session ? { ok: true, session: sessionToJSON(session) } : { ok: false, error: "Sessao sem pagina ativa." });
      return;
    }

    const cancelMatch = url.pathname.match(/^\/sessions\/([^/]+)\/cancel$/);
    if (req.method === "POST" && cancelMatch) {
      const session = await cancelSession(cancelMatch[1]);
      send(res, session ? 200 : 404, session ? { ok: true, session: sessionToJSON(session) } : { ok: false, error: "Sessao nao encontrada." });
      return;
    }

    send(res, 404, { ok: false, error: "Rota nao encontrada." });
  } catch (error) {
    send(res, 500, { ok: false, error: error?.message || String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`Wizzy CNIS Runner listening on http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  await browserContext?.close().catch(() => {});
  await browser?.close().catch(() => {});
  process.exit(0);
});
