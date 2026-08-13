import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, X } from 'lucide-react';
import { InstagramDmPreview } from '../InstagramDmPreview';
import type { InstagramFlowNode } from '@/hooks/useInstagramFlows';

interface InstagramNodePropertiesProps {
  node: InstagramFlowNode;
  accountUsername?: string | null;
  accountAvatarUrl?: string | null;
  onChange: (data: Record<string, any>) => void;
  onClose: () => void;
  onDelete: () => void;
}

const MAX_QUICK_REPLIES = 3;

export function InstagramNodeProperties({
  node,
  accountUsername,
  accountAvatarUrl,
  onChange,
  onClose,
  onDelete,
}: InstagramNodePropertiesProps) {
  const data = node.data || {};
  const set = (patch: Record<string, any>) => onChange({ ...data, ...patch });
  const quickReplies: Array<{ label: string }> = data.quickReplies || [];

  return (
    <div className="flex h-full w-80 flex-col border-l bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">Configurar bloco</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {node.type === 'start' && (
          <p className="text-sm text-muted-foreground">
            O fluxo começa aqui. O gatilho é configurado no topo da página.
          </p>
        )}

        {node.type === 'ig-message' && (
          <>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                value={data.text || ''}
                onChange={(e) => set({ text: e.target.value })}
                placeholder="Use {{username}} para citar a pessoa"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Variáveis disponíveis: <code>{'{{username}}'}</code>,{' '}
                <code>{'{{texto_recebido}}'}</code>, <code>{'{{ultima_resposta}}'}</code>
              </p>
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label>Botões de resposta rápida</Label>
              <p className="text-xs text-muted-foreground">
                Ao tocar, a pessoa responde de verdade — e isso abre a janela de 24 horas.
              </p>
              {quickReplies.map((qr, index) => (
                <div key={index} className="flex gap-1.5">
                  <Input
                    value={qr.label}
                    maxLength={20}
                    onChange={(e) => {
                      const next = [...quickReplies];
                      next[index] = { label: e.target.value };
                      set({ quickReplies: next });
                    }}
                    placeholder="Ex: Quero saber mais"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => set({ quickReplies: quickReplies.filter((_, i) => i !== index) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {quickReplies.length < MAX_QUICK_REPLIES && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => set({ quickReplies: [...quickReplies, { label: '' }] })}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Adicionar botão
                </Button>
              )}
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label>Botão de link</Label>
              {quickReplies.length > 0 ? (
                <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                  O Instagram não permite link junto com botões de resposta. Para
                  enviar um link, use um bloco de mensagem seguinte.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <Input
                    value={data.buttonLabel || ''}
                    onChange={(e) => set({ buttonLabel: e.target.value })}
                    placeholder="Texto do botão"
                  />
                  <Input
                    value={data.buttonUrl || ''}
                    onChange={(e) => set({ buttonUrl: e.target.value })}
                    placeholder="https://..."
                  />
                  <p className="text-xs text-muted-foreground">
                    O clique é registrado — dá para ramificar depois com “Se / então”.
                  </p>
                </div>
              )}
            </div>

            <div className="border-t pt-3">
              <Label className="mb-2 block">Prévia</Label>
              <InstagramDmPreview
                text={data.text || ''}
                accountUsername={accountUsername}
                accountAvatarUrl={accountAvatarUrl}
                button={!quickReplies.length && data.buttonUrl
                  ? { label: data.buttonLabel || 'Ver mais', url: data.buttonUrl }
                  : null}
                quickReply={quickReplies[0]?.label ? { label: quickReplies[0].label } : null}
              />
            </div>
          </>
        )}

        {node.type === 'ig-delay' && (
          <div className="space-y-2">
            <Label>Esperar</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                className="w-24"
                value={data.waitValue ?? 1}
                onChange={(e) => set({ waitValue: Number(e.target.value) })}
              />
              <Select
                value={data.waitUnit || 'minutes'}
                onValueChange={(v) => set({ waitUnit: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="seconds">Segundos</SelectItem>
                  <SelectItem value="minutes">Minutos</SelectItem>
                  <SelectItem value="hours">Horas</SelectItem>
                  <SelectItem value="days">Dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Lembre que só é possível enviar mensagens nas 24 horas seguintes a
              uma resposta da pessoa.
            </p>
          </div>
        )}

        {node.type === 'ig-user-input' && (
          <div className="space-y-2">
            <Label>Desistir de esperar depois de (minutos)</Label>
            <Input
              type="number"
              min={0}
              value={data.timeoutMinutes ?? 0}
              onChange={(e) => set({ timeoutMinutes: Number(e.target.value) })}
              placeholder="0 = esperar para sempre"
            />
            <p className="text-xs text-muted-foreground">
              Com 0, a saída “sem resposta” nunca dispara e o fluxo fica parado
              até a pessoa escrever.
            </p>
          </div>
        )}

        {node.type === 'ig-condition' && (
          <>
            <div className="space-y-2">
              <Label>Verificar</Label>
              <Select
                value={data.conditionType || 'variable'}
                onValueChange={(v) => set({ conditionType: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="variable">O que a pessoa respondeu</SelectItem>
                  <SelectItem value="has_tag">Se tem uma etiqueta</SelectItem>
                  <SelectItem value="clicked_link">Se clicou no último link</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(data.conditionType || 'variable') === 'variable' && (
              <>
                <div className="space-y-2">
                  <Label>Variável</Label>
                  <Input
                    value={data.variable || 'ultima_resposta'}
                    onChange={(e) => set({ variable: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Comparação</Label>
                  <Select
                    value={data.operator || 'contains'}
                    onValueChange={(v) => set({ operator: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contém</SelectItem>
                      <SelectItem value="equals">É igual a</SelectItem>
                      <SelectItem value="not_contains">Não contém</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valor</Label>
                  <Input
                    value={data.value || ''}
                    onChange={(e) => set({ value: e.target.value })}
                    placeholder="Ex: sim"
                  />
                </div>
              </>
            )}

            {data.conditionType === 'has_tag' && (
              <div className="space-y-2">
                <Label>Etiqueta</Label>
                <Input
                  value={data.tag || ''}
                  onChange={(e) => set({ tag: e.target.value })}
                  placeholder="Nome da etiqueta"
                />
              </div>
            )}
          </>
        )}

        {node.type === 'ig-action-tag' && (
          <div className="space-y-2">
            <Label>Etiqueta</Label>
            <Input
              value={data.tag || ''}
              onChange={(e) => set({ tag: e.target.value })}
              placeholder="Ex: interessado"
            />
            <p className="text-xs text-muted-foreground">
              Se a etiqueta não existir, ela é criada.
            </p>
          </div>
        )}

        {node.type === 'ig-action-transfer' && (
          <p className="text-sm text-muted-foreground">
            A conversa passa para atendimento humano e sai do modo automático.
          </p>
        )}

        {node.type === 'ig-action-webhook' && (
          <>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input
                value={data.url || ''}
                onChange={(e) => set({ url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Método</Label>
              <Select value={data.method || 'POST'} onValueChange={(v) => set({ method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Se a chamada falhar, o fluxo continua mesmo assim — para não
              interromper a conversa por causa de um sistema fora do ar.
            </p>
          </>
        )}
      </div>

      {node.type !== 'start' && (
        <div className="border-t p-3">
          <Button variant="outline" size="sm" className="w-full text-destructive" onClick={onDelete}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Remover bloco
          </Button>
        </div>
      )}
    </div>
  );
}
