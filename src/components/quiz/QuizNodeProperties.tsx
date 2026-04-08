import { useState, useEffect } from 'react';
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
import { Trash2, Plus, GripVertical, Save } from 'lucide-react';
import { getQuizComponentInfo } from './QuizSidebar';

interface QuizNodePropertiesProps {
  node: Node | null;
  selectedBlockIdx: number | null;
  onClose: () => void;
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
  onSave?: () => void;
  isSaving?: boolean;
}

export function QuizNodeProperties({ node, selectedBlockIdx, onClose, onUpdateNode, onDeleteNode, onSave, isSaving }: QuizNodePropertiesProps) {
  if (!node) return null;

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
            />
          ) : (
            <GroupEditor
              node={node}
              onUpdate={(data) => onUpdateNode(node.id, data)}
              onDelete={() => onDeleteNode(node.id)}
            />
          )}
        </ScrollArea>
        {onSave && (
          <div className="p-4 border-t">
            <Button className="w-full" onClick={onSave} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Salvando...' : 'Salvar Quizz'}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function GroupEditor({ node, onUpdate, onDelete }: { node: Node; onUpdate: (data: Record<string, unknown>) => void; onDelete: () => void }) {
  const label = (node.data.label as string) || '';

  return (
    <div className="p-4 space-y-4">
      <div>
        <Label className="text-xs">Nome do grupo</Label>
        <Input value={label} onChange={(e) => onUpdate({ label: e.target.value })} />
      </div>
      <Separator />
      <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5 mr-2" />
        Excluir grupo
      </Button>
    </div>
  );
}

function BlockEditor({ block, blockIdx, allBlocks, nodeId, onUpdate }: {
  block: any;
  blockIdx: number;
  allBlocks: any[];
  nodeId: string;
  onUpdate: (blocks: any[]) => void;
}) {
  const d = block.data || {};

  const updateBlockData = (newData: Record<string, any>) => {
    const updated = [...allBlocks];
    updated[blockIdx] = { ...block, data: { ...d, ...newData } };
    onUpdate(updated);
  };

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
          <div className="flex items-center justify-between">
            <Label className="text-xs">Autoplay</Label>
            <Switch checked={d.autoplay !== false} onCheckedChange={(v) => updateBlockData({ autoplay: v })} />
          </div>
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
          <div><Label className="text-xs">Variável (salvar como)</Label>
            <Input value={d.variable || ''} onChange={(e) => updateBlockData({ variable: e.target.value })} placeholder="Ex: nome, email..." /></div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Obrigatório</Label>
            <Switch checked={d.required !== false} onCheckedChange={(v) => updateBlockData({ required: v })} />
          </div>
        </>
      )}

      {/* Date */}
      {block.type === 'quiz-input-date' && (
        <>
          <div><Label className="text-xs">Pergunta</Label>
            <Textarea value={d.question || ''} onChange={(e) => updateBlockData({ question: e.target.value })} rows={2} placeholder="Ex: Informe a data da prisão" /></div>
          <div><Label className="text-xs">Variável</Label>
            <Input value={d.variable || ''} onChange={(e) => updateBlockData({ variable: e.target.value })} /></div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Permitir precisão flexível</Label>
            <Switch checked={d.allowFlexible === true} onCheckedChange={(v) => updateBlockData({ allowFlexible: v })} />
          </div>
          {d.allowFlexible && (
            <p className="text-[10px] text-muted-foreground">
              O respondente poderá escolher: Data exata, Mês/Ano, Apenas ano ou Não sei.
            </p>
          )}
          <div className="flex items-center justify-between">
            <Label className="text-xs">Obrigatório</Label>
            <Switch checked={d.required !== false} onCheckedChange={(v) => updateBlockData({ required: v })} />
          </div>
        </>
      )}

      {/* Time */}
      {block.type === 'quiz-input-time' && (
        <>
          <div><Label className="text-xs">Pergunta</Label>
            <Textarea value={d.question || ''} onChange={(e) => updateBlockData({ question: e.target.value })} rows={2} placeholder="Ex: Qual o melhor horário?" /></div>
          <div><Label className="text-xs">Variável</Label>
            <Input value={d.variable || ''} onChange={(e) => updateBlockData({ variable: e.target.value })} /></div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Obrigatório</Label>
            <Switch checked={d.required !== false} onCheckedChange={(v) => updateBlockData({ required: v })} />
          </div>
        </>
      )}

      {/* Rating */}
      {block.type === 'quiz-input-rating' && (
        <>
          <div><Label className="text-xs">Pergunta</Label>
            <Textarea value={d.question || ''} onChange={(e) => updateBlockData({ question: e.target.value })} rows={2} placeholder="Ex: Como avalia nosso atendimento?" /></div>
          <div><Label className="text-xs">Escala máxima</Label>
            <Select value={String(d.maxRating || 5)} onValueChange={(v) => updateBlockData({ maxRating: parseInt(v) })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[3, 5, 7, 10].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Variável</Label>
            <Input value={d.variable || ''} onChange={(e) => updateBlockData({ variable: e.target.value })} /></div>
        </>
      )}

      {/* File */}
      {block.type === 'quiz-input-file' && (
        <>
          <div><Label className="text-xs">Pergunta</Label>
            <Textarea value={d.question || ''} onChange={(e) => updateBlockData({ question: e.target.value })} rows={2} placeholder="Ex: Envie seu documento" /></div>
          <div><Label className="text-xs">Tipos aceitos (ex: .pdf,.jpg)</Label>
            <Input value={d.accept || ''} onChange={(e) => updateBlockData({ accept: e.target.value })} /></div>
          <div><Label className="text-xs">Variável</Label>
            <Input value={d.variable || ''} onChange={(e) => updateBlockData({ variable: e.target.value })} /></div>
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
        <>
          <div><Label className="text-xs">Variável</Label>
            <Input value={d.variable || ''} onChange={(e) => updateBlockData({ variable: e.target.value })} placeholder="Ex: email" /></div>
          <div><Label className="text-xs">Operador</Label>
            <Select value={d.operator || 'equals'} onValueChange={(v) => updateBlockData({ operator: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">Igual a</SelectItem>
                <SelectItem value="not_equals">Diferente de</SelectItem>
                <SelectItem value="contains">Contém</SelectItem>
                <SelectItem value="greater_than">Maior que</SelectItem>
                <SelectItem value="less_than">Menor que</SelectItem>
                <SelectItem value="is_set">Está preenchido</SelectItem>
                <SelectItem value="is_empty">Está vazio</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Valor</Label>
            <Input value={d.value || ''} onChange={(e) => updateBlockData({ value: e.target.value })} /></div>
        </>
      )}

      {/* Redirect */}
      {block.type === 'quiz-logic-redirect' && (
        <>
          <div><Label className="text-xs">URL</Label>
            <Input value={d.url || ''} onChange={(e) => updateBlockData({ url: e.target.value })} placeholder="https://..." /></div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Nova aba</Label>
            <Switch checked={d.newTab !== false} onCheckedChange={(v) => updateBlockData({ newTab: v })} />
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
        <>
          <div><Label className="text-xs">Plataforma</Label>
            <Select value={d.platform || 'facebook'} onValueChange={(v) => updateBlockData({ platform: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="facebook">Facebook Pixel</SelectItem>
                <SelectItem value="google">Google Tag</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Pixel ID</Label>
            <Input value={d.pixelId || ''} onChange={(e) => updateBlockData({ pixelId: e.target.value })} placeholder="ID do pixel" /></div>
          <div><Label className="text-xs">Evento</Label>
            <Input value={d.eventName || 'PageView'} onChange={(e) => updateBlockData({ eventName: e.target.value })} /></div>
        </>
      )}
    </div>
  );
}

function OptionsEditor({ options, onChange, showUrl, showImage }: {
  options: any[];
  onChange: (opts: any[]) => void;
  showUrl?: boolean;
  showImage?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs mb-2 block">Opções</Label>
      <div className="space-y-2">
        {options.map((opt: any, i: number) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-2">
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
              }} className="h-7 text-xs" placeholder="URL (opcional)" />
            )}
            {showImage && (
              <Input value={opt.imageUrl || ''} onChange={(e) => {
                const n = [...options];
                n[i] = { ...opt, imageUrl: e.target.value };
                onChange(n);
              }} className="h-7 text-xs" placeholder="URL da imagem" />
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
