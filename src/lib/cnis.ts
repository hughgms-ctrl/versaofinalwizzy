export type CnisVinculo = {
  nome: string;
  tipo: string;
  inicio: string;
  fim: string;
  emAberto?: boolean;
  inicioDate: Date;
  fimDate: Date;
  competencias: string[];
};

export type CnisGraceGap = {
  key: string;
  texto: string;
  perda: boolean;
  qualidadeAte: Date;
  baseQualidadeAte: Date;
  contribuicoesAtePerda: number;
  automaticGraceMonths: number;
  desempregoGraceMonths: number;
  desempregoMarcado: boolean;
  final?: boolean;
};

export type CnisAnalysis = {
  benefitType?: CnisBenefitType;
  eventDateLabel?: string;
  maternityContributionInstruction?: string;
  vinculos: CnisVinculo[];
  perdas: CnisGraceGap[];
  graceGaps: CnisGraceGap[];
  totalCompetencias: number;
  totalCompetenciasCarencia: number;
  totalContribuicoesLancadas: number;
  totalConcomitantes: number;
  competenciasDesconsideradasAposPrisao: number;
  incapacityBenefitCompetencias: number;
  incapacityBenefitCompetenciasCarencia: number;
  nonContributiveBenefitCompetencias: number;
  competenciasCarencia: number;
  contribuicoesCarenciaLancadas: number;
  concomitantesCarencia: number;
  carenciaNecessaria: number;
  carenciaExigida: boolean;
  carenciaOk: boolean;
  mantemQualidade: boolean;
  qualidadeAte: Date | null;
  lastContributionDate: Date | null;
  contribuicoesAteUltimaContribuicao: number;
  finalAutomaticGraceMonths: number;
  direito: boolean;
  prisonDate: Date | null;
  todayDate: Date;
  retroactiveValue: CnisRetroactiveValue | null;
};

export type CnisBenefitType = "auxilio_reclusao" | "pensao_morte" | "salario_maternidade";

export type CnisRetroactiveValue = {
  total: number;
  months: number;
  startLabel: string;
  endLabel: string;
  breakdown: Array<{ year: number; months: number; minimumWage: number; subtotal: number }>;
  missingYears: number[];
};

export type CnisAnalysisOptions = {
  todayDate?: string;
  desempregoLosses?: Record<string, boolean>;
  benefitType?: CnisBenefitType;
};

export type CnisSummary = {
  benefitType?: CnisBenefitType;
  direito: boolean;
  carenciaOk: boolean;
  mantemQualidade: boolean;
  competenciasCarencia: number;
  carenciaNecessaria: number;
  carenciaExigida: boolean;
  qualidadeAte: string;
  lastContributionDate: string;
  totalCompetencias: number;
  retroactiveTotal: number;
  maternityContributionInstruction?: string;
};

const REQUIRED_CARENCIA = 24;
const CARENCIA_START_DATE = new Date(2019, 5, 18);
const TIPOS_VINCULO = [
  "Empregado",
  "Empregado domestico",
  "Empregado doméstico",
  "Contribuinte Individual/Autonomo",
  "Contribuinte Individual/Autônomo",
  "Contribuinte Individual",
  "Autonomo",
  "Autônomo",
  "Facultativo",
  "Domestico",
  "Doméstico",
  "Trabalhador Avulso",
  "Segurado Especial",
  "Beneficio",
  "Benefício",
];
const BR_DATE_PATTERN = /\b\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})\b/g;

const MINIMUM_WAGES: Record<number, number> = {
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
  2026: 1621,
};

export function parseCnisText(input: string): CnisVinculo[] {
  const lines = input
    .split(/\n+/)
    .map(cleanText)
    .filter((line) => line && !isGarbageLine(line));

  const vinculos: CnisVinculo[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const parsedLine = parseDelimitedLine(line);
    if (parsedLine) {
      vinculos.push(parsedLine);
      continue;
    }

    const parsedLooseLine = parseLooseLine(line);
    if (parsedLooseLine) {
      vinculos.push(parsedLooseLine);
      continue;
    }

    if (!looksLikeCompanyName(line)) continue;
    const windowLines = lines.slice(i + 1, i + 8);
    const tipo = windowLines.find(isTipoVinculo) || "";
    const dates = extractDates(windowLines.join(" "));
    if (dates.length < 1) continue;

    const parsed = buildVinculo(line, tipo, dates[0], dates[1]);
    if (parsed) {
      vinculos.push(parsed);
      i += 3;
    }
  }

  return dedupeVinculos(vinculos).sort((a, b) => a.inicioDate.getTime() - b.inicioDate.getTime());
}

