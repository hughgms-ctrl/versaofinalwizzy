/**
 * Returns true if an item with given workspace_ids/workspace_id should be
 * shown for the currently selected workspace.
 *
 * Rules:
 *  - selectedWorkspaceId === null -> "Todos" -> always show
 *  - workspace_ids array has entries -> match if it includes selected
 *  - else fall back to legacy workspace_id (null = global, or match)
 */
export function matchesWorkspace(
  selectedWorkspaceId: string | null,
  workspace_ids?: string[] | null,
  workspace_id?: string | null
): boolean {
  if (!selectedWorkspaceId) return true;
  if (workspace_ids && workspace_ids.length > 0) {
    return workspace_ids.includes(selectedWorkspaceId);
  }
  // Legacy fallback: null/undefined = global
  if (!workspace_id) return true;
  return workspace_id === selectedWorkspaceId;
}

/** Get effective workspace ids for an item (merged legacy + new). */
export function effectiveWorkspaceIds(
  workspace_ids?: string[] | null,
  workspace_id?: string | null
): string[] {
  const set = new Set<string>(workspace_ids || []);
  if (workspace_id) set.add(workspace_id);
  return Array.from(set);
}

/**
 * generated_documents/document_signatures have no workspace_id of their own —
 * resolve it transitively through the pack/template they were generated from
 * (both of which do carry workspace_id).
 */
export function getGeneratedDocumentWorkspaceId(doc?: {
  document_packs?: { workspace_id?: string | null } | null;
  document_templates?: { workspace_id?: string | null } | null;
} | null): string | null {
  return doc?.document_packs?.workspace_id ?? doc?.document_templates?.workspace_id ?? null;
}
