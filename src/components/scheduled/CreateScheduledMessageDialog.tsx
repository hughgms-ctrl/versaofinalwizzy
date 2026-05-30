import { useState, useMemo, useEffect, useRef } from 'react';
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
  Timer,
  Upload,
  Image,
  Mic,
  Square,
  Trash2,
  Phone
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface CreateScheduledMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultContactId?: string;
}

const getMediaKind = (type: string) => {
  if (type.startsWith('image/')) return 'Imagem';
  if (type.startsWith('audio/')) return 'Áudio';
  if (type.startsWith('video/')) return 'Vídeo';
  return 'Arquivo';
};

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
  const [targetType, setTargetType] = useState<'single' | 'tag' | 'manual' | 'phone'>('single');
  const [messageContent, setMessageContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState('');
  const [mediaName, setMediaName] = useState('');
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [flowId, setFlowId] = useState<string>('');
  const [contactId, setContactId] = useState<string>('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualName, setManualName] = useState('');
  const [tagId, setTagId] = useState<string>('');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [recurrenceType, setRecurrenceType] = useState<'once' | 'daily' | 'weekly' | 'monthly'>('once');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [name, setName] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [delayBetweenContacts, setDelayBetweenContacts] = useState<number>(10);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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

  const uploadScheduledMedia = async (file: File) => {
    setIsUploadingMedia(true);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const safeWorkspace = selectedWorkspaceId || 'global';
      const fileName = `${safeWorkspace}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { data, error } = await supabase.storage
        .from('chat-media')
        .upload(`scheduled/${fileName}`, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('chat-media')
        .getPublicUrl(data.path);

      setMediaUrl(urlData.publicUrl);
      setMediaType(file.type || 'application/octet-stream');
      setMediaName(file.name);
    } catch (error: any) {
      toast({
        title: 'Erro no upload',
        description: error.message || 'Não foi possível anexar a mídia.',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(event.clipboardData.files || []).find(item => item.type.startsWith('image/'));
    if (file) {
      event.preventDefault();
      void uploadScheduledMedia(file);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast({ title: 'Gravação indisponível', description: 'Seu navegador não permitiu gravar áudio.', variant: 'destructive' });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type });
        const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
        const file = new File([blob], `audio-programado.${ext}`, { type });
        stream.getTracks().forEach(track => track.stop());
        void uploadScheduledMedia(file);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (error: any) {
      toast({
        title: 'Microfone bloqueado',
        description: error.message || 'Permita acesso ao microfone para gravar áudio.',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const clearMedia = () => {
    setMediaUrl('');
    setMediaType('');
    setMediaName('');
  };

  const handleSubmit = async () => {
    if (!scheduledDate || !scheduledTime) return;
    
    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
    
    await createMutation.mutateAsync({
      scheduled_at: scheduledAt,
      recurrence_type: recurrenceType,
      recurrence_end_at: recurrenceEndDate ? new Date(`${recurrenceEndDate}T23:59:59`).toISOString() : null,
      content_type: contentType,
      message_content: contentType === 'message' ? messageContent : null,
      media_url: contentType === 'message' ? mediaUrl || null : null,
      media_type: contentType === 'message' ? mediaType || null : null,
      flow_id: contentType === 'flow' ? flowId : null,
      target_type: targetType,
      contact_id: targetType === 'single' ? contactId : null,
      tag_id: targetType === 'tag' ? tagId : null,
      contact_ids: targetType === 'manual' ? selectedContactIds : undefined,
      manual_phone: targetType === 'phone' ? manualPhone : null,
      manual_name: targetType === 'phone' ? manualName : null,
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
    clearMedia();
    setFlowId('');
    setContactId(defaultContactId || '');
    setManualPhone('');
    setManualName('');
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
    if (contentType === 'message' && !messageContent.trim() && !mediaUrl) return false;
    if (contentType === 'flow' && !flowId) return false;
    if (targetType === 'single' && !contactId) return false;
    if (targetType === 'tag' && !tagId) return false;
    if (targetType === 'manual' && selectedContactIds.length === 0) return false;
    if (targetType === 'phone' && manualPhone.replace(/\D/g, '').length < 10) return false;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Nova programação</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          <div className="space-y-6 py-4">
            {/* Name (optional) */}
            <div className="space-y-2">
              <Label>Nome da programação (opcional)</Label>
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
                  onPaste={handlePaste}
                  rows={4}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,audio/*,video/*,application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadScheduledMedia(file);
                      event.currentTarget.value = '';
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()} disabled={isUploadingMedia}>
                    {isUploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Anexar mídia
                  </Button>
                  <Button type="button" variant={isRecording ? 'destructive' : 'outline'} size="sm" className="gap-2" onClick={isRecording ? stopRecording : startRecording} disabled={isUploadingMedia}>
                    {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {isRecording ? 'Parar gravação' : 'Gravar áudio'}
                  </Button>
                  <span className="text-xs text-muted-foreground">Cole prints com Ctrl+V no campo de mensagem.</span>
                </div>
                {mediaUrl && (
                  <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {mediaType.startsWith('image/') ? <Image className="h-4 w-4 text-primary" /> : <Upload className="h-4 w-4 text-primary" />}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{mediaName || getMediaKind(mediaType)}</p>
                        <p className="text-xs text-muted-foreground">{getMediaKind(mediaType)} anexado</p>
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={clearMedia}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
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
                onValueChange={(v) => setTargetType(v as 'single' | 'tag' | 'manual' | 'phone')}
                className="grid gap-3 md:grid-cols-4"
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
                <div className={cn(
                  "flex-1 flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                  targetType === 'phone' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                )}>
                  <RadioGroupItem value="phone" id="phone" />
                  <Label htmlFor="phone" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Phone className="h-4 w-4" />
                    Novo número
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

            {targetType === 'phone' && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Número do WhatsApp</Label>
                  <Input
                    placeholder="(11) 99999-9999"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value.replace(/[^\d+\s()\-]/g, ''))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome (opcional)</Label>
                  <Input
                    placeholder="Ex: Cliente novo"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                  />
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
