/**
 * Retomada de fluxo: um corpo só, montado num lugar só.
 *
 * Retomar é sempre a mesma coisa — chamar o flow-execute apontando o nó onde
 * continuar. O que muda é quem chama: o webhook quando o contato responde, o
 * cron quando a espera vence, o orquestrador quando a IA fecha o handoff, o
 * próprio flow-execute quando um sub-fluxo termina e o pai precisa seguir.
 *
 * Cada um montava esse corpo à mão, e a maioria esquecia `variables`. O detalhe
 * que faz isso doer: o flow-execute não "continua" a execução, ele cria uma
 * NOVA, semeada só com o contato mais o que veio no corpo. Então tudo que o
 * fluxo já tinha coletado (a resposta de uma pergunta aberta, a escolha de um
 * botão, o resultado da IA) ficava para trás na execução anterior — sem erro
 * nenhum em lugar nenhum, só {{variavel}} chegando vazia lá na frente.
 *
 * Nove pontos montando o mesmo corpo eram nove chances de esquecer o décimo.
 * Com o corpo aqui, a próxima retomada nasce certa por construção.
 */

export interface ResumeFlowOptions {
  flowId: string;
  conversationId: string;
  /** Nó onde a execução nova começa. */
  startNodeId: string;
  /** Variáveis da execução que está sendo retomada — o estado que precisa sobreviver. */
  variables?: Record<string, unknown> | null;
  /**
   * O que o próprio ponto de retomada descobriu agora (_timeout, _lastChoice,
   * ai_resultado, a resposta recém-salva). Entra por cima de `variables`.
   */
  extraVariables?: Record<string, unknown> | null;
  triggerMessage?: string | null;
  /**
   * Execução que acabou de fechar. Liga os trechos como a MESMA passagem do
   * contato pelo fluxo; sem isso o histórico vira N entradas soltas.
   */
  resumedFromExecutionId?: string | null;
  isFromOrchestrator?: boolean;
  /** Só para o log — dá nome ao ponto de retomada quando algo dá errado. */
  reason?: string;
}

export function buildResumeFlowBody(options: ResumeFlowOptions): Record<string, unknown> {
  const variables: Record<string, unknown> = {
    ...(options.variables || {}),
    ...(options.extraVariables || {}),
  };

  const body: Record<string, unknown> = {
    flowId: options.flowId,
    conversationId: options.conversationId,
    startNodeId: options.startNodeId,
    variables,
  };

  if (options.triggerMessage !== undefined && options.triggerMessage !== null) {
    body.triggerMessage = options.triggerMessage;
  }
  if (options.resumedFromExecutionId) {
    body.resumedFromExecutionId = options.resumedFromExecutionId;
  }
  if (options.isFromOrchestrator) {
    body.isFromOrchestrator = true;
  }

  return body;
}

/**
 * Dispara a retomada. Devolve a Promise crua porque cada chamador trata de um
 * jeito: o webhook joga em background, o cron e o orquestrador esperam.
 */
export function resumeFlow(options: ResumeFlowOptions): Promise<Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const body = buildResumeFlowBody(options);
  const varNames = Object.keys(body.variables as Record<string, unknown>);

  console.log(
    `[FLOW RESUME] ${options.reason || 'retomada'} — flow=${options.flowId} node=${options.startNodeId} ` +
    `vars=${varNames.length}${varNames.length ? ` (${varNames.slice(0, 8).join(', ')})` : ''}`
  );

  return fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
    body: JSON.stringify(body),
  });
}
