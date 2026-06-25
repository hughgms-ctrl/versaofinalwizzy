import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { DbConversation } from '@/hooks/useConversations';
import { ContactAvatar } from './ContactAvatar';
import { useTags, useContactTags, useAddTagToContact, useRemoveTagFromContact, useCreateTag, Tag } from '@/hooks/useTags';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  X,
  Phone,
  Mail,
  Calendar,
  Plus,
  Bot,
  Check,
  Loader2,
  Save,
  Pencil,
  Clock,
  Expand,
  ArrowLeft,
  MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { ContactNotesSection } from './ContactNotesSection';
import { ContactLogsSection } from './ContactLogsSection';
import { ContactFilesSection } from './ContactFilesSection';
import { ContactContractsSection } from './ContactContractsSection';
import { CreateScheduledMessageDialog } from '@/components/scheduled/CreateScheduledMessageDialog';
import { ConversationAttributesPanel } from './ConversationAttributesPanel';
import { ContactProfileTabs } from './ContactProfileTabs';
import { getDerivedStatusInfo } from '@/lib/conversationStatus';

interface ContactProfilePanelProps {
  conversation: DbConversation;
  onClose: () => void;
  embedded?: boolean;
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280',
];

function normalizeProfilePhone(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function ContactProfilePanel({ conversation, onClose, embedded = false }: ContactProfilePanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const contact = conversation.contact;
  const conversationMetadata = (conversation.metadata as Record<string, any> | null) || {};
  const contactId = contact?.id || conversation.contact_id || null;

  const { data: fetchedContact } = useQuery({
    queryKey: ['contact-profile-fallback', contactId],
    queryFn: async () => {
      if (!contactId) return null;
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, phone, avatar_url, email, workspace_id, created_at, metadata')
        .eq('id', contactId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!contactId && (!contact?.phone || !contact?.created_at),
  });

  const profileContact = fetchedContact || contact;

  const { data: notificationRecipient } = useQuery({
    queryKey: ['conversation-notification-recipient', conversation.id],
    queryFn: async () => {
      const { data: messageRows, error: messageError } = await supabase
        .from('messages')
        .select('metadata')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (messageError) throw messageError;

      const recipientUserId = (messageRows || [])
        .map((row: any) => row.metadata?.recipient_user_id)
        .find(Boolean);

      if (!recipientUserId) return null;

      const { data: recipientProfile, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, full_name, phone, avatar_url')
        .eq('user_id', recipientUserId)
        .maybeSingle();

      if (profileError) throw profileError;
      return recipientProfile;
    },
    enabled: !!conversation.id && (!profileContact?.phone || !profileContact?.name),
  });

  const contactMetadata = (profileContact?.metadata as Record<string, unknown> | null) || {};
  const notificationPhone = normalizeProfilePhone(notificationRecipient?.phone);
  const displayPhone = (
    profileContact?.phone ||
    notificationPhone ||
    conversationMetadata.recipient_phone ||
    conversationMetadata.contact_phone ||
    conversationMetadata.normalizedPhone ||
    conversationMetadata.phone ||
    ''
  );
  const displayName = (
    profileContact?.name ||
    notificationRecipient?.full_name ||
    conversationMetadata.recipient_name ||
    conversationMetadata.contact_name ||
    null
  );

  const { data: tags } = useTags();
  const { data: contactTags, isLoading: loadingContactTags } = useContactTags(contactId);
  const addTagToContact = useAddTagToContact();
  const removeTagFromContact = useRemoveTagFromContact();
  const createTag = useCreateTag();

  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(displayName || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editedNote, setEditedNote] = useState((contactMetadata as { note?: string } | null)?.note || '');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(((contactMetadata as any)?.description as string) || '');
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setEditedName(displayName || '');
    setEditedNote((contactMetadata as { note?: string } | null)?.note || '');
    setEditedDescription(((contactMetadata as any)?.description as string) || '');
  }, [contactId, displayName, contactMetadata?.note, (contactMetadata as any)?.description]);

  // Get conversation stats
  const { data: conversationStats } = useQuery({
    queryKey: ['conversation-stats', conversation.id],
    queryFn: async () => {
      const { data: messages, error } = await supabase
        .from('messages')
        .select('direction, is_from_bot, created_at')
        .eq('conversation_id', conversation.id);

      if (error) throw error;

      const inbound = messages?.filter(m => m.direction === 'inbound').length || 0;
      const outbound = messages?.filter(m => m.direction === 'outbound').length || 0;
      const aiMessages = messages?.filter(m => m.is_from_bot).length || 0;

      return {
        totalMessages: messages?.length || 0,
        inbound,
        outbound,
        aiMessages,
      };
    },
  });

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13 && cleaned.startsWith('55')) {
      const ddd = cleaned.slice(2, 4);
      const firstPart = cleaned.slice(4, 9);
      const secondPart = cleaned.slice(9);
      return `+55 (${ddd}) ${firstPart}-${secondPart}`;
    }
    return phone;
  };

  const getInitials = () => {
    if (displayName) {
      return displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    }
    return displayPhone?.slice(-2) || '??';
  };

  const handleAddTag = async (tag: Tag) => {
    if (!contactId) return;
    await addTagToContact.mutateAsync({
      contactId,
      tagId: tag.id,
      addedByType: 'manual',
    });
    setIsAddingTag(false);
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!contactId) return;
    await removeTagFromContact.mutateAsync({
      contactId,
      tagId,
    });
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim() || !contactId) return;

    try {
      const newTag = await createTag.mutateAsync({
        name: newTagName.trim(),
        color: newTagColor,
      });

      // Add the new tag to the contact
      if (newTag) {
        await addTagToContact.mutateAsync({
          contactId,
          tagId: newTag.id,
          addedByType: 'manual',
        });
      }

      setNewTagName('');
      setNewTagColor('#6366f1');
      setIsCreatingTag(false);
      setIsAddingTag(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleSaveName = async () => {
    if (!contactId || !editedName.trim()) return;

    const nextName = editedName.trim();
    setIsSavingName(true);
    try {
      const { data: updatedContact, error } = await supabase
        .from('contacts')
        .update({ name: nextName })
        .eq('id', contactId)
        .select('id, name, phone, avatar_url, email, workspace_id, created_at, metadata')
        .maybeSingle();

      if (error) throw error;

      queryClient.setQueryData(['contact-profile-fallback', contactId], updatedContact || {
        ...profileContact,
        id: contactId,
        name: nextName,
      });
      queryClient.setQueriesData<DbConversation[]>(
        { queryKey: ['conversations'] },
        (rows) => Array.isArray(rows)
          ? rows.map((row) => row.contact_id === contactId
            ? { ...row, contact: row.contact ? { ...row.contact, name: nextName } : row.contact }
            : row)
          : rows
      );
      queryClient.invalidateQueries({ queryKey: ['contact-profile-fallback', contactId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast({
        title: 'Nome atualizado',
        description: 'O nome do contato foi atualizado.',
      });
      setIsEditingName(false);
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar',
        description: error.message || 'Não foi possível atualizar o nome.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSaveNote = async () => {
    if (!contactId) return;
    setIsSavingNote(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ metadata: { ...contactMetadata, note: editedNote.trim() || null } })
        .eq('id', contactId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-contact-note-counts'] });
      toast({ title: 'Nota atualizada' });
      setIsEditingNote(false);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleSaveDescription = async () => {
    if (!contactId) return;
    setIsSavingDescription(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ metadata: { ...contactMetadata, description: editedDescription.trim() || null } })
        .eq('id', contactId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-contact-note-counts'] });
      toast({ title: 'Descrição atualizada' });
      setIsEditingDescription(false);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsSavingDescription(false);
    }
  };

  const availableTags = tags?.filter(
    tag => !contactTags?.some(ct => ct.tag_id === tag.id)
  ) || [];

  const addedByTypeLabels = {
    manual: 'Manual',
    flow: 'Fluxo',
    ai: 'IA',
  };

  const [fullscreenTab, setFullscreenTab] = useState<'info' | 'notes' | 'files' | 'contracts' | 'timeline' | 'scheduled' | 'favorites'>('info');

  // Fetch scheduled messages for this contact
  const { data: contactScheduledMessages } = useQuery({
    queryKey: ['contact-scheduled-messages', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('scheduled_messages')
        .select('*')
        .eq('contact_id', contactId)
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!contactId && isFullscreen,
  });

  // Fetch favorited/starred messages for this conversation (stored in metadata)
  const { data: favoritedMessages } = useQuery({
    queryKey: ['favorited-messages', conversation.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .not('metadata->starred', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: isFullscreen,
  });

  // Fullscreen modal with tabs (Notion-style)
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center" onClick={() => setIsFullscreen(false)}>
        <div className="bg-card rounded-xl shadow-2xl border border-border w-full max-w-4xl mx-4 h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="p-5 border-b border-border flex items-center gap-4">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setIsFullscreen(false)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <ContactAvatar
              src={profileContact?.avatar_url}
              name={displayName}
              phone={displayPhone}
              contactId={contactId}
              size={48}
              className="shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h2 data-sensitive className="font-semibold text-foreground text-lg truncate">{displayName || 'Sem nome'}</h2>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span data-sensitive>{displayPhone ? formatPhone(displayPhone) : ''}</span>
                {profileContact?.email && <span data-sensitive>• {profileContact.email}</span>}
              </div>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {getDerivedStatusInfo(conversation).label}
            </Badge>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => { setIsFullscreen(false); onClose(); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-border px-4 flex gap-1 overflow-x-auto">
            {([
              { key: 'info' as const, label: 'Dados' },
              { key: 'timeline' as const, label: 'Timeline' },
              { key: 'notes' as const, label: 'Notas' },
              { key: 'files' as const, label: 'Arquivos' },
              { key: 'contracts' as const, label: 'Contratos' },
              { key: 'scheduled' as const, label: 'Agendamentos' },
              { key: 'favorites' as const, label: 'Favoritas' },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFullscreenTab(tab.key)}
                className={cn(
                  "shrink-0 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                  fullscreenTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {fullscreenTab === 'info' && (
              <div className="space-y-5">
                {/* Observação */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Observação</Label>
                  <div className="flex items-start gap-2">
                    {isEditingNote ? (
                      <>
                        <Input value={editedNote} onChange={(e) => setEditedNote(e.target.value)} placeholder="Ex: Cliente VIP, ligar às 14h..." className="text-sm flex-1" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNote(); else if (e.key === 'Escape') { setIsEditingNote(false); setEditedNote((contactMetadata as { note?: string } | null)?.note || ''); } }} />
                        <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSaveNote} disabled={isSavingNote}>
                          {isSavingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                      </>
                    ) : (
                      <button onClick={() => setIsEditingNote(true)} className="w-full text-left p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors group flex items-center gap-2">
                        {editedNote ? <span className="text-sm text-amber-600 dark:text-amber-400 flex-1">{editedNote}</span> : <span className="text-sm text-muted-foreground flex-1">Adicionar observação...</span>}
                        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Descrição */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Descrição</Label>
                  <div className="flex items-start gap-2">
                    {isEditingDescription ? (
                      <>
                        <Textarea value={editedDescription} onChange={(e) => setEditedDescription(e.target.value)} placeholder="Adicionar descrição..." className="text-sm flex-1 min-h-[80px]" autoFocus />
                        <div className="flex flex-col gap-1">
                          <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSaveDescription} disabled={isSavingDescription}>
                            {isSavingDescription ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => { setIsEditingDescription(false); setEditedDescription(((contactMetadata as any)?.description as string) || ''); }}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <button onClick={() => setIsEditingDescription(true)} className="w-full text-left p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors group flex items-start gap-2 min-h-[44px]">
                        {editedDescription ? <span className="text-sm text-foreground flex-1 whitespace-pre-wrap">{editedDescription}</span> : <span className="text-sm text-muted-foreground flex-1">Adicionar descrição...</span>}
                        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                      </button>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Attributes */}
                <ConversationAttributesPanel conversation={conversation} compact />

                <Separator />

                {/* Tags */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Tags</Label>
                    <Popover open={isAddingTag} onOpenChange={(open) => { setIsAddingTag(open); if (!open) { setIsCreatingTag(false); setNewTagName(''); } }}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 px-2"><Plus className="h-3 w-3 mr-1" /> Adicionar</Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-0" align="end">
                        <div className="p-3 space-y-3">
                          {isCreatingTag ? (
                            <>
                              <p className="text-xs font-medium text-foreground">Nova Tag</p>
                              <Input placeholder="Nome da tag" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} autoFocus />
                              <div className="flex flex-wrap gap-1.5">
                                {PRESET_COLORS.map((color) => (
                                  <button key={color} type="button" className="h-6 w-6 rounded-full flex items-center justify-center transition-transform hover:scale-110" style={{ backgroundColor: color }} onClick={() => setNewTagColor(color)}>
                                    {newTagColor === color && <Check className="h-3 w-3 text-white" />}
                                  </button>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setIsCreatingTag(false); setNewTagName(''); }}>Cancelar</Button>
                                <Button size="sm" className="flex-1" onClick={handleCreateTag} disabled={!newTagName.trim() || createTag.isPending}>{createTag.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar'}</Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="text-xs text-muted-foreground">Selecione uma tag</p>
                              {availableTags.length === 0 && !tags?.length ? (
                                <div className="text-center py-2"><p className="text-xs text-muted-foreground mb-2">Nenhuma tag criada</p><Button size="sm" variant="outline" className="w-full" onClick={() => setIsCreatingTag(true)}><Plus className="h-3 w-3 mr-1" /> Criar primeira tag</Button></div>
                              ) : availableTags.length === 0 ? (
                                <div className="text-center py-2"><p className="text-xs text-muted-foreground mb-2">Todas as tags já foram atribuídas</p><Button size="sm" variant="outline" className="w-full" onClick={() => setIsCreatingTag(true)}><Plus className="h-3 w-3 mr-1" /> Criar nova tag</Button></div>
                              ) : (
                                <>
                                  <div className="space-y-1 max-h-40 overflow-y-auto">
                                    {availableTags.map((tag) => (
                                      <button key={tag.id} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-left" onClick={() => handleAddTag(tag)} disabled={addTagToContact.isPending}>
                                        <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                                        <span className="text-sm truncate">{tag.name}</span>
                                      </button>
                                    ))}
                                  </div>
                                  <Separator />
                                  <Button size="sm" variant="ghost" className="w-full" onClick={() => setIsCreatingTag(true)}><Plus className="h-3 w-3 mr-1" /> Criar nova tag</Button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  {loadingContactTags ? (
                    <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                  ) : contactTags && contactTags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {contactTags.map((ct) => (
                        <Badge key={ct.id} style={{ backgroundColor: `${ct.tag.color}20`, color: ct.tag.color, borderColor: `${ct.tag.color}40` }} className="border group pr-1">
                          {ct.tag.name}
                          <button className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveTag(ct.tag_id)}><X className="h-3 w-3" /></button>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhuma tag atribuída</p>
                  )}
                </div>

                <Separator />

                {/* Contact Info */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Informações</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span data-sensitive className="text-sm text-foreground truncate">{displayPhone ? formatPhone(displayPhone) : 'Sem telefone'}</span>
                    </div>
                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-foreground">Desde {format(new Date(profileContact?.created_at || conversation.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                {conversationStats && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-4 gap-2">
                      <div className="p-3 bg-muted/50 rounded-lg text-center">
                        <p className="text-xl font-semibold text-foreground">{conversationStats.totalMessages}</p>
                        <p className="text-[10px] text-muted-foreground">Total</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg text-center">
                        <p className="text-xl font-semibold text-foreground">{conversationStats.inbound}</p>
                        <p className="text-[10px] text-muted-foreground">Recebidas</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg text-center">
                        <p className="text-xl font-semibold text-foreground">{conversationStats.outbound}</p>
                        <p className="text-[10px] text-muted-foreground">Enviadas</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg text-center">
                        <p className="text-xl font-semibold text-foreground">{conversationStats.aiMessages}</p>
                        <p className="text-[10px] text-muted-foreground">IA</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {fullscreenTab === 'timeline' && contactId && (
              <ContactLogsSection conversationId={conversation.id} />
            )}

            {fullscreenTab === 'notes' && contactId && (
              <ContactNotesSection contactId={contactId} />
            )}

            {fullscreenTab === 'files' && contactId && (
              <ContactFilesSection contactId={contactId} />
            )}

            {fullscreenTab === 'contracts' && contactId && (
              <ContactContractsSection
                contactId={contactId}
                conversationId={conversation.id}
                contactName={displayName}
                contactPhone={displayPhone}
                contactEmail={profileContact?.email}
              />
            )}

            {fullscreenTab === 'scheduled' && (
              <div className="space-y-3">
                {contactScheduledMessages && contactScheduledMessages.length > 0 ? (
                  contactScheduledMessages.map((msg: any) => (
                    <div key={msg.id} className="p-3 rounded-lg border border-border bg-muted/30 space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant={msg.status === 'pending' ? 'default' : msg.status === 'sent' ? 'secondary' : 'destructive'}>
                          {msg.status === 'pending' ? 'Pendente' : msg.status === 'sent' ? 'Enviado' : msg.status === 'cancelled' ? 'Cancelado' : msg.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(msg.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      {msg.message_content && (
                        <p className="text-sm text-foreground line-clamp-2">{msg.message_content}</p>
                      )}
                      {msg.name && (
                        <p className="text-xs text-muted-foreground">{msg.name}</p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhum agendamento para este contato</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => setIsScheduleOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Agendar mensagem
                    </Button>
                  </div>
                )}
              </div>
            )}

            {fullscreenTab === 'favorites' && (
              <div className="space-y-3">
                {favoritedMessages && favoritedMessages.length > 0 ? (
                  favoritedMessages.map((msg: any) => (
                    <div key={msg.id} className="p-3 rounded-lg border border-border bg-muted/30 space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant={msg.direction === 'inbound' ? 'outline' : 'secondary'}>
                          {msg.direction === 'inbound' ? 'Recebida' : 'Enviada'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(msg.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <p className="text-sm text-foreground line-clamp-3">{msg.content}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <MessageCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhuma mensagem favoritada</p>
                    <p className="text-xs text-muted-foreground mt-1">Marque mensagens com ⭐ no chat para vê-las aqui</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Schedule Dialog */}
        <CreateScheduledMessageDialog
          open={isScheduleOpen}
          onOpenChange={setIsScheduleOpen}
          defaultContactId={contactId}
        />
      </div>
    );
  }

  // Normal sidebar view
  return (
    <div className={cn(
      "bg-card flex min-h-0 flex-col",
      embedded
        ? "w-full h-full"
        : "fixed inset-0 z-50 h-[100dvh] w-screen border-l border-border sm:static sm:z-auto sm:h-full sm:w-[min(22rem,42vw)] sm:min-w-[18rem] sm:max-w-[22rem] sm:flex-shrink-0"
    )}>
      {/* Header */}
      {!embedded && (
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Perfil do Contato</h3>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setIsFullscreen(true)} title="Tela cheia">
              <Expand className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Tabs at the TOP - before avatar */}
      {contactId && (
        <ContactProfileTabs
          conversation={conversation}
          contactId={contactId}
        />
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="w-full min-w-0 space-y-6 p-4 pb-16">
          {/* Avatar & Name */}
          <div className="flex flex-col items-center text-center">
            <ContactAvatar
              src={profileContact?.avatar_url}
              name={displayName}
              phone={displayPhone}
              contactId={contactId}
              size={80}
              className="mb-3"
            />

            {isEditingName ? (
              <div className="flex items-center gap-2 w-full">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  placeholder="Nome do contato"
                  className="text-center"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveName();
                    } else if (e.key === 'Escape') {
                      setEditedName(displayName || '');
                      setIsEditingName(false);
                    }
                  }}
                />
                <Button size="icon" onClick={handleSaveName} disabled={isSavingName}>
                  {isSavingName ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setIsEditingName(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                data-sensitive
                className="font-semibold text-lg text-foreground hover:text-primary transition-colors"
                onClick={() => {
                  setEditedName(displayName || '');
                  setIsEditingName(true);
                }}
              >
                {displayName || 'Sem nome'}
              </button>
            )}

            <Badge variant="secondary" className="mt-2">
              {conversation.status === 'open' && 'Aberto'}
              {conversation.status === 'resolved' && 'Resolvido'}
              {conversation.status === 'archived' && 'Arquivado'}
            </Badge>

            {/* Schedule Button */}
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setIsScheduleOpen(true)}
            >
              <Clock className="h-4 w-4 mr-2" />
              Agendar mensagem
            </Button>
          </div>

          <Separator />

          {/* Observação */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Observação
            </Label>
            <div className="flex items-start gap-2">
              {isEditingNote ? (
                <>
                  <Input
                    value={editedNote}
                    onChange={(e) => setEditedNote(e.target.value)}
                    placeholder="Ex: Cliente VIP, ligar às 14h..."
                    className="text-sm flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveNote();
                      } else if (e.key === 'Escape') {
                        setIsEditingNote(false);
                        setEditedNote((contactMetadata as { note?: string } | null)?.note || '');
                      }
                    }}
                  />
                  <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSaveNote} disabled={isSavingNote}>
                    {isSavingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => {
                    setIsEditingNote(false);
                    setEditedNote((contactMetadata as { note?: string } | null)?.note || '');
                  }}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm text-foreground flex-1 py-1 px-2 bg-muted/30 rounded-md min-h-[36px] break-all whitespace-pre-wrap">
                    {(contactMetadata as { note?: string } | null)?.note || 'Sem observação'}
                  </span>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setIsEditingNote(true)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <Separator />

          {/* Descrição */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Descrição
            </Label>
            <div className="flex items-start gap-2">
              {isEditingDescription ? (
                <>
                  <Textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    placeholder="Adicionar descrição..."
                    className="text-sm flex-1 min-h-[80px]"
                    autoFocus
                  />
                  <div className="flex flex-col gap-1">
                    <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSaveDescription} disabled={isSavingDescription}>
                      {isSavingDescription ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => {
                      setIsEditingDescription(false);
                      setEditedDescription(((contactMetadata as any)?.description as string) || '');
                    }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm text-foreground flex-1 py-1 px-2 bg-muted/30 rounded-md min-h-[36px] break-all whitespace-pre-wrap">
                    {editedDescription || 'Sem descrição'}
                  </span>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setIsEditingDescription(true)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <Separator />

          {/* Atributos da conversa (Workspace, Responsável, Origem, Pipeline) */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Atributos</Label>
            <ConversationAttributesPanel conversation={conversation} compact />
          </div>

          <Separator />

          {/* Tags */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Tags</Label>
              <Popover open={isAddingTag} onOpenChange={(open) => {
                setIsAddingTag(open);
                if (!open) {
                  setIsCreatingTag(false);
                  setNewTagName('');
                }
              }}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 px-2">
                    <Plus className="h-3 w-3 mr-1" />
                    Adicionar
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="end">
                  <div className="p-3 space-y-3">
                    {isCreatingTag ? (
                      <>
                        <p className="text-xs font-medium text-foreground">Nova Tag</p>
                        <Input
                          placeholder="Nome da tag"
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          autoFocus
                        />
                        <div className="flex flex-wrap gap-1.5">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className="h-6 w-6 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                              style={{ backgroundColor: color }}
                              onClick={() => setNewTagColor(color)}
                            >
                              {newTagColor === color && (
                                <Check className="h-3 w-3 text-white" />
                              )}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setIsCreatingTag(false); setNewTagName(''); }}>
                            Cancelar
                          </Button>
                          <Button size="sm" className="flex-1" onClick={handleCreateTag} disabled={!newTagName.trim() || createTag.isPending}>
                            {createTag.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar'}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">Selecione uma tag</p>
                        {availableTags.length === 0 && !tags?.length ? (
                          <div className="text-center py-2">
                            <p className="text-xs text-muted-foreground mb-2">Nenhuma tag criada</p>
                            <Button size="sm" variant="outline" className="w-full" onClick={() => setIsCreatingTag(true)}>
                              <Plus className="h-3 w-3 mr-1" /> Criar primeira tag
                            </Button>
                          </div>
                        ) : availableTags.length === 0 ? (
                          <div className="text-center py-2">
                            <p className="text-xs text-muted-foreground mb-2">Todas as tags já foram atribuídas</p>
                            <Button size="sm" variant="outline" className="w-full" onClick={() => setIsCreatingTag(true)}>
                              <Plus className="h-3 w-3 mr-1" /> Criar nova tag
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                              {availableTags.map((tag) => (
                                <button
                                  key={tag.id}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-left"
                                  onClick={() => handleAddTag(tag)}
                                  disabled={addTagToContact.isPending}
                                >
                                  <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                                  <span className="text-sm truncate">{tag.name}</span>
                                </button>
                              ))}
                            </div>
                            <Separator />
                            <Button size="sm" variant="ghost" className="w-full" onClick={() => setIsCreatingTag(true)}>
                              <Plus className="h-3 w-3 mr-1" /> Criar nova tag
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {loadingContactTags ? (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : contactTags && contactTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {contactTags.map((ct) => (
                  <Badge
                    key={ct.id}
                    style={{
                      backgroundColor: `${ct.tag.color}20`,
                      color: ct.tag.color,
                      borderColor: `${ct.tag.color}40`,
                    }}
                    className="border group pr-1"
                  >
                    {ct.tag.name}
                    <button
                      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemoveTag(ct.tag_id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma tag atribuída</p>
            )}
          </div>

          <Separator />

          {/* Contact Info - Compact */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <span data-sensitive className="text-sm text-foreground truncate">
                {displayPhone ? formatPhone(displayPhone) : 'Sem telefone'}
              </span>
            </div>
            {profileContact?.email && (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span data-sensitive className="text-sm text-foreground truncate">{profileContact.email}</span>
              </div>
            )}
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground">
                Desde {format(new Date(profileContact?.created_at || conversation.created_at), "dd/MM/yyyy", { locale: ptBR })}
              </span>
            </div>
          </div>

          {/* Stats */}
          {conversationStats && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-muted/50 rounded-lg text-center">
                  <p className="text-lg font-semibold text-foreground">{conversationStats.totalMessages}</p>
                  <p className="text-[10px] text-muted-foreground">Mensagens</p>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg text-center">
                  <p className="text-lg font-semibold text-foreground">{conversationStats.aiMessages}</p>
                  <p className="text-[10px] text-muted-foreground">IA</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Schedule Dialog */}
      <CreateScheduledMessageDialog
        open={isScheduleOpen}
        onOpenChange={setIsScheduleOpen}
        defaultContactId={contactId}
      />
    </div>
  );
}
