import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useConversations } from '@/hooks/useConversations';
import { useTags } from '@/hooks/useTags';
import { useFlows } from '@/hooks/useFlows';
import { useUpdateScheduledMessage, ScheduledMessage } from '@/hooks/useScheduledMessages';
import { 
  Calendar, 
  Clock, 
  MessageSquare, 
  Workflow, 
  User, 
  Tag, 
  Users,
  Repeat,
  Search,
  X,
  Loader2,
  Timer
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditScheduledMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: ScheduledMessage | null;
}

export function EditScheduledMessageDialog({ 
  open, 
  onOpenChange,
  message
}: EditScheduledMessageDialogProps) {
  const { data: conversations = [] } = useConversations();
  const { data: tags = [] } = useTags();
  const { data: flows = [] } = useFlows();
  const updateMutation = useUpdateScheduledMessage();

  // Form state
  const [contentType, setContentType] = useState<'message' | 'flow'>('message');
  const [targetType, setTargetType] = useState<'single' | 'tag' | 'manual'>('single');
  const [messageContent, setMessageContent] = useState('');
  const [flowId, setFlowId] = useState<string>('');
  const [contactId, setContactId] = useState<string>('');
  const [tagId, setTagId] = useState<string>('');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [recurrenceType, setRecurrenceType] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('once');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [name, setName] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [delayBetweenContacts, setDelayBetweenContacts] = useState<number>(10);

  // Populate form when message changes
  useEffect(() => {
    if (message && open) {
      setContentType(message.content_type);
      setTargetType(message.target_type);
      setMessageContent(message.message_content || '');
      setFlowId(message.flow_id || '');
      setContactId(message.contact_id || '');
      setTagId(message.tag_id || '');
      setName(message.name || '');
      setRecurrenceType(message.recurrence_type);
      setDelayBetweenContacts((message as any).delay_between_contacts || 10);

      // Load selected contact IDs for manual target type
      if (message.target_type === 'manual' && (message as any).contact_ids) {
        setSelectedContactIds((message as any).contact_ids);
      }

      const dt = new Date(message.next_execution_at || message.scheduled_at);
      setScheduledDate(format(dt, 'yyyy-MM-dd'));
      setScheduledTime(format(dt, 'HH:mm'));

      if (message.recurrence_end_at) {
        setRecurrenceEndDate(format(new Date(message.recurrence_end_at), 'yyyy-MM-dd'));
      } else {
        setRecurrenceEndDate('');
      }
    }
  }, [message, open]);

  const contacts = useMemo(() => {
    const contactMap = new Map();
    conversations.forEach(conv => {
      if (conv.contact) {
        contactMap.set(conv.contact.id, conv.contact);
      }
    });
    return Array.from(contactMap.values());
  }, [conversations]);

  // Fetch the selected contact directly if not in conversations list
  const [directContact, setDirectContact] = useState<any>(null);
  useEffect(() => {
    if (contactId && contacts.length > 0 && !contacts.find((c: any) => c.id === contactId)) {
      supabase.from('contacts').select('id, name, phone').eq('id', contactId).single().then(({ data }) => {
        if (data) setDirectContact(data);
      });
    } else {
      setDirectContact(null);
    }
  }, [contactId, contacts]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts;
    const query = contactSearch.toLowerCase();
    return contacts.filter((c: any) => 
      c.name?.toLowerCase().includes(query) || 
      c.phone.includes(query)
    );
  }, [contacts, contactSearch]);

  const activeFlows = useMemo(() => flows.filter((f: any) => f.is_active), [flows]);

  const handleSubmit = async () => {
    if (!message || !scheduledDate || !scheduledTime) return;
    
    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
    
    await updateMutation.mutateAsync({
      id: message.id,
      scheduled_at: scheduledAt,
      recurrence_type: recurrenceType,
      recurrence_end_at: recurrenceEndDate ? new Date(`${recurrenceEndDate}T23:59:59`).toISOString() : null,
      content_type: contentType,
      message_content: contentType === 'message' ? messageContent : null,
      flow_id: contentType === 'flow' ? flowId : null,
      target_type: targetType,
      contact_id: targetType === 'single' ? contactId : null,
      tag_id: targetType === 'tag' ? tagId : null,
      contact_ids: targetType === 'manual' ? selectedContactIds : undefined,
      name: name || null,
      delay_between_contacts: delayBetweenContacts > 0 ? delayBetweenContacts : null,
    });

    onOpenChange(false);
  };

  const toggleContact = (id: string) => {
    setSelectedContactIds(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const isValid = () => {
    if (!scheduledDate || !scheduledTime) return false;
    if (contentType === 'message' && !messageContent.trim()) return false;
    if (contentType === 'flow' && !flowId) return false;
    if (targetType === 'single' && !contactId) return false;
    if (targetType === 'tag' && !tagId) return false;
    if (targetType === 'manual' && selectedContactIds.length === 0) return false;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar Agendamento</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          <div className="space-y-6 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label>Nome do agendamento (opcional)</Label>
              <Input
                placeholder="Ex: Promoção Black Friday"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Content Type */}
            <div className="space-y-3">
              <Label>O que deseja enviar?</Label>
              <RadioGroup 
                value={contentType} 
                onValueChange={(v) => setContentType(v as 'message' | 'flow')}
                className="flex gap-4"
              >
                <div className={cn(
                  "flex-1 flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                  contentType === 'message' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                )}>
                  <RadioGroupItem value="message" id="edit-message" />
                  <Label htmlFor="edit-message" className="flex items-center gap-2 cursor-pointer flex-1">
                    <MessageSquare className="h-4 w-4" />
                    Mensagem
                  </Label>
                </div>
                <div className={cn(
                  "flex-1 flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                  contentType === 'flow' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                )}>
                  <RadioGroupItem value="flow" id="edit-flow" />
                  <Label htmlFor="edit-flow" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Workflow className="h-4 w-4" />
                    Fluxo
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Message Content */}
            {contentType === 'message' && (
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea
                  placeholder="Digite a mensagem..."
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  rows={4}
                />
              </div>
            )}

            {/* Flow Selection */}
            {contentType === 'flow' && (
              <div className="space-y-2">
                <Label>Selecione o fluxo</Label>
                <Select value={flowId} onValueChange={setFlowId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um fluxo ativo" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeFlows.map((flow: any) => (
                      <SelectItem key={flow.id} value={flow.id}>
                        {flow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Target Type */}
            <div className="space-y-3">
              <Label>Para quem enviar?</Label>
              <RadioGroup 
                value={targetType} 
                onValueChange={(v) => setTargetType(v as 'single' | 'tag' | 'manual')}
                className="flex gap-4"
              >
                <div className={cn(
                  "flex-1 flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                  targetType === 'single' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                )}>
                  <RadioGroupItem value="single" id="edit-single" />
                  <Label htmlFor="edit-single" className="flex items-center gap-2 cursor-pointer flex-1">
                    <User className="h-4 w-4" />
                    Um contato
                  </Label>
                </div>
                <div className={cn(
                  "flex-1 flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                  targetType === 'tag' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                )}>
                  <RadioGroupItem value="tag" id="edit-tag" />
                  <Label htmlFor="edit-tag" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Tag className="h-4 w-4" />
                    Por tag
                  </Label>
                </div>
                <div className={cn(
                  "flex-1 flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                  targetType === 'manual' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                )}>
                  <RadioGroupItem value="manual" id="edit-manual" />
                  <Label htmlFor="edit-manual" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Users className="h-4 w-4" />
                    Selecionar
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Single Contact Selection */}
            {targetType === 'single' && (
              <div className="space-y-2">
                <Label>Selecione o contato</Label>
                <Select value={contactId} onValueChange={setContactId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um contato" />
                  </SelectTrigger>
                  <SelectContent>
                    {contacts.map((contact: any) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.name || contact.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Tag Selection */}
            {targetType === 'tag' && (
              <div className="space-y-2">
                <Label>Selecione a tag</Label>
                <Select value={tagId} onValueChange={setTagId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha uma tag" />
                  </SelectTrigger>
                  <SelectContent>
                    {tags.map((tag: any) => (
                      <SelectItem key={tag.id} value={tag.id}>
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                          {tag.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Manual Contact Selection */}
            {targetType === 'manual' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Selecione os contatos</Label>
                  {selectedContactIds.length > 0 && (
                    <Badge variant="secondary">{selectedContactIds.length} selecionado(s)</Badge>
                  )}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar contato..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="pl-9"
                  />
                  {contactSearch && (
                    <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setContactSearch('')}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="border rounded-lg max-h-48 overflow-auto">
                  {filteredContacts.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">Nenhum contato encontrado</p>
                  ) : (
                    filteredContacts.map((contact: any) => (
                      <div key={contact.id} className="flex items-center gap-3 p-3 hover:bg-accent cursor-pointer border-b last:border-0" onClick={() => toggleContact(contact.id)}>
                        <Checkbox checked={selectedContactIds.includes(contact.id)} onCheckedChange={() => toggleContact(contact.id)} />
                        <div>
                          <p className="text-sm font-medium">{contact.name || contact.phone}</p>
                          {contact.name && <p className="text-xs text-muted-foreground">{contact.phone}</p>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Schedule */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Data
                </Label>
                <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Horário
                </Label>
                <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
              </div>
            </div>

            {/* Delay between contacts */}
            {(targetType === 'tag' || targetType === 'manual') && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  Intervalo entre contatos (segundos)
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={300}
                  value={delayBetweenContacts}
                  onChange={(e) => setDelayBetweenContacts(Number(e.target.value))}
                  placeholder="10"
                />
                <p className="text-xs text-muted-foreground">
                  Tempo de espera entre o envio para cada contato. Recomendado: 10-30 segundos para evitar bloqueios.
                </p>
              </div>
            )}

            {/* Recurrence */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Repeat className="h-4 w-4" />
                Recorrência
              </Label>
              <Select value={recurrenceType} onValueChange={(v) => setRecurrenceType(v as typeof recurrenceType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Enviar uma vez</SelectItem>
                  <SelectItem value="daily">Repetir diariamente</SelectItem>
                  <SelectItem value="weekly">Repetir semanalmente</SelectItem>
                  <SelectItem value="monthly">Repetir mensalmente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {recurrenceType !== 'once' && (
              <div className="space-y-2">
                <Label>Repetir até (opcional)</Label>
                <Input
                  type="date"
                  value={recurrenceEndDate}
                  onChange={(e) => setRecurrenceEndDate(e.target.value)}
                  min={scheduledDate}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!isValid() || updateMutation.isPending}>
            {updateMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
            ) : 'Salvar alterações'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
