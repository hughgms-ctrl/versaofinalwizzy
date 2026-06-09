const INSS_HOME_URL = "https://atendimento.inss.gov.br/";
const AUTOMATION_STATE_KEY = "cnisAutomationState";
const HISTORY_KEY = "cnisHistoryV2";
const resumeByTab = new Map();

chrome.runtime.onInstalled.addListener(() => {
  console.log("CNIS Checker instalado.");
});

chrome.action.onClicked.addListener(async tab => {
  if (!canInject(tab)) return;

  await injectChecker(tab.id);
  await chrome.tabs.sendMessage(tab.id, { type: "CNIS_TOGGLE_SIDEBAR" }).catch(() => {});
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !canInject(tab)) return;

  const { [AUTOMATION_STATE_KEY]: state = {} } = await chrome.storage.local.get(AUTOMATION_STATE_KEY);
  if (!state.running || !tab.url.startsWith(INSS_HOME_URL)) return;

  const now = Date.now();
  const lastResume = resumeByTab.get(tabId) || 0;
  if (now - lastResume < 5000) return;
  resumeByTab.set(tabId, now);

  try {
    await injectChecker(tabId);
    await sendResumeMessage(tabId);
  } catch (error) {
    console.error("Nao foi possivel retomar o CNIS Checker:", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CNIS_OPEN_HISTORY") {
    chrome.tabs.create({ url: chrome.runtime.getURL("historico.html") }, tab => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      sendResponse({ ok: true, tabId: tab.id });
    });

    return true;
  }

  if (message?.type === "CNIS_HISTORY_ADD") {
    chrome.storage.local.get({ [HISTORY_KEY]: [] }, result => {
      const history = Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
      history.unshift(message.entry);

      chrome.storage.local.set({ [HISTORY_KEY]: history.slice(0, 100) }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        sendResponse({ ok: true, total: Math.min(history.length, 100) });
      });
    });

    return true;
  }

  if (message?.type === "CNIS_HISTORY_UPDATE") {
    chrome.storage.local.get({ [HISTORY_KEY]: [] }, result => {
      const history = Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
      const index = history.findIndex(entry => entry.id === message.entry?.id);

      if (index < 0) {
        sendResponse({ ok: false, error: "Relatorio nao encontrado no historico." });
        return;
      }

      history[index] = { ...history[index], ...message.entry };

      chrome.storage.local.set({ [HISTORY_KEY]: history }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        sendResponse({ ok: true, index });
      });
    });

    return true;
  }

  if (message?.type === "CNIS_STORAGE_GET") {
    chrome.storage.local.get(message.keys, result => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message, result: {} });
        return;
      }

      sendResponse({ ok: true, result: result || {} });
    });

    return true;
  }

  if (message?.type === "CNIS_STORAGE_SET") {
    chrome.storage.local.set(message.values || {}, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      sendResponse({ ok: true });
    });

    return true;
  }

  if (message?.type !== "CNIS_DOWNLOAD_REPORT") return false;

  chrome.downloads.download({
    url: message.url,
    filename: message.filename,
    saveAs: false
  }, downloadId => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }

    sendResponse({ ok: true, downloadId });
  });

  return true;
});

function canInject(tab) {
  return Boolean(tab?.id && tab?.url && /^https?:\/\//i.test(tab.url));
}

async function injectChecker(tabId) {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["style.css"]
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

async function sendResumeMessage(tabId) {
  const messages = [
    { delay: 0, type: "CNIS_FORCE_RESUME_AUTOMATION" },
    { delay: 800, type: "CNIS_FORCE_RESUME_AUTOMATION" },
    { delay: 1800, type: "CNIS_FORCE_RESUME_AUTOMATION" }
  ];

  for (const item of messages) {
    if (item.delay) await sleep(item.delay);
    await chrome.tabs.sendMessage(tabId, { type: item.type }).catch(() => {});
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
