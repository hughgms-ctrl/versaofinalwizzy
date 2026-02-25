import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MessageSquare,
  Kanban,
  Workflow,
  BarChart3,
  Bot,
  Settings,
  Users,
  Loader2,
  Shield,
  Calendar,
  Building2,
} from 'lucide-react';
import { TeamMember } from '@/hooks/useTeamMembers';
import { useUserPermissions, useUpdateUserPermissions, UserPermissions } from '@/hooks/useUserPermissions';
import { useTags, Tag } from '@/hooks/useTags';
import { usePipelines, Pipeline } from '@/hooks/usePipelines';
import { useWorkspaces, useUserWorkspaces, useManageWorkspaceMembers, Workspace } from '@/hooks/useWorkspaces';

interface EditPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMember | null;
}

const defaultPermissions: Partial<UserPermissions> = {
  can_access_conversations: false,
  can_access_pipeline: false,
  can_access_flows: false,
  can_access_reports: false,
  can_access_agents: false,
  can_access_settings: false,
  can_access_team: false,
  can_access_scheduled: false,
  conversations_filter_type: 'all',
  conversations_allowed_tags: [],
  pipeline_access_type: 'all',
  allowed_pipeline_ids: [],
  hide_unassigned_pipeline_ids: [],
};

// Permissões padrão para Supervisor
const supervisorDefaultPermissions: Partial<UserPermissions> = {
  can_access_conversations: true,
  can_access_pipeline: true,
  can_access_flows: false,
  can_access_reports: true,
  can_access_agents: false,
  can_access_settings: false,
  can_access_team: true,
  can_access_scheduled: true,
  conversations_filter_type: 'all',
  conversations_allowed_tags: [],
  pipeline_access_type: 'all',
  allowed_pipeline_ids: [],
  hide_unassigned_pipeline_ids: [],
};

