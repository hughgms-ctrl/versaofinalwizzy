import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useGovernanceDashboard, useUpsertCheck, useDeleteCheck, useUpdateCheck } from '@/hooks/useGovernance';
import { Plus, Edit, Trash2, CheckCircle2, Clock, AlertTriangle, ShieldCheck, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const PHASES = [
  { value: 'security', label: 'Segurança', number: 1 },
  { value: 'backend', label: 'Backend', number: 2 },
  { value: 'continuity', label: 'Backup & Continuidade', number: 3 },
  { value: 'help', label: 'Ajuda', number: 4 },
  { value: 'ux', label: 'UX / Educação', number: 5 },
  { value: 'governance', label: 'Governança', number: 6 },
];

interface CheckForm {
  id?: string;
  name: string;
  description: string;
  phase: string;
  weight: number;
  is_blocker: boolean;
  status: string;
  notes: string;
}

const emptyCheck: CheckForm = {
  name: '', description: '', phase: 'security', weight: 1, is_blocker: false, status: 'pending', notes: '',
};

export function GovernanceChecklistTab() {
  const { data, isLoading } = useGovernanceDashboard();
  const upsertCheck = useUpsertCheck();
  const deleteCheck = useDeleteCheck();
  const updateCheck = useUpdateCheck();
  const [editForm, setEditForm] = useState<CheckForm | null>(null);
  const [seeding, setSeeding] = useState(false);
  const queryClient = useQueryClient();

  const checks = data?.checks || [];

  const handleSeedSecurity = async () => {
    setSeeding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-governance?action=seed_security`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Erro ao popular');
      toast.success(`Checklist populado: ${result.counts.checks} itens, ${result.counts.prompts} prompts, ${result.counts.library} biblioteca`);
      queryClient.invalidateQueries({ queryKey: ['governance'] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSeeding(false);
    }
  };

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold text-foreground">Conformidade com Arquitetura Base</h3>
          </div>
        </div>
        <div className="flex gap-2">
          {checks.length === 0 && (
            <Button onClick={handleSeedSecurity} size="sm" variant="outline" disabled={seeding}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              {seeding ? 'Populando...' : 'Popular Checklist de Segurança'}
            </Button>
          )}
          <Button onClick={() => setEditForm({ ...emptyCheck })} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Novo Item
          </Button>
        </div>
      </div>

      {/* Phases */}
      {PHASES.map((phase) => {
        const phaseChecks = checks.filter((c: any) => c.phase === phase.value);
        if (phaseChecks.length === 0) return null;
        const doneCount = phaseChecks.filter((c: any) => c.status === 'done').length;
        const pct = Math.round((doneCount / phaseChecks.length) * 100);
        const hasBlocker = phaseChecks.some((c: any) => c.is_blocker);

        return (
          <Card key={phase.value} className="overflow-hidden">
            <div className="px-6 pt-5 pb-3">
              {/* Phase header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    {phase.number}
                  </span>
                  <span className="font-semibold text-foreground">{phase.label}</span>
                  {hasBlocker && (
                    <Badge className="bg-destructive text-destructive-foreground text-xs font-semibold px-2.5 py-0.5">
                      BLOQUEANTE
                    </Badge>
                  )}
                </div>
                <span className="text-sm text-muted-foreground font-medium">
                  {doneCount}/{phaseChecks.length} ({pct}%)
                </span>
              </div>
              {/* Progress bar */}
              <Progress value={pct} className="h-2" />
            </div>

            <CardContent className="pt-2 pb-4">
              <div className="space-y-1 ml-1">
                {phaseChecks.map((check: any) => (
                  <div key={check.id} className="flex items-center gap-3 py-1.5 group">
                    <button
                      onClick={() => updateCheck.mutate({
                        id: check.id,
                        status: check.status === 'done' ? 'pending' : 'done',
                      })}
                      className="flex-shrink-0"
                    >
                      <CheckCircle2 className={`h-5 w-5 transition-colors ${
                        check.status === 'done' ? 'text-emerald-500' : 'text-muted-foreground/40 hover:text-muted-foreground'
                      }`} />
                    </button>
                    <span className={`text-sm flex-1 ${
                      check.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'
                    }`}>
                      {check.name}
                    </span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditForm({
                        id: check.id, name: check.name, description: check.description || '',
                        phase: check.phase, weight: check.weight, is_blocker: check.is_blocker,
                        status: check.status, notes: check.notes || '',
                      })}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
                        if (confirm('Remover este item?')) deleteCheck.mutate(check.id);
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {checks.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Nenhum item de checklist. Clique em "Popular Checklist de Segurança" para começar.
        </CardContent></Card>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={!!editForm} onOpenChange={() => setEditForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editForm?.id ? 'Editar Item' : 'Novo Item'}</DialogTitle>
            <p className="text-sm text-muted-foreground">Preencha os campos abaixo para {editForm?.id ? 'editar o' : 'criar um novo'} item do checklist.</p>
          </DialogHeader>
          {editForm && (
            <div className="space-y-3 py-2">
              <div>
                <Label>Nome</Label>
                <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fase</Label>
                  <Select value={editForm.phase} onValueChange={v => setEditForm({ ...editForm, phase: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PHASES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editForm.status} onValueChange={v => setEditForm({ ...editForm, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="done">Concluído</SelectItem>
                      <SelectItem value="failed">Falhou</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Peso</Label>
                  <Input type="number" value={editForm.weight} onChange={e => setEditForm({ ...editForm, weight: Number(e.target.value) })} />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={editForm.is_blocker} onCheckedChange={v => setEditForm({ ...editForm, is_blocker: v })} />
                  <Label>Bloqueante</Label>
                </div>
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditForm(null)}>Cancelar</Button>
            <Button onClick={() => { if (editForm) { upsertCheck.mutate(editForm); setEditForm(null); } }} disabled={!editForm?.name}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
