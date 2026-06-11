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
  CalendarClock,
  Building2,
  LayoutDashboard,
  Briefcase,
  MousePointerClick,
  FileText,
  HelpCircle,
  GitBranch,
  Images,
  SearchCheck,
} from 'lucide-react';
import { TeamMember } from '@/hooks/useTeamMembers';
import { useUserPermissions, useUpdateUserPermissions, UserPermissions } from '@/hooks/useUserPermissions';
import { useTags, Tag } from '@/hooks/useTags';
import { usePipelines, Pipeline } from '@/hooks/usePipelines';
import { useSetUserWorkspaces, useWorkspaces } from '@/hooks/useWorkspaces';
import { useConversationSharesByMember, useUnshareConversation } from '@/hooks/useConversationShares';
import { useConversations } from '@/hooks/useConversations';
import { Share2, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

interface EditPermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamMember | null;
}

const defaultPermissions: Partial<UserPermissions> = {
  can_access_dashboard: true,
  can_access_conversations: false,
  can_access_pipeline: false,
  can_access_flows: false,
  can_access_reports: false,
  can_access_agents: false,
  can_access_settings: false,
  can_access_team: false,
  can_access_scheduled: false,
  can_access_calendar: false,
  can_access_operations: false,
  can_access_tools: false,
  can_access_tool_widgets: false,
  can_access_tool_documents: false,
  can_access_tool_quiz: false,
  can_access_tool_wizzy_flow: false,
  can_access_tool_carousel: false,
  can_access_tool_cnis: false,
  conversations_filter_type: 'all',
  conversations_allowed_tags: [],
  pipeline_access_type: 'all',
  allowed_pipeline_ids: [],
  hide_unassigned_pipeline_ids: [],
};

// Permissões padrão para Supervisor
const supervisorDefaultPermissions: Partial<UserPermissions> = {
  can_access_dashboard: true,
  can_access_conversations: true,
  can_access_pipeline: true,
  can_access_flows: false,
  can_access_reports: true,
  can_access_agents: false,
  can_access_settings: false,
  can_access_team: true,
  can_access_scheduled: true,
  can_access_calendar: true,
  can_access_operations: true,
  can_access_tools: false,
  can_access_tool_widgets: false,
  can_access_tool_documents: false,
  can_access_tool_quiz: false,
  can_access_tool_wizzy_flow: false,
  can_access_tool_carousel: false,
  can_access_tool_cnis: false,
  conversations_filter_type: 'all',
  conversations_allowed_tags: [],
  pipeline_access_type: 'all',
  allowed_pipeline_ids: [],
  hide_unassigned_pipeline_ids: [],
};

