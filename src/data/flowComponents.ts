import { FlowComponentCategory } from '@/types/flow';

export const flowComponentCategories: FlowComponentCategory[] = [
  {
    id: 'agents',
    label: 'Agentes',
    icon: 'Bot',
    components: [
      {
        type: 'ai-handoff',
        label: 'Agente IA',
        description: 'Direciona para um agente especializado...',
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
    id: 'actions',
    label: 'Ações',
    icon: 'Zap',
    components: [
      {
        type: 'action-pipeline',
        label: 'Mover Pipeline',
        description: 'Move o lead para uma coluna do pip...',
        icon: 'Kanban',
        color: 'bg-blue-500',
      },
      {
        type: 'action-tag',
        label: 'Tag',
        description: 'Adiciona ou remove uma tag do cont...',
        icon: 'Tag',
        color: 'bg-amber-500',
      },
      {
        type: 'action-department',
        label: 'Departamento',
        description: 'Altera o departamento da conversa',
        icon: 'Webhook',
        color: 'bg-cyan-500',
      },
      {
        type: 'action-flow',
        label: 'Iniciar Fluxo',
        description: 'Dispara um fluxo de automação',
        icon: 'IterationCw',
        color: 'bg-indigo-500',
      },
      {
        type: 'action-document',
        label: 'Contrato / Documento',
        description: 'Coleta dados e gera documento PDF',
        icon: 'FileText',
        color: 'bg-rose-500',
      },
    ],
  },
  {
    id: 'logic',
    label: 'Lógica',
    icon: 'GitBranch',
    components: [
      {
        type: 'action-delay',
        label: 'Intervalo',
        description: 'Pausa antes da IA responder',
        icon: 'Clock',
        color: 'bg-slate-500',
      },
      {
        type: 'condition',
        label: 'Condição',
        description: 'Ramifica baseado em critérios',
        icon: 'GitBranch',
        color: 'bg-yellow-500',
      },
    ],
  },
];
