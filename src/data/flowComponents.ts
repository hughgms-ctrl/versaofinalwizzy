import { FlowComponentCategory } from '@/types/flow';

export const flowComponentCategories: FlowComponentCategory[] = [
  {
    id: 'agents',
    label: 'Agentes',
    icon: 'Bot',
    components: [
      {
        type: 'ai-master',
        label: 'Agente Master',
        description: 'IA Orquestradora que decide qual agente usar',
        icon: 'Sparkles',
        color: 'bg-indigo-600',
      },
      {
        type: 'ai-handoff',
        label: 'Agente IA',
        description: 'Direciona para um agente especializado',
        icon: 'Bot',
        color: 'bg-violet-500',
      },
      {
        type: 'action-transfer',
        label: 'Escalação Humana',
        description: 'Transfere para atendente humano',
        icon: 'UserPlus',
        color: 'bg-rose-500',
      },
    ],
  },
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
        label: 'Tag',
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
        type: 'action-transfer', // Use standard transfer for department in this view
        label: 'Departamento',
        description: 'Altera o departamento da conversa',
        icon: 'Webhook', // Custom icon for dept
        color: 'bg-sky-500',
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
        type: 'ai-return',
        label: 'Retorno do Fluxo',
        description: 'IA retorna o controle para o fluxo',
        icon: 'IterationCw',
        color: 'bg-fuchsia-500',
      },
    ],
  },
];
