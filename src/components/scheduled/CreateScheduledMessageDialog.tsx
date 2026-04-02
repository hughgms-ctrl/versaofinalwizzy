import { useState, useMemo, useEffect } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { useCreateScheduledMessage } from '@/hooks/useScheduledMessages';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
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

interface CreateScheduledMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultContactId?: string;
}

export function CreateScheduledMessageDialog({ 
  open, 
  onOpenChange,
  defaultContactId 
}: CreateScheduledMessageDialogProps) {
  const { data: conversations = [] } = useConversations();
  const { data: tags = [] } = useTags();
  const { data: flows = [] } = useFlows();
  const createMutation = useCreateScheduledMessage();
  const { selectedWorkspaceId } = useWorkspaceContext();

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

  // Get unique contacts from conversations
  const contacts = useMemo(() => {
    const contactMap = new Map();
    conversations.forEach(conv => {
      if (conv.contact) {
        contactMap.set(conv.contact.id, conv.contact);
      }
    });
    return Array.from(contactMap.values());
  }, [conversations]);

  // Filter contacts by search
  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts;
    const query = contactSearch.toLowerCase();
    return contacts.filter(c => 
      c.name?.toLowerCase().includes(query) || 
      c.phone.includes(query)
    );
  }, [contacts, contactSearch]);

  // Active flows only
  const activeFlows = useMemo(() => {
    return flows.filter(f => f.is_active);
  }, [flows]);

  const handleSubmit = async () => {
    if (!scheduledDate || !scheduledTime) return;
    
    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
    
    await createMutation.mutateAsync({
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
      workspace_id: selectedWorkspaceId || null,
      delay_between_contacts: delayBetweenContacts > 0 ? delayBetweenContacts : null,
    });

    // Reset form
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setContentType('message');
    setTargetType('single');
    setMessageContent('');
    setFlowId('');
    setContactId(defaultContactId || '');
    setTagId('');
    setSelectedContactIds([]);
    setScheduledDate('');
    setScheduledTime('');
    setRecurrenceType('once');
    setRecurrenceEndDate('');
    setName('');
    setContactSearch('');
    setDelayBetweenContacts(10);
  };

  // Always sync contactId with defaultContactId when dialog opens or prop changes
  useEffect(() => {
    if (open && defaultContactId) {
      setContactId(defaultContactId);
      setTargetType('single');
    }
  }, [open, defaultContactId]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  const toggleContact = (id: string) => {
    setSelectedContactIds(prev => 
      prev.includes(id) 
        ? prev.filter(c => c !== id)
        : [...prev, id]
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Novo Agendamento</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          <div className="space-y-6 py-4">
            {/* Name (optional) */}
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
                  <RadioGroupItem value="message" id="message" />
                  <Label htmlFor="message" className="flex items-center gap-2 cursor-pointer flex-1">
                    <MessageSquare className="h-4 w-4" />
                    Mensagem
                  </Label>
                </div>
                <div className={cn(
                  "flex-1 flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                  contentType === 'flow' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                )}>
                  <RadioGroupItem value="flow" id="flow" />
                  <Label htmlFor="flow" className="flex items-center gap-2 cursor-pointer flex-1">
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
                  placeholder="Digite a mensagem que será enviada..."
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
                    {activeFlows.map(flow => (
                      <SelectItem key={flow.id} value={flow.id}>
                        {flow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeFlows.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum fluxo ativo disponível. Ative um fluxo primeiro.
                  </p>
                )}
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
                  <RadioGroupItem value="single" id="single" />
                  <Label htmlFor="single" className="flex items-center gap-2 cursor-pointer flex-1">
                    <User className="h-4 w-4" />
                    Um contato
                  </Label>
                </div>
                <div className={cn(
                  "flex-1 flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                  targetType === 'tag' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                )}>
                  <RadioGroupItem value="tag" id="tag" />
                  <Label htmlFor="tag" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Tag className="h-4 w-4" />
                    Por tag
                  </Label>
                </div>
                <div className={cn(
                  "flex-1 flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                  targetType === 'manual' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                )}>
                  <RadioGroupItem value="manual" id="manual" />
                  <Label htmlFor="manual" className="flex items-center gap-2 cursor-pointer flex-1">
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
                    {defaultContactId && (() => {
                      const currentContact = contacts.find(c => c.id === defaultContactId);
                      return currentContact ? (
                        <SelectItem key={`current-${currentContact.id}`} value={currentContact.id}>
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5 text-primary" />
                            <span className="font-medium">Contato atual</span>
                            <span className="text-muted-foreground">— {currentContact.name || currentContact.phone}</span>
                          </div>
                        </SelectItem>
                      ) : null;
                    })()}
                    {defaultContactId && contacts.length > 1 && (
                      <div className="px-2 py-1.5">
                        <div className="h-px bg-border" />
                      </div>
                    )}
                    {contacts.filter(c => c.id !== defaultContactId).map(contact => (
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
                    {tags.map(tag => (
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
            )}

            {/* Manual Contact Selection */}
            {targetType === 'manual' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Selecione os contatos</Label>
                  {selectedContactIds.length > 0 && (
                    <Badge variant="secondary">
                      {selectedContactIds.length} selecionado(s)
                    </Badge>
                  )}
                </div>
                
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar contato..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="pl-9"
                  />
                  {contactSearch && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setContactSearch('')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Contact List */}
                <div className="border rounded-lg max-h-48 overflow-auto">
                  {filteredContacts.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">
                      Nenhum contato encontrado
                    </p>
                  ) : (
                    filteredContacts.map(contact => (
                      <div 
                        key={contact.id}
                        className="flex items-center gap-3 p-3 hover:bg-accent cursor-pointer border-b last:border-0"
                        onClick={() => toggleContact(contact.id)}
                      >
                        <Checkbox 
                          checked={selectedContactIds.includes(contact.id)}
                          onCheckedChange={() => toggleContact(contact.id)}
                        />
                        <div>
                          <p className="text-sm font-medium">{contact.name || contact.phone}</p>
                          {contact.name && (
                            <p className="text-xs text-muted-foreground">{contact.phone}</p>
                          )}
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
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={format(new Date(), 'yyyy-MM-dd')}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Horário
                </Label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
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
              <Select 
                value={recurrenceType} 
                onValueChange={(v) => setRecurrenceType(v as typeof recurrenceType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Enviar uma vez</SelectItem>
                  <SelectItem value="daily">Repetir diariamente</SelectItem>
                  <SelectItem value="weekly">Repetir semanalmente</SelectItem>
                  <SelectItem value="monthly">Repetir mensalmente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Recurrence End Date */}
            {recurrenceType !== 'once' && (
              <div className="space-y-2">
                <Label>Repetir até (opcional)</Label>
                <Input
                  type="date"
                  value={recurrenceEndDate}
                  onChange={(e) => setRecurrenceEndDate(e.target.value)}
                  min={scheduledDate || format(new Date(), 'yyyy-MM-dd')}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid() || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Agendando...
              </>
            ) : (
              'Agendar'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
