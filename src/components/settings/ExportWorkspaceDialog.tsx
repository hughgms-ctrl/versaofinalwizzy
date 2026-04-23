import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Save } from 'lucide-react';
import { useAIAgents } from '@/hooks/useAIAgents';
import { useFlows } from '@/hooks/useFlows';
import { useTags } from '@/hooks/useTags';
import { usePipelines } from '@/hooks/usePipelines';
import { useExportWorkspaceAsTemplate } from '@/hooks/useWorkspaceTemplates';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

interface ExportWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, the export creates a platform_packages entry instead of a workspace template (admin-only). */
  asPlatform?: boolean;
}

export function ExportWorkspaceDialog({ open, onOpenChange, asPlatform = false }: ExportWorkspaceDialogProps) {
  const { availableWorkspaces, selectedWorkspaceId } = useWorkspaceContext();
  const [workspaceId, setWorkspaceId] = useState<string | null>(selectedWorkspaceId);

  const { data: agents = [] } = useAIAgents();
  const { data: flows = [] } = useFlows();
  const { data: tags = [] } = useTags();
  const { data: pipelines = [] } = usePipelines();

  const wsAgents = useMemo(
    () => agents.filter((a) => !workspaceId || a.workspace_id === workspaceId || a.workspace_id == null),
    [agents, workspaceId]
  );
  const wsFlows = useMemo(
    () => flows.filter((f) => !workspaceId || f.workspace_id === workspaceId || f.workspace_id == null),
    [flows, workspaceId]
  );
  const wsPipelines = useMemo(
    () => pipelines.filter((p) =>
      !workspaceId || (p.workspace_ids?.includes(workspaceId)) || (p.workspace_ids?.length ?? 0) === 0
    ),
    [pipelines, workspaceId]
  );

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📦');
  const [color, setColor] = useState('#3b82f6');
  const [description, setDescription] = useState('');
  const [masterPrompt, setMasterPrompt] = useState('');

  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [flowIds, setFlowIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [pipelineId, setPipelineId] = useState<string | null>(null);

  // platform-only fields
  const [platformKind, setPlatformKind] = useState<'area' | 'objective'>('area');
  const [parentPackageId, setParentPackageId] = useState<string | null>(null);

  const exportMut = useExportWorkspaceAsTemplate();

  const toggle = (arr: string[], setArr: (v: string[]) => void, id: string) => {
    setArr(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  };

  const handleSave = async () => {
    if (!workspaceId) return;
    if (!name.trim()) return;
    await exportMut.mutateAsync({
      workspace_id: workspaceId,
      name: name.trim(),
      icon, color, description: description || null,
      master_prompt: masterPrompt || null,
      include_agent_ids: agentIds,
      include_flow_ids: flowIds,
      include_tag_ids: tagIds,
      include_pipeline_id: pipelineId,
      as_platform: asPlatform,
      platform_kind: platformKind,
      parent_package_id: parentPackageId,
    });
    onOpenChange(false);
    // reset
    setName(''); setDescription(''); setMasterPrompt('');
    setAgentIds([]); setFlowIds([]); setTagIds([]); setPipelineId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {asPlatform ? 'Importar workspace como pacote da plataforma' : 'Salvar workspace como template'}
          </DialogTitle>
          <DialogDescription>
            Selecione o que deseja incluir. Os recursos selecionados são serializados como receita —
            o original permanece intocado.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 py-2">
            <div>
              <Label>Workspace de origem</Label>
              <Select value={workspaceId || ''} onValueChange={(v) => setWorkspaceId(v || null)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {availableWorkspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: BPC LOAS" />
              </div>
              <div>
                <Label>Ícone</Label>
                <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📦" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Descrição</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div>
                <Label>Cor</Label>
                <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Master prompt (opcional)</Label>
              <Textarea
                rows={3}
                value={masterPrompt}
                onChange={(e) => setMasterPrompt(e.target.value)}
                placeholder="Tom, regras, placeholders {{empresa.nome}}..."
              />
            </div>

            {asPlatform && (
              <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3">
                <div>
                  <Label>Tipo do pacote</Label>
                  <Select value={platformKind} onValueChange={(v: any) => setPlatformKind(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="area">Área</SelectItem>
                      <SelectItem value="objective">Objetivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {platformKind === 'objective' && (
                  <div>
                    <Label>Parent package (opcional)</Label>
                    <Input
                      value={parentPackageId || ''}
                      onChange={(e) => setParentPackageId(e.target.value || null)}
                      placeholder="UUID da área pai"
                    />
                  </div>
                )}
              </div>
            )}

            <Section title={`Agentes (${agentIds.length}/${wsAgents.length})`}>
              {wsAgents.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum agente neste workspace.</p>
              ) : (
                wsAgents.map((a) => (
                  <CheckRow
                    key={a.id}
                    id={`a-${a.id}`}
                    checked={agentIds.includes(a.id)}
                    onChange={() => toggle(agentIds, setAgentIds, a.id)}
                    label={a.name}
                    sub={a.function_role}
                  />
                ))
              )}
            </Section>

            <Section title={`Fluxos (${flowIds.length}/${wsFlows.length})`}>
              {wsFlows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum fluxo.</p>
              ) : (
                wsFlows.map((f) => (
                  <CheckRow
                    key={f.id}
                    id={`f-${f.id}`}
                    checked={flowIds.includes(f.id)}
                    onChange={() => toggle(flowIds, setFlowIds, f.id)}
                    label={f.name}
                    sub={f.trigger_type}
                  />
                ))
              )}
            </Section>

            <Section title={`Tags (${tagIds.length}/${tags.length})`}>
              {tags.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma tag.</p>
              ) : (
                tags.map((t) => (
                  <CheckRow
                    key={t.id}
                    id={`t-${t.id}`}
                    checked={tagIds.includes(t.id)}
                    onChange={() => toggle(tagIds, setTagIds, t.id)}
                    label={t.name}
                  />
                ))
              )}
            </Section>

            <Section title="Pipeline">
              {wsPipelines.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum pipeline.</p>
              ) : (
                <Select value={pipelineId || 'none'} onValueChange={(v) => setPipelineId(v === 'none' ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {wsPipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Section>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!workspaceId || !name.trim() || exportMut.isPending}>
            {exportMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium mb-2">{title}</p>
      <div className="space-y-1.5 rounded-md border p-2 max-h-44 overflow-y-auto">{children}</div>
    </div>
  );
}

function CheckRow({ id, checked, onChange, label, sub }: { id: string; checked: boolean; onChange: () => void; label: string; sub?: string }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1 hover:bg-muted/50">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <span className="flex-1">{label}</span>
      {sub && <Badge variant="outline" className="text-[10px]">{sub}</Badge>}
    </label>
  );
}
