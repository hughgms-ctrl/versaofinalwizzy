import { useState, useEffect, useCallback, useRef } from 'react';
import { Node } from '@xyflow/react';
import {
  X, Layers, MousePointerClick, List, Tag, Kanban, UserPlus, Webhook,
  GitBranch, FormInput, Bot, IterationCw, Plus, Trash2, GripVertical,
  Type, Image, Video, Music, FileText, Clock, Upload, Loader2, Save, Sparkles,
  Link, ChevronRight, ChevronDown, Folder
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { FlowNodeType, ContentItem, ContentItemType } from '@/types/flow';
import { useTags } from '@/hooks/useTags';
import { useAIAgents } from '@/hooks/useAIAgents';
import { useFlows } from '@/hooks/useFlows';
import { useFlowFolders } from '@/hooks/useFlowFolders';
import { useDepartments } from '@/hooks/useCrmEntities';
import { useDocumentTemplates } from '@/hooks/useDocumentTemplates';
import { usePipelines, usePipelineColumns } from '@/hooks/usePipelines';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Generate simple unique ID
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

interface NodePropertiesPanelProps {
  node: Node | null;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onDelete?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
  organizationId?: string;
}

const nodeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'content-block': Layers,
  'message-buttons': MousePointerClick,
  'message-list': List,
  'action-tag': Tag,
  'action-pipeline': Kanban,
  'action-transfer': UserPlus,
  'action-webhook': Webhook,
  'action-department': Webhook,
  'action-flow': IterationCw,
  'condition': GitBranch,
  'user-input': FormInput,
  'ai-handoff': Bot,
  'ai-return': IterationCw,
  'action-document': FileText,
  'action-delay': Clock,
};

const nodeLabels: Record<FlowNodeType, string> = {
  'start': 'Início',
  'content-block': 'Conteúdo',
  'message-buttons': 'Botões',
  'message-list': 'Lista',
  'ai-handoff': 'Agente IA',
  'ai-return': 'Retorna ao Fluxo',
  'action-document': 'Gerar Documento',
  'action-delay': 'Intervalo (Delay)',
  'action-transfer': 'Escalação Humana',
  'action-department': 'Departamento',
  'action-flow': 'Iniciar Fluxo',
  'action-webhook': 'Chamar Fluxo/API',
  'action-tag': 'Tag',
  'action-pipeline': 'Mover Pipeline',
  'condition': 'Condição',
  'user-input': 'Pergunta',
  'randomizer': 'Randomizador',
  'smart-delay': 'Atraso Inteligente',
};

const contentItemTypes: { type: ContentItemType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'text', label: 'Texto', icon: Type },
  { type: 'image', label: 'Imagem', icon: Image },
  { type: 'video', label: 'Vídeo', icon: Video },
  { type: 'audio', label: 'Áudio', icon: Music },
  { type: 'document', label: 'Documento', icon: FileText },
  { type: 'delay', label: 'Pausa', icon: Clock },
];

