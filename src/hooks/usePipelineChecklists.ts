import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type ChecklistItem = { id: string; text: string; done: boolean };
export type ChecklistTemplate = { id: string; name: string; workspaceId: string | null; items: ChecklistItem[] };

// Legacy localStorage keys — kept for one-time migration and for the
// admin/no-workspace fallback (templates require a workspace in the DB).
const getChecklistTemplateStorageKey = (workspaceId?: string | null) => `pipeline_checklist_templates:${workspaceId || 'global'}`;
const getColumnChecklistStorageKey = (workspaceId?: string | null, pipelineId?: string | null) => (
  `pipeline_column_checklists:${workspaceId || 'global'}:${pipelineId || 'none'}`
);

export const checklistTemplatesQueryKey = (workspaceId?: string | null) => ['pipeline-checklist-templates', workspaceId || 'global'];
export const columnChecklistsQueryKey = (workspaceId?: string | null, pipelineId?: string | null) => (
  ['pipeline-column-checklists', workspaceId || 'global', pipelineId || 'none']
);

function normalizeItems(items: any): ChecklistItem[] {
  return Array.isArray(items)
    ? items.map((item: any) => ({
        id: item.id || crypto.randomUUID(),
        text: item.text || '',
        done: !!item.done,
      }))
    : [];
}

function rowToTemplate(row: any): ChecklistTemplate {
  return {
    id: row.id,
    name: row.name,
    workspaceId: row.workspace_id ?? null,
    items: normalizeItems(row.items),
  };
}

