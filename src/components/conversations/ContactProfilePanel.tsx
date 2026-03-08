import { useState } from 'react';
import { cn } from '@/lib/utils';
import { DbConversation } from '@/hooks/useConversations';
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
  MessageSquare,
  Bot,
  UserCircle,
  Check,
  Loader2,
  Save,
  Pencil,
  Clock,
  Settings2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { ContactNotesSection } from './ContactNotesSection';
import { ContactFilesSection } from './ContactFilesSection';
import { CreateScheduledMessageDialog } from '@/components/scheduled/CreateScheduledMessageDialog';
import { ConversationAttributesPanel } from './ConversationAttributesPanel';
import { ContactProfileTabs } from './ContactProfileTabs';

interface ContactProfilePanelProps {
  conversation: DbConversation;
  onClose: () => void;
  embedded?: boolean;
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280',
];

export function ContactProfilePanel({ conversation, onClose, embedded = false }: ContactProfilePanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const contact = conversation.contact;

  const { data: tags } = useTags();
  const { data: contactTags, isLoading: loadingContactTags } = useContactTags(contact?.id || null);
  const addTagToContact = useAddTagToContact();
  const removeTagFromContact = useRemoveTagFromContact();
  const createTag = useCreateTag();

  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(contact?.name || '');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editedNote, setEditedNote] = useState((contact?.metadata as { note?: string } | null)?.note || '');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);

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
    if (contact?.name) {
      return contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    }
    return contact?.phone?.slice(-2) || '??';
  };

  const handleAddTag = async (tag: Tag) => {
    if (!contact?.id) return;
    await addTagToContact.mutateAsync({
      contactId: contact.id,
      tagId: tag.id,
      addedByType: 'manual',
    });
    setIsAddingTag(false);
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!contact?.id) return;
    await removeTagFromContact.mutateAsync({
      contactId: contact.id,
      tagId,
    });
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim() || !contact?.id) return;

    try {
      const newTag = await createTag.mutateAsync({
        name: newTagName.trim(),
        color: newTagColor,
      });

      // Add the new tag to the contact
      if (newTag) {
        await addTagToContact.mutateAsync({
          contactId: contact.id,
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
    if (!contact?.id || !editedName.trim()) return;

    setIsSavingName(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ name: editedName.trim() })
        .eq('id', contact.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
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

  const availableTags = tags?.filter(
    tag => !contactTags?.some(ct => ct.tag_id === tag.id)
  ) || [];

  const addedByTypeLabels = {
    manual: 'Manual',
    flow: 'Fluxo',
    ai: 'IA',
  };

  return (
    <div className={cn(
      "bg-card flex flex-col overflow-hidden",
      embedded
        ? "w-full h-full"
        : "w-80 min-w-[320px] max-w-80 border-l border-border h-full flex-shrink-0"
    )}>
      {/* Header */}
      {!embedded && (
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Perfil do Contato</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Tabs at the TOP - before avatar */}
      {contact?.id && (
        <ContactProfileTabs
          conversation={conversation}
          contactId={contact.id}
        />
      )}

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Avatar & Name */}
          <div className="flex flex-col items-center text-center">
            <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center mb-3">
              {contact?.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={contact?.name || 'Contato'}
                  className="h-20 w-20 rounded-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-primary">
                  {getInitials()}
                </span>
              )}
            </div>

            {isEditingName ? (
              <div className="flex items-center gap-2 w-full">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  placeholder="Nome do contato"
                  className="text-center"
                  autoFocus
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
                className="font-semibold text-lg text-foreground hover:text-primary transition-colors"
                onClick={() => {
                  setEditedName(contact?.name || '');
                  setIsEditingName(true);
                }}
              >
                {contact?.name || 'Sem nome'}
              </button>
            )}

            <Badge variant="secondary" className="mt-2">
              {conversation.status === 'open' && 'Aberto'}
              {conversation.status === 'pending' && 'Pendente'}
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

          {/* Conversation Attributes */}
          <ConversationAttributesPanel conversation={conversation} compact />

          <Separator />

          {/* Tags - moved up for visibility */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Tags
              </Label>
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
              <span className="text-sm text-foreground truncate">
                {contact?.phone ? formatPhone(contact.phone) : 'Sem telefone'}
              </span>
            </div>
            {contact?.email && (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground truncate">{contact.email}</span>
              </div>
            )}
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground">
                Desde {format(new Date(contact?.created_at || conversation.created_at), "dd/MM/yyyy", { locale: ptBR })}
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
      </ScrollArea>

      {/* Schedule Dialog */}
      <CreateScheduledMessageDialog
        open={isScheduleOpen}
        onOpenChange={setIsScheduleOpen}
        defaultContactId={contact?.id}
      />
    </div>
  );
}
