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
