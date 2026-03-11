import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useGovernancePrompts, useGovernancePromptDetail, useUpsertPrompt, useDeletePrompt } from '@/hooks/useGovernance';
import { Plus, Edit, Trash2, ChevronDown, Copy, Clock, Search, FileText } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = [
  { value: 'Segurança', label: 'Segurança' },
  { value: 'Backend', label: 'Backend' },
  { value: 'Frontend', label: 'Frontend' },
  { value: 'UX', label: 'UX' },
  { value: 'Infraestrutura', label: 'Infraestrutura' },
  { value: 'Governança', label: 'Governança' },
  { value: 'Logs', label: 'Logs' },
];

const CRITICALITIES = [
  { value: 'low', label: 'Baixa', color: 'bg-muted text-muted-foreground' },
  { value: 'medium', label: 'Média', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  { value: 'high', label: 'Alta', color: 'bg-destructive/10 text-destructive border-destructive/20' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  implemented: { label: 'Implementado', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  deprecated: { label: 'Deprecado', color: 'bg-muted text-muted-foreground' },
};

interface PromptForm {
  id?: string;
  name: string;
  category: string;
  content: string;
  criticality: string;
  status: string;
  related_files: string;
  related_tables: string;
  related_functions: string;
  change_reason: string;
}

const emptyPrompt: PromptForm = {
  name: '', category: 'Backend', content: '', criticality: 'medium',
  status: 'pending', related_files: '', related_tables: '', related_functions: '', change_reason: '',
};

export function GovernancePromptsTab() {
  const { data, isLoading } = useGovernancePrompts();
  const upsertPrompt = useUpsertPrompt();
  const deletePrompt = useDeletePrompt();
  const [editForm, setEditForm] = useState<PromptForm | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');

  const { data: detail } = useGovernancePromptDetail(selectedId);

  const prompts = (data?.prompts || []).filter((p: any) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat !== 'all' && p.category !== filterCat) return false;
    return true;
  });

  // Group by category
  const grouped = prompts.reduce((acc: Record<string, any[]>, p: any) => {
    const cat = p.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar prompt..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setEditForm({ ...emptyPrompt })} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Novo Prompt
        </Button>
      </div>

      {Object.entries(grouped).map(([cat, items]) => {
        const catLabel = CATEGORIES.find(c => c.value === cat)?.label || cat;
        return (
          <Card key={cat}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {catLabel}
                <Badge variant="outline" className="ml-auto">{(items as any[]).length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {(items as any[]).map((prompt: any) => {
                  const critCfg = CRITICALITIES.find(c => c.value === prompt.criticality);
                  const stCfg = STATUS_LABELS[prompt.status] || STATUS_LABELS.pending;
                  return (
                    <Collapsible key={prompt.id}>
                      <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                        <CollapsibleTrigger className="flex-1 flex items-center gap-2 text-left" onClick={() => setSelectedId(prompt.id)}>
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                          <span className="font-medium text-sm">{prompt.name}</span>
                          <Badge className={critCfg?.color || ''} variant="outline">{critCfg?.label}</Badge>
                          <Badge className={stCfg.color} variant="outline">{stCfg.label}</Badge>
                        </CollapsibleTrigger>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            setEditForm({
                              id: prompt.id, name: prompt.name, category: prompt.category,
                              content: prompt.content || '', criticality: prompt.criticality || 'medium',
                              status: prompt.status || 'pending',
                              related_files: (prompt.related_files || []).join(', '),
                              related_tables: (prompt.related_tables || []).join(', '),
                              related_functions: (prompt.related_functions || []).join(', '),
                              change_reason: '',
                            });
                          }}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
                            if (confirm('Remover este prompt?')) deletePrompt.mutate(prompt.id);
                          }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <CollapsibleContent>
                        <div className="pl-9 pb-3 space-y-2">
                          <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-60">
                            {prompt.content || 'Sem conteúdo'}
                          </pre>
                          {prompt.related_files?.length > 0 && (
                            <p className="text-xs text-muted-foreground"><strong>Arquivos:</strong> {prompt.related_files.join(', ')}</p>
                          )}
                          {prompt.related_tables?.length > 0 && (
                            <p className="text-xs text-muted-foreground"><strong>Tabelas:</strong> {prompt.related_tables.join(', ')}</p>
                          )}
                          {prompt.related_functions?.length > 0 && (
                            <p className="text-xs text-muted-foreground"><strong>Funções:</strong> {prompt.related_functions.join(', ')}</p>
                          )}

                          {/* Version history */}
                          {selectedId === prompt.id && detail?.versions && detail.versions.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                                <Clock className="h-3 w-3" /> Histórico de Versões
                              </p>
                              <div className="space-y-2 border-l-2 border-border pl-3">
                                {detail.versions.map((v: any) => (
                                  <div key={v.id} className="text-xs">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-xs py-0">v{v.version}</Badge>
                                      <span className="text-muted-foreground">
                                        {new Date(v.created_at).toLocaleDateString('pt-BR')}
                                      </span>
                                      {v.reason && <span className="italic text-muted-foreground">— {v.reason}</span>}
                                      <Button
                                        variant="ghost" size="icon" className="h-5 w-5 ml-auto"
                                        onClick={() => { navigator.clipboard.writeText(v.content); toast.success('Copiado!'); }}
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {prompts.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum prompt cadastrado.</CardContent></Card>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={!!editForm} onOpenChange={() => setEditForm(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editForm?.id ? 'Editar Prompt' : 'Novo Prompt'}</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={editForm.category} onValueChange={v => setEditForm({ ...editForm, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Conteúdo do Prompt</Label>
                <Textarea value={editForm.content} onChange={e => setEditForm({ ...editForm, content: e.target.value })} rows={10} className="font-mono text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Criticidade</Label>
                  <Select value={editForm.criticality} onValueChange={v => setEditForm({ ...editForm, criticality: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CRITICALITIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editForm.status} onValueChange={v => setEditForm({ ...editForm, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="implemented">Implementado</SelectItem>
                      <SelectItem value="deprecated">Deprecado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Arquivos relacionados (separados por vírgula)</Label>
                <Input value={editForm.related_files} onChange={e => setEditForm({ ...editForm, related_files: e.target.value })} placeholder="src/hooks/useAuth.ts, src/pages/Login.tsx" />
              </div>
              <div>
                <Label>Tabelas relacionadas</Label>
                <Input value={editForm.related_tables} onChange={e => setEditForm({ ...editForm, related_tables: e.target.value })} placeholder="user_roles, profiles" />
              </div>
              <div>
                <Label>Funções relacionadas</Label>
                <Input value={editForm.related_functions} onChange={e => setEditForm({ ...editForm, related_functions: e.target.value })} placeholder="has_role, is_platform_admin" />
              </div>
              {editForm.id && (
                <div>
                  <Label>Motivo da alteração</Label>
                  <Input value={editForm.change_reason} onChange={e => setEditForm({ ...editForm, change_reason: e.target.value })} placeholder="Ex: Ajuste na regra de RLS" />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditForm(null)}>Cancelar</Button>
            <Button onClick={() => {
              if (editForm) {
                const payload: any = {
                  ...editForm,
                  related_files: editForm.related_files ? editForm.related_files.split(',').map(s => s.trim()).filter(Boolean) : [],
                  related_tables: editForm.related_tables ? editForm.related_tables.split(',').map(s => s.trim()).filter(Boolean) : [],
                  related_functions: editForm.related_functions ? editForm.related_functions.split(',').map(s => s.trim()).filter(Boolean) : [],
                };
                upsertPrompt.mutate(payload);
                setEditForm(null);
              }
            }} disabled={!editForm?.name}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}