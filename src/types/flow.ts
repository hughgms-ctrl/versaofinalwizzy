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
  | 'ai-return'
  | 'randomizer'
  | 'smart-delay';

// Content Block Item Types
export type ContentItemType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'delay';

export interface ContentItem {
  id: string;
  type: ContentItemType;
  content?: string;
  mediaUrl?: string;
  caption?: string;
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

// === CONDITION RULE TYPES ===

export type ConditionRuleType =
  | 'tag'
  | 'pipeline'
  | 'assigned'
  | 'variable'
  | 'contact_field'
  | 'service_mode';

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'exists'
  | 'not_exists';

export interface ConditionRule {
  id: string;
  type: ConditionRuleType;
  // For has_tag / not_has_tag
  tagId?: string;
  // For in_pipeline / not_in_pipeline
  pipelineId?: string;
  columnId?: string;
  // For assigned_to
  userId?: string;
  // For variable
  variable?: string;
  operator?: ConditionOperator;
  value?: string;
  // For contact_field
  contactField?: 'name' | 'email' | 'phone';
  // For service_mode
  serviceMode?: 'pending' | 'bot' | 'human';
}

export interface AdvancedConditionConfig {
  matchType: 'all' | 'any';
  rules: ConditionRule[];
}

// === RANDOMIZER TYPES ===

export interface RandomizerVariant {
  id: string;
  label: string;
  weight: number;
}

export interface RandomizerConfig {
  variants: RandomizerVariant[];
}

// === SMART DELAY TYPES ===

export type SmartDelayType = 'fixed' | 'until_time' | 'until_business_hours' | 'until_date';

export interface SmartDelayConfig {
  delayType: SmartDelayType;
  fixedMinutes?: number;
  time?: string;
  businessHoursStart?: string;
  businessHoursEnd?: string;
  weekdaysOnly?: boolean;
  date?: string;
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

// Legacy - kept for backward compat
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
