(function () {
  if (window.__CNIS_CHECKER_LOADED) return;
  window.__CNIS_CHECKER_LOADED = true;

  const SIDEBAR_ID = "cnisSidebar";
  const PAGE_MARGIN_ATTR = "data-cnis-original-margin-right";
  const SIDEBAR_WIDTH = 430;
  const HISTORY_KEY = "cnisHistoryV2";
  const FORM_STATE_KEY = "cnisFormState";
  const AUTOMATION_STATE_KEY = "cnisAutomationState";
  const REQUIRED_CARENCIA = 24;
  const CARENCIA_START_DATE = new Date(2019, 5, 18);
  const MINIMUM_WAGES = {
    2011: 545,
    2012: 622,
    2013: 678,
    2014: 724,
    2015: 788,
    2016: 880,
    2017: 937,
    2018: 954,
    2019: 998,
    2020: 1045,
    2021: 1100,
    2022: 1212,
    2023: 1320,
    2024: 1412,
    2025: 1518,
    2026: 1621
  };
  const INSS_HOME_URL = "https://atendimento.inss.gov.br/";
  const SERVICE_NAME = "aposentadoria por idade urbana";
  const TIPOS_VINCULO = [
    "Empregado",
    "Empregado domestico",
    "Contribuinte Individual/Autonomo",
    "Contribuinte Individual",
    "Autonomo",
    "Contribuinte Individual/Autônomo",
    "Facultativo",
    "Domestico",
    "Doméstico",
    "Trabalhador Avulso",
    "Segurado Especial",
    "Beneficio"
  ];
  const BR_DATE_PATTERN = /\b\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})\b/g;
  let keepSidebarOpen = false;
  let automationActive = false;
  let automationActiveSince = 0;
  let automationPoller = null;
  let automationResumeTimer = null;
  let currentReportContext = null;
  let autoAnalyzeSessionId = "";

  function ensureCriticalSidebarStyles() {
    if (document.getElementById("cnisSidebarCriticalStyle")) return;
    const style = document.createElement("style");
    style.id = "cnisSidebarCriticalStyle";
    style.textContent = `
      #cnisSidebar,#cnisSidebar *{box-sizing:border-box}
      #cnisSidebar .sidebar-header{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding-bottom:16px;border-bottom:1px solid #303640}
      #cnisSidebar .sidebar-kicker{display:block;margin-bottom:4px;color:#22d3ee;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0}
      #cnisSidebar .sidebar-header h2{margin:0;color:#f4f7fb;font-size:22px;line-height:1.1}
      #cnisSidebar .sidebar-credit{display:block;margin-top:4px;color:#aab4c0;font-size:11px;font-weight:600}
      #cnisSidebar #closeSidebar{width:32px;height:32px;margin:0;padding:0;color:#aab4c0;background:#20242b;border:1px solid #303640;border-radius:6px;cursor:pointer;font-size:17px}
      #cnisSidebar .sidebar-content{padding-top:16px}
      #cnisSidebar .form-grid label{display:block;margin:12px 0 6px;color:#aab4c0;font-size:12px;font-weight:700}
      #cnisSidebar .form-grid input,#cnisSidebar .form-grid select{display:block;width:100%;height:40px;padding:0 11px;color:#f4f7fb;background:#0d0f12;border:1px solid #303640;border-radius:6px;font-size:14px}
      #cnisSidebar #analyzeBtn{display:block;width:100%;height:44px;margin-top:16px;color:#071014;background:#22d3ee;border:0;border-radius:6px;cursor:pointer;font-size:15px;font-weight:800}
      #cnisSidebar .automation-status{margin-top:10px;padding:10px;border-radius:7px;font-size:12px;line-height:1.4;color:#f4f7fb;background:#181b20;border:1px solid #303640}
      #cnisSidebar #loading{margin-top:14px;color:#22d3ee;font-size:13px;text-align:center}
      #cnisSidebar .history-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:22px}
      #cnisSidebar .history-title h3{margin:0;color:#f4f7fb;font-size:16px}
      #cnisSidebar #openReportsBtn{height:32px;padding:0 10px;color:#aab4c0;background:#111317;border:1px solid #303640;border-radius:6px;cursor:pointer}
      body[data-cnis-sidebar-open="true"]{margin-right:${SIDEBAR_WIDTH}px!important;width:calc(100vw - ${SIDEBAR_WIDTH}px)!important;max-width:calc(100vw - ${SIDEBAR_WIDTH}px)!important;overflow-x:hidden!important}
      body[data-cnis-sidebar-open="true"] > *:not(#${SIDEBAR_ID}){max-width:calc(100vw - ${SIDEBAR_WIDTH}px)!important}
    `;
    document.documentElement.appendChild(style);
  }

  function applySidebarCriticalStyle(sidebar) {
    const set = (property, value) => sidebar.style.setProperty(property, value, "important");
    set("position", "fixed");
    set("top", "0");
    set("right", "0");
    set("bottom", "0");
    set("left", "auto");
    set("inset", "0 0 0 auto");
    set("width", `${SIDEBAR_WIDTH}px`);
    set("max-width", `${SIDEBAR_WIDTH}px`);
    set("height", "100vh");
    set("z-index", "2147483647");
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
  }

  function getRunnerSessionId() {
    try {
      return window.__CNIS_RUNNER_SESSION_ID || window.sessionStorage.getItem("cnisRunnerSessionId") || "";
    } catch {
      return window.__CNIS_RUNNER_SESSION_ID || "";
    }
  }

  function isAutomationStateForThisPage(state) {
    const sessionId = getRunnerSessionId();
    return !state?.sessionId || !sessionId || state.sessionId === sessionId;
  }

  function toggleSidebar() {
    const currentSidebar = document.getElementById(SIDEBAR_ID);
    if (currentSidebar) {
      closeSidebar(currentSidebar);
      return;
    }

    createSidebar();
  }

  function createSidebar() {
    if (document.getElementById(SIDEBAR_ID)) {
      applyPageInset();
      return;
    }

    applyPageInset();

    ensureCriticalSidebarStyles();
    const sidebar = document.createElement("aside");
    sidebar.id = SIDEBAR_ID;
    applySidebarCriticalStyle(sidebar);
    sidebar.innerHTML = `
      <div class="sidebar-header">
        <div>
          <span class="sidebar-kicker">Analise previdenciaria</span>
          <h2>CNIS Checker</h2>
          <small class="sidebar-credit">by Wizzy Adv</small>
        </div>
        <button id="closeSidebar" type="button" title="Fechar painel">x</button>
      </div>
      <div class="sidebar-content">
        <div class="form-grid">
          <label for="automationMode">Modo de automacao</label>
          <select id="automationMode">
            <option value="auto">Automatico</option>
            <option value="manual">Manual assistido</option>
          </select>

          <label for="nomePessoa">Nome</label>
          <input type="text" id="nomePessoa" placeholder="Nome do segurado">

          <label for="cpfPessoa">CPF</label>
          <input type="text" id="cpfPessoa" placeholder="000.000.000-00">

          <label for="prisonDate">Data da prisao</label>
          <input type="date" id="prisonDate">

          <label for="todayDate">Data de hoje</label>
          <input type="date" id="todayDate">
        </div>

        <button id="analyzeBtn" type="button">Analisar CNIS</button>
        <div id="automationStatus" class="automation-status" style="display:none;"></div>
        <div id="loading" style="display:none;">Analisando<span class="dots"></span></div>
        <div id="report"></div>

        <div class="history-title">
          <h3 id="historyHeading">Historico (0)</h3>
          <button id="openReportsBtn" type="button" title="Abrir pagina de relatorios salvos">Abrir historico</button>
        </div>
      </div>
    `;

    document.documentElement.appendChild(sidebar);

    sidebar.querySelector("#closeSidebar").addEventListener("click", () => closeSidebar(sidebar));

    sidebar.querySelector("#openReportsBtn").addEventListener("click", openReportsArchive);

    const dots = sidebar.querySelector(".dots");
    window.setInterval(() => {
      dots.textContent = dots.textContent.length < 3 ? `${dots.textContent}.` : "";
    }, 500);

    sidebar.querySelector("#analyzeBtn").addEventListener("click", handleAnalyze);
    const todayDateInput = sidebar.querySelector("#todayDate");
    if (todayDateInput && !todayDateInput.value) todayDateInput.value = formatISODateFromDate(new Date());

    sidebar.querySelectorAll("#automationMode, #nomePessoa, #cpfPessoa, #prisonDate, #todayDate").forEach(field => {
      field.addEventListener("input", saveFormState);
      field.addEventListener("change", saveFormState);
    });
    restoreFormState();
    startSidebarKeeper();
    startAutomationPoller();
    loadHistory();
    updateHistoryHeading();
  }

  function applyPageInset() {
    if (!document.body.hasAttribute(PAGE_MARGIN_ATTR)) {
      document.body.setAttribute(PAGE_MARGIN_ATTR, document.body.style.marginRight || "");
    }

    document.body.dataset.cnisSidebarOpen = "true";
    document.body.style.setProperty("margin-right", `${SIDEBAR_WIDTH}px`, "important");
    document.body.style.setProperty("width", `calc(100vw - ${SIDEBAR_WIDTH}px)`, "important");
    document.body.style.setProperty("max-width", `calc(100vw - ${SIDEBAR_WIDTH}px)`, "important");
    document.body.style.setProperty("overflow-x", "hidden", "important");
  }

  async function handleAnalyze() {
    if (automationActive) {
      setAutomationStatus("Reiniciando automacao nesta etapa...", "neutral");
      automationActive = false;
      automationActiveSince = 0;
    }

    const loading = document.getElementById("loading");
    const report = document.getElementById("report");
    const mode = document.getElementById("automationMode")?.value || "auto";
    const cpfDigits = onlyDigits(document.getElementById("cpfPessoa").value);

    saveFormState();
    loading.style.display = "block";
    report.innerHTML = "";

    try {
      if (mode === "auto") {
        if (!cpfDigits) {
          throw new Error("Informe o CPF antes de iniciar a analise automatica.");
        }

        await setAutomationRunning(true);
        const finalReached = await runInssAutomationStep(cpfDigits, mode);
        if (!finalReached) {
          loading.style.display = "none";
          return;
        }
      }

      const data = await getCNISData();
      loading.style.display = "none";

      const nome = document.getElementById("nomePessoa").value.trim();
      const cpf = document.getElementById("cpfPessoa").value.trim();
      const prisonDate = document.getElementById("prisonDate").value;
      const todayDate = getTodayDateValue();
      const analysis = analyzeCNIS(data.vinculos, prisonDate, todayDate);
      const historyId = makeHistoryId();
      const createdAt = new Date().toISOString();

      renderInteractiveReport(nome, cpf, prisonDate, todayDate, data.vinculos, analysis, {}, historyId);
      addHistoryEntry({ id: historyId, nome, cpf, prisonDate, todayDate, vinculos: data.vinculos, createdAt }, true);
      await setAutomationRunning(false);
      automationActive = false;
      automationActiveSince = 0;
    } catch (error) {
      loading.style.display = "none";
      await setAutomationRunning(false);
      automationActive = false;
      automationActiveSince = 0;
      setAutomationStatus(error.message || "A analise automatica parou. Confira a tela atual.", "fail");
    }
  }

  async function runInssAutomation(cpf, mode) {
    if (automationActive) return;
    automationActive = true;

    setAutomationStatus("Iniciando automacao assistida...", "neutral");

    if (!location.href.startsWith(INSS_HOME_URL)) {
      setAutomationStatus("Abra o Portal de Atendimento do INSS e clique novamente.", "fail");
      return;
    }

    if (!hasPageText("Selecao de Servicos") && !hasPageText("Seleção de Serviços")) {
      await clickByText("Novo Requerimento", { timeout: 12000 });
    }
    await waitForText("Selecao de Servicos", 15000).catch(() => waitForText("Seleção de Serviços", 15000));
    setAutomationStatus("Selecionando o servico Aposentadoria por Idade Urbana...", "neutral");

    const serviceInput = await waitForElement(() => {
      const customServiceSelector = findServiceSelector();
      if (customServiceSelector) return customServiceSelector;
      return findInputByPlaceholder("servico") || findInputByPlaceholder("serviço") || findInputByLabel("Serviço") || findInputByLabel("Servico");
    }, 15000);

    await selectService(serviceInput);
    await advanceAfterServiceSelection(serviceInput);

    if (isServiceSelectionPage()) {
      await clickByText("Avancar", { timeout: 8000, optional: true });
      await clickByText("Avançar", { timeout: 8000, optional: true });
    }

    await waitForText("Dados do Requerente", 15000);
    setAutomationStatus("Preenchendo CPF do requerente...", "neutral");

    const cpfInput = await waitForElement(() => {
      return findInputByLabel("CPF") || findInputByPlaceholder("CPF");
    }, 15000);

    await typeInto(cpfInput, cpf);
    await sleep(300);
    await triggerCpfLookup(cpfInput);

    const loadedName = await waitForRequesterName().catch(() => "");
    if (loadedName) {
      document.getElementById("nomePessoa").value = loadedName;
      saveFormState();
      setAutomationStatus(`Nome localizado: ${loadedName}.`, "ok");
    }

    await clickNext();
    await waitForText("Aviso Aposentadoria", 15000);
    await clickNext();
    await waitForText("Dados do Requerente", 15000);

    if (mode === "manual") {
      setAutomationStatus("Modo manual: cheguei na tela de dados do requerente. Confira e clique novamente para continuar.", "ok");
      return;
    }

    await fillRequesterDetails();
    await clickNext();

    await waitForText("Informativo", 15000);
    await clickNext();

    await waitForText("Relacoes Previdenciarias", 15000).catch(() => waitForText("Relações Previdenciárias", 15000));
    setAutomationStatus("Cheguei em Relacoes Previdenciarias. Agora voce pode gerar o relatorio CNIS.", "ok");
  }

  async function fillRequesterDetails() {
    setAutomationStatus("Preenchendo dados do requerente e anexos...", "neutral");

    const phoneInput = await waitForElement(() => {
      return findInputByLabel("Celular") || findInputByPlaceholder("____-____") || findInputByPlaceholder("_____-____");
    }, 15000);
    await typeLikeUser(phoneInput, "11987654321");

    await clickChoiceAfterQuestion("Voce aceita acompanhar", "Sim");
    await clickChoiceAfterQuestion("Você aceita acompanhar", "Sim");

    await selectOptionByQuestion("Quem esta sendo atendido", "O titular do beneficio ou servico");
    await selectOptionByQuestion("Quem está sendo atendido", "O titular do benefício ou serviço");

    await uploadDummyPdf(0, "documento-identificacao.pdf");

    await selectOptionByQuestion("autoriza o INSS a alterar a data", "SIM");
    await selectOptionByQuestion("Possui aposentadoria ou pensao RPPS", "NAO");
    await selectOptionByQuestion("Possui aposentadoria ou pensão RPPS", "NAO");

    await uploadDummyPdf(1, "procuracao.pdf");
    setAutomationStatus("Formulario preenchido. Avancando para o informativo...", "ok");
  }

  async function fillRequesterDetailsV2() {
    setAutomationStatus("Preenchendo celular...", "neutral");
    await slowScrollToY(0);
    await sleep(700);
    const phoneInput = await waitForElement(() => document.getElementById("celularRequerente.numero") || findPhoneInput(), 15000);
    await fillPhoneInput(phoneInput, "11999255265");
    await assertInputHasDigits(phoneInput, "11999255265", "celular");
    await sleep(900);

    setAutomationStatus("Marcando acompanhamento pelo Meu INSS...", "neutral");
    await scrollToText("acompanhar o andamento");
    await clickYesForFollowUpV2();
    await sleep(900);

    setAutomationStatus("Selecionando titular do beneficio...", "neutral");
    await selectComboboxBelowText("Quem esta sendo atendido", "O titular do beneficio ou servico");
    await sleep(1100);

    setAutomationStatus("Enviando documento de identificacao...", "neutral");
    await uploadDummyPdfByText("Documentos de identificacao do titular", "documento-identificacao.pdf", 0);
    await sleep(1100);

    setAutomationStatus("Respondendo perguntas adicionais...", "neutral");
    await selectComboboxBelowText("autoriza o INSS a alterar a data", "SIM");
    await sleep(900);
    await fillComboboxBelowText("Possui aposentadoria ou pensao RPPS", "NAO");
    await sleep(1100);

    setAutomationStatus("Enviando procuracao/termo...", "neutral");
    await uploadDummyPdfByText("Procuracao ou Termo de Representacao", "procuracao.pdf", 1);
    setAutomationStatus("Formulario preenchido. Avancando para o informativo...", "ok");
  }

  async function assertInputHasDigits(input, expected, fieldName) {
    const expectedDigits = onlyDigits(expected);
    await waitForElement(() => {
      return onlyDigits(input.value).includes(expectedDigits.slice(-8)) ? input : null;
    }, 2500, true);

    if (!onlyDigits(input.value).includes(expectedDigits.slice(-8))) {
      throw new Error(`Nao consegui preencher o campo ${fieldName}.`);
    }
  }

  async function fillPhoneInput(input, value) {
    await slowScrollToElement(input);
    await sleep(200);
    input.focus();
    setNativeValue(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    await sleep(300);

    if (!onlyDigits(input.value).includes(onlyDigits(value).slice(-8))) {
      await typeLikeUser(input, value);
    }
  }

  function findPhoneInput() {
    const byLabel = findInputByLabel("Celular");
    if (byLabel) return byLabel;

    const inputs = Array.from(document.querySelectorAll("input"))
      .filter(input => !input.closest(`#${SIDEBAR_ID}`) && isVisible(input) && !input.disabled);

    return inputs.find(input => {
      const placeholder = normalizeForCompare(input.getAttribute("placeholder"));
      const label = normalizeForCompare(input.getAttribute("aria-label"));
      return placeholder.includes("____") || label.includes("celular");
    }) || inputs[0] || null;
  }

  async function scrollToText(text) {
    const wanted = normalizeForCompare(text);
    const element = Array.from(document.querySelectorAll("label, p, span, div, h1, h2, h3"))
      .find(item => !item.closest(`#${SIDEBAR_ID}`) && normalizeForCompare(item.innerText || item.textContent).includes(wanted));

    if (element) {
      await slowScrollToElement(element);
      await sleep(650);
      return true;
    }

    await slowScrollToY(window.scrollY + 320);
    await sleep(650);
    return false;
  }

  async function clickYesForFollowUp() {
    const button = await waitForElement(() => {
      const candidates = Array.from(document.querySelectorAll("button, [role='button'], span, div"))
        .filter(element => !element.closest(`#${SIDEBAR_ID}`) && isVisible(element));

      return candidates.find(element => normalizeForCompare(element.innerText || element.textContent) === "sim");
    }, 10000);

    clickHard(button);
    await sleep(500);
  }

  async function clickYesForFollowUpV2() {
    const question = await waitForElement(() => findVisibleTextElement("acompanhar o andamento"), 10000);
    const questionRect = question.getBoundingClientRect();
    const button = await waitForElement(() => {
      const candidates = Array.from(document.querySelectorAll("button, [role='button'], span, div"))
        .filter(element => {
          if (element.closest(`#${SIDEBAR_ID}`) || !isVisible(element)) return false;
          if (normalizeForCompare(element.innerText || element.textContent) !== "sim") return false;
          const rect = element.getBoundingClientRect();
          return rect.top >= questionRect.top && rect.top - questionRect.top < 180;
        });

      return candidates.sort((a, b) => {
        return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
      })[0] || null;
    }, 10000);

    clickHard(button);
    await sleep(500);
  }

  async function selectVisibleComboboxByIndex(index, optionText) {
    const field = await waitForElement(() => {
      const fields = getVisibleComboboxes();
      return fields[index] || null;
    }, 12000);

    await slowScrollToElement(field);
    await sleep(550);
    clickHard(field);
    await sleep(800);

    const option = await waitForElement(() => findDropdownOptionNearField(optionText, field), 10000);
    clickDropdownOption(option);
    await sleep(1000);

    const wanted = normalizeForCompare(optionText);
    const selected = normalizeForCompare(field.value || field.innerText || field.textContent);
    if (!selected.includes(wanted) && wanted !== "sim" && wanted !== "nao") {
      await confirmServiceWithKeyboard(field);
    }
  }

  async function selectComboboxBelowText(questionText, optionText) {
    const field = await waitForElement(() => findComboboxBelowText(questionText), 12000);

    await slowScrollToElement(field);
    await sleep(650);
    await openComboboxField(field);

    const option = await waitForElement(() => findDropdownOptionNearField(optionText, field), 10000);
    clickDropdownOption(option);
    await sleep(1000);

    const wanted = normalizeForCompare(optionText);
    const selected = normalizeForCompare(field.value || field.innerText || field.textContent);
    if (!selected.includes(wanted)) {
      await confirmServiceWithKeyboard(field);
      await sleep(500);
    }
  }

  async function fillComboboxBelowText(questionText, value) {
    const field = await waitForElement(() => findComboboxBelowText(questionText), 12000);

    await slowScrollToElement(field);
    await sleep(650);
    await openComboboxField(field);
    await setComboboxText(field, value);

    const selected = normalizeForCompare(field.value || field.innerText || field.textContent);
    if (!selected.includes(normalizeForCompare(value))) {
      throw new Error(`Nao consegui preencher ${value} no campo ${questionText}.`);
    }
  }

  async function openComboboxField(field) {
    clickHard(field);
    await sleep(450);

    const trigger = findComboboxTriggerNearField(field);
    if (trigger) {
      clickHard(trigger);
      await sleep(450);
    }

    field.focus?.();
    ["ArrowDown"].forEach(key => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }));
      field.dispatchEvent(new KeyboardEvent("keyup", { key, code: key, bubbles: true, cancelable: true }));
    });

    await sleep(650);
  }

  function findComboboxTriggerNearField(field) {
    const fieldRect = field.getBoundingClientRect();
    const fieldTop = fieldRect.top + window.scrollY;
    const buttons = Array.from(document.querySelectorAll("button, [role='button']"))
      .filter(button => {
        if (button.closest(`#${SIDEBAR_ID}`) || !isVisible(button)) return false;
        const label = normalizeForCompare(button.innerText || button.textContent || button.getAttribute("aria-label"));
        if (!label.includes("exibir lista") && !label.includes("abrir") && !label.includes("selecionar")) return false;
        const rect = button.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        return Math.abs(top - fieldTop) < 28 && rect.left >= fieldRect.left;
      });

    return buttons.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] || null;
  }

  async function setComboboxText(field, value) {
    field.focus?.();
    if (/input|textarea/i.test(field.tagName)) {
      setNativeValue(field, "");
      field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward", data: null }));
      setNativeValue(field, value);
      field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
      field.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
      field.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      await sleep(900);
      return;
    }

    await typeLikeUser(field, value);
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    field.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    await sleep(900);
  }

  function findComboboxBelowText(questionText) {
    const questionBounds = findTextBounds(questionText);
    if (!questionBounds) return null;

    const questionBottom = questionBounds.bottom + window.scrollY;
    const fields = getAllComboboxes()
      .map(field => ({ field, rect: field.getBoundingClientRect() }))
      .map(item => ({ ...item, absoluteTop: item.rect.top + window.scrollY }))
      .filter(item => item.absoluteTop >= questionBottom - 8)
      .filter(item => item.absoluteTop - questionBottom < 170)
      .sort((a, b) => a.absoluteTop - b.absoluteTop);

    return fields[0]?.field || null;
  }

  function findTextBounds(text) {
    const wanted = normalizeForCompare(text);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node) {
      const parent = node.parentElement;
      const value = normalizeForCompare(node.nodeValue);
      if (parent && !parent.closest(`#${SIDEBAR_ID}`) && value.includes(wanted)) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        range.detach?.();

        if (rect.width > 0 && rect.height > 0) return rect;
      }

      node = walker.nextNode();
    }

    const element = findQuestionElement(text);
    return element?.getBoundingClientRect() || null;
  }

  function findQuestionElement(questionText) {
    const wanted = normalizeForCompare(questionText);
    return Array.from(document.querySelectorAll("label, p, span, div"))
      .filter(element => {
        if (element.closest(`#${SIDEBAR_ID}`) || !isVisible(element)) return false;
        return normalizeForCompare(element.innerText || element.textContent).includes(wanted);
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const aLength = cleanText(a.innerText || a.textContent).length;
        const bLength = cleanText(b.innerText || b.textContent).length;
        return aLength - bLength || (ar.top + window.scrollY) - (br.top + window.scrollY);
      })[0] || null;
  }

  function getVisibleComboboxes() {
    return getAllComboboxes()
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.top + window.scrollY) - (br.top + window.scrollY);
      });
  }

  function getAllComboboxes() {
    return Array.from(document.querySelectorAll("input[role='combobox'], [role='combobox'], .ng-select-container, .p-dropdown, .mat-select"))
      .filter(field => !field.closest(`#${SIDEBAR_ID}`) && isVisible(field))
      .filter(field => {
        const placeholder = normalizeForCompare(field.getAttribute("placeholder"));
        const role = normalizeForCompare(field.getAttribute("role"));
        return role === "combobox" || placeholder.includes("selecione") || field.matches(".ng-select-container, .p-dropdown, .mat-select");
      });
  }

  async function slowScrollToElement(element) {
    const rect = element.getBoundingClientRect();
    const targetY = Math.max(0, window.scrollY + rect.top - Math.round(window.innerHeight * 0.35));
    await slowScrollToY(targetY);
  }

  async function slowScrollToY(targetY) {
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const destination = Math.max(0, Math.min(maxY, targetY));

    while (Math.abs(window.scrollY - destination) > 24) {
      const delta = destination - window.scrollY;
      const step = Math.sign(delta) * Math.min(Math.abs(delta), 180);
      window.scrollBy(0, step);
      await sleep(90);
    }

    window.scrollTo(0, destination);
    await sleep(250);
  }

  async function selectFirstMatchingDropdownOption(questionHint, optionText) {
    const field = await waitForElement(() => findFieldAfterText(questionHint), 12000);
    clickHard(field);
    await sleep(500);

    const option = await waitForElement(() => findDropdownOption(optionText), 10000);
    clickDropdownOption(option);
    await sleep(500);
  }

  function findFieldAfterText(questionHint) {
    const wanted = normalizeForCompare(questionHint);
    const labels = Array.from(document.querySelectorAll("label, p, span, div"))
      .filter(element => {
        if (element.closest(`#${SIDEBAR_ID}`) || !isVisible(element)) return false;
        return normalizeForCompare(element.innerText || element.textContent).includes(wanted);
      });

    for (const label of labels) {
      const container = label.closest("div") || label.parentElement;
      const field = findNearestField(label) ||
        container?.querySelector("select, input, [role='combobox'], .ng-select-container, .p-dropdown, .mat-select") ||
        label.parentElement?.nextElementSibling?.querySelector?.("select, input, [role='combobox'], .ng-select-container, .p-dropdown, .mat-select") ||
        label.nextElementSibling;

      if (field && isVisible(field)) return field;
    }

    return null;
  }

  function findNearestField(label) {
    const labelRect = label.getBoundingClientRect();
    const fields = Array.from(document.querySelectorAll("select, input, [role='combobox'], .ng-select-container, .p-dropdown, .mat-select"))
      .filter(field => !field.closest(`#${SIDEBAR_ID}`) && isVisible(field))
      .map(field => ({ field, rect: field.getBoundingClientRect() }))
      .filter(item => item.rect.top >= labelRect.top - 8)
      .sort((a, b) => {
        const ad = Math.abs(a.rect.top - labelRect.bottom) + Math.abs(a.rect.left - labelRect.left);
        const bd = Math.abs(b.rect.top - labelRect.bottom) + Math.abs(b.rect.left - labelRect.left);
        return ad - bd;
      });

    return fields[0]?.field || null;
  }

  function findDropdownOption(optionText) {
    const wanted = normalizeForCompare(optionText);
    const options = Array.from(document.querySelectorAll("li, div, span, button, [role='option'], .ng-option, .p-dropdown-item, .mat-option"))
      .filter(element => {
        if (element.closest(`#${SIDEBAR_ID}`) || !isVisible(element)) return false;
        const label = normalizeForCompare(element.innerText || element.textContent);
        return label === wanted || label.includes(wanted);
      });

    return options.sort((a, b) => {
      return (a.innerText || a.textContent || "").length - (b.innerText || b.textContent || "").length;
    })[0] || null;
  }

  function findDropdownOptionNearField(optionText, field) {
    const wanted = normalizeForCompare(optionText);
    const fieldRect = field.getBoundingClientRect();
    const fieldTop = fieldRect.top + window.scrollY;
    const candidates = Array.from(document.querySelectorAll("li, div, span, [role='option'], .ng-option, .p-dropdown-item, .mat-option"))
      .filter(element => {
        if (element.closest(`#${SIDEBAR_ID}`) || !isVisible(element)) return false;
        const label = normalizeForCompare(element.innerText || element.textContent);
        if (!label || (label !== wanted && !label.includes(wanted))) return false;

        const rect = element.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        return top >= fieldTop - 20 && top - fieldTop < 360;
      });

    return candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const len = cleanText(a.innerText || a.textContent).length - cleanText(b.innerText || b.textContent).length;
      return len || (ar.top + window.scrollY) - (br.top + window.scrollY);
    })[0] || null;
  }

  async function runInssAutomationStep(cpf, mode) {
    if (automationActive) {
      const activeFor = Date.now() - automationActiveSince;
      if (activeFor < 45000) return false;
      automationActive = false;
    }

    automationActive = true;
    automationActiveSince = Date.now();

    try {
      setAutomationStatus("Continuando automacao na etapa atual...", "neutral");

      if (!location.href.startsWith(INSS_HOME_URL)) {
        throw new Error("Abra o Portal de Atendimento do INSS e clique novamente.");
      }

      await waitForStablePage();

      if (isInitialRequestPage()) {
        setAutomationStatus("Abrindo novo requerimento...", "neutral");
        await clickByText("Novo Requerimento", { timeout: 12000 });
        scheduleAutomationResume();
        return false;
      }

      if (isRetirementNoticePageStrict()) {
        setAutomationStatus("Aviso de aposentadoria localizado. Avancando...", "neutral");
        await advanceWizardStep("Dados Requerente", () => isRetirementNoticePageStrict(), true);
        scheduleAutomationResume();
        return false;
      }

      if (isRequesterDetailsPage()) {
        if (mode === "manual") {
          setAutomationStatus("Modo manual: confira a tela de dados do requerente.", "ok");
          return false;
        }

        await fillRequesterDetailsV2();
        await clickNext();
        scheduleAutomationResume();
        return false;
      }

      if (isRequesterCpfPage()) {
        setAutomationStatus("Preenchendo CPF do requerente...", "neutral");
        const cpfInput = await waitForElement(() => findInputByLabel("CPF") || findInputByPlaceholder("CPF"), 15000);
        await typeInto(cpfInput, cpf);
        await sleep(300);
        await triggerCpfLookup(cpfInput);

        const loadedName = await waitForRequesterName().catch(() => "");
        if (loadedName) {
          document.getElementById("nomePessoa").value = loadedName;
          saveFormState();
        }

        await clickNext();
        scheduleAutomationResume();
        return false;
      }

      if (isServiceSelectionPage()) {
        setAutomationStatus("Selecionando Aposentadoria por Idade Urbana...", "neutral");
        const serviceInput = await waitForElement(() => {
          const customServiceSelector = findServiceSelector();
          if (customServiceSelector) return customServiceSelector;
          return findInputByPlaceholder("servico") || findInputByPlaceholder("serviço") || findInputByLabel("Serviço") || findInputByLabel("Servico");
        }, 15000);

        await selectService(serviceInput);
        await advanceAfterServiceSelection(serviceInput);
        scheduleAutomationResume();
        return false;
      }

      if (isBiometryReleasePage()) {
        setAutomationStatus("Etapa de biometria localizada. Selecionando NAO...", "neutral");
        await answerBiometryReleaseStep();
        await clickNext();
        scheduleAutomationResume();
        return false;
      }

      if (isInformativePage()) {
        setAutomationStatus("Informativo localizado. Avancando...", "neutral");
        await advanceWizardStep("Relacoes Previdenciarias", () => isInformativePage(), true);
        scheduleAutomationResume();
        return false;
      }

      if (isRetirementSimulationPage()) {
        setAutomationStatus("Passei da etapa 6. Voltando para Relacoes Previdenciarias...", "neutral");
        const relationsStep = findWizardStepButton("Relacoes Previdenciarias") || findWizardStepButton("Relações Previdenciárias");
        if (!relationsStep) {
          throw new Error("Estou na simulacao, mas nao consegui localizar a etapa Relacoes Previdenciarias para voltar.");
        }
        clickHard(relationsStep);
        scheduleAutomationResume();
        return false;
      }

      if (isRealRelationsPage()) {
        setAutomationStatus("Tela de Relacoes Previdenciarias localizada. Gerando relatorio.", "ok");
        await setAutomationRunning(false);
        return true;
      }

      throw new Error("Nao reconheci a etapa atual do portal.");
    } finally {
      automationActive = false;
      automationActiveSince = 0;
    }
  }

  function scheduleAutomationResume() {
    if (automationResumeTimer) {
      window.clearTimeout(automationResumeTimer);
    }

    automationResumeTimer = window.setTimeout(() => {
      automationResumeTimer = null;
      resumeAutomationIfNeeded();
    }, 3200);
  }

  function startAutomationPoller() {
    if (automationPoller) return;

    automationPoller = window.setInterval(async () => {
      const { [AUTOMATION_STATE_KEY]: state = {} } = await safeStorageGet({ [AUTOMATION_STATE_KEY]: {} });
      if (!state.running || automationActive) return;
      if (!isAutomationStateForThisPage(state)) return;
      resumeAutomationIfNeeded();
    }, 2500);
  }

  function isInitialRequestPage() {
    return hasPageText("Consultar Requerimentos") && hasPageText("Novo Requerimento");
  }

  function isServiceSelectionPage() {
    const heading = findVisibleTextElement("Selecao de Servicos") || findVisibleTextElement("Seleção de Serviços");
    const selector = findServiceSelector();
    if (!heading || !selector) return false;

    const headingRect = heading.getBoundingClientRect();
    const selectorRect = selector.getBoundingClientRect();
    return selectorRect.top > headingRect.top && selectorRect.top - headingRect.top < 420;

    return hasPageText("Selecao de Servicos") || hasPageText("Seleção de Serviços");
  }

  function isRequesterCpfPage() {
    if (!hasPageText("Dados do Requerente") || hasPageText("Celular")) return false;
    const cpfInput = findInputByLabel("CPF") || findInputByPlaceholder("CPF");
    const nameInput = findInputByLabel("Nome") || findInputByPlaceholder("Nome do Requerente");
    return Boolean(cpfInput && nameInput);

    return hasPageText("Dados do Requerente") && !hasPageText("Celular");
  }

  function isRetirementNoticePage() {
    return hasPageText("Aviso Aposentadoria") || hasPageText("Clique em AVANCAR para prosseguir") || hasPageText("Clique em AVANÇAR para prosseguir");
  }

  function isRetirementNoticePageStrict() {
    if (findInputByLabel("CPF") || findInputByPlaceholder("CPF")) return false;

    return hasPageText("Voce pode requerer a sua aposentadoria sem sair de casa") ||
      hasPageText("Você pode requerer a sua aposentadoria sem sair de casa") ||
      hasPageText("Clique em AVANCAR para prosseguir") ||
      hasPageText("Clique em AVANÇAR para prosseguir") ||
      hasPageText("Clique em AVANÃ‡AR para prosseguir");
  }

  function isRequesterDetailsPage() {
    return hasPageText("Dados do Requerente") && hasPageText("Celular");
  }

  function isInformativePage() {
    return hasPageText("Informativo") && hasPageText("Atenção");
  }

  function isBiometryReleasePage() {
    const hasBiometryTitle = hasPageText("Liberacao da Biometria") || hasPageText("LiberaÃ§Ã£o da Biometria");
    const hasBiometryQuestion =
      hasPageText("nao precisa fazer a biometria") ||
      hasPageText("nÃ£o precisa fazer a biometria") ||
      hasPageText("situacao que nao precisa fazer a biometria") ||
      hasPageText("situaÃ§Ã£o que nÃ£o precisa fazer a biometria");

    return hasBiometryTitle || (hasPageText("Biometria") && hasBiometryQuestion);
  }

  async function answerBiometryReleaseStep() {
    await selectComboboxBelowText("nao precisa fazer a biometria", "NAO")
      .catch(() => selectComboboxBelowText("nÃ£o precisa fazer a biometria", "NAO"))
      .catch(() => fillComboboxBelowText("nao precisa fazer a biometria", "NAO"))
      .catch(() => fillComboboxBelowText("nÃ£o precisa fazer a biometria", "NAO"))
      .catch(() => selectVisibleComboboxByIndex(0, "NAO"));
    await sleep(900);
  }

  function isRelationsPage() {
    return hasPageText("Relacoes Previdenciarias") || hasPageText("Relações Previdenciárias");
  }

  function isRealRelationsPage() {
    if (!isRelationsPage()) return false;

    const hasRelationsInstruction =
      hasPageText("Abaixo listamos suas relacoes previdenciarias") ||
      hasPageText("Abaixo listamos suas relações previdenciárias") ||
      hasPageText("Adicionar Vinculo") ||
      hasPageText("Adicionar Vínculo") ||
      hasPageText("ADICIONAR VINCULO");

    const hasTableHeader =
      hasPageText("Tipo de Vinculo") ||
      hasPageText("Tipo de Vínculo") ||
      hasPageText("Inicio") ||
      hasPageText("Início");

    return hasRelationsInstruction && hasTableHeader;
  }

  function isRetirementSimulationPage() {
    return hasPageText("Simulacao de Aposentadoria") ||
      hasPageText("SimulaÃ§Ã£o de Aposentadoria") ||
      hasPageText("Valor simulado") ||
      hasPageText("Tenho direito?");
  }

  async function waitForStablePage() {
    await waitForLoadingToFinish(2500);
    await waitForVisualStability();
    await sleep(350);
  }

  async function waitForVisualStability(timeout = 5000) {
    const startedAt = Date.now();
    let previous = "";
    let stableCount = 0;

    while (Date.now() - startedAt < timeout) {
      const selector = findServiceSelector();
      const nextButton = findNextButton();
      const signature = [
        Math.round(window.scrollX),
        Math.round(window.scrollY),
        Math.round(document.documentElement.scrollWidth),
        Math.round(document.documentElement.scrollHeight),
        selector ? Math.round(selector.getBoundingClientRect().top) : "no-selector",
        nextButton ? Math.round(nextButton.getBoundingClientRect().top) : "no-next"
      ].join("|");

      if (signature === previous) {
        stableCount += 1;
        if (stableCount >= 4) return;
      } else {
        stableCount = 0;
        previous = signature;
      }

      await sleep(160);
    }
  }

  async function selectService(serviceInput) {
    setAutomationStatus("Abrindo campo de servico...", "neutral");
    clickElement(serviceInput);
    await waitForLoadingToFinish(2500);
    await sleep(300);
    setAutomationStatus("Digitando aposentadoria por idade urbana...", "neutral");
    await typeIntoServiceSelector(serviceInput, SERVICE_NAME);
    await waitForLoadingToFinish(2500);
    await sleep(1000);

    const serviceOption = await waitForElement(() => {
      return findServiceOptionExact("Aposentadoria por Idade Urbana");
    }, 15000);

    setAutomationStatus("Selecionando Aposentadoria por Idade Urbana...", "neutral");
    await confirmServiceOption(serviceOption, serviceInput);

    const selected = await waitForElement(() => {
      return (isServiceSelectionConfirmed() || !isServiceSelectionPage()) ? document.body : null;
    }, 3500, true);

    if (!selected && isServiceSelectionPage()) {
      await confirmServiceOptionByExactText(serviceInput);
    }

    const selectedAfterFallback = await waitForElement(() => {
      return (isServiceSelectionConfirmed() || !isServiceSelectionPage()) ? document.body : null;
    }, 2500, true);

    if (!selectedAfterFallback && isServiceSelectionPage()) {
      const fieldText = normalizeForCompare(findServiceSelector()?.innerText || findServiceSelector()?.textContent || findServiceSelector()?.value || "");
      if (!isExactUrbanRetirementSelection(fieldText)) {
        throw new Error("Digitei o servico, mas o portal nao confirmou a selecao. Vou parar antes de avancar.");
      }
    }

    setAutomationStatus("Servico selecionado. Avancando...", "ok");
    document.activeElement?.blur?.();
    await sleep(500);
  }

  async function advanceAfterServiceSelection(serviceInput) {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      setAutomationStatus(attempt === 1 ? "Avancando com o servico selecionado..." : "Servico selecionado. Tentando clicar em Avancar novamente...", "neutral");
      await waitForLoadingToFinish(2500);
      await sleep(350);
      await clickNext(true);
      await waitForLoadingToFinish(3500);
      await sleep(1200);

      if (!isServiceSelectionPage()) return true;

      const selector = findServiceSelector() || serviceInput;
      const fieldText = normalizeForCompare(selector?.innerText || selector?.textContent || selector?.value || "");
      const serviceStillSelected = isExactUrbanRetirementSelection(fieldText);
      const requiredError = hasServiceRequiredError();

      if (serviceStillSelected && !requiredError) {
        await sleep(650);
        continue;
      }

      if (!requiredError && attempt >= 3) {
        throw new Error("O portal continuou na selecao de servico mesmo apos selecionar Aposentadoria por Idade Urbana.");
      }

      setAutomationStatus("O portal nao aceitou o servico. Selecionando novamente...", "neutral");
      await clearServiceSelector(selector);
      await selectService(selector);
    }

    throw new Error("O portal nao confirmou o servico selecionado. Tente novamente quando a tela estiver estabilizada.");
  }

  function hasServiceRequiredError() {
    const text = normalizeForCompare(document.body.innerText || "");
    return text.includes("necessario selecionar um servico") ||
      text.includes("necessario selecionar um servi") ||
      text.includes("favor preencher os campos obrigatorios");
  }

  async function clearServiceSelector(serviceInput) {
    const input = getActiveServiceInput(serviceInput) || serviceInput?.querySelector?.("input, textarea");
    clickElement(serviceInput || input);
    await sleep(250);

    resetTextInput(input);

    const clearButton = Array.from(document.querySelectorAll("button, .ng-clear-wrapper, .p-dropdown-clear-icon, [aria-label]"))
      .find(element => {
        if (element.closest(`#${SIDEBAR_ID}`) || !isVisible(element)) return false;
        const label = normalizeForCompare(element.innerText || element.textContent || element.getAttribute("aria-label") || element.className || "");
        return label.includes("limpar") || label.includes("clear");
      });

    if (clearButton) {
      clickHard(clearButton);
      await sleep(300);
    }
  }

  async function setAutomationRunning(running) {
    keepSidebarOpen = running;
    const sessionId = getRunnerSessionId();

    if (!running) {
      const { [AUTOMATION_STATE_KEY]: currentState = {} } = await safeStorageGet({ [AUTOMATION_STATE_KEY]: {} });
      if (currentState.running && currentState.sessionId && sessionId && currentState.sessionId !== sessionId) return;
    }

    await safeStorageSet({
      [AUTOMATION_STATE_KEY]: {
        running,
        sessionId,
        updatedAt: new Date().toISOString()
      }
    });
  }

  async function resumeAutomationIfNeeded() {
    const { [AUTOMATION_STATE_KEY]: state = {}, [FORM_STATE_KEY]: formState = {} } =
      await safeStorageGet([AUTOMATION_STATE_KEY, FORM_STATE_KEY]);

    if (!state.running) return;
    if (!isAutomationStateForThisPage(state)) return;

    createSidebar();
    keepSidebarOpen = true;
    setAutomationStatus("Retomando automacao apos mudanca de tela...", "neutral");

    const cpf = onlyDigits(formState.cpf || document.getElementById("cpfPessoa")?.value);
    if (!cpf) {
      await setAutomationRunning(false);
      setAutomationStatus("Nao encontrei o CPF salvo para retomar a automacao.", "fail");
      return;
    }

    try {
      const finalReached = await runInssAutomationStep(cpf, formState.mode || "auto");
      if (!finalReached) return;

      const data = await getCNISData();
      const nome = document.getElementById("nomePessoa").value.trim();
      const currentCpf = document.getElementById("cpfPessoa").value.trim();
      const prisonDate = document.getElementById("prisonDate").value;
      const todayDate = getTodayDateValue();
      const analysis = analyzeCNIS(data.vinculos, prisonDate, todayDate);
      const historyId = makeHistoryId();
      const createdAt = new Date().toISOString();
      renderInteractiveReport(nome, currentCpf, prisonDate, todayDate, data.vinculos, analysis, {}, historyId);
      addHistoryEntry({ id: historyId, nome, cpf: currentCpf, prisonDate, todayDate, vinculos: data.vinculos, createdAt }, true);
      await setAutomationRunning(false);
    } catch (error) {
      const message = error.message || "Nao consegui retomar a automacao.";
      if (shouldRetryAutomation(message)) {
        setAutomationStatus(`${message} Tentando novamente...`, "neutral");
        scheduleAutomationResume();
        return;
      }

      await setAutomationRunning(false);
      setAutomationStatus(message, "fail");
    }
  }

  function shouldRetryAutomation(message) {
    return /Nao reconheci|N[aã]o encontrei|carregamento|esperado nesta tela/i.test(message);
  }

  function saveFormState() {
    const state = {
      mode: document.getElementById("automationMode")?.value || "auto",
      nome: document.getElementById("nomePessoa")?.value || "",
      cpf: document.getElementById("cpfPessoa")?.value || "",
      prisonDate: document.getElementById("prisonDate")?.value || "",
      todayDate: document.getElementById("todayDate")?.value || ""
    };

    safeStorageSet({ [FORM_STATE_KEY]: state });
  }

  function isExtensionContextValid() {
    try {
      return Boolean(chrome?.runtime?.id && chrome?.storage?.local);
    } catch {
      return false;
    }
  }

  function safeStorageGet(keys) {
    return new Promise(resolve => {
      const fallback = getStorageFallback(keys);

      if (!isExtensionContextValid()) {
        resolve(readLocalStorageMirror(keys, fallback));
        return;
      }

      try {
        chrome.runtime.sendMessage({ type: "CNIS_STORAGE_GET", keys }, response => {
          if (chrome.runtime.lastError || !response?.ok) {
            chrome.storage.local.get(keys, result => {
              if (chrome.runtime.lastError) {
                resolve(readLocalStorageMirror(keys, fallback));
                return;
              }

              resolve(mergeStorageWithMirror(keys, fallback, result || {}));
            });
            return;
          }

          resolve(mergeStorageWithMirror(keys, fallback, response.result || {}));
        });
      } catch {
        try {
          chrome.storage.local.get(keys, result => {
            if (chrome.runtime.lastError) {
              resolve(readLocalStorageMirror(keys, fallback));
              return;
            }

            resolve(mergeStorageWithMirror(keys, fallback, result || {}));
          });
        } catch {
          resolve(readLocalStorageMirror(keys, fallback));
        }
      }
    });
  }

  function safeStorageSet(values) {
    return new Promise(resolve => {
      writeLocalStorageMirror(values);

      if (!isExtensionContextValid()) {
        resolve(true);
        return;
      }

      try {
        chrome.runtime.sendMessage({ type: "CNIS_STORAGE_SET", values }, response => {
          if (chrome.runtime.lastError || !response?.ok) {
            chrome.storage.local.set(values, () => {
              resolve(!chrome.runtime.lastError);
            });
            return;
          }

          resolve(true);
        });
      } catch {
        try {
          chrome.storage.local.set(values, () => {
            resolve(!chrome.runtime.lastError);
          });
        } catch {
          resolve(true);
        }
      }
    });
  }

  function legacySafeStorageGetUnused(keys) {
    return new Promise(resolve => {
      const fallback = getStorageFallback(keys);

      if (!isExtensionContextValid()) {
        resolve(readLocalStorageMirror(keys, fallback));
        return;
      }

      try {
        chrome.storage.local.get(keys, result => {
          if (chrome.runtime.lastError) {
            resolve(readLocalStorageMirror(keys, fallback));
            return;
          }

          resolve(mergeStorageWithMirror(keys, fallback, result || {}));
        });
      } catch {
        resolve(readLocalStorageMirror(keys, fallback));
      }
    });
  }

  function legacySafeStorageSetUnused(values) {
    return new Promise(resolve => {
      writeLocalStorageMirror(values);

      if (!isExtensionContextValid()) {
        resolve(true);
        return;
      }

      try {
        chrome.storage.local.set(values, () => {
          resolve(!chrome.runtime.lastError);
        });
      } catch {
        resolve(true);
      }
    });
  }

  function writeLocalStorageMirror(values) {
    Object.entries(values || {}).forEach(([key, value]) => {
      try {
        window.localStorage.setItem(`cnisChecker:${key}`, JSON.stringify(value));
      } catch {
        // localStorage can be blocked by the page; chrome.storage remains primary.
      }
    });
  }

  function readLocalStorageMirror(keys, fallback) {
    const result = { ...fallback };
    getStorageKeys(keys).forEach(key => {
      try {
        const raw = window.localStorage.getItem(`cnisChecker:${key}`);
        if (raw !== null) result[key] = JSON.parse(raw);
      } catch {
        // Ignore malformed mirror entries.
      }
    });

    return result;
  }

  function mergeStorageWithMirror(keys, fallback, stored) {
    const mirror = readLocalStorageMirror(keys, fallback);
    const result = { ...fallback, ...mirror, ...stored };

    getStorageKeys(keys).forEach(key => {
      const storedValue = stored[key];
      const mirrorValue = mirror[key];

      if ((storedValue === undefined || storedValue === null) && mirrorValue !== undefined) {
        result[key] = mirrorValue;
      }
    });

    return result;
  }

  function getStorageKeys(keys) {
    if (Array.isArray(keys)) return keys;
    if (typeof keys === "string") return [keys];
    if (typeof keys === "object" && keys !== null) return Object.keys(keys);
    return [];
  }

  function getStorageFallback(keys) {
    if (Array.isArray(keys)) {
      return keys.reduce((result, key) => {
        result[key] = undefined;
        return result;
      }, {});
    }

    if (typeof keys === "object" && keys !== null) return { ...keys };
    if (typeof keys === "string") return { [keys]: undefined };
    return {};
  }

  function restoreFormState() {
    safeStorageGet({ [FORM_STATE_KEY]: {} }).then(result => {
      const state = result[FORM_STATE_KEY] || {};
      if (state.mode) document.getElementById("automationMode").value = state.mode;
      if (state.nome) document.getElementById("nomePessoa").value = state.nome;
      if (state.cpf) document.getElementById("cpfPessoa").value = state.cpf;
      if (state.prisonDate) document.getElementById("prisonDate").value = state.prisonDate;
      document.getElementById("todayDate").value = state.todayDate || formatISODateFromDate(new Date());
    });
  }

  function applyRunnerFormData(data = {}) {
    createSidebar();
    window.__CNIS_RUNNER_SESSION_ID = data.sessionId || getRunnerSessionId();
    if (window.__CNIS_RUNNER_SESSION_ID) {
      try { window.sessionStorage.setItem("cnisRunnerSessionId", window.__CNIS_RUNNER_SESSION_ID); } catch {}
    }

    const set = (id, value) => {
      const input = document.getElementById(id);
      if (!input || !value) return;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    set("nomePessoa", data.nome);
    set("cpfPessoa", data.cpf);
    set("prisonDate", data.prisonDate);
    set("todayDate", data.todayDate);
    saveFormState();
    keepSidebarOpen = true;
    maybeAutoAnalyze(data);
  }

  function maybeAutoAnalyze(data = {}) {
    if (data.autoAnalyze === false) return;
    const sessionId = data.sessionId || getRunnerSessionId() || "default";
    if (autoAnalyzeSessionId === sessionId) return;
    if (!onlyDigits(document.getElementById("cpfPessoa")?.value || "")) return;

    autoAnalyzeSessionId = sessionId;
    window.setTimeout(() => {
      if (automationActive) return;
      const button = document.getElementById("analyzeBtn");
      if (!button) {
        autoAnalyzeSessionId = "";
        return;
      }
      setAutomationStatus("Iniciando analise automaticamente...", "neutral");
      button.click();
    }, 650);
  }

  window.__CNIS_RUNNER_OPEN_PANEL = applyRunnerFormData;

  function startSidebarKeeper() {
    if (window.__CNIS_SIDEBAR_KEEPER) return;
    window.__CNIS_SIDEBAR_KEEPER = true;

    const observer = new MutationObserver(() => {
      if (!keepSidebarOpen || document.getElementById(SIDEBAR_ID)) return;
      createSidebar();
      setAutomationStatus("Continuando automacao nesta tela...", "neutral");
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function hasPageText(text) {
    return normalizeForCompare(document.body.innerText).includes(normalizeForCompare(text));
  }

  function findVisibleTextElement(text) {
    const wanted = normalizeForCompare(text);
    return Array.from(document.querySelectorAll("h1, h2, h3, label, p, span, div"))
      .filter(element => {
        if (element.closest(`#${SIDEBAR_ID}`) || !isVisible(element)) return false;
        return normalizeForCompare(element.innerText || element.textContent).includes(wanted);
      })
      .sort((a, b) => {
        const aText = cleanText(a.innerText || a.textContent);
        const bText = cleanText(b.innerText || b.textContent);
        return aText.length - bText.length;
      })[0] || null;
  }

  function findServiceSelector() {
    const label = Array.from(document.querySelectorAll("label, span, div"))
      .find(element => !element.closest(`#${SIDEBAR_ID}`) && normalizeForCompare(element.innerText).includes("servico"));

    const near = label?.parentElement?.querySelector("input, textarea, [role='combobox'], .ng-select-container, .p-dropdown, .mat-select");
    if (near && isVisible(near)) return near;

    return Array.from(document.querySelectorAll("input, textarea, [role='combobox'], .ng-select-container, .p-dropdown, .mat-select"))
      .find(element => !element.closest(`#${SIDEBAR_ID}`) && isVisible(element));
  }

  async function typeIntoServiceSelector(element, value) {
    clickElement(element);
    await sleep(600);

    const searchInput = await waitForElement(() => {
      const active = document.activeElement;
      if (active && /input|textarea/i.test(active.tagName) && !active.closest(`#${SIDEBAR_ID}`)) return active;

      return Array.from(document.querySelectorAll("input, textarea"))
        .find(input => {
          if (input.closest(`#${SIDEBAR_ID}`) || !isVisible(input) || input.disabled) return false;
          const rect = input.getBoundingClientRect();
          const placeholder = normalizeForCompare(input.getAttribute("placeholder"));
          const aria = normalizeForCompare(input.getAttribute("aria-label"));
          return rect.top >= 0 && rect.top <= window.innerHeight &&
            (placeholder.includes("servico") || placeholder.includes("serviço") || placeholder.includes("selecione") || aria.includes("servico"));
        });
    }, 5000, true);

    const target = searchInput || element.querySelector?.("input, textarea") || element;

    if (await typeIntoServiceSelectorWithRunner(target, value)) {
      return;
    }

    if (/input|textarea/i.test(target.tagName)) {
      await typeLikeUser(target, value);
      return;
    }

    target.focus?.();
    await typeLikeUser(document.activeElement, value);
  }

  async function typeIntoServiceSelectorWithRunner(target, value) {
    const clickTarget = target || document.activeElement;
    if (!clickTarget || !isVisible(clickTarget)) return false;
    resetTextInput(clickTarget);

    if (!await clickElementWithRunner(clickTarget)) return false;

    await sleep(250);
    resetTextInput(getActiveServiceInput(clickTarget) || clickTarget);
    await runnerKeyboard({ key: "Control+A" });
    await sleep(80);
    await runnerKeyboard({ key: "Backspace" });
    await sleep(120);
    const typed = await runnerKeyboard({ text: value });
    await sleep(700);
    await fixDuplicatedServiceText(getActiveServiceInput(clickTarget) || clickTarget, value);
    return typed;
  }

  async function fixDuplicatedServiceText(target, value) {
    const input = getActiveServiceInput(target) || target;
    if (!input || !/input|textarea/i.test(input.tagName)) return;

    const normalizedValue = normalizeForCompare(value);
    const current = normalizeForCompare(input.value);
    const first = current.indexOf(normalizedValue);
    const last = current.lastIndexOf(normalizedValue);
    if (first < 0 || first === last) return;

    resetTextInput(input);
    await sleep(120);
    if (await runnerKeyboard({ text: value })) {
      await sleep(500);
      return;
    }

    await typeLikeUser(input, value);
  }

  function resetTextInput(input) {
    if (!input || !/input|textarea/i.test(input.tagName)) return false;

    input.focus();
    setNativeValue(input, "");
    input.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "deleteContentBackward", data: null }));
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward", data: null }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async function typeLikeUser(target, value) {
    if (!target) return;

    target.focus?.();
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", ctrlKey: true, bubbles: true }));
    target.dispatchEvent(new KeyboardEvent("keyup", { key: "a", code: "KeyA", ctrlKey: true, bubbles: true }));
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));

    if (/input|textarea/i.test(target.tagName)) {
      setNativeValue(target, "");
      target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward", data: null }));
    }

    target.dispatchEvent(new KeyboardEvent("keyup", { key: "Backspace", bubbles: true }));

    let current = "";
    for (const char of value) {
      current += char;
      target.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
      target.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: char }));

      if (/input|textarea/i.test(target.tagName)) {
        setNativeValue(target, current);
      } else {
        document.execCommand?.("insertText", false, char);
      }

      target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: char }));
      target.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
      await sleep(35);
    }

    target.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findServiceOptionExact(text) {
    const wanted = normalizeForCompare(text);
    const candidates = Array.from(document.querySelectorAll("li, div, span, button, [role='option'], [role='button'], .ng-option, .p-dropdown-item, .mat-option"))
      .filter(element => {
        if (element.closest(`#${SIDEBAR_ID}`) || !isVisible(element)) return false;
        const label = normalizeForCompare(element.innerText || element.textContent || element.getAttribute("aria-label"));
        if (!label) return false;
        if (label.includes("acordo internacional")) return false;
        return label === wanted || label === `${wanted} atendimento a distancia`;
      });

    const match = candidates.sort((a, b) => {
      return (a.innerText || a.textContent || "").length - (b.innerText || b.textContent || "").length;
    })[0];

    if (!match) return null;

    return match.closest("[role='option'], li, .ng-option, .p-dropdown-item, .mat-option") || match;
  }

  function clickDropdownOption(element) {
    const target = element.closest("[role='option'], li, .ng-option, .p-dropdown-item, .mat-option") || element;
    target.scrollIntoView({ block: "center", inline: "center" });

    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    ["pointerdown", "mousedown", "mouseup", "pointerup", "click"].forEach(type => {
      const EventClass = type.startsWith("pointer") ? PointerEvent : MouseEvent;
      target.dispatchEvent(new EventClass(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true
      }));
    });

    target.click?.();
  }

  async function confirmServiceOption(option, serviceInput) {
    const targets = [
      option,
      option.closest("[role='option'], li, .ng-option, .p-dropdown-item, .mat-option"),
      option.parentElement
    ].filter(Boolean);

    for (const target of targets) {
      if (await clickElementWithRunner(target)) {
        await sleep(650);
        if (isServiceSelectionConfirmed()) return;
      }

      clickDropdownOption(target);
      await sleep(350);
      if (isServiceSelectionConfirmed()) return;
    }

    const input = getActiveServiceInput(serviceInput);
    if (input) {
      input.focus();
      if (await confirmServiceWithRunnerKeyboard(input)) return;
      await confirmServiceOptionByExactText(input);
    }
  }

  async function confirmServiceOptionByExactText(serviceInput) {
    const option = findServiceOptionExact("Aposentadoria por Idade Urbana");
    if (!option) {
      clickElement(serviceInput);
      await sleep(500);
      return;
    }

    clickDropdownOption(option);
    await clickElementWithRunner(option);
    await sleep(650);
  }

  async function confirmServiceWithKeyboard(serviceInput) {
    const target = getActiveServiceInput(serviceInput) || serviceInput || document.activeElement;
    clickElement(serviceInput || target);
    await sleep(200);

    ["ArrowDown", "Enter"].forEach(key => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }));
      target.dispatchEvent(new KeyboardEvent("keyup", { key, code: key, bubbles: true, cancelable: true }));
    });

    await sleep(600);
  }

  async function confirmServiceWithRunnerKeyboard(serviceInput) {
    const target = getActiveServiceInput(serviceInput) || serviceInput || document.activeElement;
    if (!target || !await clickElementWithRunner(target)) return false;

    await sleep(250);
    await runnerKeyboard({ key: "ArrowDown" });
    await sleep(200);
    await runnerKeyboard({ key: "Enter" });
    await sleep(900);
    return isServiceSelectionConfirmed();
  }

  function getActiveServiceInput(serviceInput) {
    const active = document.activeElement;
    if (active && /input|textarea/i.test(active.tagName) && !active.closest(`#${SIDEBAR_ID}`)) {
      return active;
    }

    return serviceInput?.querySelector?.("input, textarea") ||
      Array.from(document.querySelectorAll("input, textarea"))
        .find(input => {
          if (input.closest(`#${SIDEBAR_ID}`) || !isVisible(input)) return false;
          const value = normalizeForCompare(input.value);
          const placeholder = normalizeForCompare(input.getAttribute("placeholder"));
          return value.includes("aposentadoria por idade urbana") ||
            placeholder.includes("servico") ||
            placeholder.includes("serviço") ||
            placeholder.includes("selecione");
        });
  }

  function isServiceSelectionConfirmed() {
    const visibleOption = findServiceOptionExact("Aposentadoria por Idade Urbana");
    if (visibleOption) return false;

    const field = findServiceSelector();
    const fieldText = normalizeForCompare(field?.innerText || field?.textContent || field?.value || "");
    return isExactUrbanRetirementSelection(fieldText);
  }

  function isExactUrbanRetirementSelection(fieldText) {
    const normalized = normalizeForCompare(fieldText);
    if (normalized.includes("acordo internacional")) return false;
    return normalized === "aposentadoria por idade urbana" ||
      normalized.includes("aposentadoria por idade urbana atendimento a distancia");
  }

  async function waitForLoadingToFinish(timeout = 10000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      const hasLoading = Array.from(document.querySelectorAll("body *"))
        .some(element => {
          if (element.closest(`#${SIDEBAR_ID}`) || !isVisible(element)) return false;
          const visibleText = normalizeForCompare(element.innerText || element.textContent || element.getAttribute("aria-label"));
          const className = normalizeForCompare(element.className);
          return visibleText.includes("aguarde") ||
            visibleText.includes("carregando") ||
            className.includes("spinner") ||
            className.includes("loading");
        });

      if (!hasLoading) return;
      await sleep(250);
    }
  }

  async function waitForPortalReady(timeout = 30000) {
    const startedAt = Date.now();
    setAutomationStatus("Aguardando o portal concluir o carregamento...", "neutral");

    while (Date.now() - startedAt < timeout) {
      const bodyText = normalizeForCompare(document.body.innerText);
      const isWaiting = bodyText.includes("aguarde") || bodyText.includes("carregando");
      const hasVisibleSpinner = Array.from(document.querySelectorAll("body *")).some(element => {
        if (element.closest(`#${SIDEBAR_ID}`) || !isVisible(element)) return false;
        const label = normalizeForCompare(element.className || element.getAttribute("aria-label") || "");
        return label.includes("spinner") || label.includes("progress") || label.includes("loading");
      });

      if (!isWaiting && !hasVisibleSpinner) return;
      await sleep(500);
    }

    throw new Error("O portal ficou muito tempo em carregamento. Tente novamente quando a tela estabilizar.");
  }

  function setAutomationStatus(message, tone) {
    const status = document.getElementById("automationStatus");
    if (!status) return;

    status.style.display = "block";
    status.className = `automation-status ${tone || "neutral"}`;
    status.textContent = message;
  }

  async function clickByText(text, options = {}) {
    const element = await waitForElement(() => findClickableByText(text), options.timeout || 10000, options.optional);
    if (!element) return false;

    clickElement(element);
    await sleep(500);
    return true;
  }

  async function clickNext(useDebuggerClick = false) {
    if (isRealRelationsPage()) {
      setAutomationStatus("Etapa 6 localizada. Nao vou avancar alem das contribuicoes.", "ok");
      return;
    }

    const initialSignature = getWizardStepSignature();
    document.activeElement?.blur?.();
    await revealWizardFooter();

    const idButton = findVisibleNextButtonById();
    if (idButton && isVisible(idButton) && !isDisabled(idButton)) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (useDebuggerClick) {
          await clickNextWithRunnerFallback(idButton, initialSignature);
        } else {
          await clickWizardNextButton(idButton);
        }
        await sleep(1100);
        if (isRealRelationsPage() || getWizardStepSignature() !== initialSignature || !document.body.contains(idButton) || !isVisible(idButton)) break;
      }
      return;
    }

    await revealWizardFooter();
    const nextButton = await waitForElement(() => findNextButton(), 8000, true);
    if (nextButton) {
      nextButton.removeAttribute?.("disabled");
      nextButton.classList?.remove?.("disabled");
      if (useDebuggerClick) {
        await clickNextWithRunnerFallback(nextButton, initialSignature);
      } else {
        await clickWizardNextButton(nextButton);
      }
      await sleep(900);
      return;
    }

    await revealWizardFooter();
    await clickByText("Avancar", { timeout: 10000, optional: true });
    await clickByText("Avançar", { timeout: 10000, optional: true });
    await sleep(900);
  }

  async function clickNextWithRunnerFallback(button, initialSignature = getWizardStepSignature()) {
    await withSidebarClickThrough(async () => {
      const clickedByRunner = await clickElementWithRunner(button);
      await sleep(950);

      if (isRealRelationsPage() || getWizardStepSignature() !== initialSignature) return;
      if (!clickedByRunner) {
        await clickWizardNextButton(button);
      }
    });
  }

  function getWizardStepSignature() {
    const activeStep = Array.from(document.querySelectorAll("button, .wizard-progress-btn, .active, .current, [aria-current='step']"))
      .map(element => normalizeForCompare(element.innerText || element.textContent || element.getAttribute("aria-label") || ""))
      .find(text => text && /\b[1-9]\b/.test(text));

    return [
      location.href,
      activeStep || "",
      isServiceSelectionPage() ? "service" : "",
      isRequesterCpfPage() ? "requester-cpf" : "",
      isRetirementNoticePageStrict() ? "notice" : "",
      isRequesterDetailsPage() ? "requester-details" : "",
      isInformativePage() ? "informative" : "",
      isRealRelationsPage() ? "relations" : "",
      isRetirementSimulationPage() ? "simulation" : ""
    ].join("|");
  }

  async function withSidebarClickThrough(task) {
    const sidebar = document.getElementById(SIDEBAR_ID);
    const previousPointerEvents = sidebar?.style.pointerEvents || "";

    if (sidebar) {
      sidebar.style.setProperty("pointer-events", "none", "important");
    }

    try {
      return await task();
    } finally {
      if (sidebar) {
        sidebar.style.pointerEvents = previousPointerEvents;
      }
    }
  }

  function findVisibleNextButtonById() {
    return Array.from(document.querySelectorAll("#btn-next"))
      .find(button => isVisible(button) && !isDisabled(button)) || null;
  }

  async function revealWizardFooter() {
    const active = document.activeElement;
    active?.blur?.();

    const scrollTargets = [
      document.scrollingElement,
      document.documentElement,
      document.body,
      ...Array.from(document.querySelectorAll("main, section, .content, .container, .page-content, .mat-sidenav-content, .ng-star-inserted"))
    ].filter(Boolean);

    for (const target of scrollTargets) {
      try {
        target.scrollTop = target.scrollHeight;
      } catch {}
    }

    window.scrollTo(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
    await sleep(350);

    const button = findVisibleNextButtonById() || findNextButton();
    if (button) {
      button.scrollIntoView?.({ block: "center", inline: "center" });
      await sleep(250);
    }
  }

  async function advanceWizardStep(fallbackStepText, isStillOnCurrentStep, useDebuggerClick = false) {
    await clickNext(useDebuggerClick);
    await sleep(1400);

    if (!isStillOnCurrentStep()) return;

    const stepButton = findWizardStepButton(fallbackStepText);
    if (!stepButton) {
      throw new Error(`Nao consegui avancar nem localizar a etapa ${fallbackStepText}.`);
    }

    clickHard(stepButton);
    await sleep(1400);
  }

  function findWizardStepButton(stepText) {
    const wanted = normalizeForCompare(stepText);
    const buttons = Array.from(document.querySelectorAll("button.wizard-progress-btn, button"))
      .filter(button => {
        if (button.closest(`#${SIDEBAR_ID}`) || !isVisible(button)) return false;
        const label = normalizeForCompare(button.innerText || button.textContent || button.getAttribute("aria-label"));
        return label.includes(wanted);
      });

    return buttons.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return ar.left - br.left;
    })[0] || null;
  }

  async function clickWizardNextButton(button) {
    if (isRealRelationsPage()) return;

    button.scrollIntoView?.({ block: "nearest", inline: "center" });
    await sleep(250);
    button.focus?.();
    clickHard(button);
    await sleep(500);
  }

  function clickInPageWorld(selector, textHint = "") {
    return new Promise(resolve => {
      const script = document.createElement("script");
      const marker = `cnisClickDone_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      window.addEventListener(marker, () => resolve(true), { once: true });
      script.textContent = `
        (() => {
          const clean = value => String(value || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().trim();
          const isVisible = el => {
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
          };
          const wanted = clean(${JSON.stringify(textHint)});
          const el = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
            .find(item => isVisible(item) && (!wanted || clean(item.innerText || item.textContent || item.value).includes(wanted))) ||
            Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(isVisible);
          if (el) {
            el.focus && el.focus();
            const rect = el.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const target = document.elementFromPoint(x, y) || el;
            ["pointerdown", "mousedown", "mouseup", "pointerup", "click"].forEach(type => {
              const Ctor = type.startsWith("pointer") ? PointerEvent : MouseEvent;
              target.dispatchEvent(new Ctor(type, {
                bubbles: true,
                cancelable: true,
                composed: true,
                clientX: x,
                clientY: y,
                pointerId: 1,
                pointerType: "mouse",
                isPrimary: true
              }));
            });
            el.click && el.click();
            const reactKey = Object.keys(el).find(key => key.startsWith("__reactProps$"));
            const props = reactKey && el[reactKey];
            if (props && typeof props.onClick === "function") {
              props.onClick({ currentTarget: el, target: el, preventDefault(){}, stopPropagation(){} });
            }
          }
          window.dispatchEvent(new Event(${JSON.stringify(marker)}));
        })();
      `;
      (document.documentElement || document.head || document.body).appendChild(script);
      script.remove();
      window.setTimeout(() => resolve(false), 600);
    });
  }

  function findNextButton() {
    const idButton = Array.from(document.querySelectorAll("#btn-next"))
      .find(element => !element.closest(`#${SIDEBAR_ID}`) && isVisible(element) && !isDisabled(element));
    if (idButton) return idButton;

    const direct = findClickableByText("Avancar") || findClickableByText("Avançar") || findClickableByText("Prosseguir");
    if (direct && !direct.closest(`#${SIDEBAR_ID}`) && isVisible(direct) && !isDisabled(direct)) return direct;

    const candidates = Array.from(document.querySelectorAll("button, a, input[type='button'], input[type='submit'], [role='button'], .btn, .p-button"))
      .filter(element => {
        if (element.closest(`#${SIDEBAR_ID}`) || !isVisible(element) || isDisabled(element)) return false;
        const label = normalizeForCompare(element.innerText || element.textContent || element.value || element.getAttribute("aria-label") || element.title);
        return label.includes("avancar") || label.includes("prosseguir");
      });

    return candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.bottom + br.right) - (ar.bottom + ar.right);
    })[0] || null;
  }

  function isDisabled(element) {
    return Boolean(
      element.disabled ||
      element.getAttribute("disabled") !== null ||
      element.getAttribute("aria-disabled") === "true" ||
      normalizeForCompare(element.className).includes("disabled")
    );
  }

  function findClickableByText(text) {
    const wanted = normalizeForCompare(text);
    const direct = findByVisibleText(text);
    if (direct) return direct;

    const candidates = Array.from(document.querySelectorAll("button, a, input[type='button'], input[type='submit'], [role='button'], li, div, span"))
      .filter(element => element.id !== SIDEBAR_ID && !element.closest(`#${SIDEBAR_ID}`));

    return candidates.find(element => {
      const label = normalizeForCompare(element.innerText || element.textContent || element.value || element.getAttribute("aria-label") || element.title);
      if (!label || !label.includes(wanted)) return false;
      return isVisible(element);
    });
  }

  function findByVisibleText(text) {
    const wanted = normalizeForCompare(text);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node) {
      const value = normalizeForCompare(node.nodeValue);
      if (value.includes(wanted)) {
        const parent = node.parentElement;
        const clickable = parent?.closest("button, a, input[type='button'], input[type='submit'], [role='button'], .btn, .p-button, .mat-button, .mat-raised-button");
        if (clickable && !clickable.closest(`#${SIDEBAR_ID}`) && isVisible(clickable)) {
          return clickable;
        }

        if (parent && !parent.closest(`#${SIDEBAR_ID}`) && isVisible(parent)) {
          return parent;
        }
      }

      node = walker.nextNode();
    }

    return null;
  }

  async function triggerCpfLookup(cpfInput) {
    const localButton = cpfInput.closest("div")?.querySelector("button, [role='button']");

    if (localButton) {
      clickElement(localButton);
      await sleep(800);
      return;
    }

    cpfInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    cpfInput.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    await sleep(800);
  }

  async function waitForRequesterName() {
    const input = await waitForElement(() => {
      const candidate = findInputByLabel("Nome");
      return candidate && cleanText(candidate.value).length > 2 ? candidate : null;
    }, 15000);

    return cleanText(input.value);
  }

  async function clickChoiceAfterQuestion(questionText, choiceText) {
    const question = normalizeForCompare(questionText);
    const choice = normalizeForCompare(choiceText);
    const element = await waitForElement(() => {
      const blocks = Array.from(document.querySelectorAll("body *"))
        .filter(item => !item.closest(`#${SIDEBAR_ID}`) && normalizeForCompare(item.innerText).includes(question));

      for (const block of blocks) {
        const container = block.parentElement || block;
        const button = Array.from(container.querySelectorAll("button, [role='button'], span, div"))
          .find(item => normalizeForCompare(item.innerText || item.textContent) === choice && isVisible(item));
        if (button) return button;
      }

      return findClickableByText(choiceText);
    }, 10000, true);

    if (element) {
      clickElement(element);
      await sleep(500);
    }
  }

  async function selectOptionByQuestion(questionText, optionText) {
    const question = normalizeForCompare(questionText);
    const option = normalizeForCompare(optionText);

    const field = await waitForElement(() => {
      const labels = Array.from(document.querySelectorAll("label, p, span, div"))
        .filter(item => !item.closest(`#${SIDEBAR_ID}`) && normalizeForCompare(item.innerText).includes(question));

      for (const label of labels) {
        const container = label.closest("div") || label.parentElement;
        const select = container?.querySelector("select");
        if (select && isVisible(select)) return select;

        const inputLike = container?.querySelector("input, [role='combobox'], .ng-select-container");
        if (inputLike && isVisible(inputLike)) return inputLike;

        const next = label.nextElementSibling;
        if (next && isVisible(next)) return next;
      }

      return null;
    }, 12000);

    if (field.tagName === "SELECT") {
      const targetOption = Array.from(field.options).find(item => normalizeForCompare(item.textContent).includes(option));
      if (targetOption) {
        field.value = targetOption.value;
        field.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(400);
        return;
      }
    }

    clickElement(field);
    await sleep(500);

    const optionElement = await waitForElement(() => {
      return Array.from(document.querySelectorAll("div, span, li, option"))
        .find(item => !item.closest(`#${SIDEBAR_ID}`) && normalizeForCompare(item.innerText || item.textContent).includes(option) && isVisible(item));
    }, 10000);

    clickElement(optionElement);
    await sleep(500);
  }

  async function uploadDummyPdf(index, filename) {
    const inputs = Array.from(document.querySelectorAll("input[type='file']"))
      .filter(input => !input.closest(`#${SIDEBAR_ID}`));
    const input = inputs[index];

    if (!input) {
      const uploadButtons = Array.from(document.querySelectorAll("button.upload-button, button"))
        .filter(button => {
          if (button.closest(`#${SIDEBAR_ID}`) || !isVisible(button)) return false;
          return normalizeForCompare(button.innerText || button.textContent).includes("selecione o arquivo");
        })
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return (ar.top + window.scrollY) - (br.top + window.scrollY);
        });

      const visualButton = uploadButtons[index];
      if (visualButton) {
        await slowScrollToElement(visualButton);
      }

      throw new Error(`Encontrei o botao visual de upload ${index + 1}, mas o portal nao expôs um input de arquivo no DOM. Esse anexo pode precisar de escolha manual.`);
    }

    const file = createDummyPdf(filename);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(900);
  }

  async function uploadDummyPdfByText(labelText, filename, fallbackIndex) {
    const input = await waitForElement(() => findUploadInputNearText(labelText) || findUploadInputByIndex(fallbackIndex), 8000, true);

    if (!input) {
      const button = findUploadButtonNearText(labelText) || findUploadButtonByIndex(fallbackIndex);
      if (button) {
        await slowScrollToElement(button);
      }

      throw new Error(`Nao encontrei o campo real de upload para ${labelText}.`);
    }

    await slowScrollToElement(input);
    await sleep(400);
    await setPdfOnInput(input, filename);
  }

  function findUploadInputNearText(labelText) {
    const label = findQuestionElement(labelText);
    if (!label) return null;

    const labelTop = label.getBoundingClientRect().top + window.scrollY;
    const inputs = Array.from(document.querySelectorAll("input[type='file']"))
      .filter(input => !input.closest(`#${SIDEBAR_ID}`))
      .map(input => ({ input, top: input.getBoundingClientRect().top + window.scrollY }))
      .filter(item => item.top >= labelTop - 20 && item.top - labelTop < 520)
      .sort((a, b) => a.top - b.top);

    return inputs[0]?.input || null;
  }

  function findUploadInputByIndex(index) {
    return Array.from(document.querySelectorAll("input[type='file']"))
      .filter(input => !input.closest(`#${SIDEBAR_ID}`))[index] || null;
  }

  function findUploadButtonNearText(labelText) {
    const label = findQuestionElement(labelText);
    if (!label) return null;

    const labelTop = label.getBoundingClientRect().top + window.scrollY;
    const buttons = getUploadButtons()
      .map(button => ({ button, top: button.getBoundingClientRect().top + window.scrollY }))
      .filter(item => item.top >= labelTop - 20 && item.top - labelTop < 520)
      .sort((a, b) => a.top - b.top);

    return buttons[0]?.button || null;
  }

  function findUploadButtonByIndex(index) {
    return getUploadButtons()[index] || null;
  }

  function getUploadButtons() {
    return Array.from(document.querySelectorAll("button.upload-button, button"))
      .filter(button => {
        if (button.closest(`#${SIDEBAR_ID}`) || !isVisible(button)) return false;
        return normalizeForCompare(button.innerText || button.textContent).includes("selecione o arquivo");
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.top + window.scrollY) - (br.top + window.scrollY);
      });
  }

  async function setPdfOnInput(input, filename) {
    const file = createDummyPdf(filename);
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(1100);
  }

  function createDummyPdf(filename) {
    const pdf = [
      "%PDF-1.4",
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
      "2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj",
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
      "4 0 obj<</Length 58>>stream",
      "BT /F1 12 Tf 36 96 Td (Documento de simulacao CNIS Checker) Tj ET",
      "endstream endobj",
      "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
      "xref",
      "0 6",
      "0000000000 65535 f ",
      "0000000010 00000 n ",
      "0000000056 00000 n ",
      "0000000111 00000 n ",
      "0000000224 00000 n ",
      "0000000332 00000 n ",
      "trailer<</Size 6/Root 1 0 R>>",
      "startxref",
      "402",
      "%%EOF"
    ].join("\n");

    return new File([pdf], filename, { type: "application/pdf" });
  }

  function findInputByPlaceholder(text) {
    const wanted = normalizeForCompare(text);
    return Array.from(document.querySelectorAll("input, textarea, [contenteditable='true']"))
      .find(input => {
        const placeholder = normalizeForCompare(input.getAttribute("placeholder"));
        return placeholder.includes(wanted) && isVisible(input);
      });
  }

  function findInputByLabel(text) {
    const wanted = normalizeForCompare(text);
    const labels = Array.from(document.querySelectorAll("label"));
    const label = labels.find(item => normalizeForCompare(item.innerText).includes(wanted));

    if (label?.htmlFor) {
      const input = document.getElementById(label.htmlFor);
      if (input && isVisible(input)) return input;
    }

    const wrapperInput = label?.parentElement?.querySelector("input, textarea, [contenteditable='true']");
    if (wrapperInput && isVisible(wrapperInput)) return wrapperInput;

    return Array.from(document.querySelectorAll("input, textarea, [contenteditable='true']")).find(input => {
      const aria = normalizeForCompare(input.getAttribute("aria-label"));
      return aria.includes(wanted) && isVisible(input);
    });
  }

  async function typeInto(input, value) {
    input.scrollIntoView({ block: "center", inline: "center" });
    input.focus();
    setNativeValue(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    setNativeValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(250);
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function clickElement(element) {
    element.scrollIntoView({ block: "center", inline: "center" });
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    element.click();
  }

  function clickHard(element) {
    const target = element.closest("button, a, input[type='button'], input[type='submit'], [role='button']") || element;
    target.scrollIntoView({ block: "center", inline: "center" });

    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const pointTarget = document.elementFromPoint(x, y);
    const eventTarget = pointTarget?.closest("button, a, input[type='button'], input[type='submit'], [role='button'], .btn, .p-button") || pointTarget || target;

    ["pointerover", "mouseover", "pointerdown", "mousedown", "mouseup", "pointerup", "click"].forEach(type => {
      const EventClass = type.startsWith("pointer") ? PointerEvent : MouseEvent;
      eventTarget.dispatchEvent(new EventClass(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true
      }));
    });

    eventTarget.click?.();
  }

  async function clickElementWithRunner(element) {
    const sessionId = getRunnerSessionId();
    if (!sessionId || !element || !isVisible(element)) return false;

    element.scrollIntoView?.({ block: "center", inline: "center" });
    await sleep(120);

    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const payload = {
      x,
      y,
      sourceWidth: window.innerWidth,
      sourceHeight: window.innerHeight
    };

    if (typeof window.__CNIS_RUNNER_TRUSTED_CLICK === "function") {
      try {
        if (await window.__CNIS_RUNNER_TRUSTED_CLICK(payload)) return true;
      } catch {
        // Fall back to the local runner HTTP bridge below.
      }
    }

    try {
      const response = await fetch(`http://127.0.0.1:8787/sessions/${encodeURIComponent(sessionId)}/click`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function runnerKeyboard(payload) {
    const sessionId = getRunnerSessionId();
    if (!sessionId) return false;

    if (typeof window.__CNIS_RUNNER_TRUSTED_KEYBOARD === "function") {
      try {
        if (await window.__CNIS_RUNNER_TRUSTED_KEYBOARD(payload)) return true;
      } catch {
        // Fall back to the local runner HTTP bridge below.
      }
    }

    try {
      const response = await fetch(`http://127.0.0.1:8787/sessions/${encodeURIComponent(sessionId)}/keyboard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  function waitForText(text, timeout) {
    const wanted = normalizeForCompare(text);
    return waitForElement(() => {
      const bodyText = normalizeForCompare(document.body.innerText);
      return bodyText.includes(wanted) ? document.body : null;
    }, timeout);
  }

  function waitForElement(getter, timeout = 10000, optional = false) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = window.setInterval(() => {
        const element = getter();
        if (element) {
          window.clearInterval(timer);
          resolve(element);
          return;
        }

        if (Date.now() - startedAt > timeout) {
          window.clearInterval(timer);
          if (optional) {
            resolve(null);
            return;
          }
          reject(new Error("Nao encontrei o elemento esperado nesta tela."));
        }
      }, 250);
    });
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function sleep(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  async function getCNISData() {
    await autoScroll();

    const vinculos = dedupeVinculos([
      ...extractTableVinculos(),
      ...extractTextVinculos()
    ]).sort((a, b) => a.inicioDate - b.inicioDate);

    return { vinculos };
  }

  function autoScroll() {
    return new Promise(resolve => {
      const originalX = window.scrollX;
      const originalY = window.scrollY;
      let lastHeight = 0;
      let sameHeightCount = 0;

      const timer = window.setInterval(() => {
        window.scrollBy(0, 650);
        const currentHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);

        sameHeightCount = currentHeight === lastHeight ? sameHeightCount + 1 : 0;
        lastHeight = currentHeight;

        if (window.innerHeight + window.scrollY >= currentHeight - 10 && sameHeightCount >= 2) {
          window.clearInterval(timer);
          window.scrollTo(originalX, originalY);
          resolve();
        }
      }, 250);
    });
  }

  function extractTableVinculos() {
    const vinculos = [];

    document.querySelectorAll("table tr").forEach(row => {
      const cells = Array.from(row.querySelectorAll("th, td"))
        .map(cell => cleanText(cell.innerText))
        .filter(Boolean);

      const parsed = parseCells(cells);
      if (parsed) vinculos.push(parsed);
    });

    return vinculos;
  }

  function extractTextVinculos() {
    const cleanBody = document.body.cloneNode(true);
    cleanBody.querySelector(`#${SIDEBAR_ID}`)?.remove();

    const lines = cleanBody.innerText
      .split(/\n+/)
      .map(cleanText)
      .filter(line => line && !isGarbageLine(line));

    const vinculos = [];

    for (let i = 0; i < lines.length; i += 1) {
      const nome = lines[i];
      const looseParsed = parseLooseLine(nome);
      if (looseParsed) {
        vinculos.push(looseParsed);
        continue;
      }

      if (!looksLikeCompanyName(nome)) continue;

      const windowLines = lines.slice(i + 1, i + 8);
      const tipo = windowLines.find(isTipoVinculo) || "";
      const dates = extractDates(windowLines.join(" "));

      if (dates.length < 1) continue;

      const parsed = buildVinculo(nome, tipo, dates[0], dates[1]);
      if (parsed) {
        vinculos.push(parsed);
        i += 3;
      }
    }

    return vinculos;
  }

  function parseLooseLine(line) {
    BR_DATE_PATTERN.lastIndex = 0;
    const rawDates = line.match(BR_DATE_PATTERN) || [];
    const dates = rawDates.map(normalizeBRDate).filter(Boolean);
    if (!dates.length || !rawDates.length) return null;

    const beforeFirstDate = cleanText(line.slice(0, line.indexOf(rawDates[0])));
    const lastRawDate = rawDates[rawDates.length - 1];
    const afterLastDate = cleanText(line.slice(line.lastIndexOf(lastRawDate) + lastRawDate.length));
    const chunks = beforeFirstDate.split(/\s{2,}|[;|\t]/).map(cleanText).filter(Boolean);
    const tipo = findTipoVinculoLabel(`${beforeFirstDate} ${afterLastDate}`);
    const nome = chunks.find(chunk => !isTipoVinculo(chunk) && looksLikeCompanyName(chunk))
      || cleanCompanyName(beforeFirstDate.replace(new RegExp(escapeRegExp(tipo), "i"), ""));

    return buildVinculo(nome, tipo, dates[0], dates[1]);
  }

  function parseCells(cells) {
    const joined = cells.join(" ");
    if (isGarbageLine(joined)) return null;

    const dates = extractDates(joined);
    if (dates.length < 1) return null;

    const tipo = cells.find(isTipoVinculo) || "";
    const nome = cells.find(cell => {
      return !isTipoVinculo(cell) && !hasDate(cell) && looksLikeCompanyName(cell);
    });

    return buildVinculo(nome, tipo, dates[0], dates[1]);
  }

  function buildVinculo(nome, tipo, inicio, fim) {
    const inicioDate = parseBRDate(inicio);
    const fimDate = parseBRDate(fim) || getOpenVinculoEndDate();
    if (!nome || !inicioDate || !fimDate || fimDate < inicioDate) return null;

    return {
      nome: cleanCompanyName(nome),
      tipo: tipo || "Vinculo",
      inicio,
      fim: fim || "Em aberto",
      emAberto: !fim,
      inicioDate,
      fimDate,
      competencias: listCompetencias(inicioDate, fimDate)
    };
  }

  function analyzeCNIS(vinculos, prisonDateValue, todayDateValue) {
    return analyzeCNISWithOptions(vinculos, prisonDateValue, { todayDate: todayDateValue });
  }

  function analyzeCNISWithOptions(vinculos, prisonDateValue, options = {}) {
    const prisonDate = parseISODate(prisonDateValue);
    const todayDate = parseISODate(options.todayDate) || getTodayDate();
    const retroactiveValue = calculateRetroactiveValue(prisonDate, todayDate);
    const rawOrdered = vinculos.slice().sort((a, b) => a.inicioDate - b.inicioDate);
    const orderedUntilPrison = capVinculosAtPrisonDate(rawOrdered, prisonDate);
    const contributionOrdered = rawOrdered.filter(vinculo => !isNonContributiveBenefitVinculo(vinculo));
    const contributionOrderedUntilPrison = orderedUntilPrison.filter(vinculo => !isNonContributiveBenefitVinculo(vinculo));
    const graceGaps = [];
    let lastCovered = null;
    let lastLossIndex = 0;
    let segmentStartIndex = 0;

    contributionOrderedUntilPrison.forEach((vinculo, index) => {
      if (!lastCovered) {
        lastCovered = vinculo.fimDate;
        return;
      }

      const baseQualidadeAte = getQualityEndDate(lastCovered);
      const segmentVinculos = contributionOrderedUntilPrison.slice(segmentStartIndex, index);
      const contribuicoesAtePerda = uniqueCompetencias(segmentVinculos.filter(v => !isIncapacityBenefitVinculo(v))).length;
      const automaticGraceMonths = contribuicoesAtePerda > 120 ? 12 : 0;
      const key = makeLossKey(lastCovered, vinculo.inicioDate);
      const desempregoGraceMonths = options.desempregoLosses?.[key] ? 12 : 0;
      const extraGraceMonths = automaticGraceMonths + desempregoGraceMonths;
      const qualidadeAte = getQualityEndDate(lastCovered, extraGraceMonths);

      if (vinculo.inicioDate > baseQualidadeAte) {
        const gap = {
          key,
          anterior: formatMonthYear(lastCovered),
          retorno: formatMonthYear(vinculo.inicioDate),
          texto: `${formatMonthYear(lastCovered)} ate ${formatMonthYear(vinculo.inicioDate)}`,
          index,
          perda: vinculo.inicioDate > qualidadeAte,
          qualidadeAte,
          baseQualidadeAte,
          contribuicoesAtePerda,
          automaticGraceMonths,
          desempregoGraceMonths,
          desempregoMarcado: Boolean(options.desempregoLosses?.[key])
        };

        graceGaps.push(gap);
      }

      if (vinculo.inicioDate > qualidadeAte) {
        lastLossIndex = index;
        segmentStartIndex = index;
      }

      if (vinculo.fimDate > lastCovered) lastCovered = vinculo.fimDate;
    });

    const afterLastLoss = contributionOrderedUntilPrison.slice(lastLossIndex);
    const carenciaVinculos = contributionOrdered.filter(vinculo => !isIncapacityBenefitVinculo(vinculo));
    const afterLastLossCarencia = afterLastLoss.filter(vinculo => !isIncapacityBenefitVinculo(vinculo));
    const incapacityBenefitCompetencias = uniqueCompetencias(rawOrdered.filter(isIncapacityBenefitVinculo)).length;
    let incapacityBenefitCompetenciasCarencia = uniqueCompetencias(afterLastLoss.filter(isIncapacityBenefitVinculo)).length;
    const nonContributiveBenefitCompetencias = uniqueCompetencias(rawOrdered.filter(isNonContributiveBenefitVinculo)).length;
    const totalContribuicoesLancadas = countContribuicoes(contributionOrdered);
    const totalCompetencias = uniqueCompetencias(contributionOrdered).length;
    const competenciasDesconsideradasAposPrisao = Math.max(0, totalCompetencias - uniqueCompetencias(contributionOrderedUntilPrison).length);
    const totalConcomitantes = totalContribuicoesLancadas - totalCompetencias;
    const totalCompetenciasCarencia = uniqueCompetencias(carenciaVinculos).length;
    let contribuicoesCarenciaLancadas = countContribuicoes(afterLastLossCarencia);
    let competenciasCarencia = uniqueCompetencias(afterLastLossCarencia).length;
    let concomitantesCarencia = contribuicoesCarenciaLancadas - competenciasCarencia;
    const carenciaNecessaria = getRequiredCarencia(prisonDate);
    const carenciaExigida = carenciaNecessaria > 0;
    const lastContributionDate = contributionOrderedUntilPrison.reduce((latest, vinculo) => {
      return !latest || vinculo.fimDate > latest ? vinculo.fimDate : latest;
    }, null);
    const finalSegmentVinculos = contributionOrderedUntilPrison.slice(segmentStartIndex);
    const contribuicoesAteUltimaContribuicao = uniqueCompetencias(finalSegmentVinculos.filter(v => !isIncapacityBenefitVinculo(v))).length;
    const finalAutomaticGraceMonths = contribuicoesAteUltimaContribuicao > 120 ? 12 : 0;
    const finalLossKey = lastContributionDate && prisonDate ? makeLossKey(lastContributionDate, prisonDate) : "";
    const finalDesempregoGraceMonths = options.desempregoLosses?.[finalLossKey] ? 12 : 0;
    const baseFinalQualidadeAte = lastContributionDate ? getQualityEndDate(lastContributionDate, finalAutomaticGraceMonths) : null;
    const qualidadeAte = lastContributionDate ? getQualityEndDate(lastContributionDate, finalAutomaticGraceMonths + finalDesempregoGraceMonths) : null;
    const mantemQualidade = Boolean(prisonDate && qualidadeAte && prisonDate <= qualidadeAte);
    if (prisonDate && lastContributionDate && baseFinalQualidadeAte && prisonDate > baseFinalQualidadeAte) {
      graceGaps.push({
        key: finalLossKey,
        anterior: formatMonthYear(lastContributionDate),
        retorno: formatMonthYear(prisonDate),
        texto: `${formatMonthYear(lastContributionDate)} ate ${formatMonthYear(prisonDate)}`,
        perda: prisonDate > qualidadeAte,
        qualidadeAte,
        baseQualidadeAte: baseFinalQualidadeAte,
        contribuicoesAtePerda: contribuicoesAteUltimaContribuicao,
        automaticGraceMonths: finalAutomaticGraceMonths,
        desempregoGraceMonths: finalDesempregoGraceMonths,
        desempregoMarcado: Boolean(options.desempregoLosses?.[finalLossKey]),
        final: true
      });
    }
    const houvePerdaFinalAntesDaPrisao = Boolean(prisonDate && qualidadeAte && prisonDate > qualidadeAte);
    if (houvePerdaFinalAntesDaPrisao) {
      competenciasCarencia = 0;
      contribuicoesCarenciaLancadas = 0;
      concomitantesCarencia = 0;
      incapacityBenefitCompetenciasCarencia = 0;
    }
    const carenciaOk = !carenciaExigida || competenciasCarencia >= carenciaNecessaria;
    const direito = carenciaOk && mantemQualidade;

    return {
      vinculos: rawOrdered,
      perdas: graceGaps.filter(gap => gap.perda),
      graceGaps,
      totalCompetencias,
      totalCompetenciasCarencia,
      totalContribuicoesLancadas,
      totalConcomitantes,
      competenciasDesconsideradasAposPrisao,
      incapacityBenefitCompetencias,
      incapacityBenefitCompetenciasCarencia,
      nonContributiveBenefitCompetencias,
      competenciasCarencia,
      contribuicoesCarenciaLancadas,
      concomitantesCarencia,
      carenciaNecessaria,
      carenciaExigida,
      carenciaOk,
      mantemQualidade,
      qualidadeAte,
      lastContributionDate,
      contribuicoesAteUltimaContribuicao,
      finalAutomaticGraceMonths,
      direito,
      prisonDate,
      todayDate,
      retroactiveValue
    };
  }

  function renderReport(nome, cpf, prisonDate, analysis) {
    const dateLabel = analysis.prisonDate ? formatDate(analysis.prisonDate) : "Nao informada";
    const qualidadeAte = analysis.qualidadeAte ? formatDate(analysis.qualidadeAte) : "Nao calculada";
    const lastContribution = analysis.lastContributionDate ? formatMonthYear(analysis.lastContributionDate) : "Nao localizada";

    if (!analysis.vinculos.length) {
      return `
        <section class="report-section">
          <div class="report-hero denied">
            <span class="status-pill warn">Revisar captura</span>
            <h3>Nenhum vinculo CNIS foi identificado</h3>
            <p>Abra a tela com a tabela de vinculos visivel e clique em analisar novamente.</p>
          </div>
        </section>
      `;
    }

    return `
      <section class="report-section">
        <div class="report-hero ${analysis.direito ? "approved" : "denied"}">
          <span class="status-pill ${analysis.direito ? "ok" : "fail"}">${analysis.direito ? "Direito indicado" : "Direito nao indicado"}</span>
          <h3>Auxilio-reclusao em ${escapeHTML(dateLabel)}</h3>
          <p>${renderConclusionText(analysis)}</p>
        </div>

        <div class="summary-grid">
          ${renderMetric("Carencia", getCarenciaMetricValue(analysis), analysis.carenciaOk ? "ok" : "fail")}
          ${renderMetric("Qualidade", analysis.mantemQualidade ? "Mantida" : "Perdida", analysis.mantemQualidade ? "ok" : "fail")}
          ${renderMetric("Ultima contrib.", lastContribution, "neutral")}
          ${renderMetric("Periodo de graca", qualidadeAte, analysis.mantemQualidade ? "ok" : "fail")}
        </div>

        <div class="report-block">
          <h4>1. Historico de vinculos e contribuicoes</h4>
          <div class="vinculo-table">
            <div class="vinculo-row head">
              <span>Vinculo</span>
              <span>Periodo</span>
              <span>Compet.</span>
            </div>
            ${analysis.vinculos.map(vinculo => renderVinculoRow(vinculo, analysis.prisonDate)).join("")}
          </div>
          <p class="total-line">Total geral: <b>${analysis.totalCompetencias}</b> competencias.</p>
          ${renderConcomitanceNote(analysis.totalConcomitantes)}
          ${renderPostPrisonCompetenceNote(analysis)}
          ${renderIncapacityBenefitNote(analysis)}
          ${renderNonContributiveBenefitNote(analysis)}
        </div>

        <div class="report-block">
          <h4>2. Perda da qualidade de segurado</h4>
          ${renderPerdas(analysis)}
        </div>

        <div class="report-block">
          <h4>3. Carencia apos a ultima perda</h4>
          ${renderCarenciaStatus(analysis)}
          ${renderIncapacityBenefitCarenciaNote(analysis)}
          ${renderCarenciaLawNote(analysis)}
        </div>

        <div class="report-block">
          <h4>4. Condicao de segurado na prisao</h4>
          <p class="${analysis.mantemQualidade ? "ok" : "fail"}">
            Ultima contribuicao em ${escapeHTML(lastContribution)}. Periodo de graca ate ${escapeHTML(qualidadeAte)}${analysis.finalAutomaticGraceMonths ? " com prorrogacao automatica de 12 meses por mais de 120 contribuicoes." : "."}
          </p>
        </div>

        ${renderRetroactiveValue(analysis)}

        <div class="report-block conclusion ${analysis.direito ? "approved" : "denied"}">
          <h4>5. Conclusao</h4>
          <p>${renderFinalConclusion(analysis, dateLabel)}</p>
        </div>
      </section>
    `;
  }

  function renderMetric(label, value, tone) {
    return `
      <div class="metric ${tone}">
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(value)}</strong>
      </div>
    `;
  }

  function renderRetroactiveValue(analysis) {
    if (!analysis.direito || !analysis.retroactiveValue?.total) return "";

    const retroactive = analysis.retroactiveValue;
    const rows = retroactive.breakdown.map(item => `
      <tr>
        <td>${item.year}</td>
        <td>${item.months}</td>
        <td>${formatCurrencyBRL(item.minimumWage)}</td>
        <td>${formatCurrencyBRL(item.subtotal)}</td>
      </tr>
    `).join("");
    const missingNote = retroactive.missingYears.length
      ? `<p class="benefit-note">Observacao: nao ha salario minimo cadastrado para ${retroactive.missingYears.join(", ")}; essas competencias nao entraram no calculo.</p>`
      : "";

    return `
      <div class="retroactive-card">
        <h4>Valor da causa previsto - retroativos</h4>
        <p>Periodo calculado de ${escapeHTML(retroactive.startLabel)} ate ${escapeHTML(retroactive.endLabel)}, totalizando ${retroactive.months} competencia(s), com base no salario minimo vigente em cada ano.</p>
        <strong>${formatCurrencyBRL(retroactive.total)}</strong>
        <table class="retroactive-table">
          <thead><tr><th>Ano</th><th>Meses</th><th>Salario minimo</th><th>Subtotal</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${missingNote}
      </div>
    `;
  }

  function renderInteractiveReport(nome, cpf, prisonDate, todayDate, vinculos, analysis = null, desempregoLosses = {}, historyId = null) {
    const report = document.getElementById("report");
    if (!report) return;

    const currentAnalysis = analysis || analyzeCNISWithOptions(vinculos, prisonDate, { desempregoLosses, todayDate });
    currentReportContext = {
      historyId: historyId || currentReportContext?.historyId || makeHistoryId(),
      nome,
      cpf,
      prisonDate,
      todayDate,
      vinculos,
      desempregoLosses,
      analysis: currentAnalysis
    };

    report.innerHTML = renderReport(nome, cpf, prisonDate, currentAnalysis);
    bindReportControls(report);
  }

  function bindReportControls(reportElement) {
    if (reportElement.dataset.cnisReportControlsBound === "true") return;

    reportElement.dataset.cnisReportControlsBound = "true";
    reportElement.addEventListener("change", handleReportControlChange);
    reportElement.addEventListener("input", handleReportControlChange);
    reportElement.addEventListener("click", handleReportControlClick);
  }

  function handleReportControlClick(event) {
    const input = event.target?.closest?.("[data-loss-key]");
    if (!input) return;

    const lossKey = input.dataset.lossKey;
    window.setTimeout(() => updateUnemploymentLoss(lossKey, input.checked), 0);
  }

  function handleReportControlChange(event) {
    const input = event.target?.closest?.("[data-loss-key]");
    if (!input || !currentReportContext) return;

    updateUnemploymentLoss(input.dataset.lossKey, input.checked);
  }

  function updateUnemploymentLoss(lossKey, checked) {
    if (!lossKey || !currentReportContext) return;

    if (currentReportContext.desempregoLosses[lossKey] === checked) return;
    currentReportContext.desempregoLosses[lossKey] = checked;
    renderCurrentReport();
  }

  function renderCurrentReport() {
    if (!currentReportContext) return;

    const report = document.getElementById("report");
    if (!report) return;

    const analysis = analyzeCNISWithOptions(currentReportContext.vinculos, currentReportContext.prisonDate, {
      desempregoLosses: currentReportContext.desempregoLosses,
      todayDate: currentReportContext.todayDate
    });

    renderInteractiveReport(
      currentReportContext.nome,
      currentReportContext.cpf,
      currentReportContext.prisonDate,
      currentReportContext.todayDate,
      currentReportContext.vinculos,
      analysis,
      currentReportContext.desempregoLosses,
      currentReportContext.historyId
    );
    updateSavedHistoryEntry();
  }

  async function updateSavedHistoryEntry() {
    if (!currentReportContext?.historyId || !currentReportContext.analysis) return;

    const entry = prepareHistoryEntry({
      id: currentReportContext.historyId,
      nome: currentReportContext.nome,
      cpf: currentReportContext.cpf,
      prisonDate: currentReportContext.prisonDate,
      todayDate: currentReportContext.todayDate,
      vinculos: currentReportContext.vinculos,
      desempregoLosses: currentReportContext.desempregoLosses,
      updatedAt: new Date().toISOString()
    }, currentReportContext.analysis);

    updateLocalStorageHistoryEntry(entry);

    if (!isExtensionContextValid()) return;

    chrome.runtime.sendMessage({ type: "CNIS_HISTORY_UPDATE", entry }, response => {
      if (!chrome.runtime.lastError && response?.ok) return;

      safeStorageGet({ [HISTORY_KEY]: [] }).then(async result => {
        const history = Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
        const index = history.findIndex(item => item.id === entry.id);
        if (index < 0) return;

        history[index] = { ...history[index], ...entry };
        await safeStorageSet({ [HISTORY_KEY]: history });
      });
    });
  }

  function renderVinculoRow(vinculo, limitDate = null) {
    return `
      <div class="vinculo-row">
        <span>
          <b>${escapeHTML(vinculo.nome)}</b>
          <small>${escapeHTML(vinculo.tipo)}</small>
          ${isOpenVinculo(vinculo) ? "<small>Vinculo em aberto; considerado ate a data da prisao para esta analise, sujeito a comprovacao documental.</small>" : ""}
          ${isNonContributiveBenefitVinculo(vinculo) ? "<small>Beneficio; nao conta para carencia, tempo de contribuicao ou periodo de graca.</small>" : ""}
          ${isIncapacityBenefitVinculo(vinculo) ? "<small>Beneficio por incapacidade; nao conta para carencia. Para tempo, depende de estar intercalado com contribuicao/atividade.</small>" : ""}
        </span>
        <span>${escapeHTML(vinculo.inicio)} a ${escapeHTML(vinculo.fim)}</span>
        <span>${renderCompetenciasCount(vinculo, limitDate)}</span>
      </div>
    `;
  }

  function renderPerdas(analysis) {
    const gaps = analysis.graceGaps || analysis.perdas || [];

    if (!gaps.length) {
      return `<p class="ok">Nao houve perda da qualidade dentro dos vinculos capturados.</p>`;
    }

    return `
      <div class="loss-list">
        ${gaps.map(perda => `
          <div class="loss-item ${perda.perda ? "" : "resolved"}">
            <span>${perda.perda ? "Perda identificada" : "Perda afastada"}</span>
            <strong>${escapeHTML(perda.texto)}</strong>
            <small>Periodo de graca ate ${escapeHTML(formatDate(perda.qualidadeAte))}${perda.automaticGraceMonths ? ` (+${perda.automaticGraceMonths} meses por mais de 120 contribuicoes)` : ""}${perda.desempregoGraceMonths ? ` (+${perda.desempregoGraceMonths} meses por seguro-desemprego)` : ""}.</small>
            ${perda.automaticGraceMonths ? `<small>Foram identificadas ${perda.contribuicoesAtePerda} contribuicoes ate esse ponto; a prorrogacao de 12 meses foi aplicada automaticamente.</small>` : ""}
            <label class="loss-check">
              <input type="checkbox" data-loss-key="${escapeHTML(perda.key)}" ${perda.desempregoMarcado ? "checked" : ""}>
              Houve desemprego involuntario/seguro-desemprego neste intervalo
            </label>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderConcomitanceNote(discountedCount) {
    if (!discountedCount) return "";

    const contributionLabel = discountedCount === 1 ? "contribuicao concomitante foi computada" : "contribuicoes concomitantes foram computadas";

    return `
      <p class="concomitance-note">
        Observacao: ${discountedCount} ${contributionLabel} como uma unica competencia mensal. Para fins de carencia e tempo de contribuicao, um mes e contado uma so vez, mesmo que exista mais de um vinculo ou recolhimento no mesmo periodo.
      </p>
    `;
  }

  function renderPostPrisonCompetenceNote(analysis) {
    if (!analysis.competenciasDesconsideradasAposPrisao) return "";

    return `
      <p class="benefit-note">
        Observacao: ${analysis.competenciasDesconsideradasAposPrisao} competencia(s) posterior(es) a data da prisao aparecem no historico, mas foram desconsideradas para a carencia do auxilio-reclusao.
      </p>
    `;
  }

  function renderIncapacityBenefitNote(analysis) {
    if (!analysis.incapacityBenefitCompetencias) return "";

    return `
      <p class="benefit-note">
        Observacao: ${analysis.incapacityBenefitCompetencias} competencia(s) de beneficio por incapacidade aparecem no historico. Elas nao entram na carencia; eventual contagem como tempo de contribuicao depende de estarem intercaladas com contribuicao ou atividade.
      </p>
    `;
  }

  function renderIncapacityBenefitCarenciaNote(analysis) {
    if (!analysis.incapacityBenefitCompetenciasCarencia) return "";

    return `
      <p class="benefit-note">
        Observacao: auxilio-doenca/beneficio por incapacidade nao conta para carencia. Para tempo de contribuicao, a contagem depende de estar intercalado com contribuicao ou atividade. Foram desconsideradas ${analysis.incapacityBenefitCompetenciasCarencia} competencia(s) desse tipo na carencia apos a ultima perda.
      </p>
    `;
  }

  function renderNonContributiveBenefitNote(analysis) {
    if (!analysis.nonContributiveBenefitCompetencias) return "";

    return `
      <p class="benefit-note">
        Observacao: ${analysis.nonContributiveBenefitCompetencias} competencia(s) de pensao por morte, beneficio assistencial ou outro beneficio nao contributivo foram identificadas como beneficio, nao como contribuicao propria. Elas nao entram na carencia, no tempo de contribuicao, na ultima contribuicao nem no periodo de graca.
      </p>
    `;
  }

  function getCarenciaMetricValue(analysis) {
    return analysis.carenciaExigida ? `${analysis.competenciasCarencia}/${analysis.carenciaNecessaria}` : "Dispensada";
  }

  function renderCarenciaStatus(analysis) {
    if (!analysis.carenciaExigida) {
      return `
        <p class="ok">
          Carencia nao exigida para a data da prisao. Foram identificadas ${analysis.competenciasCarencia} competencia(s) apos a ultima perda, mas esse requisito nao se aplica ao caso.
        </p>
      `;
    }

    return `
      <p class="${analysis.carenciaOk ? "ok" : "fail"}">
        ${analysis.carenciaOk ? "Cumpre" : "Nao cumpre"} a carencia minima: ${analysis.competenciasCarencia} de ${analysis.carenciaNecessaria} contribuicoes.
      </p>
    `;
  }

  function renderCarenciaLawNote(analysis) {
    let caseText = "Data da prisao nao informada; por cautela, foi considerada a carencia de 24 contribuicoes mensais.";

    if (analysis.prisonDate && !analysis.carenciaExigida) {
      caseText = "Como a prisao e anterior a 18/06/2019, a carencia nao e exigida neste caso.";
    } else if (analysis.prisonDate) {
      caseText = "Como a prisao e em 18/06/2019 ou posterior, aplica-se a carencia de 24 contribuicoes mensais.";
    }

    return `
      <p class="legal-note">
        Observacao: para auxilio-reclusao, a carencia de 24 contribuicoes mensais foi introduzida pela Lei n. 13.846/2019, publicada em 18/06/2019. Prisoes anteriores a essa data nao exigem carencia; prisoes a partir de 18/06/2019 exigem 24 contribuicoes mensais. ${caseText}
      </p>
    `;
  }

  function renderConclusionText(analysis) {
    if (!analysis.carenciaExigida && analysis.mantemQualidade) {
      return "Carencia nao exigida pela data da prisao e qualidade de segurado mantida.";
    }

    if (!analysis.carenciaExigida && !analysis.mantemQualidade) {
      return "Carencia nao exigida pela data da prisao, mas a qualidade de segurado nao estava mantida.";
    }

    if (analysis.direito) {
      return `Carencia cumprida com ${analysis.competenciasCarencia} contribuicoes apos a ultima perda e qualidade de segurado mantida na data da prisao.`;
    }

    if (!analysis.carenciaOk && analysis.mantemQualidade) {
      return `Qualidade de segurado mantida, mas carencia insuficiente: ${analysis.competenciasCarencia} de ${analysis.carenciaNecessaria} contribuicoes apos a ultima perda.`;
    }

    if (analysis.carenciaOk && !analysis.mantemQualidade) {
      return "Carencia cumprida, mas a qualidade de segurado nao estava mantida na data da prisao.";
    }

    return "Carencia insuficiente e qualidade de segurado nao confirmada na data da prisao.";
  }

  function renderFinalConclusion(analysis, dateLabel) {
    if (analysis.direito) {
      if (!analysis.carenciaExigida) {
        return `Neste caso, ha indicacao de direito ao auxilio-reclusao em ${escapeHTML(dateLabel)}, pois a carencia nao era exigida na data da prisao e a qualidade de segurado estava mantida.`;
      }

      return `Neste caso, ha indicacao de direito ao auxilio-reclusao em ${escapeHTML(dateLabel)}, pois a carencia foi cumprida e a qualidade de segurado estava mantida.`;
    }

    return `Neste caso, nao ha indicacao de direito ao auxilio-reclusao em ${escapeHTML(dateLabel)}, pelos criterios analisados acima.`;
  }

  function addHistoryEntry(entry, persist) {
    const analysis = analyzeCNIS(entry.vinculos || [], entry.prisonDate, entry.todayDate);
    const storedEntry = prepareHistoryEntry(entry, analysis);

    if (persist) {
      addHistoryEntryToStorage(storedEntry).then(saved => {
        setAutomationStatus(saved ? "Relatorio salvo no historico." : "Nao consegui confirmar o salvamento do historico.", saved ? "ok" : "fail");
        updateHistoryHeading();
      });
    }
  }

  function prepareHistoryEntry(entry, analysis) {
    return {
      ...entry,
      id: entry.id || makeHistoryId(),
      reportHTML: buildReportHTML(entry.nome, entry.cpf, entry.prisonDate, entry.todayDate, analysis, {
        id: entry.id,
        vinculos: entry.vinculos || [],
        desempregoLosses: entry.desempregoLosses || {},
        todayDate: entry.todayDate || ""
      }),
      summary: entry.summary || {
        direito: analysis.direito,
        carenciaOk: analysis.carenciaOk,
        mantemQualidade: analysis.mantemQualidade,
        retroactiveTotal: analysis.retroactiveValue?.total || 0,
        competenciasCarencia: analysis.competenciasCarencia,
        totalCompetenciasCarencia: analysis.totalCompetenciasCarencia,
        totalCompetencias: analysis.totalCompetencias,
        totalContribuicoesLancadas: analysis.totalContribuicoesLancadas,
        totalConcomitantes: analysis.totalConcomitantes,
        competenciasDesconsideradasAposPrisao: analysis.competenciasDesconsideradasAposPrisao,
        incapacityBenefitCompetencias: analysis.incapacityBenefitCompetencias,
        incapacityBenefitCompetenciasCarencia: analysis.incapacityBenefitCompetenciasCarencia,
        nonContributiveBenefitCompetencias: analysis.nonContributiveBenefitCompetencias,
        concomitantesCarencia: analysis.concomitantesCarencia,
        carenciaNecessaria: analysis.carenciaNecessaria,
        carenciaExigida: analysis.carenciaExigida,
        desempregoLosses: entry.desempregoLosses || {},
        graceGaps: analysis.graceGaps || []
      }
    };
  }

  function makeHistoryId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `cnis-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function addHistoryEntryToStorage(entry) {
    writeLocalStorageHistoryEntry(entry);

    return new Promise(resolve => {
      if (!isExtensionContextValid()) {
        resolve(true);
        return;
      }

      chrome.runtime.sendMessage({ type: "CNIS_HISTORY_ADD", entry }, response => {
        if (!chrome.runtime.lastError && response?.ok) {
          resolve(true);
          return;
        }

        safeStorageGet({ [HISTORY_KEY]: [] }).then(async result => {
          const history = Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
          history.unshift(entry);
          const saved = await safeStorageSet({ [HISTORY_KEY]: history.slice(0, 100) });
          resolve(saved);
        });
      });
    });
  }

  function updateLocalStorageHistoryEntry(entry) {
    try {
      const raw = window.localStorage.getItem(`cnisChecker:${HISTORY_KEY}`);
      const history = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(history) ? history : [];
      const index = list.findIndex(item => item.id === entry.id);
      if (index < 0) return;

      list[index] = { ...list[index], ...entry };
      window.localStorage.setItem(`cnisChecker:${HISTORY_KEY}`, JSON.stringify(list));
    } catch {
      // chrome.storage remains primary.
    }
  }

  function writeLocalStorageHistoryEntry(entry) {
    try {
      const raw = window.localStorage.getItem(`cnisChecker:${HISTORY_KEY}`);
      const history = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(history) ? history : [];
      list.unshift(entry);
      window.localStorage.setItem(`cnisChecker:${HISTORY_KEY}`, JSON.stringify(list.slice(0, 100)));
    } catch {
      // chrome.storage remains primary.
    }
  }

  function loadHistory() {
    safeStorageGet({ [HISTORY_KEY]: [] }).then(result => {
      updateHistoryHeading(result[HISTORY_KEY]);
    });
  }

  async function updateHistoryHeading(historyList) {
    const heading = document.getElementById("historyHeading");
    if (!heading) return;

    let list = historyList;
    if (!Array.isArray(list)) {
      const result = await safeStorageGet({ [HISTORY_KEY]: [] });
      list = result[HISTORY_KEY] || [];
    }

    const total = list.filter(entry => Array.isArray(entry.vinculos)).length;
    heading.textContent = `Historico (${total})`;
  }

  async function openReportsArchive() {
    if (!isExtensionContextValid()) {
      window.open("historico.html", "_blank");
      return;
    }

    chrome.runtime.sendMessage({ type: "CNIS_OPEN_HISTORY" }, response => {
      if (chrome.runtime.lastError || !response?.ok) {
        window.open(chrome.runtime.getURL("historico.html"), "_blank");
      }
    });
  }

  function buildReportsArchiveHTML(history) {
    const rows = history.map((entry, index) => {
      const analysis = analyzeCNIS(entry.vinculos || [], entry.prisonDate, entry.todayDate);
      return `
        <article class="archive-item">
          <div>
            <span>${escapeHTML(formatISODate(entry.prisonDate) || "Sem data")}</span>
            <h2>${escapeHTML(entry.nome || "Sem nome")}</h2>
            <p>${escapeHTML(entry.cpf || "Sem CPF")} - Carencia: ${escapeHTML(getCarenciaMetricValue(analysis))} - ${analysis.direito ? "Direito indicado" : "Direito nao indicado"}</p>
          </div>
          <button onclick="document.getElementById('report-${index}').classList.toggle('open')">Ver</button>
        </article>
        <section id="report-${index}" class="report-preview">${buildReportBodyHTML(entry.nome, entry.cpf, entry.prisonDate, entry.todayDate, analysis)}</section>
      `;
    }).join("");

    return `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <title>Historico CNIS Checker</title>
          <style>
            body { margin: 0; background: #f4f7fb; color: #172033; font-family: Arial, Helvetica, sans-serif; }
            header { padding: 28px; color: #fff; background: #111827; }
            header h1 { margin: 0 0 6px; }
            main { max-width: 1000px; margin: 0 auto; padding: 20px; }
            .archive-item { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 10px; padding: 14px; background: #fff; border: 1px solid #d9e2ec; border-radius: 8px; }
            .archive-item h2 { margin: 2px 0; font-size: 17px; }
            .archive-item p, .archive-item span { margin: 0; color: #64748b; font-size: 12px; }
            button { align-self: center; padding: 8px 14px; color: #fff; background: #0891b2; border: 0; border-radius: 6px; cursor: pointer; }
            .report-preview { display: none; margin: 0 0 18px; padding: 16px; background: #fff; border: 1px solid #d9e2ec; border-radius: 8px; }
            .report-preview.open { display: block; }
            ${reportBaseCSS()}
          </style>
        </head>
        <body>
          <header>
            <h1>Historico CNIS Checker</h1>
            <p>${history.length} relatorio(s) salvo(s) no armazenamento da extensao.</p>
          </header>
          <main>${rows || "<p>Nenhum relatorio salvo.</p>"}</main>
        </body>
      </html>
    `;
  }

  function makeReportFilename(entry) {
    const date = sanitizeFilename(formatISODate(entry.prisonDate) || "sem-data");
    const cpf = onlyDigits(entry.cpf || "sem-cpf");
    const name = sanitizeFilename(entry.nome || "sem-nome").slice(0, 60);
    return `${date}_${cpf}_${name}`;
  }

  function sanitizeFilename(value) {
    return cleanText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function buildReportHTML(nome, cpf, prisonDate, todayDate, analysis, state = null) {
    return `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <title>Relatorio CNIS</title>
          <style>
            @page { size: A4; margin: 16mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #172033; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
            ${reportBaseCSS()}
          </style>
        </head>
        <body>
          <main id="reportBody">${buildReportBodyHTML(nome, cpf, prisonDate, todayDate, analysis)}</main>
          ${state?.vinculos?.length ? buildSavedReportScript(nome, cpf, prisonDate, todayDate, state) : ""}
        </body>
      </html>
    `;
  }

  function buildReportBodyHTML(nome, cpf, prisonDate, todayDate, analysis) {
    const dateLabel = analysis.prisonDate ? formatDate(analysis.prisonDate) : "Nao informada";
    const qualidadeAte = analysis.qualidadeAte ? formatDate(analysis.qualidadeAte) : "Nao calculada";
    const lastContribution = analysis.lastContributionDate ? formatMonthYear(analysis.lastContributionDate) : "Nao localizada";
    const conclusionTone = analysis.direito ? "ok" : "fail";

    return `
      <section class="hero">
        <span class="badge ${analysis.direito ? "badge-ok" : "badge-fail"}">${analysis.direito ? "Direito indicado" : "Direito nao indicado"}</span>
        <h1>Relatorio de Previdencia Social</h1>
        <p>Analise de carencia, qualidade de segurado e perdas entre vinculos para prisao em ${escapeHTML(dateLabel)}.</p>
      </section>

      <section class="person">
        <div class="box"><span>Nome</span><strong>${escapeHTML(nome || "Nao informado")}</strong></div>
        <div class="box"><span>CPF</span><strong>${escapeHTML(cpf || "Nao informado")}</strong></div>
        <div class="box"><span>Data da prisao</span><strong>${escapeHTML(formatISODate(prisonDate) || "Nao informada")}</strong></div>
        <div class="box"><span>Data de hoje</span><strong>${escapeHTML(formatISODate(todayDate) || formatDate(analysis.todayDate))}</strong></div>
      </section>

      <section class="metrics">
        <div class="box"><span>Carencia</span><strong class="${analysis.carenciaOk ? "ok" : "fail"}">${escapeHTML(getCarenciaMetricValue(analysis))}</strong></div>
        <div class="box"><span>Qualidade</span><strong class="${analysis.mantemQualidade ? "ok" : "fail"}">${analysis.mantemQualidade ? "Mantida" : "Perdida"}</strong></div>
        <div class="box"><span>Ultima contrib.</span><strong>${escapeHTML(lastContribution)}</strong></div>
        <div class="box"><span>Periodo de graca</span><strong>${escapeHTML(qualidadeAte)}</strong></div>
      </section>

      <h2>1. Historico de vinculos e contribuicoes</h2>
      <table>
        <thead><tr><th>Vinculo</th><th>Tipo</th><th>Periodo</th><th>Competencias</th></tr></thead>
        <tbody>
        ${analysis.vinculos.map(v => `<tr><td>${escapeHTML(v.nome)}${isOpenVinculo(v) ? "<br><small>Vinculo em aberto; considerado ate a data da prisao para esta analise, sujeito a comprovacao documental.</small>" : ""}${isNonContributiveBenefitVinculo(v) ? "<br><small>Beneficio; nao conta como contribuicao.</small>" : ""}</td><td>${escapeHTML(v.tipo)}</td><td>${escapeHTML(v.inicio)} a ${escapeHTML(v.fim)}</td><td>${renderCompetenciasCount(v, analysis.prisonDate)}</td></tr>`).join("")}
        </tbody>
      </table>
      <p><b>Total geral reconhecido:</b> ${analysis.totalCompetencias} competencias.</p>
      ${renderConcomitanceNote(analysis.totalConcomitantes)}
      ${renderPostPrisonCompetenceNote(analysis)}
      ${renderIncapacityBenefitNote(analysis)}
      ${renderNonContributiveBenefitNote(analysis)}

      <h2>2. Perda da qualidade de segurado</h2>
      ${renderDocumentPerdas(analysis)}

      <h2>3. Carencia apos a ultima perda</h2>
      ${renderCarenciaStatus(analysis)}
      ${renderIncapacityBenefitCarenciaNote(analysis)}
      ${renderCarenciaLawNote(analysis)}

      <h2>4. Condicao de segurado na prisao</h2>
      <p class="${analysis.mantemQualidade ? "ok" : "fail"}">Ultima contribuicao em ${escapeHTML(lastContribution)}. Periodo de graca ate ${escapeHTML(qualidadeAte)}${analysis.finalAutomaticGraceMonths ? " com prorrogacao automatica de 12 meses por mais de 120 contribuicoes." : "."}</p>
      ${renderRetroactiveValue(analysis)}

      <h2>5. Conclusao</h2>
      <div class="conclusion ${conclusionTone}">${renderFinalConclusion(analysis, dateLabel)}</div>
    `;
  }

  function renderDocumentPerdas(analysis) {
    const gaps = analysis.graceGaps || analysis.perdas || [];

    if (!gaps.length) {
      return `<p class="ok">Nao houve perda da qualidade dentro dos vinculos capturados.</p>`;
    }

    return gaps.map(perda => `
      <div class="loss ${perda.perda ? "" : "resolved"}">
        <b>${perda.perda ? "Perda identificada" : "Perda afastada"}:</b> ${escapeHTML(perda.texto)}
        <small>Periodo de graca ate ${escapeHTML(perda.qualidadeAte ? formatDate(perda.qualidadeAte) : "Nao calculado")}${perda.automaticGraceMonths ? ` (+${perda.automaticGraceMonths} meses por mais de 120 contribuicoes)` : ""}${perda.desempregoGraceMonths ? ` (+${perda.desempregoGraceMonths} meses por seguro-desemprego)` : ""}.</small>
        ${perda.automaticGraceMonths ? `<small>Foram identificadas ${perda.contribuicoesAtePerda} contribuicoes ate esse ponto; a prorrogacao de 12 meses foi aplicada automaticamente.</small>` : ""}
        <label class="loss-check">
          <input type="checkbox" data-loss-key="${escapeHTML(perda.key)}" ${perda.desempregoMarcado ? "checked" : ""}>
        Houve desemprego involuntario/seguro-desemprego neste intervalo
        </label>
      </div>
    `).join("");
  }

  function buildSavedReportScript(nome, cpf, prisonDate, todayDate, state) {
    const payload = {
      id: state.id || "",
      nome: nome || "",
      cpf: cpf || "",
      prisonDate: prisonDate || "",
      todayDate: todayDate || state.todayDate || "",
      vinculos: state.vinculos || [],
      desempregoLosses: state.desempregoLosses || {}
    };

    return `
      <script>
        window.__CNIS_REPORT_STATE = ${safeScriptJSON(payload)};
        (() => {
          const REQUIRED_CARENCIA = 24;
          const CARENCIA_START_DATE = new Date(2019, 5, 18);
          const MINIMUM_WAGES = ${safeScriptJSON(MINIMUM_WAGES)};
          const state = window.__CNIS_REPORT_STATE;
          const reportBody = document.getElementById("reportBody");

          document.addEventListener("change", event => {
            const input = event.target?.closest?.("[data-loss-key]");
            if (!input) return;

            state.desempregoLosses[input.dataset.lossKey] = input.checked;
            render();
            parent.postMessage({ type: "CNIS_SAVED_REPORT_UPDATE", entry: buildEntry() }, "*");
          });

          function render() {
            const analysis = analyzeCNIS(state.vinculos || [], state.prisonDate, state.todayDate, state.desempregoLosses || {});
            reportBody.innerHTML = buildReportBodyHTML(state.nome, state.cpf, state.prisonDate, state.todayDate, analysis);
          }

          function buildEntry() {
            const analysis = analyzeCNIS(state.vinculos || [], state.prisonDate, state.todayDate, state.desempregoLosses || {});
            return {
              id: state.id,
              nome: state.nome,
              cpf: state.cpf,
              prisonDate: state.prisonDate,
              todayDate: state.todayDate,
              vinculos: state.vinculos,
              desempregoLosses: state.desempregoLosses,
              reportHTML: document.documentElement.outerHTML,
              summary: {
                direito: analysis.direito,
                carenciaOk: analysis.carenciaOk,
                mantemQualidade: analysis.mantemQualidade,
                retroactiveTotal: analysis.retroactiveValue?.total || 0,
                competenciasCarencia: analysis.competenciasCarencia,
                totalCompetencias: analysis.totalCompetencias,
                competenciasDesconsideradasAposPrisao: analysis.competenciasDesconsideradasAposPrisao,
                nonContributiveBenefitCompetencias: analysis.nonContributiveBenefitCompetencias,
                carenciaNecessaria: analysis.carenciaNecessaria,
                carenciaExigida: analysis.carenciaExigida,
                graceGaps: analysis.graceGaps
              }
            };
          }

          function analyzeCNIS(vinculos, prisonDateValue, todayDateValue, desempregoLosses) {
            const prisonDate = parseISODate(prisonDateValue);
            const todayDate = parseISODate(todayDateValue) || new Date();
            const retroactiveValue = calculateRetroactiveValue(prisonDate, todayDate);
            const rawOrdered = vinculos.map(normalizeVinculo).filter(Boolean).sort((a, b) => a.inicioDate - b.inicioDate);
            const orderedUntilPrison = capVinculosAtPrisonDate(rawOrdered, prisonDate);
            const contributionOrdered = rawOrdered.filter(vinculo => !isNonContributiveBenefitVinculo(vinculo));
            const contributionOrderedUntilPrison = orderedUntilPrison.filter(vinculo => !isNonContributiveBenefitVinculo(vinculo));
            const graceGaps = [];
            let lastCovered = null;
            let lastLossIndex = 0;
            let segmentStartIndex = 0;

            contributionOrderedUntilPrison.forEach((vinculo, index) => {
              if (!lastCovered) {
                lastCovered = vinculo.fimDate;
                return;
              }

              const baseQualidadeAte = getQualityEndDate(lastCovered);
              const segmentVinculos = contributionOrderedUntilPrison.slice(segmentStartIndex, index);
              const contribuicoesAtePerda = uniqueCompetencias(segmentVinculos.filter(v => !isIncapacityBenefitVinculo(v))).length;
              const automaticGraceMonths = contribuicoesAtePerda > 120 ? 12 : 0;
              const key = makeLossKey(lastCovered, vinculo.inicioDate);
              const desempregoGraceMonths = desempregoLosses?.[key] ? 12 : 0;
              const qualidadeAte = getQualityEndDate(lastCovered, automaticGraceMonths + desempregoGraceMonths);

              if (vinculo.inicioDate > baseQualidadeAte) {
                graceGaps.push({
                  key,
                  texto: formatMonthYear(lastCovered) + " ate " + formatMonthYear(vinculo.inicioDate),
                  perda: vinculo.inicioDate > qualidadeAte,
                  qualidadeAte,
                  contribuicoesAtePerda,
                  automaticGraceMonths,
                  desempregoGraceMonths,
                  desempregoMarcado: Boolean(desempregoLosses?.[key])
                });
              }

              if (vinculo.inicioDate > qualidadeAte) {
                lastLossIndex = index;
                segmentStartIndex = index;
              }

              if (vinculo.fimDate > lastCovered) lastCovered = vinculo.fimDate;
            });

            const afterLastLoss = contributionOrderedUntilPrison.slice(lastLossIndex);
            const afterLastLossCarencia = afterLastLoss.filter(vinculo => !isIncapacityBenefitVinculo(vinculo));
            let competenciasCarencia = uniqueCompetencias(afterLastLossCarencia).length;
            const totalCompetencias = uniqueCompetencias(contributionOrdered).length;
            const competenciasDesconsideradasAposPrisao = Math.max(0, totalCompetencias - uniqueCompetencias(contributionOrderedUntilPrison).length);
            const carenciaNecessaria = getRequiredCarencia(prisonDate);
            const carenciaExigida = carenciaNecessaria > 0;
            const lastContributionDate = contributionOrderedUntilPrison.reduce((latest, vinculo) => !latest || vinculo.fimDate > latest ? vinculo.fimDate : latest, null);
            const finalSegmentVinculos = contributionOrderedUntilPrison.slice(segmentStartIndex);
            const contribuicoesAteUltimaContribuicao = uniqueCompetencias(finalSegmentVinculos.filter(v => !isIncapacityBenefitVinculo(v))).length;
            const finalAutomaticGraceMonths = contribuicoesAteUltimaContribuicao > 120 ? 12 : 0;
            const finalLossKey = lastContributionDate && prisonDate ? makeLossKey(lastContributionDate, prisonDate) : "";
            const finalDesempregoGraceMonths = desempregoLosses?.[finalLossKey] ? 12 : 0;
            const baseFinalQualidadeAte = lastContributionDate ? getQualityEndDate(lastContributionDate, finalAutomaticGraceMonths) : null;
            const qualidadeAte = lastContributionDate ? getQualityEndDate(lastContributionDate, finalAutomaticGraceMonths + finalDesempregoGraceMonths) : null;
            const mantemQualidade = Boolean(prisonDate && qualidadeAte && prisonDate <= qualidadeAte);
            if (prisonDate && lastContributionDate && baseFinalQualidadeAte && prisonDate > baseFinalQualidadeAte) {
              graceGaps.push({
                key: finalLossKey,
                texto: formatMonthYear(lastContributionDate) + " ate " + formatMonthYear(prisonDate),
                perda: prisonDate > qualidadeAte,
                qualidadeAte,
                contribuicoesAtePerda: contribuicoesAteUltimaContribuicao,
                automaticGraceMonths: finalAutomaticGraceMonths,
                desempregoGraceMonths: finalDesempregoGraceMonths,
                desempregoMarcado: Boolean(desempregoLosses?.[finalLossKey]),
                final: true
              });
            }
            const houvePerdaFinalAntesDaPrisao = Boolean(prisonDate && qualidadeAte && prisonDate > qualidadeAte);
            if (houvePerdaFinalAntesDaPrisao) competenciasCarencia = 0;
            const carenciaOk = !carenciaExigida || competenciasCarencia >= carenciaNecessaria;

            return {
              vinculos: rawOrdered,
              perdas: graceGaps.filter(gap => gap.perda),
              graceGaps,
              totalCompetencias,
              competenciasDesconsideradasAposPrisao,
              nonContributiveBenefitCompetencias: uniqueCompetencias(rawOrdered.filter(isNonContributiveBenefitVinculo)).length,
              competenciasCarencia,
              carenciaNecessaria,
              carenciaExigida,
              carenciaOk,
              mantemQualidade,
              qualidadeAte,
              lastContributionDate,
              finalAutomaticGraceMonths,
              direito: carenciaOk && mantemQualidade,
              prisonDate,
              todayDate,
              retroactiveValue
            };
          }

          function buildReportBodyHTML(nome, cpf, prisonDate, todayDate, analysis) {
            const dateLabel = analysis.prisonDate ? formatDate(analysis.prisonDate) : "Nao informada";
            const qualidadeAte = analysis.qualidadeAte ? formatDate(analysis.qualidadeAte) : "Nao calculada";
            const lastContribution = analysis.lastContributionDate ? formatMonthYear(analysis.lastContributionDate) : "Nao localizada";
            const conclusionTone = analysis.direito ? "ok" : "fail";
            return \`
              <section class="hero">
                <span class="badge \${analysis.direito ? "badge-ok" : "badge-fail"}">\${analysis.direito ? "Direito indicado" : "Direito nao indicado"}</span>
                <h1>Relatorio de Previdencia Social</h1>
                <p>Analise de carencia, qualidade de segurado e perdas entre vinculos para prisao em \${escapeHTML(dateLabel)}.</p>
              </section>
              <section class="person">
                <div class="box"><span>Nome</span><strong>\${escapeHTML(nome || "Nao informado")}</strong></div>
                <div class="box"><span>CPF</span><strong>\${escapeHTML(cpf || "Nao informado")}</strong></div>
                <div class="box"><span>Data da prisao</span><strong>\${escapeHTML(formatISODate(prisonDate) || "Nao informada")}</strong></div>
                <div class="box"><span>Data de hoje</span><strong>\${escapeHTML(formatISODate(todayDate) || formatDate(analysis.todayDate))}</strong></div>
              </section>
              <section class="metrics">
                <div class="box"><span>Carencia</span><strong class="\${analysis.carenciaOk ? "ok" : "fail"}">\${escapeHTML(getCarenciaMetricValue(analysis))}</strong></div>
                <div class="box"><span>Qualidade</span><strong class="\${analysis.mantemQualidade ? "ok" : "fail"}">\${analysis.mantemQualidade ? "Mantida" : "Perdida"}</strong></div>
                <div class="box"><span>Ultima contrib.</span><strong>\${escapeHTML(lastContribution)}</strong></div>
                <div class="box"><span>Periodo de graca</span><strong>\${escapeHTML(qualidadeAte)}</strong></div>
              </section>
              <h2>1. Historico de vinculos e contribuicoes</h2>
              <table>
                <thead><tr><th>Vinculo</th><th>Tipo</th><th>Periodo</th><th>Competencias</th></tr></thead>
                <tbody>\${analysis.vinculos.map(v => \`<tr><td>\${escapeHTML(v.nome)}\${isOpenVinculo(v) ? "<br><small>Vinculo em aberto; considerado ate a data da prisao para esta analise, sujeito a comprovacao documental.</small>" : ""}\${isNonContributiveBenefitVinculo(v) ? "<br><small>Beneficio; nao conta como contribuicao.</small>" : ""}</td><td>\${escapeHTML(v.tipo)}</td><td>\${escapeHTML(v.inicio)} a \${escapeHTML(v.fim)}</td><td>\${renderCompetenciasCount(v, analysis.prisonDate)}</td></tr>\`).join("")}</tbody>
              </table>
              <p><b>Total geral reconhecido:</b> \${analysis.totalCompetencias} competencias.</p>
              \${renderPostPrisonCompetenceNote(analysis)}
              \${renderNonContributiveBenefitNote(analysis)}
              <h2>2. Perda da qualidade de segurado</h2>
              \${renderDocumentPerdas(analysis)}
              <h2>3. Carencia apos a ultima perda</h2>
              \${renderCarenciaStatus(analysis)}
              \${renderCarenciaLawNote(analysis)}
              <h2>4. Condicao de segurado na prisao</h2>
              <p class="\${analysis.mantemQualidade ? "ok" : "fail"}">Ultima contribuicao em \${escapeHTML(lastContribution)}. Periodo de graca ate \${escapeHTML(qualidadeAte)}\${analysis.finalAutomaticGraceMonths ? " com prorrogacao automatica de 12 meses por mais de 120 contribuicoes." : "."}</p>
              \${renderRetroactiveValue(analysis)}
              <h2>5. Conclusao</h2>
              <div class="conclusion \${conclusionTone}">\${renderFinalConclusion(analysis, dateLabel)}</div>
            \`;
          }

          function renderDocumentPerdas(analysis) {
            const gaps = analysis.graceGaps || analysis.perdas || [];
            if (!gaps.length) return '<p class="ok">Nao houve perda da qualidade dentro dos vinculos capturados.</p>';
            return gaps.map(perda => \`
              <div class="loss \${perda.perda ? "" : "resolved"}">
                <b>\${perda.perda ? "Perda identificada" : "Perda afastada"}:</b> \${escapeHTML(perda.texto)}
                <small>Periodo de graca ate \${escapeHTML(perda.qualidadeAte ? formatDate(perda.qualidadeAte) : "Nao calculado")}\${perda.automaticGraceMonths ? \` (+\${perda.automaticGraceMonths} meses por mais de 120 contribuicoes)\` : ""}\${perda.desempregoGraceMonths ? \` (+\${perda.desempregoGraceMonths} meses por seguro-desemprego)\` : ""}.</small>
                \${perda.automaticGraceMonths ? \`<small>Foram identificadas \${perda.contribuicoesAtePerda} contribuicoes ate esse ponto; a prorrogacao de 12 meses foi aplicada automaticamente.</small>\` : ""}
                <label class="loss-check">
                  <input type="checkbox" data-loss-key="\${escapeHTML(perda.key)}" \${perda.desempregoMarcado ? "checked" : ""}>
                  Houve desemprego involuntario/seguro-desemprego neste intervalo
                </label>
              </div>
            \`).join("");
          }

          function normalizeVinculo(vinculo) {
            const inicioDate = parseAnyDate(vinculo.inicioDate) || parseBRDate(vinculo.inicio);
            const fimDate = parseAnyDate(vinculo.fimDate) || parseBRDate(vinculo.fim);
            if (!inicioDate || !fimDate) return null;
            return { ...vinculo, inicioDate, fimDate, competencias: Array.isArray(vinculo.competencias) ? vinculo.competencias : listCompetencias(inicioDate, fimDate) };
          }
          function capVinculosAtPrisonDate(vinculos, prisonDate) { if (!prisonDate) return vinculos; return vinculos.map(v => { if (v.inicioDate > prisonDate) return null; const fimDate = v.fimDate > prisonDate ? prisonDate : v.fimDate; return { ...v, fimDate, fim: v.fimDate > prisonDate ? formatDate(prisonDate) : v.fim, competencias: listCompetencias(v.inicioDate, fimDate) }; }).filter(Boolean); }
          function uniqueCompetencias(vinculos) { return Array.from(new Set(vinculos.flatMap(v => v.competencias || []))).sort(); }
          function getRecognizedCompetenciasCount(v, limitDate = null) { if (isNonContributiveBenefitVinculo(v)) return 0; if (!limitDate || !v?.inicioDate || !v?.fimDate) return v.competencias?.length || 0; const fimDate = v.fimDate > limitDate ? limitDate : v.fimDate; return fimDate < v.inicioDate ? 0 : listCompetencias(v.inicioDate, fimDate).length; }
          function renderCompetenciasCount(v, limitDate = null) { const total = v.competencias?.length || 0; const recognized = getRecognizedCompetenciasCount(v, limitDate); if (!limitDate || isNonContributiveBenefitVinculo(v) || recognized === total) return String(recognized); if (recognized === 0 && v.inicioDate > limitDate) return total + '<br><small>fora da carencia</small>'; return total + '<br><small>' + recognized + ' ate a prisao</small>'; }
          function isOpenVinculo(v) { return Boolean(v?.emAberto) || normalizeForCompare(v?.fim) === "em aberto"; }
          function isIncapacityBenefitVinculo(v) { const text = normalizeForCompare((v?.nome || "") + " " + (v?.tipo || "")); return /(?:^|\\s)(31|91)\\s*-/.test(text) || text.includes("auxilio doenca") || text.includes("auxilio por incapacidade") || text.includes("beneficio por incapacidade") || text.includes("incapacidade temporaria"); }
          function isNonContributiveBenefitVinculo(v) { const text = normalizeForCompare((v?.nome || "") + " " + (v?.tipo || "")).replace(/[-_/]+/g, " "); return /(?:^|\\s)21\\s/.test(text) || /(?:^|\\s)25\\s/.test(text) || /(?:^|\\s)87\\s/.test(text) || text.includes("pensao por morte") || text.includes("auxilio reclusao") || text.includes("amparo social") || text.includes("pessoa portadora de deficiencia") || text.includes("pessoa com deficiencia") || text.includes("bpc") || text.includes("loas"); }
          function getRequiredCarencia(date) { return date && date < CARENCIA_START_DATE ? 0 : REQUIRED_CARENCIA; }
          function getQualityEndDate(date, extraMonths = 0) { return new Date(date.getFullYear(), date.getMonth() + 13 + extraMonths, 15); }
          function makeLossKey(a, b) { return formatISODateFromDate(a) + "__" + formatISODateFromDate(b); }
          function listCompetencias(start, end) { const out = []; const cursor = new Date(start.getFullYear(), start.getMonth(), 1); const last = new Date(end.getFullYear(), end.getMonth(), 1); while (cursor <= last) { out.push(cursor.getFullYear() + "-" + String(cursor.getMonth() + 1).padStart(2, "0")); cursor.setMonth(cursor.getMonth() + 1); } return out; }
          function calculateRetroactiveValue(prisonDate, todayDate) { if (!prisonDate || !todayDate) return null; const start = new Date(prisonDate.getFullYear(), prisonDate.getMonth(), 1); const end = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1); if (end < start) return { total: 0, months: 0, startLabel: formatMonthYear(start), endLabel: formatMonthYear(end), breakdown: [], missingYears: [] }; const byYear = new Map(); const missingYears = new Set(); const cursor = new Date(start); let total = 0; let months = 0; while (cursor <= end) { const year = cursor.getFullYear(); months += 1; const minimumWage = MINIMUM_WAGES[year]; if (minimumWage) { const current = byYear.get(year) || { year, months: 0, minimumWage, subtotal: 0 }; current.months += 1; current.subtotal += minimumWage; byYear.set(year, current); total += minimumWage; } else { missingYears.add(year); } cursor.setMonth(cursor.getMonth() + 1); } return { total, months, startLabel: formatMonthYear(start), endLabel: formatMonthYear(end), breakdown: Array.from(byYear.values()), missingYears: Array.from(missingYears) }; }
          function parseAnyDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; }
          function parseBRDate(value) { const m = String(value || "").match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/); return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null; }
          function parseISODate(value) { const m = String(value || "").match(/^(\\d{4})-(\\d{2})-(\\d{2})$/); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; }
          function formatDate(date) { return String(date.getDate()).padStart(2, "0") + "/" + String(date.getMonth() + 1).padStart(2, "0") + "/" + date.getFullYear(); }
          function formatISODate(value) { const date = parseISODate(value); return date ? formatDate(date) : ""; }
          function formatISODateFromDate(date) { return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0"); }
          function formatMonthYear(date) { return String(date.getMonth() + 1).padStart(2, "0") + "/" + date.getFullYear(); }
          function formatCurrencyBRL(value) { return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
          function getCarenciaMetricValue(a) { return a.carenciaExigida ? a.competenciasCarencia + "/" + a.carenciaNecessaria : "Dispensada"; }
          function renderRetroactiveValue(a) { if (!a.direito || !a.retroactiveValue?.total) return ""; const r = a.retroactiveValue; const rows = r.breakdown.map(item => '<tr><td>' + item.year + '</td><td>' + item.months + '</td><td>' + formatCurrencyBRL(item.minimumWage) + '</td><td>' + formatCurrencyBRL(item.subtotal) + '</td></tr>').join(""); const missingNote = r.missingYears.length ? '<p class="benefit-note">Observacao: nao ha salario minimo cadastrado para ' + r.missingYears.join(", ") + '; essas competencias nao entraram no calculo.</p>' : ""; return '<div class="retroactive-card"><h4>Valor da causa previsto - retroativos</h4><p>Periodo calculado de ' + escapeHTML(r.startLabel) + ' ate ' + escapeHTML(r.endLabel) + ', totalizando ' + r.months + ' competencia(s), com base no salario minimo vigente em cada ano.</p><strong>' + formatCurrencyBRL(r.total) + '</strong><table class="retroactive-table"><thead><tr><th>Ano</th><th>Meses</th><th>Salario minimo</th><th>Subtotal</th></tr></thead><tbody>' + rows + '</tbody></table>' + missingNote + '</div>'; }
          function renderPostPrisonCompetenceNote(a) { if (!a.competenciasDesconsideradasAposPrisao) return ""; return '<p class="benefit-note">Observacao: ' + a.competenciasDesconsideradasAposPrisao + ' competencia(s) posterior(es) a data da prisao aparecem no historico, mas foram desconsideradas para a carencia do auxilio-reclusao.</p>'; }
          function renderNonContributiveBenefitNote(a) { if (!a.nonContributiveBenefitCompetencias) return ""; return '<p class="benefit-note">Observacao: ' + a.nonContributiveBenefitCompetencias + ' competencia(s) de pensao por morte, beneficio assistencial ou outro beneficio nao contributivo foram identificadas como beneficio, nao como contribuicao propria. Elas nao entram na carencia, no tempo de contribuicao, na ultima contribuicao nem no periodo de graca.</p>'; }
          function renderCarenciaStatus(a) { if (!a.carenciaExigida) return '<p class="ok">Carencia nao exigida para a data da prisao. Foram identificadas ' + a.competenciasCarencia + ' competencia(s) apos a ultima perda, mas esse requisito nao se aplica ao caso.</p>'; return '<p class="' + (a.carenciaOk ? "ok" : "fail") + '">' + (a.carenciaOk ? "Cumpre" : "Nao cumpre") + ' a carencia minima: ' + a.competenciasCarencia + ' de ' + a.carenciaNecessaria + ' contribuicoes.</p>'; }
          function renderCarenciaLawNote(a) { let t = "Data da prisao nao informada; por cautela, foi considerada a carencia de 24 contribuicoes mensais."; if (a.prisonDate && !a.carenciaExigida) t = "Como a prisao e anterior a 18/06/2019, a carencia nao e exigida neste caso."; else if (a.prisonDate) t = "Como a prisao e em 18/06/2019 ou posterior, aplica-se a carencia de 24 contribuicoes mensais."; return '<p class="legal-note">Observacao: para auxilio-reclusao, a carencia de 24 contribuicoes mensais foi introduzida pela Lei n. 13.846/2019, publicada em 18/06/2019. Prisoes anteriores a essa data nao exigem carencia; prisoes a partir de 18/06/2019 exigem 24 contribuicoes mensais. ' + t + '</p>'; }
          function renderFinalConclusion(a, dateLabel) { if (a.direito) return a.carenciaExigida ? 'Neste caso, ha indicacao de direito ao auxilio-reclusao em ' + escapeHTML(dateLabel) + ', pois a carencia foi cumprida e a qualidade de segurado estava mantida.' : 'Neste caso, ha indicacao de direito ao auxilio-reclusao em ' + escapeHTML(dateLabel) + ', pois a carencia nao era exigida na data da prisao e a qualidade de segurado estava mantida.'; return 'Neste caso, nao ha indicacao de direito ao auxilio-reclusao em ' + escapeHTML(dateLabel) + ', pelos criterios analisados acima.'; }
          function normalizeForCompare(value) { return String(value || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().trim(); }
          function escapeHTML(value) { return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
        })();
      </script>
    `;
  }

  function safeScriptJSON(value) {
    return JSON.stringify(value)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  function reportBaseCSS() {
    return `
      .hero { padding: 18px; color: #fff; background: #172033; border-radius: 8px; }
      .hero h1 { margin: 0 0 6px; font-size: 21px; }
      .hero p { margin: 0; line-height: 1.45; }
      .badge { display: inline-block; margin-bottom: 10px; padding: 5px 9px; color: #111827; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
      .badge-ok { background: #86efac; }
      .badge-fail { background: #fda4af; }
      .person { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
      .box { padding: 10px; background: #f8fafc; border: 1px solid #d9e2ec; border-radius: 7px; }
      .box span { display: block; margin-bottom: 4px; color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase; }
      .box strong { font-size: 13px; }
      .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 18px; }
      h2 { margin: 18px 0 8px; padding-bottom: 6px; border-bottom: 2px solid #d9e2ec; color: #172033; font-size: 15px; }
      table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      th { color: #475569; background: #f1f5f9; font-size: 10px; text-transform: uppercase; }
      th, td { padding: 7px; border: 1px solid #d9e2ec; text-align: left; vertical-align: top; }
      td:last-child, th:last-child { text-align: center; width: 70px; }
      .ok { color: #166534; font-weight: 700; }
      .fail { color: #991b1b; font-weight: 700; }
      .loss { margin: 6px 0; padding: 8px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; }
      .loss.resolved { background: #f0fdf4; border-color: #bbf7d0; }
      .loss small { display: block; margin-top: 5px; color: #64748b; line-height: 1.4; }
      .loss-check { display: flex; align-items: center; gap: 6px; margin-top: 8px; color: #172033; font-weight: 700; }
      .loss-check input { width: 14px; height: 14px; }
      .concomitance-note { margin: 8px 0 0; padding: 8px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; line-height: 1.45; }
      .benefit-note { margin: 8px 0 0; padding: 8px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; line-height: 1.45; }
      .legal-note { margin: 8px 0 0; padding: 8px; color: #155e75; background: #ecfeff; border: 1px solid #a5f3fc; border-radius: 6px; line-height: 1.45; }
      .retroactive-card { margin: 14px 0; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 5px solid #22c55e; border-radius: 7px; }
      .retroactive-card h4 { margin: 0 0 6px; color: #14532d; font-size: 14px; }
      .retroactive-card p { margin: 0 0 8px; color: #172033; line-height: 1.45; }
      .retroactive-card > strong { display: block; margin: 8px 0; color: #166534; font-size: 20px; }
      .retroactive-table { width: 100%; margin-top: 8px; border-collapse: collapse; }
      .retroactive-table th, .retroactive-table td { padding: 6px; border: 1px solid #bbf7d0; text-align: left; }
      .retroactive-table th { color: #14532d; background: #dcfce7; font-size: 10px; text-transform: uppercase; }
      .conclusion { margin-top: 12px; padding: 12px; border-left-width: 5px; border-left-style: solid; border-radius: 7px; font-size: 13px; line-height: 1.45; }
      .conclusion.ok { background: #f0fdf4; border-color: #bbf7d0; border-left-color: #22c55e; }
      .conclusion.fail { background: #fff1f2; border-color: #fecdd3; border-left-color: #f43f5e; }
    `;
  }

  function downloadReport(nome, cpf, prisonDate, analysis) {
    const todayDate = currentReportContext?.todayDate || formatISODateFromDate(analysis.todayDate || new Date());
    const html = buildReportHTML(nome, cpf, prisonDate, todayDate, analysis);

    const printWindow = window.open("", "_blank", "width=900,height=700");
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function dedupeVinculos(vinculos) {
    const seen = new Set();
    return vinculos.filter(vinculo => {
      const key = `${vinculo.nome}|${vinculo.tipo}|${vinculo.inicio}|${vinculo.fim}`.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function uniqueCompetencias(vinculos) {
    return Array.from(new Set(vinculos.flatMap(vinculo => vinculo.competencias))).sort();
  }

  function countContribuicoes(vinculos) {
    return vinculos.reduce((total, vinculo) => total + vinculo.competencias.length, 0);
  }

  function getRecognizedCompetenciasCount(vinculo, limitDate = null) {
    if (isNonContributiveBenefitVinculo(vinculo)) return 0;
    if (!limitDate || !vinculo?.inicioDate || !vinculo?.fimDate) return vinculo.competencias?.length || 0;

    const fimDate = vinculo.fimDate > limitDate ? limitDate : vinculo.fimDate;
    if (fimDate < vinculo.inicioDate) return 0;
    return listCompetencias(vinculo.inicioDate, fimDate).length;
  }

  function renderCompetenciasCount(vinculo, limitDate = null) {
    const total = vinculo.competencias?.length || 0;
    const recognized = getRecognizedCompetenciasCount(vinculo, limitDate);

    if (!limitDate || isNonContributiveBenefitVinculo(vinculo) || recognized === total) {
      return String(recognized);
    }

    if (recognized === 0 && vinculo.inicioDate > limitDate) {
      return `${total}<small>fora da carencia</small>`;
    }

    return `${total}<small>${recognized} ate a prisao</small>`;
  }

  function isIncapacityBenefitVinculo(vinculo) {
    const text = normalizeForCompare(`${vinculo?.nome || ""} ${vinculo?.tipo || ""}`);
    return /(?:^|\s)(31|91)\s*-/.test(text)
      || text.includes("auxilio doenca")
      || text.includes("auxilio por incapacidade")
      || text.includes("beneficio por incapacidade")
      || text.includes("incapacidade temporaria");
  }

  function isOpenVinculo(vinculo) {
    return Boolean(vinculo?.emAberto) || normalizeForCompare(vinculo?.fim) === "em aberto";
  }

  function capVinculosAtPrisonDate(vinculos, prisonDate) {
    if (!prisonDate) return vinculos;

    return vinculos.map(vinculo => {
      if (vinculo.inicioDate > prisonDate) return null;

      const fimDate = vinculo.fimDate > prisonDate ? prisonDate : vinculo.fimDate;
      return {
        ...vinculo,
        fimDate,
        fim: vinculo.fimDate > prisonDate ? formatDate(prisonDate) : vinculo.fim,
        competencias: listCompetencias(vinculo.inicioDate, fimDate)
      };
    }).filter(Boolean);
  }

  function isNonContributiveBenefitVinculo(vinculo) {
    const text = normalizeForCompare(`${vinculo?.nome || ""} ${vinculo?.tipo || ""}`).replace(/[-_/]+/g, " ");
    return /(?:^|\s)21\s/.test(text)
      || /(?:^|\s)25\s/.test(text)
      || /(?:^|\s)87\s/.test(text)
      || text.includes("pensao por morte")
      || text.includes("auxilio reclusao")
      || text.includes("amparo social")
      || text.includes("pessoa portadora de deficiencia")
      || text.includes("pessoa com deficiencia")
      || text.includes("bpc")
      || text.includes("loas");
  }

  function getRequiredCarencia(prisonDate) {
    if (prisonDate && prisonDate < CARENCIA_START_DATE) return 0;
    return REQUIRED_CARENCIA;
  }

  function listCompetencias(start, end) {
    const competencias = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);

    while (cursor <= last) {
      competencias.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return competencias;
  }

  function calculateRetroactiveValue(prisonDate, todayDate) {
    if (!prisonDate || !todayDate) return null;

    const start = new Date(prisonDate.getFullYear(), prisonDate.getMonth(), 1);
    const end = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
    if (end < start) {
      return {
        total: 0,
        months: 0,
        startLabel: formatMonthYear(start),
        endLabel: formatMonthYear(end),
        breakdown: [],
        missingYears: []
      };
    }

    const byYear = new Map();
    const missingYears = new Set();
    const cursor = new Date(start);
    let total = 0;
    let months = 0;

    while (cursor <= end) {
      const year = cursor.getFullYear();
      months += 1;
      const minimumWage = MINIMUM_WAGES[year];
      if (minimumWage) {
        const current = byYear.get(year) || { year, months: 0, minimumWage, subtotal: 0 };
        current.months += 1;
        current.subtotal += minimumWage;
        byYear.set(year, current);
        total += minimumWage;
      } else {
        missingYears.add(year);
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return {
      total,
      months,
      startLabel: formatMonthYear(start),
      endLabel: formatMonthYear(end),
      breakdown: Array.from(byYear.values()),
      missingYears: Array.from(missingYears)
    };
  }

  function getTodayDateValue() {
    const input = document.getElementById("todayDate");
    if (input && !input.value) input.value = formatISODateFromDate(new Date());
    return input?.value || formatISODateFromDate(new Date());
  }

  function getTodayDate() {
    const value = getTodayDateValue();
    return parseISODate(value) || new Date();
  }

  function formatCurrencyBRL(value) {
    return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function getOpenVinculoEndDate() {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  function makeLossKey(lastContributionDate, nextContributionDate) {
    return `${formatISODateFromDate(lastContributionDate)}__${formatISODateFromDate(nextContributionDate)}`;
  }

  function getQualityEndDate(lastContributionDate, extraMonths = 0) {
    return new Date(lastContributionDate.getFullYear(), lastContributionDate.getMonth() + 13 + extraMonths, 15);
  }

  function cleanText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  }

  function cleanCompanyName(value) {
    return cleanText(value)
      .replace(/^\d{1,3}\s*[-.)]\s+(?!\d)/, "")
      .replace(/^\d+\s+(?=\d{2,3}[.\s])/, "")
      .replace(/\bAcoes\b/gi, "")
      .replace(/\bAções\b/gi, "")
      .replace(/\bIndicadores?\b/gi, "")
      .replace(/\bSeq\.?\b/gi, "")
      .replace(/\bOrigem do Vinculo\b/gi, "")
      .replace(/\bOrigem do Vínculo\b/gi, "")
      .replace(/\bData Inicio\b/gi, "")
      .replace(/\bData Fim\b/gi, "")
      .replace(/\bUlt\.?\s*Remun\.?\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .slice(0, 120)
      .trim();
  }

  function isGarbageLine(line) {
    const normalized = normalizeForCompare(line);
    return normalized === "acoes"
      || normalized === "acao"
      || normalized.includes("origem do vinculo")
      || normalized.includes("data inicio")
      || normalized.includes("data fim")
      || normalized.includes("ult. remun")
      || normalized.includes("indicadores")
      || /periodo:\s*a preencher|período:\s*a preencher|lote\d|^salvar$|competencia inicial|competência inicial/i.test(line);
  }

  function looksLikeCompanyName(line) {
    if (hasDate(line) || isTipoVinculo(line) || isGarbageLine(line)) return false;
    if (line.length < 4 || line.length > 160) return false;
    return /[A-Za-zÀ-ÿ]{3,}/.test(line);
  }

  function isTipoVinculo(line) {
    const normalized = normalizeForCompare(line).replace(/\.+$/g, "");
    return TIPOS_VINCULO.some(tipo => {
      const normalizedTipo = normalizeForCompare(tipo);
      return normalized === normalizedTipo
        || normalized.includes(normalizedTipo)
        || (normalized.length >= 8 && normalizedTipo.startsWith(normalized));
    });
  }

  function findTipoVinculoLabel(value) {
    const normalized = normalizeForCompare(value);
    return TIPOS_VINCULO.find(tipo => normalized.includes(normalizeForCompare(tipo))) || "";
  }

  function normalizeForCompare(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function hasDate(value) {
    return /\b\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})\b/.test(value);
  }

  function extractDates(value) {
    BR_DATE_PATTERN.lastIndex = 0;
    return (value.match(BR_DATE_PATTERN) || []).map(normalizeBRDate).filter(Boolean);
  }

  function normalizeBRDate(value) {
    const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!match) return null;
    const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
    return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${year}`;
  }

  function parseBRDate(value) {
    const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  function parseISODate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function formatDate(date) {
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  }

  function formatISODate(value) {
    const date = parseISODate(value);
    return date ? formatDate(date) : "";
  }

  function formatISODateFromDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function formatMonthYear(date) {
    return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  }

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function closeSidebar(sidebar) {
    setAutomationRunning(false);
    automationActive = false;
    automationActiveSince = 0;
    if (automationPoller) {
      window.clearInterval(automationPoller);
      automationPoller = null;
    }
    document.body.style.marginRight = document.body.getAttribute(PAGE_MARGIN_ATTR) || "";
    document.body.style.width = "";
    document.body.style.maxWidth = "";
    document.body.style.overflowX = "";
    delete document.body.dataset.cnisSidebarOpen;
    document.body.removeAttribute(PAGE_MARGIN_ATTR);
    sidebar.remove();
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "CNIS_TOGGLE_SIDEBAR") {
      toggleSidebar();
    }

    if (message?.type === "CNIS_RESUME_AUTOMATION") {
      resumeAutomationIfNeeded();
    }

    if (message?.type === "CNIS_FORCE_RESUME_AUTOMATION") {
      applyRunnerFormData(message.data || {});
      setAutomationStatus("Continuando automacao apos troca de tela...", "neutral");
      resumeAutomationIfNeeded();
    }
  });

  window.setTimeout(() => {
    safeStorageGet({ [AUTOMATION_STATE_KEY]: {} }).then(result => {
      const state = result[AUTOMATION_STATE_KEY] || {};
      if (state.running && isAutomationStateForThisPage(state)) {
        createSidebar();
        keepSidebarOpen = true;
        setAutomationStatus("Retomando automacao...", "neutral");
        resumeAutomationIfNeeded();
      }
    });
  }, 900);
})();
