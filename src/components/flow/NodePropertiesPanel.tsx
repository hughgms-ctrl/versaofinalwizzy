import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Node, Edge } from '@xyflow/react';
import {
  X, Layers, MousePointerClick, List, Tag, Kanban, UserPlus, Webhook,
  GitBranch, FormInput, Bot, IterationCw, Plus, Trash2, GripVertical,
  Type, Image, Video, Music, FileText, Clock, Upload, Loader2, Save, Sparkles,
  Link, ChevronRight, ChevronDown, Folder, Shuffle, User, MessageSquare, Building2, Users, Settings2, UserCog, FileDown, DatabaseZap,
  AlertTriangle, Braces
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { FlowNodeType, ContentItem, ContentItemType, ConditionRule, ConditionRuleType, RandomizerVariant, ContactFieldAssignment, ContactQueryFilter, ContactQueryFilterType, ContactQueryOperator } from '@/types/flow';
import { RemarketingStepsEditor } from './RemarketingStepsEditor';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAllTags } from '@/hooks/useTags';
import { useAIAgents } from '@/hooks/useAIAgents';
import { useFlows } from '@/hooks/useFlows';
import { useFlowFolders } from '@/hooks/useFlowFolders';
import { useDepartments } from '@/hooks/useCrmEntities';
import { useDocumentTemplates } from '@/hooks/useDocumentTemplates';
import { useDocumentPacks } from '@/hooks/useDocumentPacks';
import { usePipelines, usePipelineColumns } from '@/hooks/usePipelines';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useWhatsAppGroups } from '@/hooks/useWhatsAppGroups';
import { TrainingRulesList } from '@/components/agents/TrainingRulesList';
import { QualificationRulesPanel } from '@/components/agents/QualificationRulesPanel';
import { QuickEditAgentDialog } from '@/components/agents/QuickEditAgentDialog';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { getAvailableVariables, FlowVariableGroup } from '@/lib/flowVariables';
import { useContactCustomFields, useCreateContactCustomField } from '@/hooks/useContactCustomFields';
import { VariableTextarea, VariableInput } from './VariableInserter';

// Generate simple unique ID
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

/**
 * Editor de legenda de midia com quebra de linha e formatacao do WhatsApp.
 */
function CaptionEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const wrap = (marker: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selected = value.slice(start, end) || 'texto';
    const next = value.slice(0, start) + marker + selected + marker + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + marker.length, start + marker.length + selected.length);
    });
  };

  const formatButtons: Array<{ marker: string; label: string; title: string; className?: string }> = [
    { marker: '*', label: 'B', title: 'Negrito (*texto*)', className: 'font-bold' },
    { marker: '_', label: 'I', title: 'Italico (_texto_)', className: 'italic' },
    { marker: '~', label: 'S', title: 'Riscado (~texto~)', className: 'line-through' },
    { marker: '```', label: '</>', title: 'Monoespacado (```texto```)', className: 'font-mono text-[10px]' },
  ];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        {formatButtons.map((btn) => (
          <Button
            key={btn.marker}
            type="button"
            variant="outline"
            size="sm"
            className={cn('h-7 w-8 p-0 text-xs', btn.className)}
            title={btn.title}
            onClick={() => wrap(btn.marker)}
          >
            {btn.label}
          </Button>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground">Enter = nova linha</span>
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Legenda (opcional)... use Enter para quebrar linha"
        rows={3}
        className="text-sm whitespace-pre-wrap resize-y"
      />
    </div>
  );
}


interface NodePropertiesPanelProps {
  node: Node | null;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onDelete?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
  organizationId?: string;
  flowId?: string;
  workspaceId?: string | null;
  nodes?: Node[];
  edges?: Edge[];
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
  'action-workspace': Building2,
  'action-whatsapp-group': Users,
  'action-contact-field': UserCog,
  'action-generate-pdf': FileDown,
  'action-query-contacts': DatabaseZap,
  'randomizer': Shuffle,
  'smart-delay': Clock,
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
  'user-input': 'Pergunta (Variável)',
  'action-workspace': 'Atribuir Workspace',
  'action-whatsapp-group': 'Enviar Grupo WhatsApp',
  'action-contact-field': 'Salvar no Contato',
  'action-generate-pdf': 'Gerar PDF',
  'action-query-contacts': 'Consultar Contatos',
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

// O WhatsApp recusa mídia acima de ~16MB. Como o provedor é quem baixa a URL,
// o limite vale igual para upload e para URL externa colada.
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

const formatBytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// Media Upload Field Component with Preview
function MediaUploadField({
  item,
  onUpdate
}: {
  item: ContentItem;
  onUpdate: (item: ContentItem) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [urlWarning, setUrlWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { profile } = useAuth();

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

    if (file.size > MAX_MEDIA_BYTES) {
      toast.error(
        `Arquivo muito grande (${formatBytes(file.size)}). O WhatsApp aceita no máximo 16 MB — comprima o arquivo antes de enviar.`
      );
      e.target.value = '';
      return;
    }

    // flow-media com WRITE escopado por org (migration 20260714130000): path começa com orgId.
    const orgId = profile?.organization_id;
    if (!orgId) {
      toast.error('Sessão sem organização. Recarregue a página e tente novamente.');
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${generateId()}.${fileExt}`;
      const filePath = `${orgId}/${item.type}s/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('flow-media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('flow-media')
        .getPublicUrl(filePath);

      setUrlWarning(null);
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
    setUrlWarning(null);
    onUpdate({ ...item, mediaUrl: undefined });
  };

  // URL externa: quem baixa é o servidor do WhatsApp, então checamos o tamanho
  // pelo content-length antes do fluxo rodar. Best-effort — sem CORS ou sem o
  // header, seguimos sem aviso em vez de bloquear uma URL possivelmente válida.
  useEffect(() => {
    const url = item.mediaUrl;
    if (!url || !/^https?:\/\//i.test(url)) {
      setUrlWarning(null);
      return;
    }
    // Upload próprio já foi validado no handleFileUpload.
    if (url.includes('/storage/v1/object/public/')) {
      setUrlWarning(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        if (cancelled) return;
        const size = Number(res.headers.get('content-length'));
        if (Number.isFinite(size) && size > MAX_MEDIA_BYTES) {
          setUrlWarning(
            `Este arquivo tem ${formatBytes(size)}. O WhatsApp aceita no máximo 16 MB, então o envio vai falhar.`
          );
        } else {
          setUrlWarning(null);
        }
      } catch {
        if (!cancelled) setUrlWarning(null);
      }
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [item.mediaUrl]);

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
              <p className="text-xs text-muted-foreground/70">Máx. 16 MB</p>
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

      {urlWarning && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{urlWarning}</p>
        </div>
      )}

      {/* Caption Input (except for audio) */}
      {item.type !== 'audio' && (
        <CaptionEditor
          value={item.caption || ''}
          onChange={(caption) => onUpdate({ ...item, caption })}
        />
      )}


      {item.type === 'audio' && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Salvar transcricao fixa</Label>
              <p className="text-[11px] text-muted-foreground">
                Usa este texto sempre que o audio aparecer no chat.
              </p>
            </div>
            <Switch
              checked={!!item.saveTranscription}
              onCheckedChange={(checked) => onUpdate({ ...item, saveTranscription: checked })}
            />
          </div>

          {item.saveTranscription && (
            <Textarea
              value={item.transcription || ''}
              onChange={(e) => onUpdate({ ...item, transcription: e.target.value })}
              placeholder="Digite a transcricao deste audio..."
              className="min-h-[88px] text-sm"
            />
          )}
        </div>
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
  variables,
}: {
  item: ContentItem;
  index: number;
  onUpdate: (item: ContentItem) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  variables: FlowVariableGroup[];
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
        <VariableTextarea
          value={item.content || ''}
          onValueChange={(value) => onUpdate({ ...item, content: value })}
          variables={variables}
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

function OutcomeColumnSelect({ pipelineId, value, onChange }: { pipelineId: string; value: string; onChange: (v: string) => void }) {
  const { data: cols = [] } = usePipelineColumns(pipelineId);
  return (
    <Select value={value || 'first'} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs">
        <SelectValue placeholder="Coluna..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="first">
          <span className="text-muted-foreground">Primeira coluna</span>
        </SelectItem>
        {cols.map((col) => (
          <SelectItem key={col.id} value={col.id}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
              {col.name || 'Sem nome'}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function NodePropertiesPanel({ node, onClose, onUpdate, onDelete, onSave, isSaving, hasUnsavedChanges, organizationId, flowId, workspaceId, nodes, edges }: NodePropertiesPanelProps) {
  const [localData, setLocalData] = useState<Record<string, unknown>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedFlowFolders, setExpandedFlowFolders] = useState<Set<string>>(new Set());
  const [quickEditAgentOpen, setQuickEditAgentOpen] = useState(false);
  const { data: allTags = [] } = useAllTags();
  const { data: contactCustomFields = [] } = useContactCustomFields();
  const createContactCustomField = useCreateContactCustomField();
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const { data: agents = [] } = useAIAgents();
  const { data: allFlows = [] } = useFlows();
  const { data: flowFolders = [] } = useFlowFolders();
  const { data: departments = [] } = useDepartments();
  const { data: templates = [] } = useDocumentTemplates();
  const { data: packs = [] } = useDocumentPacks();
  const { data: allPipelines = [] } = usePipelines();
  const { data: pipelineColumns = [] } = usePipelineColumns(localData.pipelineId as string || localData._conditionPipelineId as string);

  // Filter tags by flow's workspace
  const tags = workspaceId
    ? allTags.filter(t => t.workspace_id === workspaceId || !t.workspace_id)
    : allTags;

  // Filter pipelines by workspace: show only pipelines linked to this flow's workspace
  const pipelines = workspaceId
    ? allPipelines.filter(p => p.workspace_ids?.includes(workspaceId))
    : allPipelines;

  // Filter flows by workspace: show only flows in the same workspace (or global)
  const flows = workspaceId
    ? allFlows.filter(f => f.workspace_id === workspaceId || !f.workspace_id)
    : allFlows;
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: workspaces = [] } = useWorkspaces();
  const { data: whatsappGroups = [] } = useWhatsAppGroups();

  // Atraso inteligente "até data": campo fixo (datetime-local) ou variável.
  // O modo sai do valor já salvo para que reabrir o nó mostre o campo certo.
  const [dateAsVariable, setDateAsVariable] = useState(false);

  const prevNodeIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (node && node.id !== prevNodeIdRef.current) {
      prevNodeIdRef.current = node.id;
      setLocalData(node.data as Record<string, unknown>);
      setDateAsVariable(String((node.data as Record<string, unknown>)?.date || '').includes('{{'));
    }
  }, [node]);

  // Variáveis disponíveis para usar com {{...}} neste nó (calculadas pelos nós anteriores).
  const availableVariables = useMemo<FlowVariableGroup[]>(
    () => getAvailableVariables(nodes || [], edges || [], node?.id || '', contactCustomFields),
    [nodes, edges, node?.id, contactCustomFields],
  );

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
        handleChange('additionalPrompt', data.prompt);
        toast.success("Prompt gerado com sucesso!");
      }
    } catch (error) {
      console.error('Error generating prompt:', error);
      toast.error("Erro ao gerar prompt com IA.");
    } finally {
      setIsGenerating(false);
    }
  };

  // ====== CONDITION RULE TYPE OPTIONS ======
  const conditionRuleTypes: { value: ConditionRuleType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 'tag', label: 'Tag', icon: Tag },
    { value: 'pipeline', label: 'Pipeline', icon: Kanban },
    { value: 'assigned', label: 'Responsável', icon: User },
    { value: 'variable', label: 'Variável', icon: GitBranch },
    { value: 'contact_field', label: 'Campo do contato', icon: User },
    { value: 'service_mode', label: 'Modo de atendimento', icon: MessageSquare },
  ];

  // Migrate legacy rule types to new simplified format
  const migrateRule = (rule: ConditionRule): ConditionRule => {
    const legacyType = rule.type as string;
    if (legacyType === 'has_tag') return { ...rule, type: 'tag', negate: false };
    if (legacyType === 'not_has_tag') return { ...rule, type: 'tag', negate: true };
    if (legacyType === 'in_pipeline') return { ...rule, type: 'pipeline', negate: false };
    if (legacyType === 'not_in_pipeline') return { ...rule, type: 'pipeline', negate: true };
    if (legacyType === 'assigned_to') return { ...rule, type: 'assigned', negate: false };
    if (legacyType === 'not_assigned') return { ...rule, type: 'assigned', negate: true };
    return rule;
  };

  const needsNegateToggle = (type: ConditionRuleType) => {
    return ['tag', 'pipeline', 'assigned', 'service_mode'].includes(type);
  };

  const getNegateLabels = (type: ConditionRuleType): [string, string] => {
    switch (type) {
      case 'tag': return ['Tem', 'Não tem'];
      case 'pipeline': return ['Está no', 'Não está no'];
      case 'assigned': return ['É', 'Não é / Sem'];
      case 'service_mode': return ['É', 'Não é'];
      default: return ['É', 'Não é'];
    }
  };

  const renderConditionRuleFields = (rule: ConditionRule, updateRule: (updated: ConditionRule) => void) => {
    switch (rule.type) {
      case 'tag':
        return (
          <Select value={rule.tagId || ''} onValueChange={(v) => updateRule({ ...rule, tagId: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione tag..." /></SelectTrigger>
            <SelectContent>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'pipeline':
        return (
          <div className="space-y-2">
            <Select value={rule.pipelineId || ''} onValueChange={(v) => updateRule({ ...rule, pipelineId: v, columnId: undefined })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pipeline..." /></SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rule.pipelineId && (
              <Select value={rule.columnId || '_any'} onValueChange={(v) => updateRule({ ...rule, columnId: v === '_any' ? undefined : v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Qualquer etapa..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_any">Qualquer etapa</SelectItem>
                  {pipelineColumns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        );

      case 'assigned':
        if (rule.negate) {
          return (
            <p className="text-[11px] text-muted-foreground italic">Verifica se a conversa não tem responsável atribuído.</p>
          );
        }
        return (
          <Select value={rule.userId || ''} onValueChange={(v) => updateRule({ ...rule, userId: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione usuário..." /></SelectTrigger>
            <SelectContent>
              {teamMembers.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'variable':
        return (
          <div className="space-y-2">
            <Input
              value={rule.variable || ''}
              onChange={(e) => updateRule({ ...rule, variable: e.target.value })}
              placeholder="Nome da variável"
              className="h-8 text-xs"
            />
            <Select value={rule.operator || 'equals'} onValueChange={(v) => updateRule({ ...rule, operator: v as any })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">Igual a</SelectItem>
                <SelectItem value="not_equals">Diferente de</SelectItem>
                <SelectItem value="contains">Contém</SelectItem>
                <SelectItem value="not_contains">Não contém</SelectItem>
                <SelectItem value="greater_than">Maior que</SelectItem>
                <SelectItem value="less_than">Menor que</SelectItem>
                {/* "Existe"/"Não existe" davam a entender que era sobre a chave
                    estar definida. É sobre valor: variável gravada como ""
                    conta como vazia. O rótulo agora diz isso. */}
                <SelectItem value="exists">Está preenchido</SelectItem>
                <SelectItem value="not_exists">Está vazio</SelectItem>
              </SelectContent>
            </Select>
            {rule.operator !== 'exists' && rule.operator !== 'not_exists' && (
              <Input
                value={rule.value || ''}
                onChange={(e) => updateRule({ ...rule, value: e.target.value })}
                placeholder="Valor"
                className="h-8 text-xs"
              />
            )}
          </div>
        );

      case 'contact_field':
        return (
          <div className="space-y-2">
            <Select value={rule.contactField || 'name'} onValueChange={(v) => updateRule({ ...rule, contactField: v as any })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel className="text-[11px]">Cadastro</SelectLabel>
                  <SelectItem value="name">Nome</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Telefone</SelectItem>
                </SelectGroup>
                {/* Campos personalizados da org. É o que a IA grava com
                    save_contact_field e o que a importação por planilha traz —
                    até agora não dava para ramificar por eles, e a saída era
                    testar a variável com "contém". */}
                {contactCustomFields.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[11px]">Campos personalizados</SelectLabel>
                    {contactCustomFields.map((f) => (
                      <SelectItem key={f.id} value={f.key}>{f.label}</SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            <Select value={rule.operator || 'equals'} onValueChange={(v) => updateRule({ ...rule, operator: v as any })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">Igual a</SelectItem>
                <SelectItem value="not_equals">Diferente de</SelectItem>
                <SelectItem value="contains">Contém</SelectItem>
                <SelectItem value="not_contains">Não contém</SelectItem>
                <SelectItem value="exists">Está preenchido</SelectItem>
                <SelectItem value="not_exists">Está vazio</SelectItem>
              </SelectContent>
            </Select>
            {rule.operator !== 'exists' && rule.operator !== 'not_exists' && (
              <Input
                value={rule.value || ''}
                onChange={(e) => updateRule({ ...rule, value: e.target.value })}
                placeholder="Valor"
                className="h-8 text-xs"
              />
            )}
          </div>
        );

      case 'service_mode':
        return (
          // Os valores gravados aqui (pending/bot/human) não são os do enum
          // service_mode do banco (pendente/ia/ativo/arquivado). O motor
          // traduz os dois lados, então fluxo antigo continua valendo; novos
          // já saem com o nome de verdade.
          <Select value={rule.serviceMode || 'pendente'} onValueChange={(v) => updateRule({ ...rule, serviceMode: v as any })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="ia">Bot / IA</SelectItem>
              <SelectItem value="ativo">Humano</SelectItem>
              <SelectItem value="arquivado">Arquivado</SelectItem>
            </SelectContent>
          </Select>
        );

      default:
        return null;
    }
  };

  const renderAdvancedConditionEditor = () => {
    const rules = (localData.rules as ConditionRule[]) || [];
    const matchType = (localData.matchType as string) || 'all';

    const generateRuleId = () => Math.random().toString(36).substring(2, 10);

    // Migrate legacy rules on load
    const migratedRules = rules.map(migrateRule);
    const needsMigration = rules.some((r, i) => r.type !== migratedRules[i].type);
    if (needsMigration) {
      handleChange('rules', migratedRules);
    }

    const addRule = () => {
      const newRule: ConditionRule = { id: generateRuleId(), type: 'tag', negate: false };
      handleChange('rules', [...migratedRules, newRule]);
    };

    const updateRule = (index: number, updated: ConditionRule) => {
      const migrated = migrateRule(updated);
      const newRules = [...migratedRules];
      newRules[index] = migrated;
      handleChange('rules', newRules);
    };

    const removeRule = (index: number) => {
      handleChange('rules', migratedRules.filter((_, i) => i !== index));
    };

    // Migrate legacy single-condition format
    if (migratedRules.length === 0 && localData.variable) {
      const legacyRule: ConditionRule = {
        id: generateRuleId(),
        type: 'variable',
        variable: localData.variable as string,
        operator: (localData.operator as any) || 'equals',
        value: localData.value as string,
      };
      handleChange('rules', [legacyRule]);
      handleChange('matchType', 'all');
    }

    return (
      <div className="space-y-4">
        <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg flex items-center gap-3">
          <GitBranch className="h-5 w-5 text-yellow-600" />
          <div>
            <p className="text-xs font-semibold">Condição Avançada</p>
            <p className="text-[10px] text-muted-foreground">Avalia regras para decidir o próximo passo.</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Descrição</Label>
          <Input
            value={(localData.conditionLabel as string) || ''}
            onChange={(e) => handleChange('conditionLabel', e.target.value)}
            placeholder="Ex: Verificar se tem tag VIP"
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label>Corresponder a</Label>
          <Select value={matchType} onValueChange={(v) => handleChange('matchType', v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as regras (E)</SelectItem>
              <SelectItem value="any">Qualquer regra (OU)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <Label className="text-xs font-semibold">Regras ({rules.length})</Label>
          {migratedRules.map((rule, index) => {
            const RuleIcon = conditionRuleTypes.find(t => t.value === rule.type)?.icon || GitBranch;
            const showNegate = needsNegateToggle(rule.type);
            const [posLabel, negLabel] = getNegateLabels(rule.type);
            return (
              <div key={rule.id} className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RuleIcon className="h-3.5 w-3.5 text-yellow-600" />
                    <Select
                      value={rule.type}
                      onValueChange={(v) => updateRule(index, { id: rule.id, type: v as ConditionRuleType, negate: false })}
                    >
                      <SelectTrigger className="h-7 w-[150px] text-xs border-yellow-500/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {conditionRuleTypes.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            <div className="flex items-center gap-2">
                              <t.icon className="h-3.5 w-3.5" />
                              {t.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeRule(index)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                {/* É / Não é toggle */}
                {showNegate && (
                  <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                    <button
                      type="button"
                      className={cn(
                        "flex-1 text-[11px] font-medium py-1 px-2 rounded transition-colors",
                        !rule.negate ? "bg-green-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => updateRule(index, { ...rule, negate: false })}
                    >
                      {posLabel}
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "flex-1 text-[11px] font-medium py-1 px-2 rounded transition-colors",
                        rule.negate ? "bg-red-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => updateRule(index, { ...rule, negate: true })}
                    >
                      {negLabel}
                    </button>
                  </div>
                )}

                {renderConditionRuleFields(rule, (updated) => updateRule(index, updated))}
              </div>
            );
          })}

          <Button variant="outline" size="sm" className="w-full gap-2 border-dashed" onClick={addRule}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar regra
          </Button>
        </div>
      </div>
    );
  };

  const renderRandomizerEditor = () => {
    const variants = (localData.variants as RandomizerVariant[]) || [
      { id: 'A', label: 'Variante A', weight: 50 },
      { id: 'B', label: 'Variante B', weight: 50 },
    ];

    // Init if empty
    if (!(localData.variants as any)?.length) {
      handleChange('variants', variants);
    }

    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);

    const updateVariant = (index: number, updated: RandomizerVariant) => {
      const newVariants = [...variants];
      newVariants[index] = updated;
      handleChange('variants', newVariants);
    };

    const addVariant = () => {
      if (variants.length >= 5) return;
      const letter = String.fromCharCode(65 + variants.length);
      handleChange('variants', [...variants, { id: letter, label: `Variante ${letter}`, weight: 0 }]);
    };

    const removeVariant = (index: number) => {
      if (variants.length <= 2) return;
      handleChange('variants', variants.filter((_, i) => i !== index));
    };

    return (
      <div className="space-y-4">
        <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg flex items-center gap-3">
          <Shuffle className="h-5 w-5 text-purple-600" />
          <div>
            <p className="text-xs font-semibold">Randomizador</p>
            <p className="text-[10px] text-muted-foreground">Divide o tráfego aleatoriamente.</p>
          </div>
        </div>

        <div className="space-y-3">
          {variants.map((v, index) => (
            <div key={v.id} className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <Input
                  value={v.label}
                  onChange={(e) => updateVariant(index, { ...v, label: e.target.value })}
                  className="h-7 text-xs flex-1 mr-2"
                />
                {variants.length > 2 && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeVariant(index)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={v.weight}
                  onChange={(e) => updateVariant(index, { ...v, weight: parseInt(e.target.value) || 0 })}
                  className="h-7 w-20 text-xs"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
          ))}

          {variants.length < 5 && (
            <Button variant="outline" size="sm" className="w-full gap-2 border-dashed" onClick={addVariant}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar variante
            </Button>
          )}

          <div className={cn(
            "text-xs font-medium text-center p-2 rounded-lg",
            totalWeight === 100 ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
          )}>
            Total: {totalWeight}% {totalWeight !== 100 && '(deve ser 100%)'}
          </div>
        </div>
      </div>
    );
  };

  const renderSmartDelayEditor = () => {
    const delayType = (localData.delayType as string) || 'fixed';

    return (
      <div className="space-y-4">
        <div className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg flex items-center gap-3">
          <Clock className="h-5 w-5 text-orange-600" />
          <div>
            <p className="text-xs font-semibold">Atraso Inteligente</p>
            <p className="text-[10px] text-muted-foreground">Aguarda condição temporal antes de prosseguir.</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Tipo de espera</Label>
          <Select value={delayType} onValueChange={(v) => handleChange('delayType', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Tempo fixo</SelectItem>
              <SelectItem value="until_time">Até horário específico</SelectItem>
              <SelectItem value="until_business_hours">Próximo horário comercial</SelectItem>
              <SelectItem value="until_date">Até data específica</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {delayType === 'fixed' && (
          <div className="space-y-2">
            <Label>Minutos de espera</Label>
            <Input
              type="number"
              min={1}
              value={(localData.fixedMinutes as number) || 30}
              onChange={(e) => handleChange('fixedMinutes', parseInt(e.target.value) || 30)}
            />
          </div>
        )}

        {delayType === 'until_time' && (
          <div className="space-y-2">
            <Label>Horário</Label>
            <Input
              type="time"
              value={(localData.time as string) || '09:00'}
              onChange={(e) => handleChange('time', e.target.value)}
            />
          </div>
        )}

        {delayType === 'until_business_hours' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Início</Label>
                <Input
                  type="time"
                  value={(localData.businessHoursStart as string) || '08:00'}
                  onChange={(e) => handleChange('businessHoursStart', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fim</Label>
                <Input
                  type="time"
                  value={(localData.businessHoursEnd as string) || '18:00'}
                  onChange={(e) => handleChange('businessHoursEnd', e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Apenas dias úteis</Label>
              <Switch
                checked={(localData.weekdaysOnly as boolean) !== false}
                onCheckedChange={(v) => handleChange('weekdaysOnly', v)}
              />
            </div>
          </div>
        )}

        {delayType === 'until_date' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Data e hora</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground"
                onClick={() => {
                  // Trocar de modo limpa o campo: um "2026-09-20T19:00" deixado
                  // no modo variável, ou um "{{x}}" deixado no datetime-local,
                  // ficaria invisível no outro campo e a espera erraria calada.
                  setDateAsVariable(!dateAsVariable);
                  handleChange('date', '');
                }}
              >
                {dateAsVariable ? 'Usar data fixa' : 'Usar variável'}
              </Button>
            </div>

            {dateAsVariable ? (
              <>
                {/* O datetime-local do navegador recusa qualquer texto fora do
                    formato dele — não dá para digitar {{data_evento}} ali. Por
                    isso o modo variável troca o campo por texto livre: é o que
                    permite um fluxo só atender várias datas, com o valor vindo
                    de um campo do contato. */}
                <VariableInput
                  value={(localData.date as string) || ''}
                  onValueChange={(value) => handleChange('date', value)}
                  variables={availableVariables}
                  placeholder="{{data_evento}}"
                />
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Aceita <code>2026-09-20 19:00</code> ou <code>20/09/2026 19:00</code>, no horário de
                  Brasília. Sem hora, espera até as 9h. Valor vazio ou em outro formato não segura o
                  contato: o fluxo segue na hora.
                </p>
              </>
            ) : (
              <Input
                type="datetime-local"
                value={(localData.date as string) || ''}
                onChange={(e) => handleChange('date', e.target.value)}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  const renderWhatsAppGroupEditor = () => {
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
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg flex items-center gap-3">
          <Users className="h-5 w-5 text-emerald-500" />
          <div>
            <p className="text-xs font-semibold">Enviar Grupo WhatsApp</p>
            <p className="text-[10px] text-muted-foreground">Envia o conteúdo para um grupo de WhatsApp.</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Grupo</Label>
          <Select
            value={(localData.groupId as string) || ''}
            onValueChange={(val) => {
              const group = whatsappGroups.find(g => g.id === val);
              const newData = {
                ...localData,
                groupId: val,
                groupJid: group?.group_jid || '',
                groupName: group?.name || 'Grupo',
              };
              setLocalData(newData);
              onUpdate(node.id, newData);
            }}
          >
            <SelectTrigger><SelectValue placeholder="Selecione um grupo..." /></SelectTrigger>
            <SelectContent>
              {whatsappGroups.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Nenhum grupo. Sincronize na aba Grupos.
                </div>
              )}
              {whatsappGroups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name || group.group_jid}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
              variables={availableVariables}
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
              variables={availableVariables}
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

        {/* Aguardar Resposta toggle */}
        <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-xs font-semibold">Aguardar resposta</Label>
              <p className="text-[10px] text-muted-foreground">Pausa o fluxo até o usuário responder.</p>
            </div>
            <Switch
              checked={!!(localData.waitForResponse as boolean)}
              onCheckedChange={(val) => handleChange('waitForResponse', val)}
            />
          </div>

          {!!(localData.waitForResponse) && (
            <div className="space-y-3 pt-2 border-t border-border/50">
              <div className="space-y-1">
                <Label className="text-xs">Salvar resposta na variável</Label>
                <Input
                  value={(localData.saveVariable as string) || ''}
                  onChange={(e) => handleChange('saveVariable', e.target.value)}
                  placeholder="ex: nome_cliente"
                  className="h-8 text-xs"
                />
              </div>

              <RemarketingStepsEditor localData={localData} handleChange={handleChange} />
            </div>
          )}
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

      case 'action-whatsapp-group':
        return renderWhatsAppGroupEditor();

      case 'message-buttons':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="text">Texto da Mensagem</Label>
              <VariableTextarea
                id="text"
                value={(localData.text as string) || ''}
                onValueChange={(value) => handleChange('text', value)}
                variables={availableVariables}
                placeholder="Escolha uma opção:"
                className="min-h-[60px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buttonsTitle">Título (opcional)</Label>
              <Input
                id="buttonsTitle"
                value={(localData.title as string) || ''}
                onChange={(e) => handleChange('title', e.target.value)}
                placeholder="Primeira linha do texto"
              />
              <p className="text-xs text-muted-foreground">
                Aparece em negrito acima da mensagem. Se ficar vazio, a primeira linha do texto é usada.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="buttonsFooter">Rodapé (opcional)</Label>
              <Input
                id="buttonsFooter"
                value={(localData.footer as string) || ''}
                onChange={(e) => handleChange('footer', e.target.value)}
                placeholder="Texto pequeno abaixo dos botões"
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
            <RemarketingStepsEditor localData={localData} handleChange={handleChange} />
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
                <p className="text-xs font-semibold">Pipeline</p>
                <p className="text-[10px] text-muted-foreground text-blue-700/70">
                  {(localData.pipelineAction as string) === 'add'
                    ? 'Inscreve o contato nesta etapa sem tirar dos outros funis.'
                    : 'Move o contato para uma etapa do funil.'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>O que fazer</Label>
              <Select
                value={(localData.pipelineAction as string) || 'move'}
                onValueChange={(val) => handleChange('pipelineAction', val)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="move">Mover para este funil</SelectItem>
                  <SelectItem value="add">Adicionar a este funil</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {(localData.pipelineAction as string) === 'add'
                  ? 'O contato ganha um card aqui e continua nos funis onde ja estava.'
                  : 'O card sai do funil onde estava e passa para este.'}
              </p>
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
              <VariableTextarea
                id="body"
                value={(localData.body as string) || ''}
                onValueChange={(value) => handleChange('body', value)}
                variables={availableVariables}
                placeholder='{"key": "value"}'
                className="min-h-[80px] font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Se ficar vazio, mandamos o corpo padrão (contato, conversa e todas as variáveis).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhookHeaders">Headers (JSON)</Label>
              <VariableTextarea
                id="webhookHeaders"
                value={(localData.headers as string) || ''}
                onValueChange={(value) => handleChange('headers', value)}
                variables={availableVariables}
                placeholder='{"Authorization": "Bearer ..."}'
                className="min-h-[60px] font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Opcional. O Content-Type application/json já vai sozinho.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="responsePrefix">Prefixo das variáveis de resposta</Label>
              <Input
                id="responsePrefix"
                value={(localData.responsePrefix as string) || ''}
                onChange={(e) => handleChange('responsePrefix', e.target.value)}
                placeholder="ex: contrato_"
              />
              <p className="text-xs text-muted-foreground">
                A resposta JSON vira variável do fluxo. Com "contrato_", o campo id da API
                vira {'{{contrato_id}}'} em vez de {'{{id}}'}. O código HTTP volta sempre
                em {'{{webhook_status}}'}.
              </p>
            </div>
          </div>
        );

      case 'condition':
        return renderAdvancedConditionEditor();

      case 'randomizer':
        return renderRandomizerEditor();

      case 'smart-delay':
        return renderSmartDelayEditor();

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
            <RemarketingStepsEditor localData={localData} handleChange={handleChange} />
          </div>
        );

      case 'ai-handoff': {
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agentId" className="text-xs font-semibold">Agente IA</Label>
              <div className="flex items-center gap-1.5">
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
                {!!localData.agentId && (
                  <Button
                    type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0"
                    title="Editar agente base"
                    onClick={() => setQuickEditAgentOpen(true)}
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <QuickEditAgentDialog
                agentId={(localData.agentId as string) || null}
                open={quickEditAgentOpen}
                onOpenChange={setQuickEditAgentOpen}
              />
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

            <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/30">
              <div className="space-y-0.5">
                <Label className="text-xs font-semibold">Avançar automaticamente</Label>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Após o agente finalizar, avança para o próximo nó sem aguardar nova mensagem do cliente.
                </p>
              </div>
              <Switch
                checked={localData.autoAdvance !== false}
                onCheckedChange={(checked) => handleChange('autoAdvance', checked)}
              />
            </div>

            {/* Regras de qualificação específicas deste nó */}
            {organizationId && flowId && (
              <QualificationRulesPanel
                scope={{ type: 'flow-node', flow_id: flowId, node_id: node.id }}
                organizationId={organizationId}
                scopeLabel="este nó do fluxo"
                sourcePrompt={[
                  (localData.additionalPrompt as string) || '',
                  (localData.aiAssistantPrompt as string) || '',
                  (localData.prompt as string) || '',
                ].filter(Boolean).join('\n\n')}
              />
            )}

            {/* Per-outcome pipeline mapping */}
            {(() => {
              const outcomesStr = (localData.expectedOutcomes as string) || '';
              const outcomesList = outcomesStr.split(',').map(s => s.trim()).filter(Boolean);
              if (outcomesList.length === 0) return null;

              const outcomePipelines = (localData.outcomePipelines as Record<string, { pipelineId: string; columnId: string }>) || {};

              const updateOutcomePipeline = (outcome: string, field: 'pipelineId' | 'columnId', value: string) => {
                const current = outcomePipelines[outcome] || { pipelineId: '', columnId: '' };
                const updated = {
                  ...outcomePipelines,
                  [outcome]: {
                    ...current,
                    [field]: value === 'none' ? '' : value,
                    ...(field === 'pipelineId' ? { columnId: '' } : {}),
                  }
                };
                handleChange('outcomePipelines', updated);
              };

              return (
                <div className="space-y-3 pt-2 border-t border-border/50">
                  <Label className="text-xs font-semibold">Mover para Pipeline por Resultado</Label>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Para cada resultado, escolha para qual pipeline/coluna o lead será movido automaticamente.
                  </p>
                  {outcomesList.map((outcome) => {
                    const config = outcomePipelines[outcome] || { pipelineId: '', columnId: '' };
                    return (
                      <div key={outcome} className="space-y-1.5 p-2 rounded-lg border border-border/50 bg-muted/30">
                        <span className="text-[10px] font-semibold text-violet-500">● {outcome}</span>
                        <Select
                          value={config.pipelineId || 'none'}
                          onValueChange={(v) => updateOutcomePipeline(outcome, 'pipelineId', v)}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Pipeline..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              <span className="text-muted-foreground">Não mover</span>
                            </SelectItem>
                            {pipelines.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {config.pipelineId && (
                          <OutcomeColumnSelect
                            pipelineId={config.pipelineId}
                            value={config.columnId}
                            onChange={(v) => updateOutcomePipeline(outcome, 'columnId', v)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <TrainingRulesList
              targetType="flow_node"
              flowId={flowId}
              nodeId={node.id}
              organizationId={organizationId}
            />

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
                    const rootFlows = flows.filter(f => !f.folder_id && f.id !== flowId);
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
                          const folderFlows = flows.filter(f => f.folder_id === folder.id && f.id !== flowId);
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
                <p className="text-[10px] text-muted-foreground">Pausa o fluxo aqui até o sub-fluxo terminar.</p>
              </div>
              {/* Era `!== false`, o que deixava a chave desenhada LIGADA num nó novo
                  enquanto o backend lia `Boolean(data.waitForResponse)` — ou seja,
                  desligada. A tela prometia uma pausa que nunca acontecia. */}
              <Switch
                checked={!!(localData.waitForResponse as boolean)}
                onCheckedChange={(val) => handleChange('waitForResponse', val)}
              />
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-indigo-50/50">
              <div className="space-y-0.5">
                <Label className="text-xs">Herdar variáveis do fluxo pai</Label>
                <p className="text-[10px] text-muted-foreground">O sub-fluxo enxerga o que já foi coletado, e devolve o que coletar. Desligue só se os dois fluxos usam nomes de variável iguais para coisas diferentes.</p>
              </div>
              <Switch
                checked={(localData.inheritVariables as boolean) !== false}
                onCheckedChange={(val) => handleChange('inheritVariables', val)}
              />
            </div>
            {!!(localData.waitForResponse) && (
              <RemarketingStepsEditor localData={localData} handleChange={handleChange} />
            )}
          </div>
        );

      case 'ai-return':
        return (
          <div className="space-y-4">
            <div className="p-3 bg-fuchsia-500/10 rounded-lg flex items-center gap-3">
              <IterationCw className="h-5 w-5 text-fuchsia-500" />
              <div>
                <p className="text-xs font-semibold">Retorna ao Fluxo</p>
                <p className="text-[10px] text-muted-foreground">
                  Encerra o agente de IA e devolve o controle ao fluxo.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
              <p>Ao passar por este nó, a conversa:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>sai do modo IA e volta para atendimento humano;</li>
                <li>perde o agente e o contexto do handoff, então mensagens novas
                  deixam de ser roteadas para a IA;</li>
                <li>continua pela saída deste nó, normalmente.</li>
              </ul>
              <p className="pt-1">
                Um nó de <span className="font-medium text-foreground">Agente IA</span> mais
                adiante no fluxo volta a ativar a IA. Para silenciar a IA de vez, use o
                <span className="font-medium text-foreground"> Encerrar a IA</span> do nó de Escalação Humana.
              </p>
            </div>

            <p className="text-[10px] text-muted-foreground">Este nó não tem configuração.</p>
          </div>
        );

      case 'action-transfer': {
        const notifyUserIds = (localData.notifyUserIds as string[]) || [];
        const toggleNotifyUser = (userId: string) => {
          const next = notifyUserIds.includes(userId)
            ? notifyUserIds.filter(id => id !== userId)
            : [...notifyUserIds, userId];
          handleChange('notifyUserIds', next);
        };
        return (
          <div className="space-y-4">
            <div className="p-3 bg-rose-500/10 rounded-lg flex items-center gap-3">
              <UserPlus className="h-5 w-5 text-rose-500" />
              <div>
                <p className="text-xs font-semibold">Escalação Humana</p>
                <p className="text-[10px] text-muted-foreground">Direciona a conversa para um atendente humano.</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/30">
              <div className="space-y-0.5 pr-3">
                <Label className="text-xs font-semibold">Encerrar a IA</Label>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  A IA para de responder nesta conversa e só volta se um atendente reativar.
                  Sem isto, um master prompt por palavra-chave pode fazer a IA reassumir
                  depois da transferência.
                </p>
              </div>
              <Switch
                checked={localData.stopAI === true}
                onCheckedChange={(checked) => handleChange('stopAI', checked)}
              />
            </div>

            <div className="space-y-2">
              <Label>Atribuir a um atendente</Label>
              <Select
                value={(localData.assignedUserId as string) || 'queue'}
                onValueChange={(val) => {
                  if (val === 'queue') {
                    const newData = { ...localData, assignedUserId: '', assignedUserName: '' };
                    setLocalData(newData);
                    onUpdate(node.id, newData);
                  } else {
                    const m = teamMembers.find(t => t.user_id === val);
                    const newData = {
                      ...localData,
                      assignedUserId: val,
                      assignedUserName: m?.name || 'Atendente',
                    };
                    setLocalData(newData);
                    onUpdate(node.id, newData);
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="queue">
                    <span className="text-muted-foreground">Fila (sem atribuição específica)</span>
                  </SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.name} <span className="text-muted-foreground text-xs">· {m.role}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Se nenhum atendente for escolhido, a conversa entra na fila para qualquer atendente assumir.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Departamento (opcional)</Label>
              <Select
                value={(localData.departmentId as string) || 'none'}
                onValueChange={(val) => {
                  if (val === 'none') {
                    const newData = { ...localData, departmentId: '', departmentName: '' };
                    setLocalData(newData);
                    onUpdate(node.id, newData);
                  } else {
                    const dept = departments.find(d => d.id === val);
                    const newData = {
                      ...localData,
                      departmentId: val,
                      departmentName: dept?.name || 'Departamento',
                    };
                    setLocalData(newData);
                    onUpdate(node.id, newData);
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">Sem alteração</span>
                  </SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/50">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Notificar atendentes via WhatsApp</Label>
                <span className="text-[10px] text-muted-foreground">
                  {notifyUserIds.length} selecionado{notifyUserIds.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Os atendentes selecionados receberão uma mensagem no WhatsApp informando que há um lead aguardando atendimento.
              </p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border/50 bg-muted/20 p-2 space-y-1">
                {teamMembers.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Nenhum atendente cadastrado.</p>
                )}
                {teamMembers.map((m) => {
                  const checked = notifyUserIds.includes(m.user_id);
                  const hasPhone = !!m.phone;
                  return (
                    <label
                      key={m.user_id}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
                        !hasPhone && "opacity-60"
                      )}
                      title={!hasPhone ? 'Este usuário não tem telefone cadastrado' : ''}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleNotifyUser(m.user_id)}
                        className="h-3.5 w-3.5 rounded border-border accent-rose-500"
                        disabled={!hasPhone}
                      />
                      <span className="text-sm flex-1 truncate">{m.name}</span>
                      <span className="text-[10px] text-muted-foreground">{m.role}</span>
                      {!hasPhone && (
                        <span className="text-[10px] text-amber-500">sem telefone</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {notifyUserIds.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Mensagem da notificação</Label>
                <Textarea
                  value={(localData.notifyMessage as string) || ''}
                  onChange={(e) => handleChange('notifyMessage', e.target.value)}
                  placeholder="🔔 Novo lead aguardando atendimento: {nome} ({telefone})"
                  className="min-h-[70px] text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Variáveis: <code className="bg-muted px-1 rounded">{'{nome}'}</code>{' '}
                  <code className="bg-muted px-1 rounded">{'{telefone}'}</code>{' '}
                  <code className="bg-muted px-1 rounded">{'{atendente}'}</code>.
                  Se vazio, será usado um modelo padrão.
                </p>
              </div>
            )}
          </div>
        );
      }

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

      case 'action-workspace':
        return (
          <div className="space-y-4">
            <div className="p-3 bg-sky-50 dark:bg-sky-950/30 rounded-lg flex items-center gap-3">
              <Building2 className="h-5 w-5 text-sky-500" />
              <div>
                <p className="text-xs font-semibold">Atribuir Workspace</p>
                <p className="text-[10px] text-muted-foreground">Atribui o contato e conversa a um workspace.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Workspace</Label>
              <Select
                value={(localData.workspaceId as string) || ''}
                onValueChange={(val) => {
                  const ws = workspaces.find(w => w.id === val);
                  const newData = {
                    ...localData,
                    workspaceId: val,
                    workspaceName: ws?.name || 'Workspace'
                  };
                  setLocalData(newData);
                  onUpdate(node.id, newData);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione um workspace..." /></SelectTrigger>
                <SelectContent>
                  {workspaces.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id}>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ws.color }} />
                        {ws.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'action-contact-field': {
        // Grava resposta do fluxo no contato. Sem este no, tudo o que o cliente
        // responde morre em flow_executions.variables: o motor SEMEIA
        // contacts.metadata.custom_fields no comeco da execucao, mas nao tinha
        // nenhum caminho de volta pra la.
        const assignments = (Array.isArray(localData.assignments) ? localData.assignments : []) as ContactFieldAssignment[];

        const setAssignments = (next: ContactFieldAssignment[]) => handleChange('assignments', next);

        const updateAssignment = (index: number, patch: Partial<ContactFieldAssignment>) => {
          setAssignments(assignments.map((a, i) => (i === index ? { ...a, ...patch } : a)));
        };

        const addAssignment = () => {
          const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `f_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          setAssignments([...assignments, { id, fieldKey: '', value: '' }]);
        };

        const handleCreateField = async () => {
          const label = newFieldLabel.trim();
          if (!label) return;
          try {
            const created = await createContactCustomField.mutateAsync({ label });
            setNewFieldLabel('');
            // Ja emenda o campo recem-criado na ultima linha vazia, senao o
            // usuario cria o campo e precisa procurar ele no select.
            const emptyIndex = assignments.findIndex((a) => !a.fieldKey);
            if (emptyIndex >= 0) {
              updateAssignment(emptyIndex, { fieldKey: created.key });
            } else {
              const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `f_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
              setAssignments([...assignments, { id, fieldKey: created.key, value: '' }]);
            }
          } catch {
            // o hook ja mostra o toast de erro
          }
        };

        return (
          <div className="space-y-4">
            <div className="p-3 bg-teal-50 dark:bg-teal-950/30 rounded-lg flex items-center gap-3">
              <UserCog className="h-5 w-5 text-teal-600" />
              <div>
                <p className="text-xs font-semibold">Salvar no Contato</p>
                <p className="text-[10px] text-muted-foreground">
                  Grava valores nos campos personalizados do contato. Ficam disponiveis como {'{{campo}}'} em qualquer fluxo futuro.
                </p>
              </div>
            </div>

            {contactCustomFields.length === 0 && (
              <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground">
                  Nenhum campo personalizado cadastrado ainda. Crie o primeiro abaixo.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {assignments.map((assignment, index) => (
                <div key={assignment.id || index} className="p-3 rounded-lg border border-border space-y-2">
                  <div className="flex items-center gap-2">
                    <Select
                      value={assignment.fieldKey || ''}
                      onValueChange={(value) => updateAssignment(index, { fieldKey: value })}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Escolha o campo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {contactCustomFields.map((field) => (
                          <SelectItem key={field.id} value={field.key}>
                            {field.label}
                            <span className="text-muted-foreground"> ({field.key})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive shrink-0"
                      onClick={() => setAssignments(assignments.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <VariableInput
                    value={assignment.value || ''}
                    onValueChange={(value) => updateAssignment(index, { value })}
                    variables={availableVariables}
                    placeholder="{{resposta}}"
                  />
                </div>
              ))}

              <Button variant="outline" size="sm" className="w-full" onClick={addAssignment}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar campo
              </Button>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="text-xs">Criar novo campo personalizado</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  placeholder="Ex: CNPJ"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateField();
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  disabled={!newFieldLabel.trim() || createContactCustomField.isPending}
                  onClick={handleCreateField}
                >
                  {createContactCustomField.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : 'Criar'}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                O campo vale para a organizacao inteira e aparece tambem na importacao de contatos.
              </p>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Valor vazio nao apaga o que ja estava gravado no contato.
            </p>
          </div>
        );
      }

      case 'action-generate-pdf': {
        // A ponte que faltava entre um texto que ja esta numa variavel e o
        // gerador de PDF. O no action-document tambem gera PDF, mas coletando
        // campos e preenchendo um template cadastrado — aqui a entrada e texto
        // solto, normalmente o que o agente de IA escreveu.
        const rawVariable = String(localData.saveUrlToVariable || '').trim();
        const variableIsValid = rawVariable === '' || /^\w+$/.test(rawVariable);
        const effectiveVariable = variableIsValid && rawVariable ? rawVariable : 'pdf_url';

        return (
          <div className="space-y-4">
            <div className="p-3 bg-fuchsia-50 dark:bg-fuchsia-950/30 rounded-lg flex items-center gap-3">
              <FileDown className="h-5 w-5 text-fuchsia-600" />
              <div>
                <p className="text-xs font-semibold">Gerar PDF</p>
                <p className="text-[10px] text-muted-foreground">
                  Transforma um texto do fluxo em PDF e devolve a URL numa variavel, pronta para enviar como documento.
                </p>
              </div>
            </div>

            <div>
              <Label className="text-xs">Conteudo do PDF</Label>
              <Textarea
                value={String(localData.content || '')}
                onChange={(e) => handleChange('content', e.target.value)}
                placeholder={'{{relatorio_texto}}'}
                rows={8}
                className="mt-1 font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Aceita {'{{variavel}}'}. Cada linha vira um paragrafo. Markdown nao e interpretado: {'#'} e {'**'} sairiam
                literais no arquivo.
              </p>
            </div>

            <div>
              <Label className="text-xs">Nome do arquivo</Label>
              <Input
                value={String(localData.documentName || '')}
                onChange={(e) => handleChange('documentName', e.target.value)}
                placeholder="Relatorio {{evento_cidade}}"
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                E o nome que o destinatario ve no WhatsApp. Acentos sao removidos.
              </p>
            </div>

            <div>
              <Label className="text-xs">Salvar URL na variavel</Label>
              <Input
                value={rawVariable}
                onChange={(e) => handleChange('saveUrlToVariable', e.target.value)}
                placeholder="pdf_url"
                className="mt-1 font-mono"
              />
              {!variableIsValid ? (
                <p className="text-[10px] text-amber-600 mt-1">
                  Use so letras, numeros e _ — outro formato nunca voltaria como {'{{variavel}}'}. Vai usar{' '}
                  <span className="font-mono">pdf_url</span>.
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Use <span className="font-mono">{`{{${effectiveVariable}}}`}</span> num bloco de Conteudo do tipo
                  Documento para enviar o arquivo.
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">Logo (URL, opcional)</Label>
              <Input
                value={String(localData.logoUrl || '')}
                onChange={(e) => handleChange('logoUrl', e.target.value)}
                placeholder="https://..."
                className="mt-1"
              />
            </div>

            <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground">
                Se o conteudo ficar vazio, nenhum PDF e gerado e o fluxo segue. Se a geracao falhar, o fluxo PARA — melhor
                do que enviar um documento quebrado.
              </p>
            </div>
          </div>
        );
      }

      case 'action-query-contacts': {
        // O fluxo so sabia agir sobre O CONTATO da conversa. Este no e a
        // primeira vez que ele consegue PERGUNTAR algo sobre a base.
        const queryMode = String(localData.queryMode || 'count');
        const queryFilters = (localData.filters as ContactQueryFilter[]) || [];
        const listFields = (localData.listFields as string[]) || ['name', 'phone'];
        const rawOutput = String(localData.outputVariable || '').trim();
        const outputIsValid = rawOutput === '' || /^\w+$/.test(rawOutput);
        const effectiveOutput = outputIsValid && rawOutput ? rawOutput : 'consulta_resultado';

        const updateQueryFilter = (id: string, patch: Partial<ContactQueryFilter>) => {
          handleChange('filters', queryFilters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
        };
        const addQueryFilter = () => {
          const nf: ContactQueryFilter = {
            id: Math.random().toString(36).substring(2, 10),
            type: 'tag',
            negate: false,
          };
          handleChange('filters', [...queryFilters, nf]);
        };
        const removeQueryFilter = (id: string) => {
          handleChange('filters', queryFilters.filter((f) => f.id !== id));
        };
        const toggleListField = (field: string) => {
          handleChange(
            'listFields',
            listFields.includes(field) ? listFields.filter((f) => f !== field) : [...listFields, field],
          );
        };

        return (
          <div className="space-y-4">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg flex items-center gap-3">
              <DatabaseZap className="h-5 w-5 text-indigo-600" />
              <div>
                <p className="text-xs font-semibold">Consultar Contatos</p>
                <p className="text-[10px] text-muted-foreground">
                  Pergunta algo sobre a base e grava a resposta numa variavel do fluxo. Sempre so dentro desta organizacao.
                </p>
              </div>
            </div>

            <div>
              <Label className="text-xs">O que devolver</Label>
              <Select value={queryMode} onValueChange={(v) => handleChange('queryMode', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="count">Contar — devolve um numero</SelectItem>
                  <SelectItem value="list">Listar — devolve texto com os campos escolhidos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Filtros</Label>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addQueryFilter}>
                  <Plus className="h-3 w-3 mr-1" /> Filtro
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">
                Todos os filtros precisam bater ao mesmo tempo (E). Sem filtro nenhum, conta a base inteira da organizacao.
                O botao <Braces className="inline h-3 w-3 align-[-2px]" /> troca a lista por uma variavel, resolvida na hora do
                disparo — se ela vier vazia, o no falha em vez de ignorar o filtro e devolver um numero maior.
              </p>

              <div className="space-y-2">
                {queryFilters.map((f) => (
                  <div key={f.id} className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between gap-2">
                      <Select value={f.type} onValueChange={(v) => updateQueryFilter(f.id, { type: v as ContactQueryFilterType })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tag">Tag</SelectItem>
                          <SelectItem value="pipeline">Etapa do funil</SelectItem>
                          <SelectItem value="custom_field">Campo personalizado</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant={f.useVariable ? 'secondary' : 'ghost'}
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title={f.useVariable ? 'Voltar a escolher na lista' : 'Escolher por variavel'}
                        onClick={() => updateQueryFilter(f.id, { useVariable: !f.useVariable })}
                      >
                        <Braces className={f.useVariable ? 'h-3.5 w-3.5 text-indigo-600' : 'h-3.5 w-3.5 text-muted-foreground'} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeQueryFilter(f.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>

                    {f.type === 'tag' && (
                      <>
                        <div className="flex items-center gap-2">
                          <Switch checked={!f.negate} onCheckedChange={(c) => updateQueryFilter(f.id, { negate: !c })} />
                          <span className="text-[11px] text-muted-foreground">{f.negate ? 'Nao tem a tag' : 'Tem a tag'}</span>
                        </div>
                        {f.useVariable ? (
                          <VariableInput
                            value={f.tagId || ''}
                            onValueChange={(v) => updateQueryFilter(f.id, { tagId: v })}
                            variables={availableVariables}
                            placeholder="Variavel com o id da tag"
                            className="h-8 text-xs font-mono"
                          />
                        ) : (
                          <Select value={f.tagId || ''} onValueChange={(v) => updateQueryFilter(f.id, { tagId: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione tag..." /></SelectTrigger>
                            <SelectContent>
                              {tags.map((tag) => (
                                <SelectItem key={tag.id} value={tag.id}>
                                  <div className="flex items-center gap-2">
                                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                                    {tag.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </>
                    )}

                    {f.type === 'pipeline' && (
                      <>
                        <div className="flex items-center gap-2">
                          <Switch checked={!f.negate} onCheckedChange={(c) => updateQueryFilter(f.id, { negate: !c })} />
                          <span className="text-[11px] text-muted-foreground">{f.negate ? 'Nao esta na etapa' : 'Esta na etapa'}</span>
                        </div>
                        {f.useVariable ? (
                          // Quem filtra e o columnId; o pipelineId so existe para
                          // popular o segundo seletor do modo lista.
                          <VariableInput
                            value={f.columnId || ''}
                            onValueChange={(v) => updateQueryFilter(f.id, { columnId: v })}
                            variables={availableVariables}
                            placeholder="Variavel com o id da etapa"
                            className="h-8 text-xs font-mono"
                          />
                        ) : (
                          <>
                            <Select
                              value={f.pipelineId || ''}
                              onValueChange={(v) => updateQueryFilter(f.id, { pipelineId: v, columnId: undefined })}
                            >
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pipeline..." /></SelectTrigger>
                              <SelectContent>
                                {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {f.pipelineId && (
                              <Select value={f.columnId || ''} onValueChange={(v) => updateQueryFilter(f.id, { columnId: v })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Etapa..." /></SelectTrigger>
                                <SelectContent>
                                  {pipelineColumns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            )}
                          </>
                        )}
                      </>
                    )}

                    {f.type === 'custom_field' && (
                      <>
                        {f.useVariable ? (
                          <VariableInput
                            value={f.fieldKey || ''}
                            onValueChange={(v) => updateQueryFilter(f.id, { fieldKey: v })}
                            variables={availableVariables}
                            placeholder="Variavel com a chave do campo"
                            className="h-8 text-xs font-mono"
                          />
                        ) : (
                          <Select value={f.fieldKey || ''} onValueChange={(v) => updateQueryFilter(f.id, { fieldKey: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Qual campo..." /></SelectTrigger>
                            <SelectContent>
                              {contactCustomFields.map((cf) => (
                                <SelectItem key={cf.id} value={cf.key}>{cf.label}</SelectItem>
                              ))}
                              {!contactCustomFields.length && (
                                <SelectItem value="none" disabled>Nenhum campo personalizado criado</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        )}
                        <Select
                          value={f.operator || 'equals'}
                          onValueChange={(v) => updateQueryFilter(f.id, { operator: v as ContactQueryOperator })}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="equals">Igual a</SelectItem>
                            <SelectItem value="not_equals">Diferente de</SelectItem>
                            <SelectItem value="contains">Contem</SelectItem>
                            <SelectItem value="is_not_empty">Esta preenchido</SelectItem>
                            <SelectItem value="is_empty">Esta vazio</SelectItem>
                          </SelectContent>
                        </Select>
                        {f.operator !== 'is_empty' && f.operator !== 'is_not_empty' && (
                          <VariableInput
                            value={f.value || ''}
                            onValueChange={(v) => updateQueryFilter(f.id, { value: v })}
                            variables={availableVariables}
                            placeholder="Valor (aceita variavel)"
                            className="h-8 text-xs"
                          />
                        )}
                      </>
                    )}
                  </div>
                ))}
                {queryFilters.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic px-1">Nenhum filtro — conta todos os contatos da organizacao.</p>
                )}
              </div>
            </div>

            {queryMode === 'list' && (
              <>
                <div>
                  <Label className="text-xs">Campos em cada linha</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {[
                      { key: 'name', label: 'Nome' },
                      { key: 'phone', label: 'Telefone' },
                      { key: 'email', label: 'E-mail' },
                      ...contactCustomFields.map((cf) => ({ key: cf.key, label: cf.label })),
                    ].map((field) => (
                      <button
                        key={field.key}
                        type="button"
                        onClick={() => toggleListField(field.key)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                          listFields.includes(field.key)
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border text-muted-foreground hover:bg-muted/50',
                        )}
                      >
                        {field.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Maximo de linhas</Label>
                  <Input
                    type="number"
                    value={Number(localData.listLimit) || 20}
                    onChange={(e) => handleChange('listLimit', Number(e.target.value) || 20)}
                    className="mt-1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Teto duro de 200, independente do que estiver aqui — o texto vai para uma mensagem de WhatsApp. Se
                    cortar, a propria mensagem diz "mostrando X de Y".
                  </p>
                </div>
              </>
            )}

            <div>
              <Label className="text-xs">Salvar resultado na variavel</Label>
              <Input
                value={rawOutput}
                onChange={(e) => handleChange('outputVariable', e.target.value)}
                placeholder="consulta_resultado"
                className="mt-1 font-mono"
              />
              {!outputIsValid ? (
                <p className="text-[10px] text-amber-600 mt-1">
                  Use so letras, numeros e _ — outro formato nunca voltaria como {'{{variavel}}'}. Vai usar{' '}
                  <span className="font-mono">consulta_resultado</span>.
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground mt-1">
                  <span className="font-mono">{`{{${effectiveOutput}}}`}</span> traz{' '}
                  {queryMode === 'count' ? 'o numero' : 'o texto da lista'}, e{' '}
                  <span className="font-mono">{`{{${effectiveOutput}_total}}`}</span> traz sempre o total exato — use ele
                  num no de Condicao para comparar.
                </p>
              )}
            </div>

            <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground">
                Se um filtro de tag ou etapa alcancar mais de 20 mil contatos, o no FALHA em vez de devolver um numero
                cortado — numero errado seria pior que erro. E um filtro "nao tem" sozinho, sem nenhum filtro positivo
                junto, so funciona ate algumas centenas de contatos.
              </p>
            </div>
          </div>
        );
      }

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

      case 'action-document': {
        const docMode = (localData.documentMode as string) || 'ai_agent';
        // Variáveis específicas geradas pelo próprio nó de documento.
        const linkVariables: FlowVariableGroup[] = [
          {
            label: 'Do documento',
            variables: [{ name: 'link', description: 'Link do formulário público gerado' }],
          },
          ...availableVariables,
        ];
        const noteVariables: FlowVariableGroup[] = [
          {
            label: 'Do documento',
            variables: [
              { name: 'template_name', description: 'Nome do template do documento' },
              { name: 'contact_name', description: 'Nome do contato' },
              { name: 'contact_phone', description: 'Telefone do contato' },
              { name: 'document_name', description: 'Nome do documento gerado' },
            ],
          },
          ...availableVariables,
        ];
        return (
          <div className="space-y-4">
            <div className="p-3 bg-rose-50 rounded-lg flex items-center gap-3">
              <FileText className="h-5 w-5 text-rose-500" />
              <div>
                <p className="text-xs font-semibold">Gerar Contrato / Documento</p>
                <p className="text-[10px] text-muted-foreground text-rose-700/70">Coleta dados e gera PDFs automaticamente.</p>
              </div>
            </div>

            {/* Modo de operação */}
            <div className="space-y-2">
              <Label>Modo de operação</Label>
              <Select
                value={docMode}
                onValueChange={(val) => handleChange('documentMode', val)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ai_agent">
                    <div className="flex items-center gap-2">
                      <Bot className="h-3.5 w-3.5" />
                      Agente IA (coleta conversacional)
                    </div>
                  </SelectItem>
                  <SelectItem value="public_link">
                    <div className="flex items-center gap-2">
                      <Link className="h-3.5 w-3.5" />
                      Link Público (formulário web)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {docMode === 'ai_agent'
                  ? 'O agente coleta os dados conversando pelo WhatsApp e gera o documento automaticamente.'
                  : 'Envia um link de formulário público para o contato preencher os dados.'}
              </p>
            </div>

            {/* Tipo de documento */}
            <div className="space-y-2">
              <Label>Tipo de documento</Label>
              <Select
                value={(localData.documentSource as string) || 'template'}
                onValueChange={(val) => {
                  const newData = {
                    ...localData,
                    documentSource: val,
                    templateId: '',
                    templateName: '',
                    packId: '',
                    packName: '',
                  };
                  setLocalData(newData);
                  onUpdate(node.id, newData);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="template">Template individual</SelectItem>
                  <SelectItem value="pack">Pack de documentos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Template selection */}
            {(localData.documentSource as string || 'template') === 'template' && (
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
            )}

            {/* Pack selection */}
            {(localData.documentSource as string) === 'pack' && (
              <div className="space-y-2">
                <Label>Pack de Documentos</Label>
                <Select
                  value={(localData.packId as string) || ''}
                  onValueChange={(val) => {
                    const pack = packs.find(p => p.id === val);
                    const newData = {
                      ...localData,
                      packId: val,
                      packName: pack?.name || 'Pack',
                      templateId: '',
                    };
                    setLocalData(newData);
                    onUpdate(node.id, newData);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione um pack..." /></SelectTrigger>
                  <SelectContent>
                    {packs.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <Layers className="h-3.5 w-3.5" />
                          {p.name}
                          <span className="text-[10px] text-muted-foreground">({p.template_ids?.length || 0} docs)</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  {docMode === 'ai_agent'
                    ? 'O agente coletará todos os campos compartilhados do pack e gerará todos os documentos de uma vez.'
                    : 'Será enviado o link do formulário público do pack.'}
                </p>
              </div>
            )}

            {/* Verificação de documentos (ambos os modos) */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Verificação de documentos</Label>
                <Switch
                  checked={!!(localData.requireDocumentVerification as boolean)}
                  onCheckedChange={(val) => handleChange('requireDocumentVerification', val)}
                />
              </div>
              {!!(localData.requireDocumentVerification as boolean) && (
                <div className="space-y-2">
                  <Textarea
                    value={(localData.documentVerificationPrompt as string) || ''}
                    onChange={(e) => handleChange('documentVerificationPrompt', e.target.value)}
                    placeholder={"Antes de prosseguir, verifique se o contato enviou:\n- Foto da identidade (frente e verso)\n- Certidão de nascimento\n- Comprovante de residência"}
                    className="text-xs min-h-[100px]"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    O agente verificará se todos os documentos listados foram enviados pelo contato antes de avançar para a coleta de dados ou envio do link.
                  </p>
                </div>
              )}
            </div>

            {/* === MODO AGENTE IA === */}
            {docMode === 'ai_agent' && (
              <>
                {/* Agent selector */}
                <div className="space-y-2">
                  <Label>Agente para coleta</Label>
                  <Select
                    value={(localData.documentAgentId as string) || '_default'}
                    onValueChange={(val) => handleChange('documentAgentId', val === '_default' ? '' : val)}
                  >
                    <SelectTrigger><SelectValue placeholder="Agente padrão da conversa" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_default">
                        <span className="text-muted-foreground">Usar agente ativo da conversa</span>
                      </SelectItem>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          <div className="flex items-center gap-2">
                            <Bot className="h-3.5 w-3.5" />
                            {a.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Escolha qual agente conduzirá a coleta de dados. O prompt e personalidade dele serão usados.
                  </p>
                </div>

                {/* Prompt adicional para coleta */}
                <div className="space-y-2">
                  <Label>Prompt adicional para coleta</Label>
                  <Textarea
                    value={(localData.additionalInstructions as string) || ''}
                    onChange={(e) => handleChange('additionalInstructions', e.target.value)}
                    placeholder="Ex: Peça o CPF formatado com pontos e traço. Seja objetivo e não faça perguntas extras."
                    className="text-xs min-h-[60px]"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Instruções extras que o agente seguirá durante a coleta dos dados do documento.
                  </p>
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
                </div>
              </>
            )}

            {/* === MODO LINK PÚBLICO === */}
            {docMode === 'public_link' && (
              <>
                <div className="space-y-2">
                  <Label>Mensagem de envio do link</Label>
                  <VariableTextarea
                    value={(localData.publicLinkMessage as string) || ''}
                    onValueChange={(value) => handleChange('publicLinkMessage', value)}
                    variables={linkVariables}
                    placeholder="📋 Olá! Para prosseguir, por favor preencha seus dados neste link: {{link}}"
                    className="text-xs min-h-[60px]"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Use {'{{link}}'} para incluir o link do formulário. Se vazio, o link será enviado diretamente.
                  </p>
                </div>
              </>
            )}

            {/* Assinatura (ambos os modos) */}
            <div className="border-t pt-4 space-y-2">
              <Label>Método de Assinatura</Label>
              <Select
                value={(localData.signingMethod as string) || 'manual'}
                onValueChange={(val) => handleChange('signingMethod', val)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual / PDF Direto</SelectItem>
                  <SelectItem value="govbr">Gov.br</SelectItem>
                  <SelectItem value="zapsign">Wizzy Sign</SelectItem>
                </SelectContent>
              </Select>
              {(localData.signingMethod as string) !== 'manual' && (
                <div className="flex items-center justify-between pt-1">
                  <Label className="text-xs">Enviar link de assinatura</Label>
                  <Switch
                    checked={(localData.sendSignatureLink as boolean) !== false}
                    onCheckedChange={(val) => handleChange('sendSignatureLink', val)}
                  />
                </div>
              )}
            </div>

            {/* Notificação interna */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Notificar equipe (nota interna)</Label>
                <Switch
                  checked={(localData.sendInternalNote as boolean) ?? true}
                  onCheckedChange={(val) => handleChange('sendInternalNote', val)}
                />
              </div>
              {(localData.sendInternalNote as boolean) !== false && (
                <div className="space-y-2">
                  <Label className="text-xs">Mensagem da notificação</Label>
                  <VariableTextarea
                    value={(localData.internalNoteTemplate as string) || ''}
                    onValueChange={(value) => handleChange('internalNoteTemplate', value)}
                    variables={noteVariables}
                    placeholder="📋 Documento gerado: {{template_name}} para {{contact_name}}"
                    className="text-xs min-h-[50px]"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Variáveis: {'{{template_name}}'}, {'{{contact_name}}'}, {'{{contact_phone}}'}, {'{{document_name}}'}
                  </p>
                </div>
              )}
            </div>

            {/* Mover Pipeline após geração */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Mover Pipeline após gerar</Label>
                <Switch
                  checked={!!(localData.movePipelineAfter as boolean)}
                  onCheckedChange={(val) => handleChange('movePipelineAfter', val)}
                />
              </div>
              {!!(localData.movePipelineAfter as boolean) && (
                <div className="space-y-2">
                  <Label className="text-xs">Pipeline</Label>
                  <Select
                    value={(localData.docPipelineId as string) || ''}
                    onValueChange={(val) => {
                      const p = pipelines.find(pl => pl.id === val);
                      handleChange('docPipelineId', val);
                      handleChange('docPipelineName', p?.name || '');
                      handleChange('docPipelineColumnId', '');
                    }}
                  >
                    <SelectTrigger className="text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {pipelines.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {(localData.docPipelineId as string) && (
                    <>
                      <Label className="text-xs">Coluna de destino</Label>
                      <OutcomeColumnSelect
                        pipelineId={localData.docPipelineId as string}
                        value={(localData.docPipelineColumnId as string) || ''}
                        onChange={(val) => handleChange('docPipelineColumnId', val)}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      }

      // Condition is handled above via renderAdvancedConditionEditor

      case 'message-list':
        const listSections = (localData.sections as Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>) || [];
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="listText">Texto da Mensagem</Label>
              <VariableTextarea
                id="listText"
                value={(localData.content as string) || ''}
                onValueChange={(value) => handleChange('content', value)}
                variables={availableVariables}
                placeholder="Selecione uma das opções abaixo:"
                className="min-h-[60px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buttonText">Texto do Botão</Label>
              <Input
                id="buttonText"
                value={(localData.buttonText as string) || ''}
                onChange={(e) => handleChange('buttonText', e.target.value)}
                placeholder="Ver opções"
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Opções da Lista</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    const newSections = [...listSections];
                    if (newSections.length === 0) {
                      newSections.push({ title: '', rows: [{ id: generateId(), title: '', description: '' }] });
                    } else {
                      newSections[0].rows.push({ id: generateId(), title: '', description: '' });
                    }
                    handleChange('sections', newSections);
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Adicionar opção
                </Button>
              </div>
              {listSections.length > 0 && listSections.map((section, si) => (
                <div key={si} className="space-y-2">
                  {listSections.length > 1 && (
                    <Input
                      value={section.title}
                      onChange={(e) => {
                        const newSections = [...listSections];
                        newSections[si] = { ...newSections[si], title: e.target.value };
                        handleChange('sections', newSections);
                      }}
                      placeholder={`Seção ${si + 1}`}
                      className="h-8 text-xs font-medium"
                    />
                  )}
                  {section.rows.map((row, ri) => (
                    <div key={row.id} className="flex items-center gap-2">
                      <div className="flex-1 space-y-1">
                        <Input
                          value={row.title}
                          onChange={(e) => {
                            const newSections = [...listSections];
                            newSections[si].rows[ri] = { ...row, title: e.target.value };
                            handleChange('sections', newSections);
                          }}
                          placeholder={`Opção ${ri + 1}`}
                          className="h-8 text-xs"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          const newSections = [...listSections];
                          newSections[si].rows = newSections[si].rows.filter((_, i) => i !== ri);
                          if (newSections[si].rows.length === 0) {
                            newSections.splice(si, 1);
                          }
                          handleChange('sections', newSections);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
              {listSections.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Adicione opções para criar rotas individuais
                </p>
              )}
            </div>
            <RemarketingStepsEditor localData={localData} handleChange={handleChange} />
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
    <Dialog open={!!node} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">{nodeLabel}</DialogTitle>
              <p className="text-xs text-muted-foreground">ID: {node.id}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {renderFields()}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center gap-3 shrink-0">
          {onDelete && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
              Excluir Bloco
            </Button>
          )}
          <div className="flex-1" />
          {onSave && (
            <Button
              size="sm"
              className={cn(
                "gap-2 min-w-[140px] transition-colors",
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
