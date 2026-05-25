// Conversation Types
export interface Conversation {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAvatar?: string;
  lastMessage: string;
  timestamp: Date;
  status: 'open' | 'pending' | 'closed' | 'urgent';
  assignedAgent: Agent | null;
  tags: string[];
  pipelineStage: string;
  unreadCount: number;
  channel: 'whatsapp' | 'email' | 'chat' | 'phone';
}

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  timestamp: Date;
  sender: 'customer' | 'agent' | 'ai';
  agentName?: string;
  isRead: boolean;
}

// Agent Types
export interface Agent {
  id: string;
  name: string;
  type: 'ai' | 'human';
  avatar?: string;
  status: 'online' | 'offline' | 'busy';
  persona?: string;
  description?: string;
  specialization?: string[];
  knowledgeBase?: string[];
  isActive: boolean;
  conversationsHandled: number;
  avgResponseTime: number;
  satisfactionScore: number;
}

// Pipeline Types
export interface PipelineColumn {
  id: string;
  title: string;
  tag: string;
  color: string;
  order: number;
}

export interface PipelineCard {
  id: string;
  conversation: Conversation;
  columnId: string;
}

// Flow Types
export interface Flow {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  triggersCount: number;
  nodesCount: number;
}

// Metrics Types
export interface Metrics {
  totalConversations: number;
  openConversations: number;
  avgResponseTime: number;
  avgHandleTime: number;
  aiHandledPercentage: number;
  satisfactionScore: number;
  conversationsToday: number;
  resolvedToday: number;
}

// Filter Types
export interface ConversationFilters {
  status?: string[];
  agent?: string;
  tag?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  channel?: string[];
}