export function analyzeCNIS(
  rawVinculos: CnisVinculo[],
  prisonDateValue: string,
  options: CnisAnalysisOptions = {},
): CnisAnalysis {
  const benefitType = options.benefitType || "auxilio_reclusao";
  const prisonDate = parseISODate(prisonDateValue);
  const todayDate = parseISODate(options.todayDate) || new Date();
  const retroactiveValue = calculateRetroactiveValue(prisonDate, todayDate);
  const rawOrdered = rawVinculos.map(normalizeVinculo).filter(Boolean).sort((a, b) => a.inicioDate.getTime() - b.inicioDate.getTime());
  const orderedUntilPrison = capVinculosAtPrisonDate(rawOrdered, prisonDate);
  const contributionOrdered = rawOrdered.filter((vinculo) => !isNonContributiveBenefitVinculo(vinculo));
  const contributionOrderedUntilPrison = orderedUntilPrison.filter((vinculo) => !isNonContributiveBenefitVinculo(vinculo));
  const graceGaps: CnisGraceGap[] = [];
  let lastCovered: Date | null = null;
  let lastLossIndex = 0;
  let segmentStartIndex = 0;

  contributionOrderedUntilPrison.forEach((vinculo, index) => {
    if (!lastCovered) {
      lastCovered = vinculo.fimDate;
      return;
    }

    const baseQualidadeAte = getQualityEndDate(lastCovered);
    const segmentVinculos = contributionOrderedUntilPrison.slice(segmentStartIndex, index);
    const contribuicoesAtePerda = uniqueCompetencias(segmentVinculos.filter((item) => !isIncapacityBenefitVinculo(item))).length;
    const automaticGraceMonths = contribuicoesAtePerda > 120 ? 12 : 0;
    const key = makeLossKey(lastCovered, vinculo.inicioDate);
    const desempregoGraceMonths = options.desempregoLosses?.[key] ? 12 : 0;
    const qualidadeAte = getQualityEndDate(lastCovered, automaticGraceMonths + desempregoGraceMonths);

    if (vinculo.inicioDate > baseQualidadeAte) {
      graceGaps.push({
        key,
        texto: `${formatMonthYear(lastCovered)} ate ${formatMonthYear(vinculo.inicioDate)}`,
        perda: vinculo.inicioDate > qualidadeAte,
        qualidadeAte,
        baseQualidadeAte,
        contribuicoesAtePerda,
        automaticGraceMonths,
        desempregoGraceMonths,
        desempregoMarcado: Boolean(options.desempregoLosses?.[key]),
      });
    }

    if (vinculo.inicioDate > qualidadeAte) {
      lastLossIndex = index;
      segmentStartIndex = index;
    }

    if (vinculo.fimDate > lastCovered) lastCovered = vinculo.fimDate;
  });

  const afterLastLoss = contributionOrderedUntilPrison.slice(lastLossIndex);
  const carenciaVinculos = contributionOrdered.filter((vinculo) => !isIncapacityBenefitVinculo(vinculo));
  const afterLastLossCarencia = afterLastLoss.filter((vinculo) => !isIncapacityBenefitVinculo(vinculo));
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
  const carenciaNecessaria = benefitType === "auxilio_reclusao" ? getRequiredCarencia(prisonDate) : 0;
  const carenciaExigida = carenciaNecessaria > 0;
  const lastContributionDate = contributionOrderedUntilPrison.reduce<Date | null>((latest, vinculo) => {
    return !latest || vinculo.fimDate > latest ? vinculo.fimDate : latest;
  }, null);
  const finalSegmentVinculos = contributionOrderedUntilPrison.slice(segmentStartIndex);
  const contribuicoesAteUltimaContribuicao = uniqueCompetencias(finalSegmentVinculos.filter((vinculo) => !isIncapacityBenefitVinculo(vinculo))).length;
  const finalAutomaticGraceMonths = contribuicoesAteUltimaContribuicao > 120 ? 12 : 0;
  const finalLossKey = lastContributionDate && prisonDate ? makeLossKey(lastContributionDate, prisonDate) : "";
  const finalDesempregoGraceMonths = options.desempregoLosses?.[finalLossKey] ? 12 : 0;
  const baseFinalQualidadeAte = lastContributionDate ? getQualityEndDate(lastContributionDate, finalAutomaticGraceMonths) : null;
  const qualidadeAte = lastContributionDate ? getQualityEndDate(lastContributionDate, finalAutomaticGraceMonths + finalDesempregoGraceMonths) : null;
  const mantemQualidade = Boolean(prisonDate && qualidadeAte && prisonDate <= qualidadeAte);

  if (prisonDate && lastContributionDate && baseFinalQualidadeAte && prisonDate > baseFinalQualidadeAte) {
    graceGaps.push({
      key: finalLossKey,
      texto: `${formatMonthYear(lastContributionDate)} ate ${formatMonthYear(prisonDate)}`,
      perda: prisonDate > (qualidadeAte as Date),
      qualidadeAte: qualidadeAte as Date,
      baseQualidadeAte: baseFinalQualidadeAte,
      contribuicoesAtePerda: contribuicoesAteUltimaContribuicao,
      automaticGraceMonths: finalAutomaticGraceMonths,
      desempregoGraceMonths: finalDesempregoGraceMonths,
      desempregoMarcado: Boolean(options.desempregoLosses?.[finalLossKey]),
      final: true,
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
  const maternityContributionInstruction = benefitType === "salario_maternidade" && !mantemQualidade
    ? getMaternityContributionInstruction(prisonDate, todayDate)
    : undefined;

  return {
    benefitType,
    eventDateLabel: getBenefitEventDateLabel(benefitType),
    maternityContributionInstruction,
    vinculos: rawOrdered,
    perdas: graceGaps.filter((gap) => gap.perda),
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
    direito: benefitType === "salario_maternidade" ? mantemQualidade : carenciaOk && mantemQualidade,
    prisonDate,
    todayDate,
    retroactiveValue,
  };
}

export function buildCnisSummary(analysis: CnisAnalysis): CnisSummary {
  return {
    benefitType: analysis.benefitType,
    direito: analysis.direito,
    carenciaOk: analysis.carenciaOk,
    mantemQualidade: analysis.mantemQualidade,
    competenciasCarencia: analysis.competenciasCarencia,
    carenciaNecessaria: analysis.carenciaNecessaria,
    carenciaExigida: analysis.carenciaExigida,
    qualidadeAte: analysis.qualidadeAte ? formatDate(analysis.qualidadeAte) : "Nao calculada",
    lastContributionDate: analysis.lastContributionDate ? formatMonthYear(analysis.lastContributionDate) : "Nao localizada",
    totalCompetencias: analysis.totalCompetencias,
    retroactiveTotal: analysis.retroactiveValue?.total || 0,
    maternityContributionInstruction: analysis.maternityContributionInstruction,
  };
}

export function buildCnisReportHtml(args: {
  nome: string;
  cpf: string;
  prisonDate: string;
  todayDate: string;
  analysis: CnisAnalysis;
}): string {
  const { nome, cpf, prisonDate, todayDate, analysis } = args;
  const dateLabel = analysis.prisonDate ? formatDate(analysis.prisonDate) : "Nao informada";
  const summary = buildCnisSummary(analysis);
  const benefitLabel = getBenefitLabel(analysis.benefitType || "auxilio_reclusao");
  const eventLabel = analysis.eventDateLabel || getBenefitEventDateLabel(analysis.benefitType || "auxilio_reclusao");
  const conclusion = getConclusionText(analysis);
  const rows = analysis.vinculos
    .map((vinculo) => `<tr><td>${escapeHTML(vinculo.nome)}</td><td>${escapeHTML(vinculo.tipo)}</td><td>${escapeHTML(vinculo.inicio)} a ${escapeHTML(vinculo.fim)}</td><td>${getRecognizedCompetenciasCount(vinculo, analysis.prisonDate)}</td></tr>`)
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Relatorio CNIS</title>
  <style>
    body{font-family:Arial,sans-serif;color:#172033;margin:32px;line-height:1.45}
    h1{margin-bottom:4px}.hero{padding:18px;border-radius:8px;background:${analysis.direito ? "#dcfce7" : "#fee2e2"}}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}.box{border:1px solid #d9e2ec;border-radius:8px;padding:10px}
    table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #d9e2ec;padding:8px;text-align:left;font-size:12px}
    .ok{color:#166534}.fail{color:#991b1b}
  </style>
</head>
<body>
  <section class="hero">
    <h1>${analysis.direito ? "Direito indicado" : "Direito nao indicado"}</h1>
    <p>Analise de ${escapeHTML(benefitLabel)} em ${escapeHTML(dateLabel)}.</p>
  </section>
  <div class="grid">
    <div class="box"><b>Nome</b><br>${escapeHTML(nome || "Nao informado")}</div>
    <div class="box"><b>CPF</b><br>${escapeHTML(cpf || "Nao informado")}</div>
    <div class="box"><b>${escapeHTML(eventLabel)}</b><br>${escapeHTML(formatISODate(prisonDate) || "Nao informada")}</div>
    <div class="box"><b>Data base</b><br>${escapeHTML(formatISODate(todayDate) || "Atual")}</div>
    <div class="box"><b>Carencia</b><br>${escapeHTML(summary.carenciaExigida ? `${summary.competenciasCarencia}/${summary.carenciaNecessaria}` : "Dispensada")}</div>
    <div class="box"><b>Qualidade</b><br>${escapeHTML(summary.mantemQualidade ? "Mantida" : "Perdida")}</div>
    <div class="box"><b>Ultima contribuicao</b><br>${escapeHTML(summary.lastContributionDate)}</div>
    <div class="box"><b>Retroativos</b><br>${formatCurrencyBRL(summary.retroactiveTotal)}</div>
  </div>
  <h2>Historico de vinculos</h2>
  <table><thead><tr><th>Vinculo</th><th>Tipo</th><th>Periodo</th><th>Competencias</th></tr></thead><tbody>${rows}</tbody></table>
  <h2>Conclusao</h2>
  <p class="${analysis.direito ? "ok" : "fail"}">${escapeHTML(conclusion)}</p>
</body>
</html>`;
}

function parseDelimitedLine(line: string): CnisVinculo | null {
  const parts = line.split(/[;|\t]/).map(cleanText).filter(Boolean);
  if (parts.length < 3) return null;
  const dates = extractDates(parts.join(" "));
  if (!dates.length) return null;
  const tipo = parts.find(isTipoVinculo) || "Vinculo";
  const nome = parts.find((part) => !isTipoVinculo(part) && !hasDate(part) && !looksLikeCpfOnly(part)) || "Contribuicao informada";
  return buildVinculo(nome, tipo, dates[0], dates[1]);
}

function parseLooseLine(line: string): CnisVinculo | null {
  BR_DATE_PATTERN.lastIndex = 0;
  const rawDates = line.match(BR_DATE_PATTERN) || [];
  const dates = rawDates.map(normalizeBRDate).filter(Boolean) as string[];
  if (!dates.length || !rawDates.length) return null;

  const beforeFirstDate = cleanText(line.slice(0, line.indexOf(rawDates[0])));
  const lastRawDate = rawDates[rawDates.length - 1];
  const afterLastDate = cleanText(line.slice(line.lastIndexOf(lastRawDate) + lastRawDate.length));
  const chunks = beforeFirstDate.split(/\s{2,}|[;|\t]/).map(cleanText).filter(Boolean);
  const tipo = findTipoVinculoLabel(`${beforeFirstDate} ${afterLastDate}`);
  const nome = chunks.find((chunk) => !isTipoVinculo(chunk) && looksLikeCompanyName(chunk))
    || cleanCompanyName(beforeFirstDate.replace(new RegExp(escapeRegExp(tipo), "i"), ""));

  return buildVinculo(nome, tipo, dates[0], dates[1]);
}

function buildVinculo(nome: string, tipo: string, inicio: string, fim?: string): CnisVinculo | null {
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
    competencias: listCompetencias(inicioDate, fimDate),
  };
}

function normalizeVinculo(vinculo: CnisVinculo): CnisVinculo | null {
  const inicioDate = parseAnyDate(vinculo.inicioDate) || parseBRDate(vinculo.inicio);
  const fimDate = parseAnyDate(vinculo.fimDate) || parseBRDate(vinculo.fim);
  if (!inicioDate || !fimDate || fimDate < inicioDate) return null;
  return {
    ...vinculo,
    inicioDate,
    fimDate,
    competencias: Array.isArray(vinculo.competencias) ? vinculo.competencias : listCompetencias(inicioDate, fimDate),
  };
}

function dedupeVinculos(vinculos: CnisVinculo[]): CnisVinculo[] {
  const seen = new Set<string>();
  return vinculos.filter((vinculo) => {
    const key = `${vinculo.nome}|${vinculo.tipo}|${vinculo.inicio}|${vinculo.fim}`.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function capVinculosAtPrisonDate(vinculos: CnisVinculo[], prisonDate: Date | null): CnisVinculo[] {
  if (!prisonDate) return vinculos;
  return vinculos
    .map((vinculo) => {
      if (vinculo.inicioDate > prisonDate) return null;
      const fimDate = vinculo.fimDate > prisonDate ? prisonDate : vinculo.fimDate;
      return {
        ...vinculo,
        fimDate,
        fim: vinculo.fimDate > prisonDate ? formatDate(prisonDate) : vinculo.fim,
        competencias: listCompetencias(vinculo.inicioDate, fimDate),
      };
    })
    .filter(Boolean) as CnisVinculo[];
}

function uniqueCompetencias(vinculos: CnisVinculo[]): string[] {
  return Array.from(new Set(vinculos.flatMap((vinculo) => vinculo.competencias || []))).sort();
}

function countContribuicoes(vinculos: CnisVinculo[]): number {
  return vinculos.reduce((total, vinculo) => total + (vinculo.competencias?.length || 0), 0);
}

function getRecognizedCompetenciasCount(vinculo: CnisVinculo, limitDate: Date | null = null): number {
  if (isNonContributiveBenefitVinculo(vinculo)) return 0;
  if (!limitDate || !vinculo?.inicioDate || !vinculo?.fimDate) return vinculo.competencias?.length || 0;
  const fimDate = vinculo.fimDate > limitDate ? limitDate : vinculo.fimDate;
  if (fimDate < vinculo.inicioDate) return 0;
  return listCompetencias(vinculo.inicioDate, fimDate).length;
}

function isIncapacityBenefitVinculo(vinculo: CnisVinculo): boolean {
  const text = normalizeForCompare(`${vinculo?.nome || ""} ${vinculo?.tipo || ""}`);
  return /(?:^|\s)(31|91)\s*-/.test(text)
    || text.includes("auxilio doenca")
    || text.includes("auxilio por incapacidade")
    || text.includes("beneficio por incapacidade")
    || text.includes("incapacidade temporaria");
}

function isNonContributiveBenefitVinculo(vinculo: CnisVinculo): boolean {
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

function getRequiredCarencia(date: Date | null): number {
  return date && date < CARENCIA_START_DATE ? 0 : REQUIRED_CARENCIA;
}

function getMaternityContributionInstruction(eventDate: Date | null, todayDate: Date): string | undefined {
  if (!eventDate) return undefined;
  if (eventDate > todayDate) {
    return "Precisa fazer uma contribuicao antes do parto para recuperar a qualidade de segurada.";
  }
  const deadline = new Date(eventDate.getFullYear(), eventDate.getMonth() + 1, 15);
  return `Precisa fazer uma contribuicao ate ${formatDate(deadline)}, 15o dia do mes subsequente ao nascimento.`;
}

function getBenefitLabel(value: CnisBenefitType): string {
  if (value === "pensao_morte") return "pensao por morte";
  if (value === "salario_maternidade") return "salario-maternidade";
  return "auxilio-reclusao";
}

function getBenefitEventDateLabel(value: CnisBenefitType): string {
  if (value === "pensao_morte") return "Data do obito";
  if (value === "salario_maternidade") return "Data do nascimento ou prevista";
  return "Data da prisao";
}

function getConclusionText(analysis: CnisAnalysis): string {
  if (analysis.benefitType === "pensao_morte") {
    return analysis.mantemQualidade
      ? "Ha indicacao de direito: havia qualidade de segurado na data do obito. Para pensao por morte nao ha carencia."
      : "Nao ha indicacao de direito: nao foi identificada qualidade de segurado na data do obito. Para pensao por morte nao ha carencia.";
  }

  if (analysis.benefitType === "salario_maternidade") {
    if (analysis.mantemQualidade) {
      return "Ha indicacao de direito: havia qualidade de segurada na data do nascimento ou data prevista.";
    }
    return analysis.maternityContributionInstruction || "Nao ha indicacao de direito sem recuperar a qualidade de segurada.";
  }

  return analysis.direito
    ? "Ha indicacao de direito pelos criterios analisados."
    : "Nao ha indicacao de direito pelos criterios analisados.";
}

function listCompetencias(start: Date, end: Date): string[] {
  const competencias: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    competencias.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return competencias;
}

function calculateRetroactiveValue(prisonDate: Date | null, todayDate: Date): CnisRetroactiveValue | null {
  if (!prisonDate || !todayDate) return null;
  const start = new Date(prisonDate.getFullYear(), prisonDate.getMonth(), 1);
  const end = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
  if (end < start) return { total: 0, months: 0, startLabel: formatMonthYear(start), endLabel: formatMonthYear(end), breakdown: [], missingYears: [] };

  const byYear = new Map<number, { year: number; months: number; minimumWage: number; subtotal: number }>();
  const missingYears = new Set<number>();
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

  return { total, months, startLabel: formatMonthYear(start), endLabel: formatMonthYear(end), breakdown: Array.from(byYear.values()), missingYears: Array.from(missingYears) };
}

function getOpenVinculoEndDate(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function getQualityEndDate(lastContributionDate: Date, extraMonths = 0): Date {
  return new Date(lastContributionDate.getFullYear(), lastContributionDate.getMonth() + 13 + extraMonths, 15);
}

function makeLossKey(lastContributionDate: Date, nextContributionDate: Date): string {
  return `${formatISODateFromDate(lastContributionDate)}__${formatISODateFromDate(nextContributionDate)}`;
}

function parseAnyDate(value: unknown): Date | null {
  const date = value ? new Date(value as string | Date) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function parseBRDate(value?: string): Date | null {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function parseISODate(value?: string): Date | null {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function formatISODate(value?: string): string {
  const date = parseISODate(value);
  return date ? formatDate(date) : "";
}

function formatISODateFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMonthYear(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function formatCurrencyBRL(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function cleanText(value: string): string {
  return String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function cleanCompanyName(value: string): string {
  return cleanText(value)
    .replace(/^\d{1,3}\s*[-.)]\s+(?!\d)/, "")
    .replace(/^\d+\s+(?=\d{2,3}[.\s])/, "")
    .replace(/\b(Acoes|Ações|Indicadores?|Seq\.?|Origem do Vinculo|Origem do Vínculo|Data Inicio|Data Fim|Ult\.?\s*Remun\.?)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 140)
    .trim();
}

function isGarbageLine(line: string): boolean {
  const normalized = normalizeForCompare(line);
  return !normalized
    || normalized.includes("cnis checker")
    || normalized.includes("historico")
    || normalized.includes("analisar cnis")
    || normalized.includes("origem do vinculo")
    || normalized.includes("data inicio")
    || normalized.includes("data fim")
    || normalized.includes("ult. remun")
    || normalized.includes("indicadores")
    || normalized === "acoes"
    || normalized === "acao"
    || /^(seq|nit|nb|cpf|nome|origem do vinculo|origem do vínculo|data inicio|data fim|ult\.?\s*remun\.?|indicadores?)$/i.test(line)
    || /periodo:\s*a preencher|per[ií]odo:\s*a preencher|lote\d|^salvar$|compet[eê]ncia inicial/i.test(line)
    || normalized.length < 3;
}

function looksLikeCompanyName(line: string): boolean {
  if (hasDate(line) || isTipoVinculo(line) || isGarbageLine(line)) return false;
  const normalized = normalizeForCompare(line);
  return normalized.length >= 4 && /[a-z]/i.test(normalized);
}

function isTipoVinculo(line: string): boolean {
  const normalized = normalizeForCompare(line).replace(/\.+$/g, "");
  return TIPOS_VINCULO.some((tipo) => {
    const normalizedTipo = normalizeForCompare(tipo);
    return normalized === normalizedTipo
      || normalized.includes(normalizedTipo)
      || (normalized.length >= 8 && normalizedTipo.startsWith(normalized));
  });
}

function findTipoVinculoLabel(value: string): string {
  const normalized = normalizeForCompare(value);
  return TIPOS_VINCULO.find((tipo) => normalized.includes(normalizeForCompare(tipo))) || "";
}

function hasDate(value: string): boolean {
  return /\b\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})\b/.test(value);
}

function looksLikeCpfOnly(value: string): boolean {
  return /^\D*\d{11}\D*$/.test(value);
}

function extractDates(value: string): string[] {
  BR_DATE_PATTERN.lastIndex = 0;
  return (value.match(BR_DATE_PATTERN) || []).map(normalizeBRDate).filter(Boolean) as string[];
}

function normalizeBRDate(value: string): string | null {
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
  return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${year}`;
}

function normalizeForCompare(value: string): string {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function escapeRegExp(value: string): string {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHTML(value: string | number): string {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

