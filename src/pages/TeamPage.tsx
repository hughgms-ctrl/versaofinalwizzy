import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  MoreVertical, 
  Phone, 
  Clock,
  MessageSquare,
  Star,
  Edit,
  Trash2,
  Loader2,
  Shield
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTeamMembers, TeamMember } from '@/hooks/useTeamMembers';
import { EditPermissionsDialog } from '@/components/team/EditPermissionsDialog';
import { AddUserDialog } from '@/components/team/AddUserDialog';
import { EditMemberDialog } from '@/components/team/EditMemberDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

const roleLabels = {
  owner: { label: 'Proprietário', color: 'bg-amber-500/10 text-amber-500' },
  admin: { label: 'Administrador', color: 'bg-purple-500/10 text-purple-500' },
  supervisor: { label: 'Gerente', color: 'bg-blue-500/10 text-blue-500' },
  agent: { label: 'Atendente', color: 'bg-green-500/10 text-green-500' },
};

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { selectedOrganizationId, canManageOrganization } = useWorkspaceContext();
  const { data: teamMembers = [], isLoading } = useTeamMembers();
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editMemberOpen, setEditMemberOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<TeamMember | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleEditPermissions = (member: TeamMember) => {
    setSelectedMember(member);
    setPermissionsOpen(true);
  };

  const handleDeleteClick = (member: TeamMember) => {
    setMemberToDelete(member);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!memberToDelete) return;

    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId: memberToDelete.user_id, organizationId: selectedOrganizationId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({
        title: 'Membro removido',
        description: `${memberToDelete.name} foi removido da equipe`,
      });
      setDeleteDialogOpen(false);
      setMemberToDelete(null);
    } catch (error) {
      console.error('Error deleting member:', error);
      toast({
        title: 'Erro ao remover membro',
        description: error instanceof Error ? error.message : 'Não foi possível remover o membro',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <MainLayout 
      title="Equipe" 
      subtitle="Gerencie os membros da sua equipe"
      showNewButton={canManageOrganization}
      newButtonLabel="Novo Membro"
      onNewClick={() => canManageOrganization && setAddUserOpen(true)}
    >
      <div className="space-y-4 md:space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xl md:text-2xl font-bold text-foreground">{teamMembers.length}</p>
                  <p className="text-xs md:text-sm text-muted-foreground">Total de Membros</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full bg-green-500" />
                </div>
                <div>
                  <p className="text-xl md:text-2xl font-bold text-foreground">-</p>
                  <p className="text-xs md:text-sm text-muted-foreground">Online Agora</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <Clock className="h-4 w-4 md:h-5 md:w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-xl md:text-2xl font-bold text-foreground">-</p>
                  <p className="text-xs md:text-sm text-muted-foreground">Em Atendimento</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Star className="h-4 w-4 md:h-5 md:w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-xl md:text-2xl font-bold text-foreground">-</p>
                  <p className="text-xs md:text-sm text-muted-foreground">Satisfação Média</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Team Table */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 md:pb-6">
            <CardTitle className="text-foreground text-base md:text-lg">Membros da Equipe</CardTitle>
          </CardHeader>
          <CardContent className="p-0 md:p-6 md:pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : teamMembers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum membro encontrado
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="block md:hidden divide-y divide-border">
                  {teamMembers.map((member) => (
                    <div key={member.id} className="p-4 flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{member.name}</p>
                        <Badge className={cn('text-[10px]', roleLabels[member.role]?.color || roleLabels.agent.color)}>
                          {roleLabels[member.role]?.label || 'Agente'}
                        </Badge>
                      </div>
                      {canManageOrganization && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setMemberToEdit(member); setEditMemberOpen(true); }}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar Perfil
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditPermissions(member)}>
                            <Shield className="h-4 w-4 mr-2" />
                            Permissões
                          </DropdownMenuItem>
                          {member.role !== 'owner' && (
                            <DropdownMenuItem 
                              onClick={() => handleDeleteClick(member)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remover
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="text-muted-foreground">Membro</TableHead>
                        <TableHead className="text-muted-foreground">Cargo</TableHead>
                        <TableHead className="text-muted-foreground">Telefone</TableHead>
                        <TableHead className="text-muted-foreground">Membro desde</TableHead>
                        <TableHead className="text-muted-foreground w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamMembers.map((member) => (
                        <TableRow key={member.id} className="border-border">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={member.avatar_url || undefined} />
                                <AvatarFallback className="bg-primary/10 text-primary">
                                  {getInitials(member.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-foreground">{member.name}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={roleLabels[member.role]?.color || roleLabels.agent.color}>
                              {roleLabels[member.role]?.label || 'Agente'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-foreground">
                            {member.phone || '-'}
                          </TableCell>
                          <TableCell className="text-foreground">
                            {new Date(member.created_at).toLocaleDateString('pt-BR')}
                          </TableCell>
                          <TableCell>
                            {canManageOrganization && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setMemberToEdit(member); setEditMemberOpen(true); }}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Editar Perfil
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEditPermissions(member)}>
                                  <Shield className="h-4 w-4 mr-2" />
                                  Permissões
                                </DropdownMenuItem>
                                {member.phone && (
                                  <DropdownMenuItem>
                                    <Phone className="h-4 w-4 mr-2" />
                                    Ligar
                                  </DropdownMenuItem>
                                )}
                                {member.role !== 'owner' && (
                                  <DropdownMenuItem 
                                    onClick={() => handleDeleteClick(member)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Remover
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <EditPermissionsDialog
        open={permissionsOpen}
        onOpenChange={setPermissionsOpen}
        member={selectedMember}
      />

      <EditMemberDialog
        open={editMemberOpen}
        onOpenChange={setEditMemberOpen}
        member={memberToEdit}
      />

      <AddUserDialog
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro da equipe?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a remover <strong>{memberToDelete?.name}</strong> da equipe.
              Esta ação não pode ser desfeita. O usuário perderá acesso ao sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