export function EditPermissionsDialog({ open, onOpenChange, member }: EditPermissionsDialogProps) {
  const { profile } = useAuth();
  const { selectedOrganizationId } = useWorkspaceContext();
  const organizationId = selectedOrganizationId || profile?.organization_id || null;
  const { data: existingPermissions, isLoading: loadingPermissions } = useUserPermissions(member?.user_id);
  const { data: tags = [] } = useTags();
  const { data: pipelines = [] } = usePipelines();
  const { data: workspaces = [] } = useWorkspaces(organizationId);
  const updatePermissions = useUpdateUserPermissions();
  const setUserWorkspaces = useSetUserWorkspaces();
  const { data: memberShares = [] } = useConversationSharesByMember(member?.user_id);
  const { data: allConversations = [] } = useConversations();
  const unshareConversation = useUnshareConversation();

  const [permissions, setPermissions] = useState<Partial<UserPermissions>>(defaultPermissions);
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[]>([]);

  // Load member's workspace memberships
  useEffect(() => {
    if (member?.user_id && open) {
      // Fetch workspace memberships for this specific member
      const fetchMemberWorkspaces = async () => {
        const { data } = await (await import('@/integrations/supabase/client')).supabase
          .from('workspace_members')
          .select('workspace_id, workspace:workspaces(organization_id)')
          .eq('user_id', member.user_id);
        setSelectedWorkspaceIds((data || [])
          .filter((d: any) => {
            const workspaceOrgId = Array.isArray(d.workspace)
              ? d.workspace[0]?.organization_id
              : d.workspace?.organization_id;
            return !organizationId || workspaceOrgId === organizationId;
          })
          .map((d: any) => d.workspace_id));
      };
      fetchMemberWorkspaces();
    }
  }, [member?.user_id, open, organizationId]);

  useEffect(() => {
    if (existingPermissions) {
      setPermissions({
        can_access_dashboard: existingPermissions.can_access_dashboard ?? true,
        can_access_conversations: existingPermissions.can_access_conversations,
        can_access_pipeline: existingPermissions.can_access_pipeline,
        can_access_flows: existingPermissions.can_access_flows,
        can_access_reports: existingPermissions.can_access_reports,
        can_access_agents: existingPermissions.can_access_agents,
        can_access_settings: existingPermissions.can_access_settings,
        can_access_team: existingPermissions.can_access_team,
        can_access_scheduled: existingPermissions.can_access_scheduled,
        can_access_calendar: (existingPermissions as any).can_access_calendar ?? true,
        can_access_operations: (existingPermissions as any).can_access_operations ?? false,
        can_access_tools: (existingPermissions as any).can_access_tools ?? false,
        can_access_tool_widgets: (existingPermissions as any).can_access_tool_widgets ?? false,
        can_access_tool_documents: (existingPermissions as any).can_access_tool_documents ?? false,
        can_access_tool_quiz: (existingPermissions as any).can_access_tool_quiz ?? false,
        can_access_tool_wizzy_flow: (existingPermissions as any).can_access_tool_wizzy_flow ?? false,
        can_access_tool_carousel: (existingPermissions as any).can_access_tool_carousel ?? false,
        can_access_tool_cnis: (existingPermissions as any).can_access_tool_cnis ?? false,
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

    await setUserWorkspaces.mutateAsync({
      userId: member.user_id,
      workspaceIds: selectedWorkspaceIds,
      organizationId,
    });

    onOpenChange(false);
  };

  const toggleModule = (key: keyof UserPermissions, value: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [key]: value,
      ...(key === 'can_access_tools' && !value ? {
        can_access_tool_widgets: false,
        can_access_tool_documents: false,
        can_access_tool_quiz: false,
        can_access_tool_wizzy_flow: false,
        can_access_tool_carousel: false,
        can_access_tool_cnis: false,
      } : {}),
    }));
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
                    icon={LayoutDashboard}
                    label="Dashboard"
                    checked={permissions.can_access_dashboard ?? true}
                    onCheckedChange={(v) => toggleModule('can_access_dashboard', v)}
                  />
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
                    icon={Calendar}
                    label="Agenda"
                    checked={permissions.can_access_calendar ?? true}
                    onCheckedChange={(v) => toggleModule('can_access_calendar', v)}
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
                    icon={CalendarClock}
                    label="Mensagens programadas"
                    checked={permissions.can_access_scheduled || false}
                    onCheckedChange={(v) => toggleModule('can_access_scheduled', v)}
                  />
                  <ModuleSwitch
                    icon={Briefcase}
                    label="Operacional"
                    checked={permissions.can_access_operations || false}
                    onCheckedChange={(v) => toggleModule('can_access_operations', v)}
                  />
                  <ModuleSwitch
                    icon={MousePointerClick}
                    label="Ferramentas"
                    checked={permissions.can_access_tools || false}
                    onCheckedChange={(v) => toggleModule('can_access_tools', v)}
                  />
                </div>
              </div>

              {permissions.can_access_tools && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                      <MousePointerClick className="h-4 w-4" />
                      Ferramentas liberadas
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <ModuleSwitch
                        icon={MousePointerClick}
                        label="Wizzy Forms"
                        checked={permissions.can_access_tool_widgets || false}
                        onCheckedChange={(v) => toggleModule('can_access_tool_widgets', v)}
                      />
                      <ModuleSwitch
                        icon={FileText}
                        label="Wizzy Sign"
                        checked={permissions.can_access_tool_documents || false}
                        onCheckedChange={(v) => toggleModule('can_access_tool_documents', v)}
                      />
                      <ModuleSwitch
                        icon={HelpCircle}
                        label="Wizzy Quiz"
                        checked={permissions.can_access_tool_quiz || false}
                        onCheckedChange={(v) => toggleModule('can_access_tool_quiz', v)}
                      />
                      <ModuleSwitch
                        icon={GitBranch}
                        label="Wizzy Flow"
                        checked={permissions.can_access_tool_wizzy_flow || false}
                        onCheckedChange={(v) => toggleModule('can_access_tool_wizzy_flow', v)}
                      />
                      <ModuleSwitch
                        icon={Images}
                        label="Wizzy Carrossel"
                        checked={permissions.can_access_tool_carousel || false}
                        onCheckedChange={(v) => toggleModule('can_access_tool_carousel', v)}
                      />
                      <ModuleSwitch
                        icon={SearchCheck}
                        label="Wizzy Prev"
                        checked={permissions.can_access_tool_cnis || false}
                        onCheckedChange={(v) => toggleModule('can_access_tool_cnis', v)}
                      />
                    </div>
                  </div>
                </>
              )}

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

              {/* Shared Leads Section */}
              {memberShares.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                      <Share2 className="h-4 w-4" />
                      Leads Compartilhados ({memberShares.length})
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Leads compartilhados manualmente com este membro, independente das demais restrições.
                    </p>
                    <div className="space-y-2 p-3 border rounded-lg bg-muted/30 max-h-48 overflow-y-auto">
                      {memberShares.map(share => {
                        const conv = allConversations.find(c => c.id === share.conversation_id);
                        return (
                          <div key={share.id} className="flex items-center justify-between gap-2 py-1">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {conv?.contact?.name || conv?.contact?.phone || 'Lead removido'}
                              </p>
                              {conv?.contact?.phone && conv?.contact?.name && (
                                <p className="text-xs text-muted-foreground">{conv.contact.phone}</p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={async () => {
                                await unshareConversation.mutateAsync({
                                  conversationId: share.conversation_id,
                                  userId: member!.user_id,
                                });
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
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
            <Button onClick={handleSave} disabled={updatePermissions.isPending || setUserWorkspaces.isPending}>
              {(updatePermissions.isPending || setUserWorkspaces.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
