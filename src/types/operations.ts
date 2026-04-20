export type CaseKind = 'judicial' | 'administrative';
export type CasePriority = 'low' | 'medium' | 'high' | 'urgent';
export type CaseTaskStatus = 'todo' | 'doing' | 'done' | 'blocked';

export interface CaseCategory {
  id: string;
  organization_id: string;
  kind: CaseKind;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseStatus {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  name: string;
  color: string;
  order: number;
  is_default: boolean;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
}

export interface CaseTemplate {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  kind: CaseKind;
  category_id: string | null;
  default_assignee_id: string | null;
  default_status_id: string | null;
  default_judicial_data: JudicialData;
  default_administrative_data: AdministrativeData;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CaseTemplateTask {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  days_to_due: number;
  order: number;
  is_mandatory: boolean;
  created_at: string;
}

export interface CaseTrigger {
  id: string;
  organization_id: string;
  pipeline_id: string;
  column_id: string;
  template_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface JudicialData {
  process_number?: string;
  court?: string;
  comarca?: string;
  plaintiff?: string;
  defendant?: string;
  action_type?: string;
  notes?: string;
}

export interface AdministrativeData {
  agency?: string;
  protocol_number?: string;
  benefit_number?: string;
  procedure_type?: string;
  instance?: string;
  notes?: string;
}

export interface OperationsCase {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  template_id: string | null;
  status_id: string | null;
  assignee_id: string | null;
  created_by: string | null;
  kind: CaseKind;
  category_id: string | null;
  title: string;
  priority: CasePriority;
  opened_at: string;
  closed_at: string | null;
  judicial_data: JudicialData;
  administrative_data: AdministrativeData;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CaseTask {
  id: string;
  case_id: string;
  organization_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  order: number;
  status: CaseTaskStatus;
  is_mandatory: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseDeadline {
  id: string;
  case_id: string;
  organization_id: string;
  title: string;
  description: string | null;
  due_date: string;
  is_fatal: boolean;
  notify_days_before: number;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseActivityEntry {
  id: string;
  case_id: string;
  organization_id: string;
  actor_id: string | null;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
}
