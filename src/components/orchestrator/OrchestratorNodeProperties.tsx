/* eslint-disable react-hooks/rules-of-hooks */
import { useState } from 'react';
import { Node } from '@xyflow/react';
import { X, Trash2, Plus, Zap, Tag, MessageSquare, Ban, Sparkles, Loader2, Pause, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAIAgents } from '@/hooks/useAIAgents';
import { useTags } from '@/hooks/useTags';
import { useFlows } from '@/hooks/useFlows';
import { usePipelines, usePipelineColumns } from '@/hooks/usePipelines';
import { useDocumentTemplates } from '@/hooks/useDocumentTemplates';
import { OrchestratorNodeType } from '@/types/orchestrator';
import { TriggerKeyword } from '@/hooks/useMasterPrompts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface OrchestratorNodePropertiesProps {
  node: Node;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onDelete: () => void;
  organizationId?: string;
}

export function OrchestratorNodeProperties({ node, onClose, onUpdate, onDelete, organizationId }: OrchestratorNodePropertiesProps) {
  const { data: agents = [] } = useAIAgents();
  const { data: tags = [] } = useTags();
  const { data: flows = [] } = useFlows();
  const { data: pipelines = [] } = usePipelines();
  const { data: templates = [] } = useDocumentTemplates();
  const selectedPipelineId = (node.data as Record<string, unknown>).pipelineId as string | null;
  const { data: pipelineColumns = [] } = usePipelineColumns(selectedPipelineId || null);

  const nodeType = node.type as OrchestratorNodeType;
  const data = node.data as Record<string, unknown>;

  const handleChange = (key: string, value: unknown) => {
    onUpdate(node.id, { [key]: value });
  };

  const renderConfig = () => {
    switch (nodeType) {
      case 'orch-trigger': {
        const currentTriggerType = (data.triggerType as string) || 'disabled';
        const currentTriggerTags = (data.triggerTags as string[]) || [];
        const currentTriggerKeywords = (data.triggerKeywords as TriggerKeyword[]) || [];
        const availableTriggerTags = tags.filter(t => !currentTriggerTags.includes(t.id));

        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tipo de gatilho</Label>
              <p className="text-[10px] text-muted-foreground mb-2">
                Quando este agente deve ser ativado automaticamente.
              </p>
              <div className="flex flex-col gap-1.5">
                <Button
                  variant={currentTriggerType === 'disabled' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start gap-2 h-8 text-xs"
                  onClick={() => handleChange('triggerType', 'disabled')}
                >
                  <Ban className="h-3.5 w-3.5" /> Desativado
                </Button>
                <Button
                  variant={currentTriggerType === 'tag' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start gap-2 h-8 text-xs"
                  onClick={() => handleChange('triggerType', 'tag')}
                >
                  <Tag className="h-3.5 w-3.5" /> Por Tag
                </Button>
                <Button
                  variant={currentTriggerType === 'keyword' ? 'default' : 'outline'}
                  size="sm"
                  className="justify-start gap-2 h-8 text-xs"
                  onClick={() => handleChange('triggerType', 'keyword')}
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Por Palavra-chave
                </Button>
              </div>
            </div>

            {currentTriggerType === 'tag' && (
              <div className="space-y-2">
                <Label className="text-xs">Tags que ativam</Label>
                <div className="flex flex-wrap gap-1.5">
                  {currentTriggerTags.map(tagId => {
                    const tag = tags.find(t => t.id === tagId);
                    return tag ? (
                      <Badge key={tagId} variant="secondary" className="gap-1 pr-1 text-[10px]" style={{ borderLeft: `3px solid ${tag.color}` }}>
                        {tag.name}
                        <button
                          onClick={() => onUpdate(node.id, { triggerTags: currentTriggerTags.filter(t => t !== tagId) })}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ) : null;
                  })}
                </div>
                {availableTriggerTags.length > 0 && (
                  <Select onValueChange={(v) => onUpdate(node.id, { triggerTags: [...currentTriggerTags, v] })}>
                    <SelectTrigger className="mt-1 text-xs"><SelectValue placeholder="Adicionar tag..." /></SelectTrigger>
                    <SelectContent>
                      {availableTriggerTags.map(tag => (
                        <SelectItem key={tag.id} value={tag.id}>
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                            {tag.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {currentTriggerType === 'keyword' && (
              <div className="space-y-2">
                <Label className="text-xs">Palavras-chave</Label>
                <div className="space-y-1.5">
                  {currentTriggerKeywords.map((kw, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <Select
                        value={kw.match_type}
                        onValueChange={(v) => {
                          const updated = [...currentTriggerKeywords];
                          updated[index] = { ...updated[index], match_type: v as TriggerKeyword['match_type'] };
                          onUpdate(node.id, { triggerKeywords: updated });
                        }}
                      >
                        <SelectTrigger className="w-24 shrink-0 text-[10px] h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="exact">Exata</SelectItem>
                          <SelectItem value="contains">Contém</SelectItem>
                          <SelectItem value="starts_with">Começa com</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={kw.value}
                        onChange={e => {
                          const updated = [...currentTriggerKeywords];
                          updated[index] = { ...updated[index], value: e.target.value };
                          onUpdate(node.id, { triggerKeywords: updated });
                        }}
                        placeholder="palavra..."
                        className="flex-1 text-xs h-8"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => {
                          onUpdate(node.id, { triggerKeywords: currentTriggerKeywords.filter((_, i) => i !== index) });
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-7"
                  onClick={() => onUpdate(node.id, { triggerKeywords: [...currentTriggerKeywords, { value: '', match_type: 'contains' }] })}
                >
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>
            )}
          </div>
        );
      }

      case 'orch-agent': {
        const [agentAiInput, setAgentAiInput] = useState('');
        const [isAgentAiGenerating, setIsAgentAiGenerating] = useState(false);

        const handleAgentAIGenerate = async () => {
          if (!agentAiInput.trim()) return;
          const agentName = (data.agentName as string) || 'Agente';
          setIsAgentAiGenerating(true);
          try {
            const { data: result, error } = await supabase.functions.invoke('generate-agent-prompt', {
              body: { userDescription: agentAiInput, agentName, agentRole: 'Especialista no fluxo do orquestrador', organizationId },
            });
            if (error) throw error;
            if (result?.prompt) {
              handleChange('additionalPrompt', result.prompt);
              toast({ title: 'Prompt adicional gerado!' });
            }
          } catch (err) {
            toast({ title: 'Erro ao gerar prompt', description: err instanceof Error ? err.message : 'Tente novamente', variant: 'destructive' });
          } finally {
            setIsAgentAiGenerating(false);
          }
        };

        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Agente IA</Label>
              <Select value={(data.agentId as string) || ''} onValueChange={(v) => {
                const agent = agents.find(a => a.id === v);
                handleChange('agentId', v);
                onUpdate(node.id, { agentId: v, agentName: agent?.name || '' });
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar agente..." /></SelectTrigger>
                <SelectContent>
                  {agents.filter(a => a.is_active).map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Prompt adicional</Label>
              <p className="text-[10px] text-muted-foreground mb-1">Instruções específicas para este agente neste fluxo (não altera o agente globalmente).</p>
              <Textarea
                value={(data.additionalPrompt as string) || ''}
                onChange={e => handleChange('additionalPrompt', e.target.value)}
                placeholder="Instruções extras para este agente neste contexto..."
                className="min-h-[80px] text-xs resize-none"
                rows={4}
              />
            </div>
            {/* AI Assistant for additional prompt */}
            <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Assistente IA
              </div>
              <Textarea
                value={agentAiInput}
                onChange={e => setAgentAiInput(e.target.value)}
                placeholder="Descreva o que este agente deve fazer neste fluxo..."
                className="min-h-[50px] text-xs"
              />
              <Button
                onClick={handleAgentAIGenerate}
                disabled={isAgentAiGenerating || !agentAiInput.trim()}
                size="sm"
                className="gap-1.5 h-7 text-xs w-full"
              >
                {isAgentAiGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {isAgentAiGenerating ? 'Gerando...' : 'Gerar com IA'}
              </Button>
            </div>
          </div>
        );
      }

      case 'orch-pipeline':
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Pipeline</Label>
              <Select value={(data.pipelineId as string) || ''} onValueChange={(v) => {
                handleChange('pipelineId', v);
                handleChange('columnId', '');
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar pipeline..." /></SelectTrigger>
                <SelectContent>
                  {pipelines.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data.pipelineId && (
              <div>
                <Label className="text-xs">Coluna</Label>
                <Select value={(data.columnId as string) || ''} onValueChange={(v) => {
                  const col = pipelineColumns.find(c => c.id === v);
                  const pipe = pipelines.find(p => p.id === data.pipelineId);
                  handleChange('columnId', v);
                  onUpdate(node.id, { columnId: v, pipelineName: `${pipe?.name} > ${col?.name}` });
                }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar coluna..." /></SelectTrigger>
                  <SelectContent>
                    {pipelineColumns.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        );

      case 'orch-tag':
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Ação</Label>
              <Select value={(data.action as string) || 'add'} onValueChange={(v) => handleChange('action', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Adicionar</SelectItem>
                  <SelectItem value="remove">Remover</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tag</Label>
              <Select value={(data.tagId as string) || ''} onValueChange={(v) => {
                const tag = tags.find(t => t.id === v);
                onUpdate(node.id, { tagId: v, tagName: tag?.name || '' });
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar tag..." /></SelectTrigger>
                <SelectContent>
                  {tags.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'orch-department':
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Departamento</Label>
              <Input
                value={(data.departmentName as string) || ''}
                onChange={e => onUpdate(node.id, { departmentName: e.target.value })}
                placeholder="Nome do departamento..."
                className="mt-1"
              />
            </div>
          </div>
        );

      case 'orch-flow':
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Fluxo</Label>
              <Select value={(data.flowId as string) || ''} onValueChange={(v) => {
                const flow = flows.find(f => f.id === v);
                onUpdate(node.id, { flowId: v, flowName: flow?.name || '' });
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar fluxo..." /></SelectTrigger>
                <SelectContent>
                  {flows.filter(f => f.is_active).map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-xs flex items-center gap-1.5"><Pause className="h-3 w-3" /> Aguardar resposta</Label>
                <p className="text-[10px] text-muted-foreground">Pausar o fluxo até o cliente responder</p>
              </div>
              <Switch
                checked={data.waitForResponse !== false}
                onCheckedChange={(v) => handleChange('waitForResponse', v)}
              />
            </div>
          </div>
        );

      case 'orch-delay':
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tempo (segundos)</Label>
              <Input
                type="number"
                min={1}
                max={300}
                value={(data.delaySeconds as number) || 5}
                onChange={e => handleChange('delaySeconds', parseInt(e.target.value) || 5)}
                className="mt-1"
              />
            </div>
          </div>
        );

      case 'orch-condition':
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Descrição da condição</Label>
              <Input
                value={(data.conditionLabel as string) || ''}
                onChange={e => handleChange('conditionLabel', e.target.value)}
                placeholder="Ex.: Intenção de compra"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Variável</Label>
              <Input
                value={(data.variable as string) || ''}
                onChange={e => handleChange('variable', e.target.value)}
                placeholder="Ex.: intent"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Operador</Label>
              <Select value={(data.operator as string) || 'equals'} onValueChange={(v) => handleChange('operator', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Igual a</SelectItem>
                  <SelectItem value="not_equals">Diferente de</SelectItem>
                  <SelectItem value="contains">Contém</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valor</Label>
              <Input
                value={(data.value as string) || ''}
                onChange={e => handleChange('value', e.target.value)}
                placeholder="Valor esperado..."
                className="mt-1"
              />
            </div>
          </div>
        );

      case 'orch-human':
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Rótulo</Label>
              <Input
                value={(data.label as string) || 'Humano'}
                onChange={e => handleChange('label', e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        );

      case 'orch-document':
        return (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Template de Documento</Label>
              <p className="text-[10px] text-muted-foreground mb-1">
                O agente coletará os dados necessários e gerará o PDF automaticamente.
              </p>
              <Select value={(data.templateId as string) || ''} onValueChange={(v) => {
                const tmpl = templates.find(t => t.id === v);
                onUpdate(node.id, { templateId: v, templateName: tmpl?.name || '' });
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar template..." /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <FileText className="h-3 w-3 text-rose-500" />
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Método de Assinatura</Label>
              <p className="text-[10px] text-muted-foreground mb-1">
                Como o documento será assinado após gerado.
              </p>
              <Select value={(data.signingMethod as string) || 'manual'} onValueChange={(v) => handleChange('signingMethod', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem assinatura</SelectItem>
                  <SelectItem value="manual">📝 Manual</SelectItem>
                  <SelectItem value="govbr">🏛️ Gov.br</SelectItem>
                  <SelectItem value="zapsign">✍️ Wizzy Sign</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-xs">Solicitar confirmação</Label>
                <p className="text-[10px] text-muted-foreground">Pedir ao cliente para confirmar os dados antes de gerar</p>
              </div>
              <Switch
                checked={data.requireConfirmation !== false}
                onCheckedChange={(v) => handleChange('requireConfirmation', v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-xs">Enviar PDF no chat</Label>
                <p className="text-[10px] text-muted-foreground">Enviar o documento gerado como mídia na conversa</p>
              </div>
              <Switch
                checked={data.sendPdfInChat !== false}
                onCheckedChange={(v) => handleChange('sendPdfInChat', v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-xs">Enviar link de assinatura</Label>
                <p className="text-[10px] text-muted-foreground">Enviar o link para assinatura automaticamente no chat</p>
              </div>
              <Switch
                checked={data.sendSignatureLink !== false}
                onCheckedChange={(v) => handleChange('sendSignatureLink', v)}
              />
            </div>
            <div>
              <Label className="text-xs">Instruções adicionais</Label>
              <Textarea
                value={(data.additionalInstructions as string) || ''}
                onChange={e => handleChange('additionalInstructions', e.target.value)}
                placeholder="Ex.: Extrair dados da imagem do documento, perguntar CPF se não encontrado..."
                className="min-h-[60px] text-xs resize-none mt-1"
                rows={3}
              />
            </div>
          </div>
        );

      default:
        return <p className="text-xs text-muted-foreground">Sem configuração disponível.</p>;
    }
  };

  const nodeLabels: Record<string, string> = {
    'orch-trigger': 'Gatilho',
    'orch-agent': 'Agente IA',
    'orch-pipeline': 'Pipeline',
    'orch-tag': 'Tag',
    'orch-department': 'Departamento',
    'orch-flow': 'Fluxo',
    'orch-delay': 'Intervalo',
    'orch-condition': 'Condição',
    'orch-human': 'Escalação Humana',
    'orch-document': 'Contrato / Documento',
  };

  return (
    <div className="absolute top-0 right-0 w-72 h-full bg-card border-l border-border z-50 flex flex-col shadow-xl">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{nodeLabels[nodeType] || 'Propriedades'}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {renderConfig()}
      </div>

      {nodeType !== 'orch-trigger' && (
        <div className="p-3 border-t border-border">
          <Button variant="destructive" size="sm" className="w-full gap-1.5" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </Button>
        </div>
      )}
    </div>
  );
}
