import type { Node, Edge } from '@xyflow/react';

// Uma variável que pode ser usada com a sintaxe {{nome}} nos textos do fluxo.
export interface FlowVariable {
  name: string;
  description: string;
}

// Grupo de variáveis exibido no seletor (ex: "Coletadas no fluxo", "Do gatilho").
export interface FlowVariableGroup {
  label: string;
  hint?: string;
  variables: FlowVariable[];
}

type NodeData = Record<string, unknown>;

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * Variáveis que um nó "produz" para os nós seguintes consumirem.
 * Só inclui o que o motor de execução realmente salva em variables.
 */
function nodeProducedVariables(node: Node): FlowVariable[] {
  const data = (node.data || {}) as NodeData;
  const label = asTrimmedString(data.label);

  switch (node.type) {
    case 'content-block': {
      // O bloco só salva resposta quando "Aguardar resposta" está ligado.
      if (!data.waitForResponse) return [];
      const name = asTrimmedString(data.saveVariable) || 'resposta';
      return [{
        name,
        description: `Resposta do cliente${label ? ` no bloco "${label}"` : ''}`,
      }];
    }
    case 'user-input': {
      const name = asTrimmedString(data.variableName) || 'resposta';
      return [{
        name,
        description: `Valor digitado${label ? ` na pergunta "${label}"` : ''}`,
      }];
    }
    default:
      return [];
  }
}

/**
 * Retorna os ids de todos os nós que conseguem chegar até `targetNodeId`
 * seguindo as conexões do fluxo (ou seja, os nós "anteriores"). BFS reverso.
 */
function getUpstreamNodeIds(targetNodeId: string, edges: Edge[]): Set<string> {
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    const list = incoming.get(edge.target);
    if (list) list.push(edge.source);
    else incoming.set(edge.target, [edge.source]);
  }

  const visited = new Set<string>();
  const queue: string[] = [...(incoming.get(targetNodeId) || [])];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const source of incoming.get(id) || []) {
      if (!visited.has(source)) queue.push(source);
    }
  }

  // Um ciclo pode trazer o próprio nó de volta; ele nunca lista as próprias variáveis.
  visited.delete(targetNodeId);
  return visited;
}

/**
 * Monta a lista de variáveis disponíveis para uso (sintaxe {{nome}}) no nó
 * `targetNodeId`, considerando apenas os nós que vêm antes dele no fluxo.
 */
export function getAvailableVariables(
  nodes: Node[],
  edges: Edge[],
  targetNodeId: string,
): FlowVariableGroup[] {
  const upstreamIds = getUpstreamNodeIds(targetNodeId, edges);
  const upstreamNodes = nodes.filter((n) => upstreamIds.has(n.id));

  const groups: FlowVariableGroup[] = [];

  // 1. Variáveis criadas por nós anteriores deste fluxo.
  const nodeVars: FlowVariable[] = [];
  const seen = new Set<string>();
  for (const node of upstreamNodes) {
    for (const variable of nodeProducedVariables(node)) {
      if (seen.has(variable.name)) continue;
      seen.add(variable.name);
      nodeVars.push(variable);
    }
  }
  if (nodeVars.length > 0) {
    groups.push({
      label: 'Coletadas no fluxo',
      hint: 'Criadas por blocos anteriores deste fluxo.',
      variables: nodeVars,
    });
  }

  // 2. Variáveis vindas do gatilho/campanha (campos da planilha + telefone).
  groups.push({
    label: 'Do gatilho / campanha',
    hint: 'Enviadas ao disparar o fluxo. Os nomes dependem das colunas da sua campanha.',
    variables: [
      { name: 'phone', description: 'Telefone do contato (sempre disponível)' },
      { name: 'name', description: 'Nome do contato (se enviado na campanha)' },
      { name: 'cpf', description: 'CPF (se enviado na campanha)' },
      { name: 'campaign_name', description: 'Nome da campanha que disparou o fluxo' },
      { name: 'campaign_id', description: 'ID único da campanha que disparou o fluxo' },
    ],
  });

  // 3. Variáveis de sistema, disponíveis só quando há um nó anterior que as gera.
  const hasChoiceUpstream = upstreamNodes.some(
    (n) => n.type === 'message-buttons' || n.type === 'message-list',
  );
  if (hasChoiceUpstream) {
    groups.push({
      label: 'Sistema',
      variables: [
        { name: '_lastChoice', description: 'Texto da última opção escolhida (botão/lista)' },
        { name: '_lastChoiceHandle', description: 'Identificador interno da opção escolhida' },
      ],
    });
  }

  // 4. Aviso: webhooks anteriores geram variáveis dinâmicas que não dá para listar.
  const hasWebhookUpstream = upstreamNodes.some((n) => n.type === 'action-webhook');
  if (hasWebhookUpstream) {
    groups.push({
      label: 'Do webhook',
      hint: 'A resposta (JSON) de um webhook anterior vira variáveis com o mesmo nome de cada campo retornado.',
      variables: [],
    });
  }

  return groups;
}
