const HISTORY_KEY = "cnisHistoryV2";

const list = document.getElementById("list");
const subtitle = document.getElementById("subtitle");
const refreshBtn = document.getElementById("refreshBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const clearBtn = document.getElementById("clearBtn");
const statusFilter = document.getElementById("statusFilter");
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

refreshBtn.addEventListener("click", render);
downloadAllBtn.addEventListener("click", downloadAll);
clearBtn.addEventListener("click", clearHistory);
statusFilter.addEventListener("change", render);
window.addEventListener("message", handleSavedReportMessage);

render();

async function handleSavedReportMessage(event) {
  if (event.data?.type !== "CNIS_SAVED_REPORT_UPDATE" || !event.data.entry?.id) return;

  const history = await getHistory();
  const index = history.findIndex(entry => entry.id === event.data.entry.id);
  if (index < 0) return;

  history[index] = {
    ...history[index],
    ...event.data.entry,
    updatedAt: new Date().toISOString()
  };

  await setHistory(history);
  updateRenderedItemStatus(event.data.entry.id, history[index]);
}

function updateRenderedItemStatus(id, entry) {
  if (!id) return;
  const item = document.querySelector(`[data-history-id="${CSS.escape(id)}"]`);
  if (!item) {
    render();
    return;
  }

  const badge = item.querySelector(".right-badge");
  if (!badge) return;

  const direito = getEntryDireito(entry);
  const badgeClass = direito === true ? "ok" : direito === false ? "fail" : "unknown";
  badge.className = `right-badge ${badgeClass}`;
  badge.textContent = direito === true ? "Qualificado" : direito === false ? "Desqualificado" : "Nao informado";

  if (!entryMatchesCurrentFilter(entry)) render();
}

async function getHistory() {
  const result = await chrome.storage.local.get({ [HISTORY_KEY]: [] });
  return Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
}

async function setHistory(history) {
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

async function render() {
  const history = await getHistory();
  const filteredHistory = filterHistoryByStatus(history);
  subtitle.textContent = getSubtitleText(history.length, filteredHistory.length);
  list.innerHTML = "";

  if (!history.length) {
    list.innerHTML = `<div class="empty">Nenhum relatorio salvo ainda.</div>`;
    return;
  }

  if (!filteredHistory.length) {
    list.innerHTML = `<div class="empty">Nenhum relatorio encontrado para este filtro.</div>`;
    return;
  }

  filteredHistory.forEach(({ entry, index }) => {
    const item = document.createElement("article");
    const direito = getEntryDireito(entry);
    const badgeClass = direito === true ? "ok" : direito === false ? "fail" : "unknown";
    const badgeText = direito === true ? "Qualificado" : direito === false ? "Desqualificado" : "Nao informado";
    item.className = "item";
    if (entry.id) item.dataset.historyId = entry.id;
    item.innerHTML = `
      <div>
        <h2>${escapeHTML(entry.nome || "Sem nome")}</h2>
        <p>${escapeHTML(entry.cpf || "Sem CPF")} - Prisao: ${escapeHTML(formatISODate(entry.prisonDate) || "Sem data")} - Hoje: ${escapeHTML(formatISODate(entry.todayDate) || "Atual")}</p>
      </div>
      <span class="right-badge ${badgeClass}">${badgeText}</span>
      <div class="actions">
        <button type="button" data-action="view">Ver</button>
        <button type="button" data-action="download">Baixar</button>
        <button class="danger" type="button" data-action="delete">Excluir</button>
      </div>
    `;

    const frame = document.createElement("iframe");
    frame.srcdoc = getEntryReportHTML(entry);
    frame.addEventListener("load", () => bindFrameReportControls(frame, entry, index));

    item.querySelector('[data-action="view"]').addEventListener("click", () => {
      frame.classList.toggle("open");
      bindFrameReportControls(frame, entry, index);
    });

    item.querySelector('[data-action="download"]').addEventListener("click", () => {
      downloadEntry(entry, index);
    });

    item.querySelector('[data-action="delete"]').addEventListener("click", () => {
      deleteEntry(index);
    });

    list.appendChild(item);
    list.appendChild(frame);
  });
}

function filterHistoryByStatus(history) {
  return history
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entryMatchesCurrentFilter(entry));
}

function entryMatchesCurrentFilter(entry) {
  const selected = statusFilter.value;
  if (selected === "qualified") return getEntryDireito(entry) === true;
  if (selected === "disqualified") return getEntryDireito(entry) === false;
  return true;
}

function getSubtitleText(total, visible) {
  if (statusFilter.value === "all") return `${total} relatorio(s) salvo(s).`;
  return `${visible} de ${total} relatorio(s) exibido(s).`;
}

async function downloadAll() {
  const history = await getHistory();
  history.forEach((entry, index) => downloadEntry(entry, index));
}

async function clearHistory() {
  if (!confirm("Limpar todos os relatorios salvos?")) return;
  await setHistory([]);
  render();
}

async function deleteEntry(index) {
  const history = await getHistory();
  const entry = history[index];
  const name = entry?.nome || "este relatorio";
  if (!confirm(`Excluir ${name} do historico?`)) return;

  history.splice(index, 1);
  await setHistory(history);
  render();
}

function bindFrameReportControls(frame, entry, index) {
  const doc = frame.contentDocument;
  if (!doc || doc.documentElement.dataset.cnisHistoryBound === "true") return;

  doc.documentElement.dataset.cnisHistoryBound = "true";
  doc.addEventListener("change", event => {
    const input = event.target?.closest?.("[data-loss-key]");
    if (!input) return;

    updateReportFromHistoryCheckbox(frame, entry, index, input.dataset.lossKey, input.checked);
  });
}

async function updateReportFromHistoryCheckbox(frame, entry, index, lossKey, checked) {
  entry.desempregoLosses = {
    ...(entry.desempregoLosses || entry.summary?.desempregoLosses || {}),
    [lossKey]: checked
  };

  const analysis = analyzeCNIS(entry.vinculos || [], entry.prisonDate, entry.todayDate, entry.desempregoLosses);
  entry.summary = buildSummary(analysis, entry.desempregoLosses);
  entry.reportHTML = buildReportHTML(entry, analysis);
  entry.updatedAt = new Date().toISOString();

  const history = await getHistory();
  const currentIndex = entry.id ? history.findIndex(item => item.id === entry.id) : index;
  if (currentIndex >= 0 && currentIndex < history.length) {
    history[currentIndex] = { ...history[currentIndex], ...entry };
    await setHistory(history);
  }

  updateRenderedItemStatus(entry.id, entry);
  frame.srcdoc = entry.reportHTML;
}

function downloadEntry(entry, index) {
  const html = getEntryReportHTML(entry);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${makeReportFilename(entry, index)}.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function getEntryReportHTML(entry) {
  if (Array.isArray(entry.vinculos) && entry.vinculos.length) {
    const desempregoLosses = entry.desempregoLosses || entry.summary?.desempregoLosses || {};
    return buildReportHTML(entry, analyzeCNIS(entry.vinculos, entry.prisonDate, entry.todayDate, desempregoLosses));
  }

  return entry.reportHTML || buildFallbackHTML(entry);
}

function makeReportFilename(entry, index) {
  const date = sanitizeFilename(formatISODate(entry.prisonDate) || "sem-data");
  const cpf = String(entry.cpf || "").replace(/\D/g, "") || `sem-cpf-${index + 1}`;
  const name = sanitizeFilename(entry.nome || "sem-nome").slice(0, 60);
  return `${date}_${cpf}_${name}`;
}

function buildReportHTML(entry, analysis) {
  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Relatorio CNIS</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; color: #172033; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
          main { padding: 0; }
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
          th { color: #475569; background: #f1f5f9; font-size: 10px; text-transform: uppercase; }
          th, td { padding: 7px; border: 1px solid #d9e2ec; text-align: left; vertical-align: top; }
          td:last-child, th:last-child { text-align: center; width: 70px; }
          .ok { color: #166534; font-weight: 700; }
          .fail { color: #991b1b; font-weight: 700; }
          .loss { margin: 6px 0; padding: 8px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; }
          .loss.resolved { background: #f0fdf4; border-color: #bbf7d0; }
          .loss small { display: block; margin-top: 5px; color: #64748b; line-height: 1.4; }
          .loss-check { display: flex; align-items: center; gap: 8px; margin-top: 8px; color: #172033; font-weight: 700; }
          .loss-check input { width: 16px; height: 16px; }
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
        </style>
      </head>
      <body><main>${buildReportBodyHTML(entry, analysis)}</main></body>
    </html>
  `;
}

function buildReportBodyHTML(entry, analysis) {
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
      <div class="box"><span>Nome</span><strong>${escapeHTML(entry.nome || "Nao informado")}</strong></div>
      <div class="box"><span>CPF</span><strong>${escapeHTML(entry.cpf || "Nao informado")}</strong></div>
      <div class="box"><span>Data da prisao</span><strong>${escapeHTML(formatISODate(entry.prisonDate) || "Nao informada")}</strong></div>
      <div class="box"><span>Data de hoje</span><strong>${escapeHTML(formatISODate(entry.todayDate) || formatDate(analysis.todayDate))}</strong></div>
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
  if (!gaps.length) return `<p class="ok">Nao houve perda da qualidade dentro dos vinculos capturados.</p>`;

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

function buildFallbackHTML(entry) {
  return `
    <!doctype html>
    <html lang="pt-BR">
      <head><meta charset="utf-8"><title>Relatorio CNIS</title></head>
      <body>
        <h1>Relatorio CNIS</h1>
        <p><b>Nome:</b> ${escapeHTML(entry.nome || "Sem nome")}</p>
        <p><b>CPF:</b> ${escapeHTML(entry.cpf || "Sem CPF")}</p>
        <p><b>Data da prisao:</b> ${escapeHTML(formatISODate(entry.prisonDate) || "Sem data")}</p>
        <p><b>Data de hoje:</b> ${escapeHTML(formatISODate(entry.todayDate) || "Sem data")}</p>
        <pre>${escapeHTML(JSON.stringify(entry, null, 2))}</pre>
      </body>
    </html>
  `;
}

function analyzeCNIS(vinculos, prisonDateValue, todayDateValue, desempregoLosses = {}) {
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
        texto: `${formatMonthYear(lastCovered)} ate ${formatMonthYear(vinculo.inicioDate)}`,
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
  const totalContribuicoesLancadas = countContribuicoes(contributionOrdered);
  const totalCompetencias = uniqueCompetencias(contributionOrdered).length;
  const competenciasDesconsideradasAposPrisao = Math.max(0, totalCompetencias - uniqueCompetencias(contributionOrderedUntilPrison).length);
  const totalConcomitantes = totalContribuicoesLancadas - totalCompetencias;
  let competenciasCarencia = uniqueCompetencias(afterLastLossCarencia).length;
  let contribuicoesCarenciaLancadas = countContribuicoes(afterLastLossCarencia);
  let concomitantesCarencia = contribuicoesCarenciaLancadas - competenciasCarencia;
  const incapacityBenefitCompetencias = uniqueCompetencias(rawOrdered.filter(isIncapacityBenefitVinculo)).length;
  let incapacityBenefitCompetenciasCarencia = uniqueCompetencias(afterLastLoss.filter(isIncapacityBenefitVinculo)).length;
  const nonContributiveBenefitCompetencias = uniqueCompetencias(rawOrdered.filter(isNonContributiveBenefitVinculo)).length;
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
      texto: `${formatMonthYear(lastContributionDate)} ate ${formatMonthYear(prisonDate)}`,
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
  if (houvePerdaFinalAntesDaPrisao) {
    competenciasCarencia = 0;
    contribuicoesCarenciaLancadas = 0;
    concomitantesCarencia = 0;
    incapacityBenefitCompetenciasCarencia = 0;
  }
  const carenciaOk = !carenciaExigida || competenciasCarencia >= carenciaNecessaria;

  return {
    vinculos: rawOrdered,
    perdas: graceGaps.filter(gap => gap.perda),
    graceGaps,
    totalCompetencias,
    totalConcomitantes,
    competenciasDesconsideradasAposPrisao,
    incapacityBenefitCompetencias,
    incapacityBenefitCompetenciasCarencia,
    nonContributiveBenefitCompetencias,
    competenciasCarencia,
    concomitantesCarencia,
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

function buildSummary(analysis, desempregoLosses) {
  return {
    direito: analysis.direito,
    carenciaOk: analysis.carenciaOk,
    mantemQualidade: analysis.mantemQualidade,
    retroactiveTotal: analysis.retroactiveValue?.total || 0,
    competenciasCarencia: analysis.competenciasCarencia,
    totalCompetencias: analysis.totalCompetencias,
    totalConcomitantes: analysis.totalConcomitantes,
    competenciasDesconsideradasAposPrisao: analysis.competenciasDesconsideradasAposPrisao,
    incapacityBenefitCompetencias: analysis.incapacityBenefitCompetencias,
    incapacityBenefitCompetenciasCarencia: analysis.incapacityBenefitCompetenciasCarencia,
    nonContributiveBenefitCompetencias: analysis.nonContributiveBenefitCompetencias,
    concomitantesCarencia: analysis.concomitantesCarencia,
    carenciaNecessaria: analysis.carenciaNecessaria,
    carenciaExigida: analysis.carenciaExigida,
    desempregoLosses,
    graceGaps: analysis.graceGaps
  };
}

function normalizeVinculo(vinculo) {
  const inicioDate = parseAnyDate(vinculo.inicioDate) || parseBRDate(vinculo.inicio);
  const fimDate = parseAnyDate(vinculo.fimDate) || parseBRDate(vinculo.fim);
  if (!inicioDate || !fimDate) return null;

  return {
    ...vinculo,
    inicioDate,
    fimDate,
    competencias: Array.isArray(vinculo.competencias) ? vinculo.competencias : listCompetencias(inicioDate, fimDate)
  };
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

function renderConcomitanceNote(discountedCount) {
  if (!discountedCount) return "";
  const contributionLabel = discountedCount === 1 ? "contribuicao concomitante foi computada" : "contribuicoes concomitantes foram computadas";
  return `<p class="concomitance-note">Observacao: ${discountedCount} ${contributionLabel} como uma unica competencia mensal. Para fins de carencia e tempo de contribuicao, um mes e contado uma so vez, mesmo que exista mais de um vinculo ou recolhimento no mesmo periodo.</p>`;
}

function renderPostPrisonCompetenceNote(analysis) {
  if (!analysis.competenciasDesconsideradasAposPrisao) return "";
  return `<p class="benefit-note">Observacao: ${analysis.competenciasDesconsideradasAposPrisao} competencia(s) posterior(es) a data da prisao aparecem no historico, mas foram desconsideradas para a carencia do auxilio-reclusao.</p>`;
}

function renderIncapacityBenefitNote(analysis) {
  if (!analysis.incapacityBenefitCompetencias) return "";
  return `<p class="benefit-note">Observacao: ${analysis.incapacityBenefitCompetencias} competencia(s) de beneficio por incapacidade aparecem no historico. Elas nao entram na carencia; eventual contagem como tempo de contribuicao depende de estarem intercaladas com contribuicao ou atividade.</p>`;
}

function renderIncapacityBenefitCarenciaNote(analysis) {
  if (!analysis.incapacityBenefitCompetenciasCarencia) return "";
  return `<p class="benefit-note">Observacao: auxilio-doenca/beneficio por incapacidade nao conta para carencia. Para tempo de contribuicao, a contagem depende de estar intercalado com contribuicao ou atividade. Foram desconsideradas ${analysis.incapacityBenefitCompetenciasCarencia} competencia(s) desse tipo na carencia apos a ultima perda.</p>`;
}

function renderNonContributiveBenefitNote(analysis) {
  if (!analysis.nonContributiveBenefitCompetencias) return "";
  return `<p class="benefit-note">Observacao: ${analysis.nonContributiveBenefitCompetencias} competencia(s) de pensao por morte, beneficio assistencial ou outro beneficio nao contributivo foram identificadas como beneficio, nao como contribuicao propria. Elas nao entram na carencia, no tempo de contribuicao, na ultima contribuicao nem no periodo de graca.</p>`;
}

function renderCarenciaStatus(analysis) {
  if (!analysis.carenciaExigida) {
    return `<p class="ok">Carencia nao exigida para a data da prisao. Foram identificadas ${analysis.competenciasCarencia} competencia(s) apos a ultima perda, mas esse requisito nao se aplica ao caso.</p>`;
  }

  return `<p class="${analysis.carenciaOk ? "ok" : "fail"}">${analysis.carenciaOk ? "Cumpre" : "Nao cumpre"} a carencia minima: ${analysis.competenciasCarencia} de ${analysis.carenciaNecessaria} contribuicoes.</p>`;
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

function renderCarenciaLawNote(analysis) {
  let caseText = "Data da prisao nao informada; por cautela, foi considerada a carencia de 24 contribuicoes mensais.";
  if (analysis.prisonDate && !analysis.carenciaExigida) {
    caseText = "Como a prisao e anterior a 18/06/2019, a carencia nao e exigida neste caso.";
  } else if (analysis.prisonDate) {
    caseText = "Como a prisao e em 18/06/2019 ou posterior, aplica-se a carencia de 24 contribuicoes mensais.";
  }

  return `<p class="legal-note">Observacao: para auxilio-reclusao, a carencia de 24 contribuicoes mensais foi introduzida pela Lei n. 13.846/2019, publicada em 18/06/2019. Prisoes anteriores a essa data nao exigem carencia; prisoes a partir de 18/06/2019 exigem 24 contribuicoes mensais. ${caseText}</p>`;
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

function getEntryDireito(entry) {
  if (typeof entry?.summary?.direito === "boolean") return entry.summary.direito;
  if (typeof entry?.direito === "boolean") return entry.direito;
  return null;
}

function uniqueCompetencias(vinculos) {
  return Array.from(new Set(vinculos.flatMap(vinculo => vinculo.competencias || []))).sort();
}

function countContribuicoes(vinculos) {
  return vinculos.reduce((total, vinculo) => total + (vinculo.competencias?.length || 0), 0);
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
    return `${total}<br><small>fora da carencia</small>`;
  }

  return `${total}<br><small>${recognized} ate a prisao</small>`;
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

function getQualityEndDate(lastContributionDate, extraMonths = 0) {
  return new Date(lastContributionDate.getFullYear(), lastContributionDate.getMonth() + 13 + extraMonths, 15);
}

function makeLossKey(lastContributionDate, nextContributionDate) {
  return `${formatISODateFromDate(lastContributionDate)}__${formatISODateFromDate(nextContributionDate)}`;
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

function parseAnyDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

function formatISODateFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMonthYear(date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function formatCurrencyBRL(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getCarenciaMetricValue(analysis) {
  return analysis.carenciaExigida ? `${analysis.competenciasCarencia}/${analysis.carenciaNecessaria}` : "Dispensada";
}

function normalizeForCompare(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHTML(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatISODate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value || "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function sanitizeFilename(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
