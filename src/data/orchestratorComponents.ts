import { OrchestratorComponentCategory } from '@/types/orchestrator';

export const orchestratorComponentCategories: OrchestratorComponentCategory[] = [
  {
    id: 'agents',
    label: 'Agentes',
    icon: 'Bot',
    components: [
      {
        type: 'orch-agent',
        label: 'Agente IA',
        description: 'Direciona para um agente especializado',
        icon: 'Bot',
        color: 'bg-violet-500',
      },
      {
        type: 'orch-human',
        label: 'Escalação Humana',
        description: 'Transfere para atendente humano',
        icon: 'UserPlus',
        color: 'bg-green-500',
      },
    ],
  },
  {
    id: 'actions',
    label: 'Ações',
    icon: 'Zap',
    components: [
      {
        type: 'orch-pipeline',
        label: 'Mover Pipeline',
        description: 'Move o lead para uma coluna do pipeline',
        icon: 'Kanban',
        color: 'bg-blue-500',
      },
      {
        type: 'orch-tag',
        label: 'Tag',
        description: 'Adiciona ou remove uma tag do contato',
        icon: 'Tag',
        color: 'bg-amber-500',
      },
      {
        type: 'orch-department',
        label: 'Departamento',
        description: 'Altera o departamento da conversa',
        icon: 'Building2',
        color: 'bg-cyan-500',
      },
      {
        type: 'orch-flow',
        label: 'Iniciar Fluxo',
        description: 'Dispara um fluxo de automação',
        icon: 'GitBranch',
        color: 'bg-indigo-500',
      },
      {
        type: 'orch-document',
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
        type: 'orch-delay',
        label: 'Intervalo',
        description: 'Pausa antes da IA responder',
        icon: 'Clock',
        color: 'bg-slate-500',
      },
      {
        type: 'orch-condition',
        label: 'Condição',
        description: 'Ramifica baseado em critérios',
        icon: 'GitBranch',
        color: 'bg-yellow-500',
      },
    ],
  },
];
