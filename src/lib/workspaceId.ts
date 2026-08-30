/**
 * O seletor de workspace usa a string 'unassigned' como sentinela de "Sem
 * Workspace" — ela NAO e um uuid. Mandada para o PostgREST, derruba a consulta
 * inteira (`invalid input syntax for type uuid`) e, num insert, derruba a
 * gravacao. No banco, "sem workspace" e NULL.
 *
 * Ja quebrou a lista e a criacao de tags (commit 41ade59a); as campanhas e a
 * configuracao do funil tinham o mesmo furo.
 */
export const UNASSIGNED_WORKSPACE = 'unassigned';

/** O uuid do workspace, ou null quando e "Sem Workspace" (ou nada selecionado). */
export function normalizeWorkspaceId(workspaceId: string | null | undefined): string | null {
  if (!workspaceId || workspaceId === UNASSIGNED_WORKSPACE) return null;
  return workspaceId;
}

/** True quando o usuario escolheu explicitamente "Sem Workspace". */
export function isUnassignedWorkspace(workspaceId: string | null | undefined): boolean {
  return workspaceId === UNASSIGNED_WORKSPACE;
}
