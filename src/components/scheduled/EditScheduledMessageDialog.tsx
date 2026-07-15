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
import { useWhatsAppGroups } from '@/hooks/useWhatsAppGroups';
import { useUpdateScheduledMessage, ScheduledMessage } from '@/hooks/useScheduledMessages';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/hooks/useAuth';
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
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

const getMediaKind = (type: string) => {
  if (type.startsWith('image/')) return 'Imagem';
  if (type.startsWith('audio/')) return 'Áudio';
  if (type.startsWith('video/')) return 'Vídeo';
  return 'Arquivo';
};

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
  const { data: whatsappGroups = [] } = useWhatsAppGroups();
  const updateMutation = useUpdateScheduledMessage();
  const { selectedWorkspaceId } = useWorkspaceContext();
  const { profile } = useAuth();

  // Form state
  const [contentType, setContentType] = useState<'message' | 'flow'>('message');
  const [targetType, setTargetType] = useState<'single' | 'tag' | 'manual' | 'group'>('single');
  const [selectedGroupJids, setSelectedGroupJids] = useState<string[]>([]);
  const [messageContent, setMessageContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState('');
  const [mediaName, setMediaName] = useState('');
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
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
  const [batchSizeMax, setBatchSizeMax] = useState<number>(0);
  const [batchPauseMinutes, setBatchPauseMinutes] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Populate form when message changes
  useEffect(() => {
    if (message && open) {
      const isGroupTarget = message.target_type === 'group' || message.target_type === 'groups';
      setContentType(message.content_type);
      setTargetType(isGroupTarget ? 'group' : (message.target_type as 'single' | 'tag' | 'manual'));
      setMessageContent(message.message_content || '');
      setMediaUrl(message.media_url || '');
      setMediaType(message.media_type || '');
      setMediaName(message.media_url ? (message.media_type ? getMediaKind(message.media_type) : 'Arquivo') : '');
      setFlowId(message.flow_id || '');
      setContactId(message.contact_id || '');
      setTagId(message.tag_id || '');
      setName(message.name || '');
      setRecurrenceType(message.recurrence_type);
      setDelayBetweenContacts((message as any).delay_between_contacts || 10);
      setBatchSizeMax((message as any).batch_size_max || 0);
      setBatchPauseMinutes((message as any).batch_pause_minutes || 0);

      // Load selected contact IDs for manual target type
      if (message.target_type === 'manual' && (message as any).contact_ids) {
        setSelectedContactIds((message as any).contact_ids);
      } else {
        setSelectedContactIds([]);
      }

      // Load selected group JIDs for group target type
      if (isGroupTarget) {
        const jids = message.group_jids;
        setSelectedGroupJids(Array.isArray(jids) ? jids : []);
      } else {
        setSelectedGroupJids([]);
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

  const uploadScheduledMedia = async (file: File) => {
    // chat-media com WRITE escopado por org (migration 20260714130000): path começa com orgId.
    const orgId = profile?.organization_id;
    if (!orgId) {
      toast({
        title: 'Erro no upload',
        description: 'Sessão sem organização. Recarregue a página e tente novamente.',
        variant: 'destructive',
      });
      return;
    }
    setIsUploadingMedia(true);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const safeWorkspace = selectedWorkspaceId || 'global';
      const fileName = `${safeWorkspace}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { data, error } = await supabase.storage
        .from('chat-media')
        .upload(`${orgId}/scheduled/${fileName}`, file, {
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
    if (!message || !scheduledDate || !scheduledTime) return;

    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();

    // Groups only support direct messages (flows operate on a contact/conversation).
    const isGroupTarget = targetType === 'group';
    const effectiveContentType = isGroupTarget ? 'message' : contentType;
    const resolvedGroupTarget = selectedGroupJids.length > 1 ? 'groups' : 'group';

    await updateMutation.mutateAsync({
      id: message.id,
      scheduled_at: scheduledAt,
      recurrence_type: recurrenceType,
      recurrence_end_at: recurrenceEndDate ? new Date(`${recurrenceEndDate}T23:59:59`).toISOString() : null,
      content_type: effectiveContentType,
      message_content: effectiveContentType === 'message' ? messageContent : null,
      media_url: effectiveContentType === 'message' ? mediaUrl || null : null,
      media_type: effectiveContentType === 'message' ? mediaType || null : null,
      flow_id: effectiveContentType === 'flow' ? flowId : null,
      target_type: isGroupTarget ? resolvedGroupTarget : targetType,
      contact_id: targetType === 'single' ? contactId : null,
      tag_id: targetType === 'tag' ? tagId : null,
      contact_ids: targetType === 'manual' ? selectedContactIds : undefined,
      group_jids: isGroupTarget ? selectedGroupJids : undefined,
      name: name || null,
      delay_between_contacts: delayBetweenContacts > 0 ? delayBetweenContacts : null,
      batch_size_max: batchSizeMax > 0 ? batchSizeMax : null,
      batch_pause_minutes: batchSizeMax > 0 && batchPauseMinutes > 0 ? batchPauseMinutes : null,
    });

    onOpenChange(false);
  };

  const toggleContact = (id: string) => {
    setSelectedContactIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const toggleGroup = (jid: string) => {
    setSelectedGroupJids(prev => (prev.includes(jid) ? prev.filter(j => j !== jid) : [...prev, jid]));
  };

  const isValid = () => {
    if (!scheduledDate || !scheduledTime) return false;
    if (targetType === 'group') {
      // Groups only support direct messages
      if (!messageContent.trim() && !mediaUrl) return false;
      if (selectedGroupJids.length === 0) return false;
      return true;
    }
    if (contentType === 'message' && !messageContent.trim() && !mediaUrl) return false;
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
          <DialogTitle>Editar programação</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          <div className="space-y-6 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label>Nome da programação (opcional)</Label>
              <Input
                placeholder="Ex: Promoção Black Friday"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Content Type */}
            {targetType !== 'group' && (
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
            )}

            {/* Message Content */}
            {(contentType === 'message' || targetType === 'group') && (
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea
                  placeholder="Digite a mensagem..."
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
            {contentType === 'flow' && targetType !== 'group' && (
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
                onValueChange={(v) => {
                  const next = v as 'single' | 'tag' | 'manual' | 'group';
                  setTargetType(next);
                  if (next === 'group') setContentType('message');
                }}
                className="grid gap-3 md:grid-cols-2"
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
                <div className={cn(
                  "flex-1 flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                  targetType === 'group' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                )}>
                  <RadioGroupItem value="group" id="edit-group" />
                  <Label htmlFor="edit-group" className="flex items-center gap-2 cursor-pointer flex-1">
                    <Users className="h-4 w-4" />
                    Grupo(s)
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
                    {directContact && !contacts.find((c: any) => c.id === directContact.id) && (
                      <SelectItem key={directContact.id} value={directContact.id}>
                        <span className="font-medium">{directContact.name || directContact.phone}</span>
                      </SelectItem>
                    )}
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

            {/* Group Selection */}
            {targetType === 'group' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Selecione os grupos</Label>
                  {selectedGroupJids.length > 0 && (
                    <Badge variant="secondary">{selectedGroupJids.length} selecionado(s)</Badge>
                  )}
                </div>
                <div className="border rounded-lg max-h-48 overflow-auto">
                  {whatsappGroups.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">
                      Nenhum grupo. Sincronize na aba Grupos.
                    </p>
                  ) : (
                    whatsappGroups.map((group: any) => (
                      <div
                        key={group.id}
                        className="flex items-center gap-3 p-3 hover:bg-accent cursor-pointer border-b last:border-0"
                        onClick={() => toggleGroup(group.group_jid)}
                      >
                        <Checkbox
                          checked={selectedGroupJids.includes(group.group_jid)}
                          onCheckedChange={() => toggleGroup(group.group_jid)}
                        />
                        <p className="text-sm font-medium truncate">{group.name || group.group_jid}</p>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Marque vários grupos para envio em massa. Fluxos não se aplicam a grupos.
                </p>
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
            {(targetType === 'tag' || targetType === 'manual' || targetType === 'group') && (
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

            {/* Envio em lotes */}
            {(targetType === 'tag' || targetType === 'manual') && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Timer className="h-4 w-4" />
                    Tamanho máximo do lote
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={batchSizeMax}
                    onChange={(e) => setBatchSizeMax(Number(e.target.value))}
                    placeholder="0 = enviar tudo de uma vez"
                  />
                  <p className="text-xs text-muted-foreground">
                    O sistema sorteia de 1 até este número a cada lote. Deixe 0 para desativar (envia todos os contatos sem parar em lotes).
                  </p>
                </div>
                {batchSizeMax > 0 && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Pausa entre lotes (minutos)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={batchPauseMinutes}
                      onChange={(e) => setBatchPauseMinutes(Number(e.target.value))}
                      placeholder="Ex: 5"
                    />
                    <p className="text-xs text-muted-foreground">
                      Tempo de espera após cada lote antes de começar o próximo.
                    </p>
                  </div>
                )}
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
