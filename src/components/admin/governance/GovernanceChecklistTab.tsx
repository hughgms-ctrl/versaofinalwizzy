import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useGovernanceDashboard, useUpsertCheck, useDeleteCheck, useUpdateCheck } from '@/hooks/useGovernance';
import { Plus, Edit, Trash2, CheckCircle2, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const PHASES = [
  { value: 'security', label: 'Segurança' },
  { value: 'backend', label: 'Backend' },
  { value: 'continuity', label: 'Continuidade' },
  { value: 'help', label: 'Ajuda' },
  { value: 'ux', label: 'UX' },
  { value: 'governance', label: 'Governança' },
];

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  done: { label: 'Concluído', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: CheckCircle2 },
  pending: { label: 'Pendente', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Clock },
  failed: { label: 'Falhou', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: AlertTriangle },
};

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
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [seeding, setSeeding] = useState(false);
  const queryClient = useQueryClient();

  const checks = data?.checks || [];
  const filtered = filterPhase === 'all' ? checks : checks.filter((c: any) => c.phase === filterPhase);

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

  // Group by phase
  const grouped = filtered.reduce((acc: Record<string, any[]>, c: any) => {
    const p = c.phase || 'other';
    if (!acc[p]) acc[p] = [];
    acc[p].push(c);
    return acc;
  }, {});

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={filterPhase} onValueChange={setFilterPhase}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as fases</SelectItem>
              {PHASES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filtered.length} itens</span>
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

      {Object.entries(grouped).map(([phase, items]) => {
        const phaseLabel = PHASES.find(p => p.value === phase)?.label || phase;
        const doneCount = (items as any[]).filter(i => i.status === 'done').length;
        return (
          <Card key={phase}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{phaseLabel}</span>
                <Badge variant="outline">{doneCount}/{(items as any[]).length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {(items as any[]).map((check: any) => {
                  const cfg = statusConfig[check.status] || statusConfig.pending;
                  return (
                    <div key={check.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                      <button
                        onClick={() => updateCheck.mutate({
                          id: check.id,
                          status: check.status === 'done' ? 'pending' : 'done',
                        })}
                        className="mt-0.5 flex-shrink-0"
                      >
                        <cfg.icon className={`h-5 w-5 ${check.status === 'done' ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium text-sm ${check.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                            {check.name}
                          </span>
                          {check.is_blocker && <Badge variant="destructive" className="text-xs py-0">Blocker</Badge>}
                          <Badge variant="outline" className="text-xs py-0">Peso: {check.weight}</Badge>
                        </div>
                        {check.description && <p className="text-xs text-muted-foreground mt-0.5">{check.description}</p>}
                        {check.notes && <p className="text-xs italic text-muted-foreground mt-0.5">{check.notes}</p>}
                      </div>
                      <div className="flex gap-1">
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
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {filtered.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum item de checklist.</CardContent></Card>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={!!editForm} onOpenChange={() => setEditForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editForm?.id ? 'Editar Item' : 'Novo Item'}</DialogTitle>
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