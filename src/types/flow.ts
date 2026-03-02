// Flow Builder Types

export type FlowNodeType =
  | 'start'
  | 'content-block'
  | 'message-buttons'
  | 'message-list'
  | 'action-tag'
  | 'action-pipeline'
  | 'action-transfer'
  | 'action-webhook'
  | 'action-flow'
  | 'action-department'
  | 'action-document'
  | 'action-delay'
  | 'condition'
  | 'user-input'
  | 'ai-handoff'
  | 'ai-return';

// Content Block Item Types
export type ContentItemType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'delay';

export interface ContentItem {
  id: string;
  type: ContentItemType;
  // For text
  content?: string;
  // For media (image, video, audio, document)
  mediaUrl?: string;
  caption?: string;
  // For delay
  delaySeconds?: number;
}

export interface ContentBlockConfig {
  items: ContentItem[];
}

export interface FlowNodeData {
  label: string;
  type: FlowNodeType;
  config?: Record<string, unknown>;
}

// Message Node Configs
export interface TextMessageConfig {
  content: string;
  formatting?: {
    bold?: boolean;
    italic?: boolean;
  };
}

export interface MediaMessageConfig {
  mediaType: 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string;
  caption?: string;
}

export interface ButtonsMessageConfig {
  text: string;
  buttons: Array<{
    id: string;
    label: string;
  }>;
}

export interface ListMessageConfig {
  headerText: string;
  bodyText: string;
  buttonText: string;
  sections: Array<{
    title: string;
    items: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>;
}

// Action Node Configs
export interface TagActionConfig {
  action: 'add' | 'remove';
  tagId: string;
}

export interface PipelineActionConfig {
  pipelineColumnId: string;
}

export interface TransferActionConfig {
  agentType: 'human' | 'ai';
  agentId: string;
}

export interface DelayActionConfig {
  duration: number;
  unit: 'seconds' | 'minutes' | 'hours';
}

export interface WebhookActionConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
}

// Logic Node Configs
export interface ConditionConfig {
  variable: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: string;
}

export interface UserInputConfig {
  variableName: string;
  inputType: 'text' | 'number' | 'email' | 'phone' | 'cpf';
  validationMessage?: string;
}

// AI Node Configs
export interface AIHandoffConfig {
  agentId?: string;
  contextMessage?: string;
}

export interface AIReturnConfig {
  returnToNodeId?: string;
}

// Sidebar Component Categories
export interface FlowComponentCategory {
  id: string;
  label: string;
  icon: string;
  components: FlowComponent[];
}

export interface FlowComponent {
  type: FlowNodeType;
  label: string;
  description: string;
  icon: string;
  color: string;
}