// Media Upload Field Component with Preview
function MediaUploadField({
  item,
  onUpdate
}: {
  item: ContentItem;
  onUpdate: (item: ContentItem) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getAcceptTypes = () => {
    switch (item.type) {
      case 'image': return 'image/*';
      case 'video': return 'video/*';
      case 'audio': return 'audio/*';
      case 'document': return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';
      default: return '*/*';
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${generateId()}.${fileExt}`;
      const filePath = `${item.type}s/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('flow-media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('flow-media')
        .getPublicUrl(filePath);

      onUpdate({ ...item, mediaUrl: publicUrl });
      toast.success('Arquivo enviado com sucesso!');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Erro ao enviar arquivo: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveMedia = () => {
    onUpdate({ ...item, mediaUrl: undefined });
  };

  const renderPreview = () => {
    if (!item.mediaUrl) return null;

    switch (item.type) {
      case 'image':
        return (
          <div className="relative group rounded-lg overflow-hidden border border-border bg-muted">
            <img
              src={item.mediaUrl}
              alt="Preview"
              className="w-full h-32 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder.svg';
              }}
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRemoveMedia}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remover
              </Button>
            </div>
          </div>
        );

      case 'video':
        return (
          <div className="relative group rounded-lg overflow-hidden border border-border bg-muted">
            <video
              src={item.mediaUrl}
              className="w-full h-32 object-cover"
              controls={false}
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open(item.mediaUrl, '_blank')}
              >
                <Video className="h-4 w-4 mr-1" />
                Ver
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRemoveMedia}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case 'audio':
        return (
          <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted">
            <audio src={item.mediaUrl} controls className="flex-1 h-8" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={handleRemoveMedia}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );

      case 'document':
        const fileName = item.mediaUrl.split('/').pop() || 'documento';
        return (
          <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted">
            <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{fileName}</p>
              <a
                href={item.mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Abrir documento
              </a>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive shrink-0"
              onClick={handleRemoveMedia}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={getAcceptTypes()}
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Preview Section */}
      {item.mediaUrl && renderPreview()}

      {/* Upload Section - show if no media */}
      {!item.mediaUrl && (
        <div
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer transition-colors hover:border-primary hover:bg-muted/50",
            isUploading && "opacity-50 cursor-not-allowed"
          )}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Enviando...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Clique para fazer upload
              </p>
              <p className="text-xs text-muted-foreground/70">
                {item.type === 'image' && 'JPG, PNG, GIF, WebP'}
                {item.type === 'video' && 'MP4, WebM, MOV'}
                {item.type === 'audio' && 'MP3, WAV, OGG, M4A'}
                {item.type === 'document' && 'PDF, DOC, DOCX, XLS, XLSX'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* URL Input - alternative to upload */}
      <div className="flex gap-2">
        <Input
          value={item.mediaUrl || ''}
          onChange={(e) => onUpdate({ ...item, mediaUrl: e.target.value })}
          placeholder="Ou cole a URL da mídia..."
          className="text-sm flex-1"
        />
        {item.mediaUrl && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="h-9 w-9 shrink-0"
            title="Substituir arquivo"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Caption Input (except for audio) */}
      {item.type !== 'audio' && (
        <Input
          value={item.caption || ''}
          onChange={(e) => onUpdate({ ...item, caption: e.target.value })}
          placeholder="Legenda (opcional)..."
          className="text-sm"
        />
      )}
    </div>
  );
}

function ContentItemEditor({
  item,
  index,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  item: ContentItem;
  index: number;
  onUpdate: (item: ContentItem) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const ItemIcon = contentItemTypes.find(t => t.type === item.type)?.icon || Type;

  return (
    <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4"
              disabled={isFirst}
              onClick={onMoveUp}
            >
              ▲
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4"
              disabled={isLast}
              onClick={onMoveDown}
            >
              ▼
            </Button>
          </div>
          <ItemIcon className="h-4 w-4 text-muted-foreground" />
          <Select
            value={item.type}
            onValueChange={(value: ContentItemType) => onUpdate({ ...item, type: value })}
          >
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {contentItemTypes.map((t) => (
                <SelectItem key={t.type} value={t.type}>
                  <div className="flex items-center gap-2">
                    <t.icon className="h-3.5 w-3.5" />
                    {t.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {item.type === 'text' && (
        <Textarea
          value={item.content || ''}
          onChange={(e) => onUpdate({ ...item, content: e.target.value })}
          placeholder="Digite o texto da mensagem..."
          className="min-h-[80px] text-sm"
        />
      )}

      {['image', 'video', 'audio', 'document'].includes(item.type) && (
        <MediaUploadField item={item} onUpdate={onUpdate} />
      )}

      {item.type === 'delay' && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={60}
            value={item.delaySeconds || 3}
            onChange={(e) => onUpdate({ ...item, delaySeconds: parseInt(e.target.value) || 3 })}
            className="w-20 text-sm"
          />
          <span className="text-sm text-muted-foreground">segundos</span>
        </div>
      )}
    </div>
  );
}

export function NodePropertiesPanel({ node, onClose, onUpdate, onDelete, onSave, isSaving, hasUnsavedChanges, organizationId }: NodePropertiesPanelProps) {
  const [localData, setLocalData] = useState<Record<string, unknown>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedFlowFolders, setExpandedFlowFolders] = useState<Set<string>>(new Set());
  const { data: tags = [] } = useTags();
  const { data: agents = [] } = useAIAgents();
  const { data: flows = [] } = useFlows();
  const { data: flowFolders = [] } = useFlowFolders();
  const { data: departments = [] } = useDepartments();
  const { data: templates = [] } = useDocumentTemplates();
  const { data: pipelines = [] } = usePipelines();
  const { data: pipelineColumns = [] } = usePipelineColumns(localData.pipelineId as string);

  useEffect(() => {
    if (node) {
      setLocalData(node.data as Record<string, unknown>);
    }
  }, [node]);

  if (!node) return null;

  const nodeType = node.type as FlowNodeType;
  const Icon = nodeIcons[nodeType] || Layers;
  let nodeLabel = nodeLabels[nodeType] || (localData.label as string) || 'Nó';

  // Force label for AI Agent node to avoid legacy overrides
  if (nodeType === 'ai-handoff') {
    nodeLabel = 'Agente IA';
  }

  const handleChange = (key: string, value: unknown) => {
    const newData = { ...localData, [key]: value };
    setLocalData(newData);
    onUpdate(node.id, newData);
  };

  const handleGenerateAgentPrompt = async () => {
    const promptDescription = localData.aiAssistantPrompt as string;
    if (!promptDescription) {
      toast.error("Descreva o que o agente deve fazer primeiro.");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-agent-prompt', {
        body: {
          userDescription: promptDescription,
          agentName: 'Agente Especialista',
          agentRole: 'Atendimento e Execução no Fluxo',
          organizationId
        }
      });

      if (error) throw error;

      if (data?.prompt) {
        handleChange('contextMessage', data.prompt);
        toast.success("Prompt gerado com sucesso!");
      }
    } catch (error) {
      console.error('Error generating prompt:', error);
      toast.error("Erro ao gerar prompt com IA.");
    } finally {
      setIsGenerating(false);
    }
  };

  const renderContentBlockEditor = () => {
    const items = (localData.items as ContentItem[]) || [];

    const addItem = (type: ContentItemType) => {
      const newItem: ContentItem = {
        id: generateId(),
        type,
        content: type === 'text' ? '' : undefined,
        mediaUrl: ['image', 'video', 'audio', 'document'].includes(type) ? '' : undefined,
        delaySeconds: type === 'delay' ? 3 : undefined,
      };
      handleChange('items', [...items, newItem]);
    };

    const updateItem = (index: number, item: ContentItem) => {
      const newItems = [...items];
      newItems[index] = item;
      handleChange('items', newItems);
    };

    const removeItem = (index: number) => {
      handleChange('items', items.filter((_, i) => i !== index));
    };

    const moveItem = (from: number, to: number) => {
      if (to < 0 || to >= items.length) return;
      const newItems = [...items];
      const [moved] = newItems.splice(from, 1);
      newItems.splice(to, 0, moved);
      handleChange('items', newItems);
    };

    return (
      <div className="space-y-4">
        <div className="space-y-3">
          {items.map((item, index) => (
            <ContentItemEditor
              key={item.id}
              item={item}
              index={index}
              onUpdate={(updated) => updateItem(index, updated)}
              onRemove={() => removeItem(index)}
              onMoveUp={() => moveItem(index, index - 1)}
              onMoveDown={() => moveItem(index, index + 1)}
              isFirst={index === 0}
              isLast={index === items.length - 1}
            />
          ))}
        </div>

        <div className="border-2 border-dashed border-border rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-2 text-center">Adicionar conteúdo</p>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {contentItemTypes.map((t) => (
              <Button
                key={t.type}
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => addItem(t.type)}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Use {`{{variavel}}`} para inserir variáveis dinâmicas nos textos.
        </p>
      </div>
    );
  };

  const renderFields = () => {
    switch (nodeType) {
      case 'content-block':
        return renderContentBlockEditor();

      case 'message-buttons':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="text">Texto da Mensagem</Label>
              <Textarea
                id="text"
                value={(localData.text as string) || ''}
                onChange={(e) => handleChange('text', e.target.value)}
                placeholder="Escolha uma opção:"
                className="min-h-[60px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Botões (máximo 3)</Label>
              {[0, 1, 2].map((index) => {
                const buttons = (localData.buttons as Array<{ id: string; label: string }>) || [];
                const button = buttons[index] || { id: `btn_${index}`, label: '' };
                return (
                  <Input
                    key={index}
                    value={button.label}
                    onChange={(e) => {
                      const newButtons = [...buttons];
                      newButtons[index] = { id: `btn_${index}`, label: e.target.value };
                      handleChange('buttons', newButtons.filter(b => b.label));
                    }}
                    placeholder={`Botão ${index + 1}`}
                  />
                );
              })}
            </div>
          </div>
        );

      case 'action-tag':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="action">Ação</Label>
              <Select
                value={(localData.action as string) || 'add'}
                onValueChange={(value) => handleChange('action', value)}
              >
                <SelectTrigger id="action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Adicionar Tag</SelectItem>
                  <SelectItem value="remove">Remover Tag</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tagId">Tag</Label>
              <Select
                value={(localData.tagId as string) || ''}
                onValueChange={(value) => {
                  const tag = tags.find(t => t.id === value);
                  const newData = {
                    ...localData,
                    tagId: value,
                    tagName: tag?.name || 'tag'
                  };
                  setLocalData(newData);
                  onUpdate(node.id, newData);
                }}
              >
                <SelectTrigger id="tagId">
                  <SelectValue placeholder="Selecione uma tag" />
                </SelectTrigger>
                <SelectContent>
                  {tags?.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'action-pipeline':
        return (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg flex items-center gap-3">
              <Kanban className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs font-semibold">Mover Pipeline</p>
                <p className="text-[10px] text-muted-foreground text-blue-700/70">Move o contato para uma etapa do funil.</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Pipeline</Label>
              <Select
                value={(localData.pipelineId as string) || ''}
                onValueChange={(val) => {
                  const pipeline = pipelines.find(p => p.id === val);
                  const newData = {
                    ...localData,
                    pipelineId: val,
                    pipelineName: pipeline?.name || 'Pipeline',
                    pipelineColumnId: '',
                    pipelineColumnName: ''
                  };
                  setLocalData(newData);
                  onUpdate(node.id, newData);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o funil..." /></SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Etapa (Coluna)</Label>
              <Select
                value={(localData.pipelineColumnId as string) || ''}
                onValueChange={(val) => {
                  const col = pipelineColumns.find(c => c.id === val);
                  const newData = {
                    ...localData,
                    pipelineColumnId: val,
                    pipelineColumnName: col?.name || 'Etapa'
                  };
                  setLocalData(newData);
                  onUpdate(node.id, newData);
                }}
                disabled={!localData.pipelineId}
              >
                <SelectTrigger><SelectValue placeholder="Selecione a etapa..." /></SelectTrigger>
                <SelectContent>
                  {pipelineColumns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'action-webhook':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">URL do Webhook</Label>
              <Input
                id="url"
                value={(localData.url as string) || ''}
                onChange={(e) => handleChange('url', e.target.value)}
                placeholder="https://api.exemplo.com/webhook"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="method">Método HTTP</Label>
              <Select
                value={(localData.method as string) || 'POST'}
                onValueChange={(value) => handleChange('method', value)}
              >
                <SelectTrigger id="method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Body (JSON)</Label>
              <Textarea
                id="body"
                value={(localData.body as string) || ''}
                onChange={(e) => handleChange('body', e.target.value)}
                placeholder='{"key": "value"}'
                className="min-h-[80px] font-mono text-xs"
              />
            </div>
          </div>
        );

      case 'condition':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="variable">Variável</Label>
              <Input
                id="variable"
                value={(localData.variable as string) || ''}
                onChange={(e) => handleChange('variable', e.target.value)}
                placeholder="ex: ultima_mensagem"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="operator">Operador</Label>
              <Select
                value={(localData.operator as string) || 'equals'}
                onValueChange={(value) => handleChange('operator', value)}
              >
                <SelectTrigger id="operator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">É igual a</SelectItem>
                  <SelectItem value="not_equals">É diferente de</SelectItem>
                  <SelectItem value="contains">Contém</SelectItem>
                  <SelectItem value="greater_than">Maior que</SelectItem>
                  <SelectItem value="less_than">Menor que</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="value">Valor</Label>
              <Input
                id="value"
                value={(localData.value as string) || ''}
                onChange={(e) => handleChange('value', e.target.value)}
                placeholder="Valor para comparação"
              />
            </div>
          </div>
        );

      case 'user-input':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="variableName">Nome da Variável</Label>
              <Input
                id="variableName"
                value={(localData.variableName as string) || ''}
                onChange={(e) => handleChange('variableName', e.target.value)}
                placeholder="ex: nome_cliente"
              />
              <p className="text-xs text-muted-foreground">
                O valor digitado será salvo nesta variável.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inputType">Tipo de Entrada</Label>
              <Select
                value={(localData.inputType as string) || 'text'}
                onValueChange={(value) => handleChange('inputType', value)}
              >
                <SelectTrigger id="inputType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto livre</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="phone">Telefone</SelectItem>
                  <SelectItem value="cpf">CPF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="validationMessage">Mensagem de Erro (opcional)</Label>
              <Input
                id="validationMessage"
                value={(localData.validationMessage as string) || ''}
                onChange={(e) => handleChange('validationMessage', e.target.value)}
                placeholder="Por favor, digite um valor válido."
              />
            </div>
          </div>
        );

      case 'ai-handoff': {
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agentId" className="text-xs font-semibold">Agente IA</Label>
              <Select
                value={(localData.agentId as string) || ''}
                onValueChange={(value) => {
                  const agent = agents.find(a => a.id === value);
                  const newData = {
                    ...localData,
                    agentId: value,
                    agentName: agent?.name || 'Agente IA'
                  };
                  setLocalData(newData);
                  onUpdate(node.id, newData);
                }}
              >
                <SelectTrigger id="agentId" className="h-11 border-rose-500/50 focus:ring-rose-500 rounded-xl bg-background/50">
                  <SelectValue placeholder="Selecionar agente..." />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="additionalPrompt" className="text-xs font-semibold">Prompt adicional</Label>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Instruções específicas para este agente neste fluxo (não altera o agente globalmente).
              </p>
              <Textarea
                id="additionalPrompt"
                value={(localData.additionalPrompt as string) || ''}
                onChange={(e) => handleChange('additionalPrompt', e.target.value)}
                placeholder="Ex: Tente descobrir se ele já tem um processo em andamento..."
                className="min-h-[80px] text-sm bg-background/50 rounded-xl border-rose-500/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expectedOutcomes" className="text-xs font-semibold">Resultados Esperados</Label>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Lista de resultados que o agente pode retornar ao finalizar (separados por vírgula).
              </p>
              <Input
                id="expectedOutcomes"
                value={(localData.expectedOutcomes as string) || ''}
                onChange={(e) => handleChange('expectedOutcomes', e.target.value)}
                placeholder="ex: qualificado, desqualificado, erro"
                className="h-9 text-sm bg-background/50 rounded-xl border-rose-500/20"
              />
            </div>

            <div className="p-3 rounded-2xl border border-dashed border-rose-500/40 bg-rose-500/5 space-y-3 mt-2">
              <div className="flex items-center gap-2 text-rose-500">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold">Assistente IA</span>
              </div>

              <Textarea
                placeholder="Descreva o que este agente deve fazer neste fluxo..."
                className="min-h-[60px] text-xs bg-black/20 border-rose-500/20 focus-visible:ring-rose-500 rounded-xl"
                value={(localData.aiAssistantPrompt as string) || ''}
                onChange={(e) => handleChange('aiAssistantPrompt', e.target.value)}
              />

              <Button
                size="sm"
                disabled={isGenerating}
                className="w-full h-10 gap-2 bg-gradient-to-r from-rose-600 to-rose-800 hover:from-rose-700 hover:to-rose-900 text-white text-xs font-medium rounded-xl border-none shadow-lg shadow-rose-900/20 disabled:opacity-70"
                onClick={handleGenerateAgentPrompt}
              >
                {isGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {isGenerating ? 'Gerando...' : 'Gerar com IA'}
              </Button>
            </div>
          </div>
        );
      }

      case 'action-flow':
        return (
          <div className="space-y-4">
            <div className="p-3 bg-indigo-50 rounded-lg flex items-center gap-3">
              <IterationCw className="h-5 w-5 text-indigo-500" />
              <div>
                <p className="text-xs font-semibold">Iniciar Fluxo</p>
                <p className="text-[10px] text-muted-foreground text-indigo-700/70">Dispara outro fluxo de automação.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fluxo</Label>
              <Select
                value={(localData.flowId as string) || ''}
                onValueChange={(val) => {
                  const flow = flows.find(f => f.id === val);
                  const newData = {
                    ...localData,
                    flowId: val,
                    flowName: flow?.name || 'Fluxo'
                  };
                  setLocalData(newData);
                  onUpdate(node.id, newData);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione um fluxo..." /></SelectTrigger>
                <SelectContent>
                  {(() => {
                    const rootFlows = flows.filter(f => !f.folder_id);
                    const foldersToRender = flowFolders;
                    return (
                      <>
                        {rootFlows.length > 0 && (
                          <SelectGroup>
                            {rootFlows.map((f) => (
                              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        {foldersToRender.map((folder) => {
                          const isOpen = expandedFlowFolders.has(folder.id);
                          const folderFlows = flows.filter(f => f.folder_id === folder.id);
                          return (
                            <SelectGroup key={folder.id}>
                              <div
                                className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-muted-foreground cursor-pointer hover:bg-muted/50 rounded-sm select-none"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setExpandedFlowFolders(prev => {
                                    const next = new Set(prev);
                                    if (next.has(folder.id)) next.delete(folder.id);
                                    else next.add(folder.id);
                                    return next;
                                  });
                                }}
                              >
                                {isOpen ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                                <Folder className="h-3.5 w-3.5" />
                                {folder.name}
                              </div>
                              {isOpen && folderFlows.map((f) => (
                                <SelectItem key={f.id} value={f.id} className="pl-7">{f.name}</SelectItem>
                              ))}
                            </SelectGroup>
                          );
                        })}
                      </>
                    );
                  })()}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-indigo-50/50">
              <div className="space-y-0.5">
                <Label className="text-xs">Aguardar resposta</Label>
                <p className="text-[10px] text-muted-foreground">Pausa o orquestrador até o fluxo terminar.</p>
              </div>
              <Switch
                checked={(localData.waitForResponse as boolean) !== false}
                onCheckedChange={(val) => handleChange('waitForResponse', val)}
              />
            </div>
          </div>
        );

      case 'action-department':
        return (
          <div className="space-y-4">
            <div className="p-3 bg-cyan-50 rounded-lg flex items-center gap-3">
              <Webhook className="h-5 w-5 text-cyan-500" />
              <div>
                <p className="text-xs font-semibold">Alterar Departamento</p>
                <p className="text-[10px] text-muted-foreground text-cyan-700/70">Muda a conversa para outro departamento.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Departamento</Label>
              <Select
                value={(localData.departmentId as string) || ''}
                onValueChange={(val) => {
                  const dept = departments.find(d => d.id === val);
                  const newData = {
                    ...localData,
                    departmentId: val,
                    departmentName: dept?.name || 'Departamento'
                  };
                  setLocalData(newData);
                  onUpdate(node.id, newData);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione um departamento..." /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'action-delay':
        return (
          <div className="space-y-4">
            <div className="p-3 bg-muted/30 rounded-lg flex items-center gap-3">
              <Clock className="h-5 w-5 text-slate-500" />
              <div>
                <p className="text-xs font-semibold">Intervalo de Pausa</p>
                <p className="text-[10px] text-muted-foreground">Define quanto tempo o fluxo aguardará antes de prosseguir.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tempo</Label>
                <Input
                  type="number"
                  value={localData.unit === 'minutes' ? (localData.delaySeconds as number || 300) / 60 : (localData.delaySeconds as number || 5)}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    const seconds = localData.unit === 'minutes' ? val * 60 : val;
                    handleChange('delaySeconds', seconds);
                  }}
                  min={1}
                />
              </div>
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Select
                  value={(localData.unit as string) || 'seconds'}
                  onValueChange={(val) => {
                    const currentVal = localData.unit === 'minutes' ? (localData.delaySeconds as number || 300) / 60 : (localData.delaySeconds as number || 5);
                    const seconds = val === 'minutes' ? currentVal * 60 : currentVal;
                    setLocalData(prev => ({ ...prev, unit: val, delaySeconds: seconds }));
                    onUpdate(node.id, { ...localData, unit: val, delaySeconds: seconds });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seconds">Segundos</SelectItem>
                    <SelectItem value="minutes">Minutos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );

      case 'action-document':
        return (
          <div className="space-y-4">
            <div className="p-3 bg-rose-50 rounded-lg flex items-center gap-3">
              <FileText className="h-5 w-5 text-rose-500" />
              <div>
                <p className="text-xs font-semibold">Gerar Contrato / Documento</p>
                <p className="text-[10px] text-muted-foreground text-rose-700/70">Utiliza as variáveis do fluxo para preencher um PDF.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Template do Documento</Label>
              <Select
                value={(localData.templateId as string) || ''}
                onValueChange={(val) => {
                  const template = templates.find(t => t.id === val);
                  const newData = {
                    ...localData,
                    templateId: val,
                    templateName: template?.name || 'Template'
                  };
                  setLocalData(newData);
                  onUpdate(node.id, newData);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione um template..." /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Método de Assinatura</Label>
              <Select
                value={(localData.signingMethod as string) || 'manual'}
                onValueChange={(val) => handleChange('signingMethod', val)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual / PDF Direto</SelectItem>
                  <SelectItem value="govbr">Gov.br</SelectItem>
                  <SelectItem value="zapsign">ZapSign</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Solicitar confirmação</Label>
                <Switch
                  checked={(localData.requireConfirmation as boolean) !== false}
                  onCheckedChange={(val) => handleChange('requireConfirmation', val)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Enviar PDF no chat</Label>
                <Switch
                  checked={(localData.sendPdfInChat as boolean) !== false}
                  onCheckedChange={(val) => handleChange('sendPdfInChat', val)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Enviar link de assinatura</Label>
                <Switch
                  checked={(localData.sendSignatureLink as boolean) !== false}
                  onCheckedChange={(val) => handleChange('sendSignatureLink', val)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Instruções Adicionais</Label>
              <Textarea
                value={(localData.additionalInstructions as string) || ''}
                onChange={(e) => handleChange('additionalInstructions', e.target.value)}
                placeholder="Ex: Peça o CPF se não tiver..."
                className="text-xs min-h-[60px]"
              />
            </div>
          </div>
        );

      case 'condition':
        return (
          <div className="space-y-4">
            <div className="p-3 bg-yellow-50 rounded-lg flex items-center gap-3">
              <GitBranch className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-xs font-semibold">Condição de Desvio</p>
                <p className="text-[10px] text-muted-foreground text-yellow-800/70">Avalia uma variável para decidir o próximo passo.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição da Condição</Label>
              <Input
                value={(localData.conditionLabel as string) || ''}
                onChange={(e) => handleChange('conditionLabel', e.target.value)}
                placeholder="Ex: Se cliente for VIP"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Variável</Label>
                <Input
                  value={(localData.variable as string) || ''}
                  onChange={(e) => handleChange('variable', e.target.value)}
                  placeholder="Ex: status"
                />
              </div>
              <div className="space-y-2">
                <Label>Operador</Label>
                <Select
                  value={(localData.operator as string) || 'equals'}
                  onValueChange={(val) => handleChange('operator', val)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Igual a</SelectItem>
                    <SelectItem value="not_equals">Diferente de</SelectItem>
                    <SelectItem value="contains">Contém</SelectItem>
                    <SelectItem value="greater_than">Maior que</SelectItem>
                    <SelectItem value="less_than">Menor que</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                value={(localData.value as string) || ''}
                onChange={(e) => handleChange('value', e.target.value)}
                placeholder="Valor para comparar"
              />
            </div>
          </div>
        );

      default:
        return (
          <div className="text-sm text-muted-foreground text-center py-8">
            Este tipo de nó não possui configurações adicionais.
          </div>
        );
    }
  };

  return (
    <div className="w-80 bg-card border-l border-border h-full flex flex-col">
      {/* Build trigger force comment */}
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{nodeLabel}</h3>
            <p className="text-xs text-muted-foreground">ID: {node.id}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {renderFields()}
      </div>

      {/* Footer with Save and Delete Buttons */}
      <div className="p-4 border-t border-border space-y-2">
        {/* Save Button */}
        {onSave && (
          <Button
            size="sm"
            className={cn(
              "w-full gap-2 transition-colors",
              hasUnsavedChanges && !isSaving && "bg-amber-600 hover:bg-amber-700 text-white"
            )}
            onClick={onSave}
            disabled={isSaving || !hasUnsavedChanges}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {hasUnsavedChanges ? 'Salvar Alterações*' : 'Tudo Salvo'}
          </Button>
        )}

        {/* Delete Button */}
        {onDelete && (
          <Button
            variant="destructive"
            size="sm"
            className="w-full gap-2"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            Excluir Bloco
          </Button>
        )}
      </div>
    </div>
  );
}
