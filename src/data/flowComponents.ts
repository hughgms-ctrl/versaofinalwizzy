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
    id: 'ia',
    label: 'IA',
    icon: 'Bot',
    components: [
      {
        type: 'ai-handoff',
        label: 'Agente de IA',
        description: 'Direciona a conversa para um agente de IA',
        icon: 'Bot',
        color: 'bg-violet-500',
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
        description: 'Transfere para um agente humano ou departamento',
        icon: 'UserPlus',
        color: 'bg-rose-500',
      },
      {
        type: 'action-webhook',
        label: 'Webhook',
        description: 'Envia dados para um sistema externo via API',
        icon: 'Webhook',
        color: 'bg-orange-500',
      },
      {
        type: 'action-flow',
        label: 'Iniciar Fluxo',
        description: 'Dispara um fluxo de automação específico',
        icon: 'IterationCw',
        color: 'bg-indigo-500',
      },
      {
        type: 'action-document',
        label: 'Gerar Documento',
        description: 'Coleta dados e gera documento PDF para assinatura',
        icon: 'FileText',
        color: 'bg-rose-600',
      },
      {
        type: 'action-workspace',
        label: 'Atribuir Workspace',
        description: 'Atribui o contato e conversa a um workspace',
        icon: 'Building2',
        color: 'bg-sky-500',
      },
      {
        type: 'action-whatsapp-group',
        label: 'Enviar Grupo WhatsApp',
        description: 'Envia mensagem para um grupo de WhatsApp',
        icon: 'Users',
        color: 'bg-emerald-500',
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
        description: 'Ramifica com base em tags, pipeline, variáveis e mais',
        icon: 'GitBranch',
        color: 'bg-yellow-500',
      },
      {
        type: 'randomizer',
        label: 'Randomizador',
        description: 'Divide o tráfego aleatoriamente entre variantes',
        icon: 'Shuffle',
        color: 'bg-purple-500',
      },
      {
        type: 'smart-delay',
        label: 'Atraso Inteligente',
        description: 'Aguarda horário comercial, data ou tempo específico',
        icon: 'Clock',
        color: 'bg-orange-500',
      },
      {
        type: 'user-input',
        label: 'Pergunta',
        description: 'Faz uma pergunta e salva a resposta em uma variável do fluxo',
        icon: 'FormInput',
        color: 'bg-teal-500',
      },
    ],
  },
];