export function EditPermissionsDialog({ open, onOpenChange, member }: EditPermissionsDialogProps) {
  const { data: existingPermissions, isLoading: loadingPermissions } = useUserPermissions(member?.user_id);
  const { data: tags = [] } = useTags();
  const { data: pipelines = [] } = usePipelines();
  const { data: workspaces = [] } = useWorkspaces();
  const updatePermissions = useUpdateUserPermissions();
  const manageWorkspaceMembers = useManageWorkspaceMembers();

  // Fetch workspaces this user belongs to
  const { data: allWorkspaceMembers = [] } = useUserWorkspaces();

  const [permissions, setPermissions] = useState<Partial<UserPermissions>>(defaultPermissions);
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>([]);

  // Load member's workspace memberships
  useEffect(() => {
    if (member?.user_id && open) {
      // Fetch workspace memberships for this specific member
      const fetchMemberWorkspaces = async () => {
        const { data } = await (await import('@/integrations/supabase/client')).supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', member.user_id);
        setSelectedWorkspaceIds((data || []).map((d: any) => d.workspace_id));
      };
      fetchMemberWorkspaces();
    }
  }, [member?.user_id, open]);

  useEffect(() => {
    if (existingPermissions) {
      setPermissions({
        can_access_conversations: existingPermissions.can_access_conversations,
        can_access_pipeline: existingPermissions.can_access_pipeline,
        can_access_flows: existingPermissions.can_access_flows,
        can_access_reports: existingPermissions.can_access_reports,
        can_access_agents: existingPermissions.can_access_agents,
        can_access_settings: existingPermissions.can_access_settings,
        can_access_team: existingPermissions.can_access_team,
        can_access_scheduled: existingPermissions.can_access_scheduled,
        conversations_filter_type: existingPermissions.conversations_filter_type,
        conversations_allowed_tags: existingPermissions.conversations_allowed_tags || [],
        pipeline_access_type: existingPermissions.pipeline_access_type,
        allowed_pipeline_ids: existingPermissions.allowed_pipeline_ids || [],
        hide_unassigned_pipeline_ids: (existingPermissions as any).hide_unassigned_pipeline_ids || [],
      });
    } else if (member?.role === 'supervisor') {
      setPermissions(supervisorDefaultPermissions);
    } else {
      setPermissions(defaultPermissions);
    }
  }, [existingPermissions, open, member?.role]);

  const handleSave = async () => {
    if (!member) return;
    
    await updatePermissions.mutateAsync({
      user_id: member.user_id,
      ...permissions,
    });

    // Save workspace memberships for each workspace
    // We need to add/remove this member from workspaces
    for (const workspace of workspaces) {
      const isSelected = selectedWorkspaceIds.includes(workspace.id);
      const { data: currentMembers } = await (await import('@/integrations/supabase/client')).supabase
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', workspace.id);
      
      const memberUserIds = (currentMembers || []).map((m: any) => m.user_id);
      const isMember = memberUserIds.includes(member.user_id);

      if (isSelected && !isMember) {
        // Add member
        const newIds = [...memberUserIds, member.user_id];
        await manageWorkspaceMembers.mutateAsync({ workspaceId: workspace.id, userIds: newIds });
      } else if (!isSelected && isMember) {
        // Remove member
        const newIds = memberUserIds.filter((id: string) => id !== member.user_id);
        await manageWorkspaceMembers.mutateAsync({ workspaceId: workspace.id, userIds: newIds });
      }
    }

    onOpenChange(false);
  };

  const toggleModule = (key: keyof UserPermissions, value: boolean) => {
    setPermissions(prev => ({ ...prev, [key]: value }));
  };

  const toggleTag = (tagId: string) => {
    setPermissions(prev => {
      const current = prev.conversations_allowed_tags || [];
      const updated = current.includes(tagId)
        ? current.filter(id => id !== tagId)
        : [...current, tagId];
      return { ...prev, conversations_allowed_tags: updated };
    });
  };

  const togglePipeline = (pipelineId: string) => {
    setPermissions(prev => {
      const current = prev.allowed_pipeline_ids || [];
      const updated = current.includes(pipelineId)
        ? current.filter(id => id !== pipelineId)
        : [...current, pipelineId];
      return { ...prev, allowed_pipeline_ids: updated };
    });
  };

  const toggleHideUnassigned = (pipelineId: string) => {
    setPermissions(prev => {
      const current = (prev as any).hide_unassigned_pipeline_ids || [];
      const updated = current.includes(pipelineId)
        ? current.filter((id: string) => id !== pipelineId)
        : [...current, pipelineId];
      return { ...prev, hide_unassigned_pipeline_ids: updated };
    });
  };

  const toggleWorkspace = (workspaceId: string) => {
    setSelectedWorkspaceIds(prev =>
      prev.includes(workspaceId) ? prev.filter(id => id !== workspaceId) : [...prev, workspaceId]
    );
  };

  const isOwnerOrAdmin = member?.role === 'owner' || member?.role === 'admin';

  if (!member) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Permissões de {member.name}
          </DialogTitle>
          <DialogDescription>
            Configure quais áreas e funcionalidades este membro pode acessar.
          </DialogDescription>
        </DialogHeader>

        {isOwnerOrAdmin ? (
          <div className="py-8 text-center">
            <Shield className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <p className="text-lg font-medium">Acesso Total</p>
            <p className="text-muted-foreground">
              {member.role === 'owner' ? 'Proprietários' : 'Administradores'} têm acesso completo a todas as áreas do sistema.
            </p>
          </div>
        ) : loadingPermissions ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[60vh] pr-4">
            <div className="space-y-6 pb-4">
              {/* Module Access */}
              <div>
                <h3 className="text-sm font-medium mb-4">Acesso aos Módulos</h3>
                <div className="grid grid-cols-2 gap-4">
                  <ModuleSwitch
                    icon={MessageSquare}
                    label="Conversas"
                    checked={permissions.can_access_conversations || false}
                    onCheckedChange={(v) => toggleModule('can_access_conversations', v)}
                  />
                  <ModuleSwitch
                    icon={Kanban}
                    label="Pipeline"
                    checked={permissions.can_access_pipeline || false}
                    onCheckedChange={(v) => toggleModule('can_access_pipeline', v)}
                  />
                  <ModuleSwitch
                    icon={Workflow}
                    label="Fluxos"
                    checked={permissions.can_access_flows || false}
                    onCheckedChange={(v) => toggleModule('can_access_flows', v)}
                  />
                  <ModuleSwitch
                    icon={BarChart3}
                    label="Relatórios"
                    checked={permissions.can_access_reports || false}
                    onCheckedChange={(v) => toggleModule('can_access_reports', v)}
                  />
                  <ModuleSwitch
                    icon={Bot}
                    label="Agentes IA"
                    checked={permissions.can_access_agents || false}
                    onCheckedChange={(v) => toggleModule('can_access_agents', v)}
                  />
                  <ModuleSwitch
                    icon={Settings}
                    label="Configurações"
                    checked={permissions.can_access_settings || false}
                    onCheckedChange={(v) => toggleModule('can_access_settings', v)}
                  />
                  <ModuleSwitch
                    icon={Users}
                    label="Equipe"
                    checked={permissions.can_access_team || false}
                    onCheckedChange={(v) => toggleModule('can_access_team', v)}
                  />
                  <ModuleSwitch
                    icon={Calendar}
                    label="Agendamentos"
                    checked={permissions.can_access_scheduled || false}
                    onCheckedChange={(v) => toggleModule('can_access_scheduled', v)}
                  />
                </div>
              </div>

              {/* Conversations Restrictions */}
              {permissions.can_access_conversations && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Restrições de Conversas
                    </h3>
                    
                    <div className="space-y-4">
                      <div>
                        <Label>Tipo de Filtro</Label>
                        <Select
                          value={permissions.conversations_filter_type}
                          onValueChange={(v) => setPermissions(prev => ({ 
                            ...prev, 
                            conversations_filter_type: v as UserPermissions['conversations_filter_type']
                          }))}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas as conversas</SelectItem>
                            <SelectItem value="assigned">Apenas atribuídas a ele</SelectItem>
                            <SelectItem value="tags">Apenas com tags específicas</SelectItem>
                            <SelectItem value="assigned_and_tags">Atribuídas OU com tags específicas</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {(permissions.conversations_filter_type === 'tags' || 
                        permissions.conversations_filter_type === 'assigned_and_tags') && (
                        <div>
                          <Label className="mb-2 block">Tags Permitidas</Label>
                          <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/30">
                            {tags.length === 0 ? (
                              <span className="text-sm text-muted-foreground">Nenhuma tag cadastrada</span>
                            ) : (
                              tags.map((tag) => (
                                <TagCheckbox
                                  key={tag.id}
                                  tag={tag}
                                  checked={(permissions.conversations_allowed_tags || []).includes(tag.id)}
                                  onCheckedChange={() => toggleTag(tag.id)}
                                />
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Pipeline Restrictions */}
              {permissions.can_access_pipeline && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                      <Kanban className="h-4 w-4" />
                      Restrições de Pipeline
                    </h3>
                    
                    <div className="space-y-4">
                      <div>
                        <Label>Tipo de Acesso</Label>
                        <Select
                          value={permissions.pipeline_access_type}
                          onValueChange={(v) => setPermissions(prev => ({ 
                            ...prev, 
                            pipeline_access_type: v as 'all' | 'specific'
                          }))}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os pipelines</SelectItem>
                            <SelectItem value="specific">Pipelines específicos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {permissions.pipeline_access_type === 'specific' && (
                        <div>
                          <Label className="mb-2 block">Pipelines Permitidos</Label>
                          <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                            {(() => {
                              const memberPipelines = pipelines.filter(p => 
                                selectedWorkspaceIds.length === 0 || !p.workspace_ids || p.workspace_ids.length === 0 || p.workspace_ids.some(wid => selectedWorkspaceIds.includes(wid))
                              );
                              return memberPipelines.length === 0 ? (
                                <span className="text-sm text-muted-foreground">Nenhum pipeline disponível nos workspaces selecionados</span>
                              ) : (
                                memberPipelines.map((pipeline) => (
                                  <div key={pipeline.id} className="flex items-center gap-2">
                                    <Checkbox
                                      id={`pipeline-${pipeline.id}`}
                                      checked={(permissions.allowed_pipeline_ids || []).includes(pipeline.id)}
                                      onCheckedChange={() => togglePipeline(pipeline.id)}
                                    />
                                    <Label htmlFor={`pipeline-${pipeline.id}`} className="cursor-pointer">
                                      {pipeline.name}
                                    </Label>
                                  </div>
                                ))
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Hide unassigned per pipeline */}
                      <div>
                        <Label className="mb-2 block">Ocultar "Não classificados" nos pipelines</Label>
                        <p className="text-xs text-muted-foreground mb-2">
                          Marque os pipelines onde este membro NÃO verá a coluna de leads não classificados.
                        </p>
                        <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                            {(() => {
                              const basePipelines = pipelines.filter(p => 
                                selectedWorkspaceIds.length === 0 || !p.workspace_ids || p.workspace_ids.length === 0 || p.workspace_ids.some(wid => selectedWorkspaceIds.includes(wid))
                              );
                            const visiblePipelines = permissions.pipeline_access_type === 'specific'
                              ? basePipelines.filter(p => (permissions.allowed_pipeline_ids || []).includes(p.id))
                              : basePipelines;
                            return visiblePipelines.length === 0 ? (
                              <span className="text-sm text-muted-foreground">Nenhum pipeline disponível</span>
                            ) : (
                              visiblePipelines.map((pipeline) => (
                                <div key={pipeline.id} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`hide-unassigned-${pipeline.id}`}
                                    checked={((permissions as any).hide_unassigned_pipeline_ids || []).includes(pipeline.id)}
                                    onCheckedChange={() => toggleHideUnassigned(pipeline.id)}
                                  />
                                  <Label htmlFor={`hide-unassigned-${pipeline.id}`} className="cursor-pointer text-sm">
                                    {pipeline.name}
                                  </Label>
                                </div>
                              ))
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Workspace Access */}
              {workspaces.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Workspaces
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Selecione quais workspaces este membro pode acessar.
                    </p>
                    <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                      {workspaces.map((workspace) => (
                        <div key={workspace.id} className="flex items-center gap-3">
                          <Checkbox
                            id={`workspace-${workspace.id}`}
                            checked={selectedWorkspaceIds.includes(workspace.id)}
                            onCheckedChange={() => toggleWorkspace(workspace.id)}
                          />
                          <div
                            className="h-3 w-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: workspace.color }}
                          />
                          <Label htmlFor={`workspace-${workspace.id}`} className="cursor-pointer">
                            {workspace.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {!isOwnerOrAdmin && (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={updatePermissions.isPending}>
              {updatePermissions.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Permissões
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModuleSwitch({ 
  icon: Icon, 
  label, 
  checked, 
  onCheckedChange 
}: { 
  icon: React.ElementType; 
  label: string; 
  checked: boolean; 
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function TagCheckbox({ 
  tag, 
  checked, 
  onCheckedChange 
}: { 
  tag: Tag; 
  checked: boolean; 
  onCheckedChange: () => void;
}) {
  return (
    <div 
      className="flex items-center gap-1.5 cursor-pointer"
      onClick={onCheckedChange}
    >
      <Checkbox checked={checked} />
      <Badge 
        variant="outline" 
        style={{ 
          backgroundColor: `${tag.color}20`,
          borderColor: tag.color,
          color: tag.color,
        }}
      >
        {tag.name}
      </Badge>
    </div>
  );
}
