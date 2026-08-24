import { supabase } from '@/integrations/supabase/client';

// Visibilidade de contato por workspace.
//
// O contato é da ORGANIZAÇÃO: a identidade dele é organization_id + telefone, e
// é assim que o webhook do WhatsApp e a importação o encontram. O workspace, por
// outro lado, é só onde ele APARECE — e um contato pode aparecer em mais de um.
//
// contacts.workspace_id é o workspace de origem (quem criou/recebeu primeiro) e
// contacts.shared_workspace_ids são os demais em que ele também aparece. Nada é
// movido quando um contato passa a ser usado em outro workspace: quem já
// trabalhava nele continua enxergando-o exatamente como antes.
//
// Antes disso, o telefone que já existisse no workspace A ficava preso: no
// workspace B ele não aparecia na lista (filtrada por workspace_id) e também não
// podia ser criado, porque a checagem de duplicidade é por organização.

export interface ContactWorkspaceFields {
  workspace_id?: string | null;
  shared_workspace_ids?: string[] | null;
}

/** O contato aparece neste workspace? (origem ou compartilhamento) */
export function contactAppearsInWorkspace(
  contact: ContactWorkspaceFields,
  workspaceId: string | null | undefined,
): boolean {
  if (!workspaceId || workspaceId === 'unassigned') return !contact.workspace_id;
  if (contact.workspace_id === workspaceId) return true;
  return (contact.shared_workspace_ids || []).includes(workspaceId);
}

/**
 * Cláusula PostgREST para "contatos que aparecem neste workspace", pronta para
 * `.or(...)`: o de origem mais os compartilhados. `cs` é o `@>` do array, que
 * usa o índice GIN de shared_workspace_ids.
 */
export function workspaceVisibilityOrClause(workspaceId: string): string {
  return `workspace_id.eq.${workspaceId},shared_workspace_ids.cs.{${workspaceId}}`;
}

/**
 * Faz o contato aparecer também neste workspace. Retorna true se algo mudou
 * (false quando ele já aparecia lá).
 *
 * Vai por RPC porque ler o array, acrescentar e gravar de volta perde escrita
 * quando dois workspaces compartilham o mesmo contato ao mesmo tempo. A função
 * também recusa workspace de outra organização — compartilhamento nunca cruza
 * orgs.
 */
export async function shareContactWithWorkspace(
  contactId: string,
  workspaceId: string | null | undefined,
): Promise<boolean> {
  if (!workspaceId || workspaceId === 'unassigned') return false;

  const { data, error } = await supabase.rpc('share_contact_with_workspace' as any, {
    _contact_id: contactId,
    _workspace_id: workspaceId,
  });

  if (error) throw error;
  return data === true;
}

/** Tira o contato deste workspace. Só mexe nos compartilhados: o de origem fica. */
export async function unshareContactFromWorkspace(
  contactId: string,
  workspaceId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('unshare_contact_from_workspace' as any, {
    _contact_id: contactId,
    _workspace_id: workspaceId,
  });

  if (error) throw error;
  return data === true;
}
