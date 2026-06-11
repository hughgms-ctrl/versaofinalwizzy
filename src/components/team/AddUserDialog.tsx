import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { LimitUpgradeDialog } from '@/components/billing/LimitUpgradeDialog';
import { useOrganizationPlan } from '@/hooks/useOrganizationPlan';
import { isPlanLimitError } from '@/lib/planLimitErrors';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddUserDialog({ open, onOpenChange }: AddUserDialogProps) {
  const { profile } = useAuth();
  const {
    selectedOrganizationId,
    selectedWorkspaceId,
    availableWorkspaces,
    canManageOrganization,
  } = useWorkspaceContext();
  const organizationId = selectedOrganizationId || profile?.organization_id || null;
  const queryClient = useQueryClient();
  const { usage } = useOrganizationPlan(organizationId);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: 'agent' as 'admin' | 'supervisor' | 'agent',
    password: '',
  });

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, password }));
  };

  const resetForm = () => {
    setFormData({ fullName: '', email: '', phone: '', role: 'agent', password: '' });
    setWorkspaceIds([]);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      const defaultWorkspaceId = selectedWorkspaceId || (availableWorkspaces.length === 1 ? availableWorkspaces[0].id : null);
      setWorkspaceIds(defaultWorkspaceId ? [defaultWorkspaceId] : []);
    }
    onOpenChange(nextOpen);
  };

  const toggleWorkspace = (workspaceId: string) => {
    setWorkspaceIds((current) => (
      current.includes(workspaceId)
        ? current.filter((id) => id !== workspaceId)
        : [...current, workspaceId]
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !canManageOrganization) return;

    setIsLoading(true);
    try {
      const memberWorkspaceIds = formData.role === 'admin' ? [] : workspaceIds;
      if (formData.role !== 'admin' && memberWorkspaceIds.length === 0) {
        throw new Error('Selecione pelo menos um workspace para este membro.');
      }

      if (usage.teamLimit > 0 && usage.teamCount >= usage.teamLimit) {
        setShowLimitDialog(true);
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: formData.email,
          fullName: formData.fullName,
          phone: formData.phone,
          role: formData.role,
          password: formData.password,
          organizationId,
          workspaceIds: memberWorkspaceIds,
        },
      });

      if (error) throw await getFunctionError(error);
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'Membro adicionado!',
        description: data?.existingUser
          ? `${formData.fullName} foi vinculado a esta organizacao.`
          : `${formData.fullName} foi adicionado a equipe com senha temporaria.`,
      });

      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['organization-memberships'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] });
      handleOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error('Error creating user:', error);
      if (isPlanLimitError(error, 'team')) {
        setShowLimitDialog(true);
        return;
      }
      toast({
        title: 'Erro ao adicionar membro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Novo Membro</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome Completo</Label>
              <Input
                id="fullName"
                value={formData.fullName}
                onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                placeholder="Joao Silva"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="joao@empresa.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">WhatsApp</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="5511999999999"
                required
              />
              <p className="text-xs text-muted-foreground">
                Numero com codigo do pais, sem espacos ou tracos. Usado para notificacoes.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Cargo</Label>
              <Select
                value={formData.role}
                onValueChange={(value: 'admin' | 'supervisor' | 'agent') =>
                  setFormData(prev => ({ ...prev, role: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="supervisor">Gerente</SelectItem>
                  <SelectItem value="agent">Atendente</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formData.role === 'admin' && 'Acesso total, pode gerenciar equipe e configuracoes.'}
                {formData.role === 'supervisor' && 'Acesso a relatorios e supervisao de atendentes.'}
                {formData.role === 'agent' && 'Acesso as conversas e tarefas do dia a dia.'}
              </p>
            </div>

            {formData.role !== 'admin' && availableWorkspaces.length > 0 && (
              <div className="space-y-2">
                <Label>Workspaces</Label>
                <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  {availableWorkspaces.map((workspace) => (
                    <label key={workspace.id} className="flex cursor-pointer items-center gap-3 text-sm">
                      <Checkbox
                        checked={workspaceIds.includes(workspace.id)}
                        onCheckedChange={() => toggleWorkspace(workspace.id)}
                      />
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: workspace.color }}
                      />
                      <span className="truncate">{workspace.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  O primeiro acesso do membro abre nos workspaces selecionados aqui.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Senha Temporaria</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Senha temporaria"
                    required
                    minLength={8}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button type="button" variant="outline" onClick={generatePassword}>
                  Gerar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Usuarios novos usam esta senha no primeiro acesso. Se o email ja existe, a senha atual dele continua valendo.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Adicionar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <LimitUpgradeDialog
        open={showLimitDialog}
        onOpenChange={setShowLimitDialog}
        description={`Seu plano permite ${usage.teamLimit} usuario${usage.teamLimit === 1 ? '' : 's'} e sua organizacao ja esta usando ${usage.teamCount}. Escolha um plano maior para adicionar novos membros.`}
      />
    </>
  );
}

async function getFunctionError(error: any) {
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.error) return new Error(body.error);
    } catch {
      // Fall back to the Supabase error message below.
    }
  }
  return error;
}
