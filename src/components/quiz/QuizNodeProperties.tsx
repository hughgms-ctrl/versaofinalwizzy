import { useState, useEffect, useRef, useCallback } from 'react';
import { Node } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Calendar } from '@/components/ui/calendar';
import { Trash2, Plus, GripVertical, Save, ArrowUp, ArrowDown, Copy, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { usePipelines, usePipelineColumns } from '@/hooks/usePipelines';
import { useTags } from '@/hooks/useTags';
import { getQuizComponentInfo } from './QuizSidebar';
import { ptBR } from 'date-fns/locale';

interface QuizNodePropertiesProps {
  node: Node | null;
  selectedBlockIdx: number | null;
  onClose: () => void;
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode?: (nodeId: string) => void;
  onSave?: () => void;
  isSaving?: boolean;
  allNodes?: Node[];
}

export function QuizNodeProperties({ node, selectedBlockIdx, onClose, onUpdateNode, onDeleteNode, onDuplicateNode, onSave, isSaving, allNodes }: QuizNodePropertiesProps) {
  if (!node) return null;

  // Collect all user-defined fields from all blocks across all nodes
  const userFields: string[] = [];
  (allNodes || []).forEach(n => {
    const blocks = (n.data?.blocks as any[]) || [];
    blocks.forEach(b => {
      const v = b.data?.variable;
      if (v && !userFields.includes(v)) userFields.push(v);
    });
  });

  const blocks = (node.data.blocks as any[]) || [];
  const block = selectedBlockIdx !== null ? blocks[selectedBlockIdx] : null;

  return (
    <Sheet open={!!node} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-80 sm:w-96 p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="text-sm">
            {block ? 'Editar bloco' : 'Grupo'}
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1">
          {block ? (
            <BlockEditor
              block={block}
              blockIdx={selectedBlockIdx!}
              allBlocks={blocks}
              nodeId={node.id}
              onUpdate={(updatedBlocks) => onUpdateNode(node.id, { blocks: updatedBlocks })}
              userFields={userFields}
            />
          ) : (
            <GroupEditor
              node={node}
              onUpdate={(data) => onUpdateNode(node.id, data)}
              onDelete={() => onDeleteNode(node.id)}
              onDuplicate={onDuplicateNode ? () => onDuplicateNode(node.id) : undefined}
            />
          )}
        </ScrollArea>
        {onSave && (
          <div className="p-4 border-t">
            <Button className="w-full" onClick={onSave} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function GroupEditor({ node, onUpdate, onDelete, onDuplicate }: { node: Node; onUpdate: (data: Record<string, unknown>) => void; onDelete: () => void; onDuplicate?: () => void }) {
  const label = (node.data.label as string) || '';

  return (
    <div className="p-4 space-y-4">
      <div>
        <Label className="text-xs">Nome do grupo</Label>
        <Input value={label} onChange={(e) => onUpdate({ label: e.target.value })} />
      </div>
      <Separator />
      {onDuplicate && (
        <Button variant="outline" size="sm" className="w-full" onClick={onDuplicate}>
          <Copy className="h-3.5 w-3.5 mr-2" />
          Duplicar grupo
        </Button>
      )}
      <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5 mr-2" />
        Excluir grupo
      </Button>
    </div>
  );
}

function BlockEditor({ block, blockIdx, allBlocks, nodeId, onUpdate, userFields }: {
  block: any;
  blockIdx: number;
  allBlocks: any[];
  nodeId: string;
  onUpdate: (blocks: any[]) => void;
  userFields: string[];
}) {
  // Local state for block data to avoid re-rendering entire canvas on every keystroke
  const [localData, setLocalData] = useState<Record<string, any>>(block.data || {});
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allBlocksRef = useRef(allBlocks);
  allBlocksRef.current = allBlocks;
  const blockRef = useRef(block);
  blockRef.current = block;
  const blockIdxRef = useRef(blockIdx);
  blockIdxRef.current = blockIdx;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const localDataRef = useRef(localData);
  localDataRef.current = localData;

  // Sync local data when block changes externally (e.g. switching blocks)
  useEffect(() => {
    setLocalData(block.data || {});
  }, [block.id]);

  const d = localData;

  const flushToParent = useCallback((newData: Record<string, any>) => {
    const updated = [...allBlocksRef.current];
    updated[blockIdxRef.current] = { ...blockRef.current, data: newData };
    onUpdateRef.current(updated);
  }, []);

  const updateBlockData = useCallback((newData: Record<string, any>) => {
    setLocalData(prev => {
      const merged = { ...prev, ...newData };
      localDataRef.current = merged;
      if (flushRef.current) clearTimeout(flushRef.current);
      flushRef.current = setTimeout(() => flushToParent(localDataRef.current), 300);
      return merged;
    });
  }, [flushToParent]);

  // Flush pending changes on unmount
  useEffect(() => {
    return () => {
      if (flushRef.current) {
        clearTimeout(flushRef.current);
        flushToParent(localDataRef.current);
      }
    };
  }, [flushToParent]);

  // Immediate update (for switches, selects — non-text inputs)
  const updateBlockDataImmediate = useCallback((newData: Record<string, any>) => {
    setLocalData(prev => {
      const merged = { ...prev, ...newData };
      localDataRef.current = merged;
      if (flushRef.current) clearTimeout(flushRef.current);
      flushToParent(merged);
      return merged;
    });
  }, [flushToParent]);

  const deleteBlock = () => {
    onUpdate(allBlocks.filter((_, i) => i !== blockIdx));
  };

  return (
    <div className="p-4 space-y-4">
      {/* Common delete */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="text-destructive" onClick={deleteBlock}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover bloco
        </Button>
      </div>

      {/* Bubble text */}
      {block.type === 'quiz-bubble-text' && (
        <div>
          <Label className="text-xs">Conteúdo</Label>
          <Textarea value={d.content || ''} onChange={(e) => updateBlockData({ content: e.target.value })} rows={4} placeholder="Digite o texto..." />
        </div>
      )}

      {/* Bubble image */}
      {block.type === 'quiz-bubble-image' && (
        <>
          <div><Label className="text-xs">URL da imagem</Label>
            <Input value={d.url || ''} onChange={(e) => updateBlockData({ url: e.target.value })} placeholder="https://..." /></div>
          <div><Label className="text-xs">Texto alternativo</Label>
            <Input value={d.alt || ''} onChange={(e) => updateBlockData({ alt: e.target.value })} /></div>
        </>
      )}

      {/* Bubble video */}
      {block.type === 'quiz-bubble-video' && (
        <>
          <div><Label className="text-xs">URL do vídeo</Label>
            <Input value={d.url || ''} onChange={(e) => updateBlockData({ url: e.target.value })} placeholder="YouTube, Vimeo ou MP4" /></div>
          <div>
            <Label className="text-xs">Orientação</Label>
            <Select value={d.orientation || 'horizontal'} onValueChange={(v) => updateBlockDataImmediate({ orientation: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="horizontal">Horizontal (16:9)</SelectItem>
                <SelectItem value="vertical">Vertical (9:16)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Autoplay</Label>
            <Switch checked={d.autoplay !== false} onCheckedChange={(v) => updateBlockDataImmediate({ autoplay: v })} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <Label className="text-xs">Botão WhatsApp</Label>
            <Switch checked={d.showWhatsapp === true} onCheckedChange={(v) => updateBlockDataImmediate({ showWhatsapp: v })} />
          </div>
          {d.showWhatsapp && (
            <>
              <div><Label className="text-xs">Número do WhatsApp</Label>
                <Input value={d.waNumber || ''} onChange={(e) => updateBlockData({ waNumber: e.target.value })} placeholder="5511999999999" /></div>
              <div><Label className="text-xs">Mensagem pré-preenchida</Label>
                <Input value={d.waMessage || ''} onChange={(e) => updateBlockData({ waMessage: e.target.value })} placeholder="Olá, vim pelo quizz!" /></div>
              <div><Label className="text-xs">Texto do botão</Label>
                <Input value={d.waButtonText || ''} onChange={(e) => updateBlockData({ waButtonText: e.target.value })} placeholder="Falar no WhatsApp" /></div>
            </>
          )}
        </>
      )}

      {/* Bubble embed */}
      {block.type === 'quiz-bubble-embed' && (
        <div><Label className="text-xs">HTML embed ou URL</Label>
          <Textarea value={d.url || ''} onChange={(e) => updateBlockData({ url: e.target.value })} rows={4} placeholder="<iframe>..." /></div>
      )}

      {/* Bubble audio */}
      {block.type === 'quiz-bubble-audio' && (
        <div><Label className="text-xs">URL do áudio</Label>
          <Input value={d.url || ''} onChange={(e) => updateBlockData({ url: e.target.value })} placeholder="https://..." /></div>
      )}

      {/* Text/Number/Email/Website/Phone inputs */}
      {['quiz-input-text', 'quiz-input-number', 'quiz-input-email', 'quiz-input-website', 'quiz-input-phone'].includes(block.type) && (
        <>
          <div><Label className="text-xs">Pergunta</Label>
            <Textarea value={d.question || ''} onChange={(e) => updateBlockData({ question: e.target.value })} rows={2} placeholder="Ex: Qual é o seu nome?" /></div>
          <div><Label className="text-xs">Placeholder</Label>
            <Input value={d.placeholder || ''} onChange={(e) => updateBlockData({ placeholder: e.target.value })} /></div>
          <ContactFieldSelect value={d.variable || ''} onChange={(v) => updateBlockDataImmediate({ variable: v })} userFields={userFields} />
          <div className="flex items-center justify-between">
            <Label className="text-xs">Obrigatório</Label>
            <Switch checked={d.required !== false} onCheckedChange={(v) => updateBlockDataImmediate({ required: v })} />
          </div>
        </>
      )}

      {/* Date */}
      {block.type === 'quiz-input-date' && (
        <>
          <div><Label className="text-xs">Pergunta</Label>
            <Textarea value={d.question || ''} onChange={(e) => updateBlockData({ question: e.target.value })} rows={2} placeholder="Ex: Informe a data de nascimento" /></div>
          
          <Separator />


          <Separator />

          <div className="flex items-center justify-between">
            <Label className="text-xs">Permitir precisão flexível</Label>
            <Switch checked={d.allowFlexible !== false} onCheckedChange={(v) => updateBlockDataImmediate({ allowFlexible: v })} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Permite selecionar: Data exata, Mês/Ano ou Apenas ano.
          </p>

          <div className="flex items-center justify-between">
            <Label className="text-xs">Opção "Não sei"</Label>
            <Switch checked={d.allowUnknown !== false} onCheckedChange={(v) => updateBlockDataImmediate({ allowUnknown: v })} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Adiciona botão "Não sei" com saída separada para ramificação no fluxo.
          </p>

          <Separator />

          <ContactFieldSelect value={d.variable || ''} onChange={(v) => updateBlockDataImmediate({ variable: v })} userFields={userFields} />

          <div className="flex items-center justify-between">
            <Label className="text-xs">Obrigatório</Label>
            <Switch checked={d.required !== false} onCheckedChange={(v) => updateBlockDataImmediate({ required: v })} />
          </div>

          <div>
            <Label className="text-xs mb-2 block">Pré-visualização</Label>
            <Calendar
              mode="single"
              locale={ptBR}
              className="rounded-md border pointer-events-auto mx-auto"
            />
          </div>
        </>
      )}

      {/* Time */}
      {block.type === 'quiz-input-time' && (
        <>
          <div><Label className="text-xs">Pergunta</Label>
            <Textarea value={d.question || ''} onChange={(e) => updateBlockData({ question: e.target.value })} rows={2} placeholder="Ex: Qual o melhor horário?" /></div>
          <div><Label className="text-xs">Salvar como campo do contato</Label>
            <Input value={d.variable || ''} onChange={(e) => updateBlockData({ variable: e.target.value })} /></div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Obrigatório</Label>
            <Switch checked={d.required !== false} onCheckedChange={(v) => updateBlockDataImmediate({ required: v })} />
          </div>
        </>
      )}

      {/* Rating */}
      {block.type === 'quiz-input-rating' && (
        <>
          <div><Label className="text-xs">Pergunta</Label>
            <Textarea value={d.question || ''} onChange={(e) => updateBlockData({ question: e.target.value })} rows={2} placeholder="Ex: Como avalia nosso atendimento?" /></div>
          <div><Label className="text-xs">Escala máxima</Label>
            <Select value={String(d.maxRating || 5)} onValueChange={(v) => updateBlockDataImmediate({ maxRating: parseInt(v) })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[3, 5, 7, 10].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <ContactFieldSelect value={d.variable || ''} onChange={(v) => updateBlockDataImmediate({ variable: v })} userFields={userFields} />
        </>
      )}

      {/* File */}
      {block.type === 'quiz-input-file' && (
        <>
          <div><Label className="text-xs">Pergunta</Label>
            <Textarea value={d.question || ''} onChange={(e) => updateBlockData({ question: e.target.value })} rows={2} placeholder="Ex: Envie seu documento" /></div>
          <div><Label className="text-xs">Tipos aceitos (ex: .pdf,.jpg)</Label>
            <Input value={d.accept || ''} onChange={(e) => updateBlockData({ accept: e.target.value })} /></div>
          <ContactFieldSelect value={d.variable || ''} onChange={(v) => updateBlockDataImmediate({ variable: v })} userFields={userFields} />
        </>
      )}

      {/* Buttons */}
      {block.type === 'quiz-input-buttons' && (
        <>
          <div><Label className="text-xs">Pergunta</Label>
            <Textarea value={d.question || ''} onChange={(e) => updateBlockData({ question: e.target.value })} rows={2} placeholder="Ex: Qual opção você prefere?" /></div>
          <OptionsEditor options={d.options || []} onChange={(opts) => updateBlockData({ options: opts })} showUrl />
        </>
      )}

      {/* Pic choice */}
      {block.type === 'quiz-input-pic-choice' && (
        <>
          <div><Label className="text-xs">Pergunta</Label>
            <Textarea value={d.question || ''} onChange={(e) => updateBlockData({ question: e.target.value })} rows={2} placeholder="Ex: Escolha uma imagem" /></div>
          <OptionsEditor options={d.options || []} onChange={(opts) => updateBlockData({ options: opts })} showImage />
        </>
      )}

      {/* Condition */}
      {block.type === 'quiz-logic-condition' && (
        <ConditionEditor data={d} onUpdate={updateBlockData} userFields={userFields} />
      )}

      {/* Redirect */}
      {block.type === 'quiz-logic-redirect' && (
        <>
          <div><Label className="text-xs">URL</Label>
            <Input value={d.url || ''} onChange={(e) => updateBlockData({ url: e.target.value })} placeholder="https://..." /></div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Nova aba</Label>
            <Switch checked={d.newTab !== false} onCheckedChange={(v) => updateBlockDataImmediate({ newTab: v })} />
          </div>
        </>
      )}

      {/* Wait */}
      {block.type === 'quiz-logic-wait' && (
        <div><Label className="text-xs">Segundos</Label>
          <Input type="number" value={d.seconds || 3} onChange={(e) => updateBlockData({ seconds: parseInt(e.target.value) || 0 })} /></div>
      )}

      {/* AB Test */}
      {block.type === 'quiz-logic-ab-test' && (
        <div><Label className="text-xs">% para variante A</Label>
          <Input type="number" value={d.percentA || 50} min={0} max={100}
            onChange={(e) => updateBlockData({ percentA: parseInt(e.target.value) || 50 })} /></div>
      )}

      {/* Jump */}
      {block.type === 'quiz-logic-jump' && (
        <div><Label className="text-xs">Grupo destino</Label>
          <Input value={d.targetGroup || ''} onChange={(e) => updateBlockData({ targetGroup: e.target.value })} placeholder="Nome do grupo" /></div>
      )}

      {/* Pixel */}
      {block.type === 'quiz-event-pixel' && (
        <PixelEditor data={d} onUpdate={updateBlockData} onUpdateImmediate={updateBlockDataImmediate} />
      )}

      {/* WhatsApp Trigger */}
      {block.type === 'quiz-event-whatsapp-trigger' && (
        <>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Enviar para o número do contato</Label>
            <Switch checked={d.useContactPhone === true} onCheckedChange={(v) => updateBlockDataImmediate({ useContactPhone: v })} />
          </div>
          {d.useContactPhone && (
            <p className="text-[10px] text-muted-foreground">
              O disparo será enviado para o telefone preenchido pelo contato (campo: phone, telefone ou whatsapp).
            </p>
          )}
          {!d.useContactPhone && (
            <div><Label className="text-xs">Número do WhatsApp</Label>
              <Input value={d.waNumber || ''} onChange={(e) => updateBlockData({ waNumber: e.target.value })} placeholder="5511999999999" /></div>
          )}
          <div><Label className="text-xs">Mensagem</Label>
            <Textarea value={d.waMessage || ''} onChange={(e) => updateBlockData({ waMessage: e.target.value })} rows={4}
              placeholder="Olá {{nome}}, obrigado por responder!" />
            <p className="text-[10px] text-muted-foreground mt-1">Use {'{{campo}}'} para interpolar campos do contato.</p>
          </div>
          <Separator />
          <CrmFieldsEditor data={d} onUpdate={updateBlockData} onUpdateImmediate={updateBlockDataImmediate} />
        </>
      )}

      {/* Contact Info */}
      {block.type === 'quiz-input-contact-info' && (
        <>
          <div><Label className="text-xs">Pergunta / Título</Label>
            <Textarea value={d.question || ''} onChange={(e) => updateBlockData({ question: e.target.value })} rows={2} placeholder="Ex: Preencha seus dados" /></div>
          <Separator />
          <Label className="text-xs font-semibold">Campos visíveis</Label>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Nome</Label>
              <Switch checked={d.showName !== false} onCheckedChange={(v) => updateBlockDataImmediate({ showName: v })} />
            </div>
            {d.showName !== false && (
              <div className="flex items-center justify-between pl-4">
                <Label className="text-[10px] text-muted-foreground">Obrigatório</Label>
                <Switch checked={d.nameRequired !== false} onCheckedChange={(v) => updateBlockDataImmediate({ nameRequired: v })} />
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label className="text-xs">WhatsApp</Label>
              <Switch checked={d.showPhone !== false} onCheckedChange={(v) => updateBlockDataImmediate({ showPhone: v })} />
            </div>
            {d.showPhone !== false && (
              <div className="flex items-center justify-between pl-4">
                <Label className="text-[10px] text-muted-foreground">Obrigatório</Label>
                <Switch checked={d.phoneRequired !== false} onCheckedChange={(v) => updateBlockDataImmediate({ phoneRequired: v })} />
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label className="text-xs">Email</Label>
              <Switch checked={d.showEmail !== false} onCheckedChange={(v) => updateBlockDataImmediate({ showEmail: v })} />
            </div>
            {d.showEmail !== false && (
              <div className="flex items-center justify-between pl-4">
                <Label className="text-[10px] text-muted-foreground">Obrigatório</Label>
                <Switch checked={d.emailRequired === true} onCheckedChange={(v) => updateBlockDataImmediate({ emailRequired: v })} />
              </div>
            )}
          </div>
        </>
      )}

      {/* CRM Action */}
      {block.type === 'quiz-event-crm-action' && (
        <CrmFieldsEditor data={d} onUpdate={updateBlockData} onUpdateImmediate={updateBlockDataImmediate} />
      )}
    </div>
  );
}


const DEFAULT_CONTACT_FIELDS = [
  { value: 'nome', label: 'Nome' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

function CrmFieldsEditor({ data, onUpdate, onUpdateImmediate }: { data: Record<string, any>; onUpdate: (d: Record<string, any>) => void; onUpdateImmediate: (d: Record<string, any>) => void }) {
  const { data: workspaces = [] } = useWorkspaces();
  const { data: pipelines = [] } = usePipelines();
  const { data: columns = [] } = usePipelineColumns(data.pipelineId || null);
  const { data: tags = [] } = useTags();

  // Filter pipelines by selected workspace ID
  const filteredPipelines = pipelines.filter(p => {
    if (!data.workspaceId) return true;
    return Array.isArray(p.workspace_ids) && p.workspace_ids.includes(data.workspaceId);
  });

  const currentTagIds = Array.isArray(data.tagIds) ? data.tagIds : [];
  const availableTags = tags.filter(t => !currentTagIds.includes(t.id));

  return (
    <div className="space-y-4">
      <Label className="text-xs font-semibold">Ações CRM</Label>
      <p className="text-[10px] text-muted-foreground">
        Configure tag, workspace, pipeline e coluna para atribuir ao contato quando passar por este nó.
      </p>

      {/* Workspace Selection */}
      <div className="space-y-1">
        <Label className="text-xs">Workspace</Label>
        <Select
          value={data.workspaceId || "none"}
          onValueChange={(val) => {
            const nextVal = val === "none" ? null : val;
            onUpdateImmediate({
              workspaceId: nextVal,
              pipelineId: null,
              columnId: null,
            });
          }}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Selecione o workspace..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhum workspace</SelectItem>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={w.id} className="text-xs">
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Pipeline Selection */}
      <div className="space-y-1">
        <Label className="text-xs">Pipeline</Label>
        <Select
          value={data.pipelineId || "none"}
          onValueChange={(val) => {
            const nextVal = val === "none" ? null : val;
            onUpdateImmediate({
              pipelineId: nextVal,
              columnId: null,
            });
          }}
          disabled={!data.workspaceId}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder={data.workspaceId ? "Selecione o pipeline..." : "Selecione um workspace primeiro"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhum pipeline</SelectItem>
            {filteredPipelines.map((p) => (
              <SelectItem key={p.id} value={p.id} className="text-xs">
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Column/Stage Selection */}
      <div className="space-y-1">
        <Label className="text-xs">Coluna (Stage)</Label>
        <Select
          value={data.columnId || "none"}
          onValueChange={(val) => {
            const nextVal = val === "none" ? null : val;
            onUpdateImmediate({ columnId: nextVal });
          }}
          disabled={!data.pipelineId}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder={data.pipelineId ? "Selecione a coluna..." : "Selecione um pipeline primeiro"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhuma coluna</SelectItem>
            {columns.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-xs">
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tags Selection */}
      <div className="space-y-2">
        <Label className="text-xs">Tags do Contato</Label>
        <div className="flex flex-wrap gap-1">
          {currentTagIds.map((tagId: string) => {
            const tag = tags.find((t) => t.id === tagId);
            return tag ? (
              <Badge
                key={tagId}
                variant="secondary"
                className="gap-1 pr-1 text-[10px]"
                style={{ borderLeft: `3px solid ${tag.color}` }}
              >
                {tag.name}
                <button
                  onClick={() =>
                    onUpdateImmediate({
                      tagIds: currentTagIds.filter((id: string) => id !== tagId),
                    })
                  }
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ) : null;
          })}
          {currentTagIds.length === 0 && (
            <span className="text-[10px] text-muted-foreground block w-full py-1">Nenhuma tag selecionada.</span>
          )}
        </div>
        
        {availableTags.length > 0 && (
          <Select
            value=""
            onValueChange={(v) => {
              if (v) {
                onUpdateImmediate({ tagIds: [...currentTagIds, v] });
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs mt-1">
              <SelectValue placeholder="Adicionar tag..." />
            </SelectTrigger>
            <SelectContent>
              {availableTags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id} className="text-xs">
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

function ContactFieldSelect({ value, onChange, userFields }: { value: string; onChange: (v: string) => void; userFields: string[] }) {
  const [customMode, setCustomMode] = useState(false);
  const allOptions = [...DEFAULT_CONTACT_FIELDS];
  userFields.forEach(f => {
    if (!allOptions.some(o => o.value === f)) {
      allOptions.push({ value: f, label: f });
    }
  });
  const isKnown = allOptions.some(o => o.value === value);
  const showCustom = customMode || (value && !isKnown);

  if (showCustom) {
    return (
      <div>
        <Label className="text-xs">Salvar como campo do contato</Label>
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Nome do campo customizado" />
        <Button variant="link" size="sm" className="px-0 h-6 text-[10px]" onClick={() => setCustomMode(false)}>
          Escolher campo existente
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Label className="text-xs">Salvar como campo do contato</Label>
      <Select value={value || ''} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Selecione um campo..." /></SelectTrigger>
        <SelectContent>
          {allOptions.map(f => (
            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="link" size="sm" className="px-0 h-6 text-[10px]" onClick={() => setCustomMode(true)}>
        Criar campo customizado
      </Button>
    </div>
  );
}

const META_STANDARD_EVENTS = [
  { value: 'PageView', label: 'PageView' },
  { value: 'Lead', label: 'Lead' },
  { value: 'CompleteRegistration', label: 'CompleteRegistration' },
  { value: 'Contact', label: 'Contact' },
  { value: 'ViewContent', label: 'ViewContent' },
  { value: 'AddToCart', label: 'AddToCart' },
  { value: 'AddToWishlist', label: 'AddToWishlist' },
  { value: 'InitiateCheckout', label: 'InitiateCheckout' },
  { value: 'AddPaymentInfo', label: 'AddPaymentInfo' },
  { value: 'Purchase', label: 'Purchase' },
  { value: 'Schedule', label: 'Schedule' },
  { value: 'Search', label: 'Search' },
  { value: 'StartTrial', label: 'StartTrial' },
  { value: 'Subscribe', label: 'Subscribe' },
  { value: 'SubmitApplication', label: 'SubmitApplication' },
  { value: 'FindLocation', label: 'FindLocation' },
  { value: 'CustomizeProduct', label: 'CustomizeProduct' },
  { value: 'Donate', label: 'Donate' },
];

function PixelEditor({ data, onUpdate, onUpdateImmediate }: { data: Record<string, any>; onUpdate: (d: Record<string, any>) => void; onUpdateImmediate: (d: Record<string, any>) => void }) {
  const [customEvent, setCustomEvent] = useState(false);
  const isCustom = customEvent || !META_STANDARD_EVENTS.some(e => e.value === (data.eventName || 'PageView'));

  return (
    <div className="space-y-4">
      <div><Label className="text-xs">Plataforma</Label>
        <Select value={data.platform || 'facebook'} onValueChange={(v) => onUpdateImmediate({ platform: v })}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="facebook">Facebook Pixel</SelectItem>
            <SelectItem value="google">Google Tag</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label className="text-xs">Pixel ID</Label>
        <Input value={data.pixelId || ''} onChange={(e) => onUpdate({ pixelId: e.target.value })} placeholder="Ex: 123456789012345" /></div>
      
      <div><Label className="text-xs">Evento</Label>
        {!isCustom ? (
          <>
            <Select value={data.eventName || 'PageView'} onValueChange={(v) => onUpdateImmediate({ eventName: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {META_STANDARD_EVENTS.map(ev => (
                  <SelectItem key={ev.value} value={ev.value}>{ev.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="link" size="sm" className="px-0 h-6 text-[10px]" onClick={() => setCustomEvent(true)}>
              Usar evento customizado
            </Button>
          </>
        ) : (
          <>
            <Input value={data.eventName || ''} onChange={(e) => onUpdate({ eventName: e.target.value })} placeholder="Nome do evento customizado" />
            <Button variant="link" size="sm" className="px-0 h-6 text-[10px]" onClick={() => { setCustomEvent(false); onUpdateImmediate({ eventName: 'PageView' }); }}>
              Usar evento padrão
            </Button>
          </>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        O pixel será disparado uma única vez quando o fluxo passar por este nó.
      </p>
    </div>
  );
}

function ConditionEditor({ data, onUpdate, userFields }: { data: Record<string, any>; onUpdate: (d: Record<string, any>) => void; userFields: string[] }) {
  const rules: any[] = data.rules || [{ source: 'variable', variable: '', compareType: 'text', operator: 'equals', value: '' }];
  const matchType = data.matchType || 'all';

  const updateRule = (idx: number, patch: Record<string, any>) => {
    const updated = [...rules];
    updated[idx] = { ...updated[idx], ...patch };
    onUpdate({ rules: updated });
  };

  const addRule = () => {
    onUpdate({ rules: [...rules, { source: 'variable', variable: '', compareType: 'text', operator: 'equals', value: '' }] });
  };

  const removeRule = (idx: number) => {
    onUpdate({ rules: rules.filter((_, i) => i !== idx) });
  };

  const getOperators = (compareType: string) => {
    const base = [
      { value: 'equals', label: 'Igual a' },
      { value: 'not_equals', label: 'Diferente de' },
      { value: 'is_set', label: 'Está preenchido' },
      { value: 'is_empty', label: 'Está vazio' },
    ];
    if (compareType === 'text') {
      return [...base.slice(0, 2), { value: 'contains', label: 'Contém' }, { value: 'not_contains', label: 'Não contém' }, ...base.slice(2)];
    }
    if (compareType === 'number') {
      return [...base.slice(0, 2), { value: 'greater_than', label: 'Maior que' }, { value: 'less_than', label: 'Menor que' }, { value: 'greater_equal', label: 'Maior ou igual' }, { value: 'less_equal', label: 'Menor ou igual' }, ...base.slice(2)];
    }
    if (compareType === 'date') {
      return [...base.slice(0, 2), { value: 'greater_than', label: 'Depois de' }, { value: 'less_than', label: 'Antes de' }, { value: 'greater_equal', label: 'A partir de' }, { value: 'less_equal', label: 'Até' }, ...base.slice(2)];
    }
    return base;
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Descrição</Label>
        <Input value={data.description || ''} onChange={(e) => onUpdate({ description: e.target.value })} placeholder="Ex: Verificar se tem tag VIP" />
      </div>

      <div>
        <Label className="text-xs">Corresponder a</Label>
        <Select value={matchType} onValueChange={(v) => onUpdate({ matchType: v })}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as regras (E)</SelectItem>
            <SelectItem value="any">Qualquer regra (OU)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs mb-2 block">Regras ({rules.length})</Label>
        <div className="space-y-3">
          {rules.map((rule, idx) => (
            <div key={idx} className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">📋 Campo do contato</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRule(idx)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {rule.source === 'variable' && (
                <div>
                  <Label className="text-[10px] text-muted-foreground">Campo do contato</Label>
                  <Select value={rule.variable || ''} onValueChange={(v) => updateRule(idx, { variable: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione um campo..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nome">Nome</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="telefone">Telefone</SelectItem>
                      {userFields.filter(f => !['nome', 'email', 'telefone'].includes(f)).map(f => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}


              <div>
                <Label className="text-[10px] text-muted-foreground">Tipo de comparação</Label>
                <Select value={rule.compareType || 'text'} onValueChange={(v) => updateRule(idx, { compareType: v, operator: 'equals' })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="number">Número</SelectItem>
                    <SelectItem value="date">Data</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] text-muted-foreground">Operador</Label>
                <Select value={rule.operator || 'equals'} onValueChange={(v) => updateRule(idx, { operator: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {getOperators(rule.compareType || 'text').map(op => (
                      <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!['is_set', 'is_empty'].includes(rule.operator || '') && (
                <div>
                  <Label className="text-[10px] text-muted-foreground">Valor</Label>
                  {rule.compareType === 'date' ? (
                    <Input type="date" value={rule.value || ''} onChange={(e) => updateRule(idx, { value: e.target.value })} className="h-8 text-xs" />
                  ) : (
                    <Input value={rule.value || ''} onChange={(e) => updateRule(idx, { value: e.target.value })} className="h-8 text-xs"
                      placeholder={rule.compareType === 'number' ? 'Ex: 2018' : 'Ex: sim'} />
                  )}
                </div>
              )}

              {rule.compareType === 'date' && (
                <p className="text-[10px] text-muted-foreground">
                  Para datas flexíveis (mês/ano ou ano), a comparação usa o valor armazenado.
                </p>
              )}
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="w-full h-8 text-xs mt-2" onClick={addRule}>
          <Plus className="h-3 w-3 mr-1" /> Adicionar regra
        </Button>
      </div>
    </div>
  );
}

function OptionsEditor({ options, onChange, showUrl, showImage }: {
  options: any[];
  onChange: (opts: any[]) => void;
  showUrl?: boolean;
  showImage?: boolean;
}) {
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }
    const n = [...options];
    const dragged = n.splice(dragItem.current, 1)[0];
    n.splice(dragOverItem.current, 0, dragged);
    onChange(n);
    dragItem.current = null;
    dragOverItem.current = null;
  };

  return (
    <div>
      <Label className="text-xs mb-2 block">Opções</Label>
      <div className="space-y-2">
        {options.map((opt: any, i: number) => (
          <div
            key={i}
            className="space-y-1"
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragEnter={() => handleDragEnter(i)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="flex items-center gap-1">
              <div className="cursor-grab active:cursor-grabbing flex-shrink-0 text-muted-foreground hover:text-foreground">
                <GripVertical className="h-4 w-4" />
              </div>
              <Input value={opt.label} onChange={(e) => {
                const n = [...options];
                n[i] = { ...opt, label: e.target.value };
                onChange(n);
              }} className="h-8 text-sm" placeholder="Label" />
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0"
                onClick={() => onChange(options.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            {showUrl && (
              <Input value={opt.url || ''} onChange={(e) => {
                const n = [...options];
                n[i] = { ...opt, url: e.target.value };
                onChange(n);
              }} className="h-7 text-xs ml-5" placeholder="URL (opcional)" />
            )}
            {showImage && (
              <Input value={opt.imageUrl || ''} onChange={(e) => {
                const n = [...options];
                n[i] = { ...opt, imageUrl: e.target.value };
                onChange(n);
              }} className="h-7 text-xs ml-5" placeholder="URL da imagem" />
            )}
          </div>
        ))}
        <Button variant="outline" size="sm" className="w-full h-8 text-xs"
          onClick={() => onChange([...options, { label: `Opção ${options.length + 1}`, value: `opt_${options.length + 1}` }])}>
          <Plus className="h-3 w-3 mr-1" /> Adicionar
        </Button>
      </div>
    </div>
  );
}
