import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Building2, Plus, Pencil, Trash2, Loader2, Users, Tag } from 'lucide-react';
import { useAllWorkspaces, useCreateWorkspace, useUpdateWorkspace, useWorkspaceMembers, useManageWorkspaceMembers, Workspace } from '@/hooks/useWorkspaces';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTags, Tag as TagType } from '@/hooks/useTags';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useToast } from '@/hooks/use-toast';
import { useOrganizationPlan } from '@/hooks/useOrganizationPlan';
import { LimitUpgradeDialog } from '@/components/billing/LimitUpgradeDialog';

const WORKSPACE_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

export function WorkspacesSettings() {
  const { data: allWorkspaces = [], isLoading } = useAllWorkspaces();
  const workspaces = [...allWorkspaces].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const activeCount = allWorkspaces.filter(w => w.is_active).length;
  const inactiveCount = allWorkspaces.length - activeCount;
  const { usage } = useOrganizationPlan();
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const workspaceLimitReached = usage.workspaceLimit > 0 && usage.workspaceCount >= usage.workspaceLimit;

  const handleCreateClick = () => {
    if (workspaceLimitReached) {
      setShowLimitDialog(true);
      return;
    }
    setShowCreateDialog(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-foreground">Workspaces</CardTitle>
              <CardDescription>
                Gerencie os workspaces da sua organização. Cada workspace isola leads, pipelines, fluxos e widgets por área de atuação.
              </CardDescription>
              {allWorkspaces.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {activeCount} ativo{activeCount === 1 ? '' : 's'}
                  {inactiveCount > 0 && ` · ${inactiveCount} inativo${inactiveCount === 1 ? '' : 's'}`}
                </p>
              )}
            </div>
            <Button onClick={handleCreateClick} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Workspace
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {workspaces.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">Nenhum workspace criado</p>
              <p className="text-muted-foreground mb-4">
                Crie workspaces para separar leads e recursos por área de atuação.
              </p>
              <Button onClick={handleCreateClick} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Criar primeiro workspace
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {workspaces.map((workspace) => (
                <WorkspaceCard
                  key={workspace.id}
                  workspace={workspace}
                  onEdit={() => setEditingWorkspace(workspace)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <WorkspaceFormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        workspace={null}
      />

      <LimitUpgradeDialog
        open={showLimitDialog}
        onOpenChange={setShowLimitDialog}
        description={`Seu plano permite ${usage.workspaceLimit} workspace${usage.workspaceLimit === 1 ? '' : 's'} e sua organização já está usando ${usage.workspaceCount}. Escolha um plano maior para criar novos workspaces.`}
      />

      <WorkspaceFormDialog
        open={!!editingWorkspace}
        onOpenChange={(open) => !open && setEditingWorkspace(null)}
        workspace={editingWorkspace}
      />
    </div>
  );
}

function WorkspaceCard({ workspace, onEdit }: { workspace: Workspace; onEdit: () => void }) {
  const { data: members = [] } = useWorkspaceMembers(workspace.id);
  const { data: tags = [] } = useTags();

  const workspaceTags = tags.filter(t => workspace.filter_tag_ids.includes(t.id));

  return (
    <div className={`flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/30 transition-colors ${!workspace.is_active ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${workspace.color}20` }}
        >
          <Building2 className="h-5 w-5" style={{ color: workspace.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground truncate">{workspace.name}</p>
            {!workspace.is_active && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="secondary" className="text-xs cursor-help">Inativo</Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Oculto da operação. Dados preservados. Reative no botão de edição.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {members.length} membros
            </span>
            <span className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              {workspaceTags.length} tags
            </span>
          </div>
          {workspaceTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {workspaceTags.slice(0, 5).map(tag => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  className="text-[10px] py-0"
                  style={{
                    backgroundColor: `${tag.color}15`,
                    borderColor: tag.color,
                    color: tag.color,
                  }}
                >
                  {tag.name}
                </Badge>
              ))}
              {workspaceTags.length > 5 && (
                <Badge variant="secondary" className="text-[10px] py-0">
                  +{workspaceTags.length - 5}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  );
}

function WorkspaceFormDialog({
  open,
  onOpenChange,
  workspace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace | null;
}) {
  const isEditing = !!workspace;
  const { data: tags = [] } = useTags();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: currentMembers = [] } = useWorkspaceMembers(workspace?.id);
  const createWorkspace = useCreateWorkspace();
  const updateWorkspace = useUpdateWorkspace();
  const manageMembers = useManageWorkspaceMembers();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(WORKSPACE_COLORS[0]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  // Populate form when dialog opens or workspace/members change
  useEffect(() => {
    if (open && workspace) {
      setName(workspace.name);
      setDescription(workspace.description || '');
      setColor(workspace.color);
      setSelectedTagIds(workspace.filter_tag_ids || []);
      setIsActive(workspace.is_active);
    } else if (open && !workspace) {
      setName('');
      setDescription('');
      setColor(WORKSPACE_COLORS[0]);
      setSelectedTagIds([]);
      setSelectedMemberIds([]);
      setIsActive(true);
    }
  }, [open, workspace]);

  // Sync members separately since they load async
  useEffect(() => {
    if (open && workspace && currentMembers.length > 0) {
      setSelectedMemberIds(currentMembers.map(m => m.user_id));
    }
  }, [open, workspace, currentMembers]);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  const toggleMember = (userId: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }

    try {
      if (isEditing && workspace) {
        await updateWorkspace.mutateAsync({
          id: workspace.id,
          name: name.trim(),
          description: description.trim() || undefined,
          color,
          filter_tag_ids: selectedTagIds,
          is_active: isActive,
        });
        await manageMembers.mutateAsync({
          workspaceId: workspace.id,
          userIds: selectedMemberIds,
        });
        toast({ title: 'Workspace atualizado!' });
      } else {
        const newWorkspace = await createWorkspace.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          color,
          filter_tag_ids: selectedTagIds,
        });
        if (selectedMemberIds.length > 0 && newWorkspace) {
          await manageMembers.mutateAsync({
            workspaceId: (newWorkspace as any).id,
            userIds: selectedMemberIds,
          });
        }
        toast({ title: 'Workspace criado!' });
      }
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const isPending = createWorkspace.isPending || updateWorkspace.isPending || manageMembers.isPending;

  // Filter out owners/admins from member selection (they always have access)
  const assignableMembers = teamMembers.filter(m => m.role !== 'owner' && m.role !== 'admin');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Workspace' : 'Novo Workspace'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Altere as configurações do workspace.' : 'Crie um workspace para separar leads por área de atuação.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto max-h-[60vh] pr-4">
          <div className="space-y-5 pb-4">
            {/* Name */}
            <div>
              <Label>Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Direito da Saúde"
                className="mt-1"
              />
            </div>

            {/* Description */}
            <div>
              <Label>Descrição (opcional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descrição da área"
                className="mt-1"
              />
            </div>

            {/* Color */}
            <div>
              <Label>Cor</Label>
              <div className="flex gap-2 mt-2">
                {WORKSPACE_COLORS.map((c) => (
                  <button
                    key={c}
                    className="h-8 w-8 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c,
                      borderColor: color === c ? 'hsl(var(--foreground))' : 'transparent',
                      transform: color === c ? 'scale(1.15)' : 'scale(1)',
                    }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>

            <Separator />

            {/* Tags */}
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Tag className="h-4 w-4" />
                Tags do Workspace
              </Label>
              <p className="text-xs text-muted-foreground mb-3">
                Leads com essas tags serão exibidos neste workspace.
              </p>
              <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/30">
                {tags.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Nenhuma tag cadastrada</span>
                ) : (
                  tags.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center gap-1.5 cursor-pointer"
                      onClick={() => toggleTag(tag.id)}
                    >
                      <Checkbox checked={selectedTagIds.includes(tag.id)} />
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
                  ))
                )}
              </div>
            </div>

            <Separator />

            {/* Members */}
            <div>
              <Label className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4" />
                Membros
              </Label>
              <p className="text-xs text-muted-foreground mb-3">
                Selecione quais atendentes/supervisores terão acesso a este workspace. Owners e Admins sempre têm acesso.
              </p>
              <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                {assignableMembers.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Nenhum membro disponível</span>
                ) : (
                  assignableMembers.map((member) => (
                    <div key={member.user_id} className="flex items-center gap-3">
                      <Checkbox
                        id={`member-${member.user_id}`}
                        checked={selectedMemberIds.includes(member.user_id)}
                        onCheckedChange={() => toggleMember(member.user_id)}
                      />
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px]">
                          {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <Label htmlFor={`member-${member.user_id}`} className="cursor-pointer flex-1">
                        {member.name}
                      </Label>
                      <Badge variant="secondary" className="text-[10px]">
                        {member.role === 'supervisor' ? 'Supervisor' : 'Atendente'}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Active toggle (only for editing) */}
            {isEditing && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Workspace ativo</Label>
                    <p className="text-xs text-muted-foreground">Desativar oculta o workspace sem excluí-lo.</p>
                  </div>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? 'Salvar' : 'Criar Workspace'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
