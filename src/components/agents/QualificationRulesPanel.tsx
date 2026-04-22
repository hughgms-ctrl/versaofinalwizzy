import { useState } from 'react';
import {
  useQualificationRules,
  useCreateQualificationRule,
  useUpdateQualificationRule,
  useDeleteQualificationRule,
  type QualificationRule,
  type QualificationScope,
} from '@/hooks/useQualificationRules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { CheckSquare, Plus, Trash2, Pencil, Check, X, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  scope: QualificationScope;
  organizationId: string;
  scopeLabel?: string;
}

export function QualificationRulesPanel({ scope, organizationId, scopeLabel }: Props) {
  const { data: rules = [], isLoading } = useQualificationRules(scope);
  const create = useCreateQualificationRule();
  const update = useUpdateQualificationRule();
  const del = useDeleteQualificationRule();

  const [expanded, setExpanded] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newCriteria, setNewCriteria] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editCriteria, setEditCriteria] = useState('');

  const handleCreate = () => {
    if (!newLabel.trim() || !newCriteria.trim()) return;
    create.mutate(
      {
        scope,
        organization_id: organizationId,
        label: newLabel.trim(),
        criteria: newCriteria.trim(),
        order: rules.length,
      },
      {
        onSuccess: () => {
          setNewLabel('');
          setNewCriteria('');
          setShowAdd(false);
        },
      }
    );
  };

  const startEdit = (r: QualificationRule) => {
    setEditingId(r.id);
    setEditLabel(r.label);
    setEditCriteria(r.criteria);
  };

  const saveEdit = (id: string) => {
    if (!editLabel.trim() || !editCriteria.trim()) return;
    update.mutate(
      { id, scope, label: editLabel.trim(), criteria: editCriteria.trim() },
      { onSuccess: () => setEditingId(null) }
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">Regras de Qualificação</span>
          <span className="text-xs text-muted-foreground">
            ({rules.filter(r => r.is_active).length} ativa{rules.filter(r => r.is_active).length === 1 ? '' : 's'})
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Checklist obrigatório que a IA deve validar <strong>antes</strong> de qualificar ou rejeitar um lead
            {scopeLabel ? <> em <strong>{scopeLabel}</strong></> : null}.
            Se algum critério estiver pendente, a IA <strong>deve perguntar</strong> em vez de assumir o pior.
          </p>

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
            </div>
          )}

          {!isLoading && rules.length === 0 && !showAdd && (
            <div className="rounded-md border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground mb-2">
                Nenhuma regra cadastrada. Adicione critérios como "tem mais de 60 anos" ou "possui 15+ anos de contribuição".
              </p>
            </div>
          )}

          {rules.map((r) => {
            const isEditing = editingId === r.id;
            return (
              <div
                key={r.id}
                className={cn(
                  'rounded-md border border-border bg-muted/20 p-3 space-y-2 transition-opacity',
                  !r.is_active && 'opacity-50'
                )}
              >
                {isEditing ? (
                  <>
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="Nome curto (ex.: Idade mínima)"
                      className="text-sm"
                    />
                    <Textarea
                      value={editCriteria}
                      onChange={(e) => setEditCriteria(e.target.value)}
                      placeholder="Critério (ex.: cliente deve ter 60 anos ou mais)"
                      className="text-sm min-h-[60px]"
                    />
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(r.id)} disabled={update.isPending}>
                        {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{r.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{r.criteria}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Switch
                          checked={r.is_active}
                          onCheckedChange={(v) =>
                            update.mutate({ id: r.id, scope, is_active: v })
                          }
                          className="scale-75"
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(r)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => del.mutate({ id: r.id, scope })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {showAdd ? (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Nome curto (ex.: Tempo de contribuição)"
                className="text-sm"
              />
              <Textarea
                value={newCriteria}
                onChange={(e) => setNewCriteria(e.target.value)}
                placeholder="Critério (ex.: 15 anos ou mais de contribuição ao INSS)"
                className="text-sm min-h-[60px]"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setNewLabel(''); setNewCriteria(''); }}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={create.isPending || !newLabel.trim() || !newCriteria.trim()}>
                  {create.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                  Adicionar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowAdd(true)} className="w-full">
              <Plus className="h-3 w-3 mr-1" /> Adicionar regra
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
