import { FlowComponentCategory } from '@/types/flow';

export const flowComponentCategories: FlowComponentCategory[] = [
  {
    id: 'content',
    label: 'Conteúdo',
    icon: 'MessageSquare',
    components: [
      {
        type: 'content-block',
        label: 'Bloco de Conteúdo',
        description: 'Envie textos, mídias e pausas em sequência',
        icon: 'Layers',
        color: 'bg-blue-500',
      },
      {
        type: 'message-buttons',
        label: 'Botões',
        description: 'Mensagem com botões de resposta rápida',
        icon: 'MousePointerClick',
        color: 'bg-indigo-500',
      },
      {
        type: 'message-list',
        label: 'Lista',
        description: 'Lista interativa com múltiplas opções',
        icon: 'List',
        color: 'bg-cyan-500',
      },
    ],
  },
  {
    id: 'actions',
    label: 'Ações',
    icon: 'Zap',
    components: [
      {
        type: 'action-tag',
        label: 'Atribuir Tag',
        description: 'Adiciona ou remove uma tag do contato',
        icon: 'Tag',
        color: 'bg-amber-500',
      },
      {
        type: 'action-pipeline',
        label: 'Mover Pipeline',
        description: 'Move o atendimento para uma coluna do pipeline',
        icon: 'Kanban',
        color: 'bg-green-500',
      },
      {
        type: 'action-transfer',
        label: 'Transferir',
        description: 'Transfere para um agente humano ou IA',
        icon: 'UserPlus',
        color: 'bg-rose-500',
      },
      {
        type: 'action-webhook',
        label: 'Webhook',
        description: 'Envia dados para um sistema externo',
        icon: 'Webhook',
        color: 'bg-orange-500',
      },
    ],
  },
  {
    id: 'logic',
    label: 'Lógica',
    icon: 'GitBranch',
    components: [
      {
        type: 'condition',
        label: 'Condição',
        description: 'Cria ramificações baseadas em variáveis',
        icon: 'GitBranch',
        color: 'bg-yellow-500',
      },
      {
        type: 'user-input',
        label: 'Entrada do Usuário',
        description: 'Captura a resposta e salva em uma variável',
        icon: 'FormInput',
        color: 'bg-teal-500',
      },
    ],
  },
  {
    id: 'ai',
    label: 'Inteligência Artificial',
    icon: 'Sparkles',
    components: [
      {
        type: 'ai-handoff',
        label: 'Transbordo IA',
        description: 'Transfere o controle para um agente de IA',
        icon: 'Bot',
        color: 'bg-violet-500',
      },
      {
        type: 'ai-return',
        label: 'Retorno do Fluxo',
        description: 'IA retorna o controle para o fluxo',
        icon: 'IterationCw',
        color: 'bg-fuchsia-500',
      },
    ],
  },
];
