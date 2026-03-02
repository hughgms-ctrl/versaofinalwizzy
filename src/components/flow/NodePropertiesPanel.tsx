import { useState, useEffect, useCallback, useRef } from 'react';
import { Node } from '@xyflow/react';
import {
  X, Layers, MousePointerClick, List, Tag, Kanban, UserPlus, Webhook,
  GitBranch, FormInput, Bot, IterationCw, Plus, Trash2, GripVertical,
  Type, Image, Video, Music, FileText, Clock, Upload, Loader2, Save, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { FlowNodeType, ContentItem, ContentItemType } from '@/types/flow';
import { useTags } from '@/hooks/useTags';
import { useAIAgents } from '@/hooks/useAIAgents';
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
}

const nodeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'content-block': Layers,
  'message-buttons': MousePointerClick,
  'message-list': List,
  'action-tag': Tag,
  'action-pipeline': Kanban,
  'action-transfer': UserPlus,
  'action-webhook': Webhook,
  'condition': GitBranch,
  'user-input': FormInput,
  'ai-handoff': Bot,
  'ai-return': IterationCw,
  'ai-master': Sparkles,
};

const nodeLabels: Record<FlowNodeType, string> = {
  'start': 'Início',
  'content-block': 'Bloco de Conteúdo',
  'message-buttons': 'Mensagem com Botões',
  'message-list': 'Mensagem com Lista',
  'action-tag': 'Adicionar/Remover Tag',
  'action-pipeline': 'Mover no Pipeline',
  'action-transfer': 'Transferir Atendimento',
  'action-webhook': 'Chamar Webhook',
  'condition': 'Condição',
  'user-input': 'Entrada do Usuário',
  'ai-handoff': 'Passar para IA',
  'ai-return': 'Retornar da IA',
  'ai-master': 'Agente Master',
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

export function NodePropertiesPanel({ node, onClose, onUpdate, onDelete, onSave, isSaving, hasUnsavedChanges }: NodePropertiesPanelProps) {
  const [localData, setLocalData] = useState<Record<string, unknown>>({});
  const { data: tags } = useTags();

  useEffect(() => {
    if (node) {
      setLocalData(node.data as Record<string, unknown>);
    }
  }, [node]);

  if (!node) return null;

  const nodeType = node.type as FlowNodeType;
  const Icon = nodeIcons[nodeType] || Layers;
  const nodeLabel = nodeLabels[nodeType] || (localData.label as string) || 'Nó';

  const handleChange = (key: string, value: unknown) => {
    const newData = { ...localData, [key]: value };
    setLocalData(newData);
    onUpdate(node.id, newData);
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
                onValueChange={(value) => handleChange('tagId', value)}
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

      case 'ai-handoff':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contextMessage">Contexto para a IA (opcional)</Label>
              <Textarea
                id="contextMessage"
                value={(localData.contextMessage as string) || ''}
                onChange={(e) => handleChange('contextMessage', e.target.value)}
                placeholder="Instruções adicionais para a IA..."
                className="min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground">
                A IA assumirá a conversa e usará este contexto como referência.
              </p>
            </div>
          </div>
        );

      case 'ai-master': {
        const { data: agents = [] } = useAIAgents();
        const currentRules = (localData.orchestration_rules as any) || { orchestration_nodes: [], orchestration_edges: [] };
        const selectedAgentIds = currentRules.orchestration_nodes
          ?.filter((n: any) => n.type === 'orch-agent')
          ?.map((n: any) => n.data?.agentId) || [];

        const toggleAgent = (agentId: string, agentName: string) => {
          let newNodes = [...(currentRules.orchestration_nodes || [])];
          let newEdges = [...(currentRules.orchestration_edges || [])];

          if (selectedAgentIds.includes(agentId)) {
            // Remove
            newNodes = newNodes.filter((n: any) => !(n.type === 'orch-agent' && n.data?.agentId === agentId));
            // Also remove edges connected to this agent
            const nodeToRemove = currentRules.orchestration_nodes.find((n: any) => n.type === 'orch-agent' && n.data?.agentId === agentId);
            if (nodeToRemove) {
              newEdges = newEdges.filter((e: any) => e.source !== nodeToRemove.id && e.target !== nodeToRemove.id);
            }
          } else {
            // Add
            const id = `orch_agent_${Math.random().toString(36).substr(2, 5)}`;
            newNodes.push({
              id,
              type: 'orch-agent',
              position: { x: 250, y: 100 + (newNodes.length * 80) },
              data: { label: agentName, agentId }
            });
            // Connect from trigger if it exists and is the only one
            const trigger = newNodes.find((n: any) => n.type === 'orch-trigger' || n.id === 'trigger-1');
            if (trigger) {
              newEdges.push({
                id: `e-${trigger.id}-${id}`,
                source: trigger.id,
                target: id,
                animated: true
              });
            } else if (!newNodes.some(n => n.type === 'orch-trigger')) {
              // Add trigger if missing
              newNodes.unshift({
                id: 'trigger-1',
                type: 'orch-trigger',
                position: { x: 50, y: 200 },
                data: { label: 'Entrada' }
              });
              newEdges.push({
                id: `e-trigger-1-${id}`,
                source: 'trigger-1',
                target: id,
                animated: true
              });
            }
          }

          handleChange('orchestration_rules', {
            orchestration_nodes: newNodes,
            orchestration_edges: newEdges
          });
        };

        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="niche">Nicho / Área de Atuação</Label>
              <Input
                id="niche"
                value={(localData.niche as string) || ''}
                onChange={(e) => handleChange('niche', e.target.value)}
                placeholder="Ex.: direito_saude, vendas_premium..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">Instruções do Mestre (System Prompt)</Label>
              <Textarea
                id="prompt"
                value={(localData.prompt as string) || ''}
                onChange={(e) => handleChange('prompt', e.target.value)}
                placeholder="Você é um assistente virtual especializado em..."
                className="min-h-[120px] text-sm"
              />
            </div>

            <div className="space-y-3 pt-2 border-t border-border">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Agentes Especializados Disponíveis
              </Label>
              <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-1">
                {agents.map((agent: any) => (
                  <div
                    key={agent.id}
                    onClick={() => toggleAgent(agent.id, agent.name)}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg border-2 cursor-pointer transition-all",
                      selectedAgentIds.includes(agent.id)
                        ? "border-indigo-500 bg-indigo-500/5 shadow-sm"
                        : "border-transparent bg-muted/30 hover:bg-muted/50"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      selectedAgentIds.includes(agent.id) ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground"
                    )}>
                      <Bot className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{agent.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{agent.role || 'Especialista'}</p>
                    </div>
                    {selectedAgentIds.includes(agent.id) && (
                      <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                    )}
                  </div>
                ))}
                {agents.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic text-center py-4">
                    Nenhum agente especializado encontrado.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <Label htmlFor="orchestration_rules" className="text-[10px] text-muted-foreground flex items-center gap-2">
                <Zap className="h-3 w-3" /> Configuração Avançada (JSON)
              </Label>
              <Textarea
                id="orchestration_rules"
                value={typeof localData.orchestration_rules === 'string'
                  ? localData.orchestration_rules
                  : JSON.stringify(localData.orchestration_rules || {}, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    handleChange('orchestration_rules', parsed);
                  } catch (err) {
                    handleChange('orchestration_rules', e.target.value);
                  }
                }}
                className="min-h-[80px] font-mono text-[9px] bg-muted/20"
              />
            </div>
          </div>
        );
      }

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
        {onSave && hasUnsavedChanges && (
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar Alterações
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
