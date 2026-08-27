import { useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useWhatsAppInstances } from './useWhatsAppInstances';

export interface WhatsAppGroupParticipant {
  jid: string;
  isAdmin: boolean;
}

export interface WhatsAppGroup {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  whatsapp_instance_id: string | null;
  group_jid: string;
  name: string | null;
  description: string | null;
  picture_url: string | null;
  participant_count: number;
  is_admin: boolean;
  participants: WhatsAppGroupParticipant[];
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// Escopo dos grupos: um grupo pertence ao NUMERO que o sincronizou, entao a
// lista segue a mesma regra do chat — o workspace selecionado manda no numero,
// e numero que nao esta mais conectado nao aparece. Sem isso a pagina mostrava
// os grupos de qualquer instancia da organizacao (inclusive de um numero ja
// desconectado), enquanto o numero do workspace ficava de fora.
export interface GroupsInstanceScope {
  // Instancia designada do workspace selecionado (null quando nao ha workspace).
  instanceId: string | null;
  // true quando o workspace selecionado nao tem numero associado: nao ha grupos
  // para mostrar nem numero para sincronizar.
  blocked: boolean;
  workspaceName: string | null;
  // Instancias conectadas da org — usadas quando nenhum workspace esta selecionado.
  connectedInstanceIds: string[];
  instanceLabel: string | null;
  isLoading: boolean;
}

export function useGroupsInstanceScope(): GroupsInstanceScope {
  const { selectedWorkspace } = useWorkspaceContext();
  const { data: instances = [], isLoading } = useWhatsAppInstances();

  return useMemo(() => {
    const connectedInstanceIds = instances
      .filter((instance) => instance.status === 'connected')
      .map((instance) => instance.id);
    const workspaceInstanceId = selectedWorkspace?.whatsapp_instance_id || null;
    const instance = workspaceInstanceId
      ? instances.find((item) => item.id === workspaceInstanceId) || null
      : null;

    return {
      instanceId: workspaceInstanceId,
      blocked: Boolean(selectedWorkspace) && !workspaceInstanceId,
      workspaceName: selectedWorkspace?.name || null,
      connectedInstanceIds,
      instanceLabel: instance ? (instance.label || instance.phone_number || null) : null,
      isLoading,
    };
  }, [instances, isLoading, selectedWorkspace]);
}

function scopeKeyOf(scope: GroupsInstanceScope): string {
  if (scope.blocked) return 'blocked';
  if (scope.instanceId) return scope.instanceId;
  return `org:${[...scope.connectedInstanceIds].sort().join(',')}`;
}

// Read groups from the DB (populated by the sync action), ja escopados ao numero.
export function useWhatsAppGroups() {
  const { session } = useAuth();
  const scope = useGroupsInstanceScope();

  return useQuery({
    queryKey: ['whatsapp-groups', scopeKeyOf(scope)],
    queryFn: async (): Promise<WhatsAppGroup[]> => {
      // Workspace sem numero: nenhum grupo pertence a ele.
      if (scope.blocked) return [];

      let query = (supabase as any)
        .from('whatsapp_groups')
        .select('*')
        .order('name', { ascending: true });

      if (scope.instanceId) {
        query = query.eq('whatsapp_instance_id', scope.instanceId);
      } else {
        // Sem workspace selecionado: so os numeros que ainda estao conectados.
        if (scope.connectedInstanceIds.length === 0) return [];
        query = query.in('whatsapp_instance_id', scope.connectedInstanceIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as WhatsAppGroup[];
    },
    enabled: !!session && !scope.isLoading,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

async function invokeGroups<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('zapi-groups', { body });
  if (error) throw new Error(error.message || 'Erro ao chamar zapi-groups');
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// Toda acao precisa ir pelo numero do workspace selecionado; caso contrario a
// Evolution responde pela instancia errada (grupos de outro numero).
function useGroupsScopePayload() {
  const scope = useGroupsInstanceScope();
  const { selectedWorkspace } = useWorkspaceContext();

  return useMemo(() => ({
    scope,
    payload: {
      instanceId: scope.instanceId,
      workspaceId: selectedWorkspace?.id || null,
    } as Record<string, unknown>,
  }), [scope, selectedWorkspace]);
}

// Sync the group list from the Evolution API into whatsapp_groups.
export function useSyncGroups() {
  const queryClient = useQueryClient();
  const { scope, payload } = useGroupsScopePayload();

  return useMutation({
    // `silent` é a sincronização automática ao abrir a página: ela não deve
    // encher a tela de toast (nem de erro, em conta que não é Evolution).
    mutationFn: async (options?: { silent?: boolean }) => {
      if (scope.blocked) {
        throw new Error(
          `O workspace ${scope.workspaceName || 'selecionado'} não tem um número de WhatsApp associado. ` +
          'Associe um número ao workspace para sincronizar os grupos.'
        );
      }
      return invokeGroups({ action: 'sync', ...payload });
    },
    onSuccess: (data: any, options) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
      if (options?.silent) return;
      toast({
        title: 'Grupos sincronizados',
        description: `${data?.synced ?? 0} grupo(s) atualizados${data?.removed ? `, ${data.removed} removido(s)` : ''}.`,
      });
    },
    onError: (error: any, options) => {
      if (options?.silent) {
        console.warn('[grupos] sincronização automática falhou:', error?.message || error);
        return;
      }
      toast({
        title: 'Erro ao sincronizar',
        description: error.message || 'Não foi possível sincronizar os grupos.',
        variant: 'destructive',
      });
    },
  });
}

// Sincroniza sozinho ao abrir a pagina quando a lista esta vazia ou velha —
// antes so sincronizava no clique, entao a lista ficava congelada no que o
// ultimo sync (as vezes de outro numero) tinha deixado.
const AUTO_SYNC_STALE_MS = 5 * 60 * 1000;

export function useAutoSyncGroups(
  groups: WhatsAppGroup[] | undefined,
  syncGroups: ReturnType<typeof useSyncGroups>,
  enabled: boolean,
) {
  const scope = useGroupsInstanceScope();
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || scope.isLoading || scope.blocked || !groups) return;
    if (!scope.instanceId && scope.connectedInstanceIds.length === 0) return;

    const key = scopeKeyOf(scope);
    if (attemptedRef.current === key) return;

    const newestSync = groups.reduce<number>((newest, group) => {
      const at = group.last_synced_at ? Date.parse(group.last_synced_at) : 0;
      return at > newest ? at : newest;
    }, 0);
    const isStale = groups.length === 0 || Date.now() - newestSync > AUTO_SYNC_STALE_MS;
    if (!isStale) return;

    attemptedRef.current = key;
    syncGroups.mutate({ silent: true });
  }, [enabled, groups, scope, syncGroups]);
}

// Send a message to one or more groups.
export function useSendGroupMessage() {
  const { payload } = useGroupsScopePayload();

  return useMutation({
    mutationFn: async ({
      groupJids,
      text,
      type = 'text',
      mediaUrl,
      caption,
    }: {
      groupJids: string[];
      text?: string | null;
      type?: 'text' | 'image' | 'video' | 'audio' | 'document';
      mediaUrl?: string | null;
      caption?: string | null;
    }) => {
      const results = [];
      for (const groupJid of groupJids) {
        const res = await invokeGroups({ action: 'send', groupJid, text, type, mediaUrl, caption, ...payload });
        results.push(res);
      }
      return results;
    },
    onSuccess: (_data, vars) => {
      toast({
        title: 'Mensagem enviada',
        description: `Enviada para ${vars.groupJids.length} grupo(s).`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao enviar',
        description: error.message || 'Não foi possível enviar a mensagem.',
        variant: 'destructive',
      });
    },
  });
}

export function useGroupParticipants() {
  const { payload } = useGroupsScopePayload();

  return useMutation({
    mutationFn: async (groupJid: string) => invokeGroups({ action: 'participants', groupJid, ...payload }),
  });
}

export function useUpdateParticipants() {
  const queryClient = useQueryClient();
  const { payload } = useGroupsScopePayload();

  return useMutation({
    mutationFn: async ({
      groupJid,
      participantAction,
      participants,
    }: {
      groupJid: string;
      participantAction: 'add' | 'remove' | 'promote' | 'demote';
      participants: string[];
    }) => invokeGroups({ action: 'updateParticipant', groupJid, participantAction, participants, ...payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
    },
    onError: (error: any) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  const { payload } = useGroupsScopePayload();

  return useMutation({
    mutationFn: async ({
      subject,
      description,
      participants,
    }: {
      subject: string;
      description?: string;
      participants: string[];
    }) => invokeGroups({ action: 'create', subject, description, participants, ...payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
      toast({ title: 'Grupo criado', description: 'O grupo foi criado com sucesso.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao criar grupo', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();
  const { payload } = useGroupsScopePayload();

  return useMutation({
    mutationFn: async ({
      groupJid,
      subject,
      description,
      image,
    }: {
      groupJid: string;
      subject?: string;
      description?: string;
      image?: string;
    }) => {
      if (subject !== undefined) await invokeGroups({ action: 'updateSubject', groupJid, subject, ...payload });
      if (description !== undefined) await invokeGroups({ action: 'updateDescription', groupJid, description, ...payload });
      if (image !== undefined) await invokeGroups({ action: 'updatePicture', groupJid, image, ...payload });
      return { ok: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
      toast({ title: 'Grupo atualizado', description: 'As informações do grupo foram atualizadas.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    },
  });
}