function readLocalTemplates(workspaceId?: string | null): ChecklistTemplate[] {
  try {
    const stored = JSON.parse(localStorage.getItem(getChecklistTemplateStorageKey(workspaceId)) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.map((template: any) => ({
      id: template.id || crypto.randomUUID(),
      name: template.name || 'Checklist',
      workspaceId: template.workspaceId || workspaceId || null,
      items: normalizeItems(template.items),
    }));
  } catch {
    return [];
  }
}

function writeLocalTemplates(workspaceId: string | null | undefined, templates: ChecklistTemplate[]) {
  localStorage.setItem(getChecklistTemplateStorageKey(workspaceId), JSON.stringify(templates));
}

function readLocalColumnConfig(workspaceId?: string | null, pipelineId?: string | null): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(getColumnChecklistStorageKey(workspaceId, pipelineId)) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Avoid re-running the localStorage -> DB migration on every refetch.
const migratedTemplateWorkspaces = new Set<string>();
const migratedColumnConfigs = new Set<string>();

async function migrateLocalTemplates(workspaceId: string) {
  if (migratedTemplateWorkspaces.has(workspaceId)) return;
  migratedTemplateWorkspaces.add(workspaceId);
  const local = readLocalTemplates(workspaceId);
  if (local.length === 0) return;
  const rows = local.map(template => ({
    id: template.id,
    workspace_id: workspaceId,
    name: template.name,
    items: template.items.map(item => ({ id: item.id, text: item.text, done: false })) as any,
  }));
  const { error } = await (supabase as any)
    .from('pipeline_checklist_templates')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (error) {
    // Allow a retry on a later refetch if the migration failed.
    migratedTemplateWorkspaces.delete(workspaceId);
    throw error;
  }
}

async function migrateLocalColumnConfig(workspaceId: string, pipelineId: string) {
  const cacheKey = `${workspaceId}:${pipelineId}`;
  if (migratedColumnConfigs.has(cacheKey)) return;
  migratedColumnConfigs.add(cacheKey);
  const local = readLocalColumnConfig(workspaceId, pipelineId);
  const entries = Object.entries(local).filter(([, templateId]) => !!templateId);
  if (entries.length === 0) return;
  const rows = entries.map(([columnId, templateId]) => ({
    workspace_id: workspaceId,
    pipeline_id: pipelineId,
    column_id: columnId,
    template_id: templateId,
  }));
  const { error } = await (supabase as any)
    .from('pipeline_column_checklists')
    .upsert(rows, { onConflict: 'pipeline_id,column_id', ignoreDuplicates: true });
  if (error) {
    migratedColumnConfigs.delete(cacheKey);
    throw error;
  }
}

export async function fetchChecklistTemplates(workspaceId?: string | null): Promise<ChecklistTemplate[]> {
  if (!workspaceId) return readLocalTemplates(workspaceId);
  // Best-effort migration of pre-existing localStorage modelos into the DB.
  try {
    await migrateLocalTemplates(workspaceId);
  } catch {
    // ignore — fall through to read whatever is already in the DB
  }
  const { data, error } = await (supabase as any)
    .from('pipeline_checklist_templates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data as any[]) || []).map(rowToTemplate);
}

export async function fetchColumnChecklistConfig(workspaceId?: string | null, pipelineId?: string | null): Promise<Record<string, string>> {
  if (!workspaceId || !pipelineId) return readLocalColumnConfig(workspaceId, pipelineId);
  try {
    await migrateLocalColumnConfig(workspaceId, pipelineId);
  } catch {
    // ignore
  }
  const { data, error } = await (supabase as any)
    .from('pipeline_column_checklists')
    .select('column_id, template_id')
    .eq('pipeline_id', pipelineId);
  if (error) throw error;
  const config: Record<string, string> = {};
  for (const row of (data as any[]) || []) {
    config[row.column_id] = row.template_id;
  }
  return config;
}

export async function upsertChecklistTemplate(template: ChecklistTemplate, workspaceId?: string | null) {
  const items = template.items.map(item => ({ id: item.id, text: item.text, done: false }));
  if (!workspaceId) {
    const local = readLocalTemplates(workspaceId);
    const exists = local.some(t => t.id === template.id);
    const next = exists
      ? local.map(t => (t.id === template.id ? { ...template, items } : t))
      : [...local, { ...template, items }];
    writeLocalTemplates(workspaceId, next);
    return;
  }
  const { error } = await (supabase as any)
    .from('pipeline_checklist_templates')
    .upsert({
      id: template.id,
      workspace_id: workspaceId,
      name: template.name,
      items: items as any,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  if (error) throw error;
}

export async function deleteChecklistTemplate(templateId: string, workspaceId?: string | null) {
  if (!workspaceId) {
    const next = readLocalTemplates(workspaceId).filter(t => t.id !== templateId);
    writeLocalTemplates(workspaceId, next);
    return;
  }
  const { error } = await (supabase as any)
    .from('pipeline_checklist_templates')
    .delete()
    .eq('id', templateId);
  if (error) throw error;
}

export async function setColumnChecklistTemplate(
  columnId: string,
  templateId: string,
  workspaceId?: string | null,
  pipelineId?: string | null,
) {
  if (!workspaceId || !pipelineId) {
    const current = readLocalColumnConfig(workspaceId, pipelineId);
    const next = { ...current };
    if (templateId) next[columnId] = templateId;
    else delete next[columnId];
    localStorage.setItem(getColumnChecklistStorageKey(workspaceId, pipelineId), JSON.stringify(next));
    return;
  }
  if (!templateId) {
    const { error } = await (supabase as any)
      .from('pipeline_column_checklists')
      .delete()
      .eq('pipeline_id', pipelineId)
      .eq('column_id', columnId);
    if (error) throw error;
    return;
  }
  const { error } = await (supabase as any)
    .from('pipeline_column_checklists')
    .upsert({
      workspace_id: workspaceId,
      pipeline_id: pipelineId,
      column_id: columnId,
      template_id: templateId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'pipeline_id,column_id' });
  if (error) throw error;
}

export function usePipelineChecklistTemplates(workspaceId?: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: checklistTemplatesQueryKey(workspaceId),
    queryFn: () => fetchChecklistTemplates(workspaceId),
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePipelineColumnChecklists(workspaceId?: string | null, pipelineId?: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: columnChecklistsQueryKey(workspaceId, pipelineId),
    queryFn: () => fetchColumnChecklistConfig(workspaceId, pipelineId),
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
  });
}

export function useInvalidateChecklists() {
  const queryClient = useQueryClient();
  return {
    invalidateTemplates: (workspaceId?: string | null) =>
      queryClient.invalidateQueries({ queryKey: checklistTemplatesQueryKey(workspaceId) }),
    invalidateColumnConfig: (workspaceId?: string | null, pipelineId?: string | null) =>
      queryClient.invalidateQueries({ queryKey: columnChecklistsQueryKey(workspaceId, pipelineId) }),
  };
}
