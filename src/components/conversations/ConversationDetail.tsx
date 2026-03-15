import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DbConversation, useMessages, DbMessage } from '@/hooks/useConversations';
import { useContactPresence } from '@/hooks/useContactPresence';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useSyncMessages } from '@/hooks/useSyncMessages';
import { useWhatsAppPresence } from '@/hooks/useWhatsAppPresence';
import { useMediaUpload } from '@/hooks/useMediaUpload';
import { useMediaTranscriptions } from '@/hooks/useMediaTranscription';
import { useAuth } from '@/hooks/useAuth';
import { useSignatureSettings } from '@/hooks/useSignatureSettings';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bot, User, Send, Loader2, MessageCircle, Mic, Check, CheckCheck, ArrowUp, FileText, MapPin, Play, UserCircle, X, Variable, PenLine, Archive, Search, Reply, Clock } from 'lucide-react';
import { formatWhatsAppMessage, parseMessageVariables, messageVariables } from '@/lib/whatsappFormatter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MediaUploadButton } from './MediaUploadButton';
import { MediaPreviewDialog } from './MediaPreviewDialog';
import { AudioRecordButton } from './AudioRecordButton';
import { ContactProfilePanel } from './ContactProfilePanel';
import { MediaTranscription } from './MediaTranscription';
import { ConversationActionsMenu } from './ConversationActionsMenu';
import { ArchiveMediaButton } from './ArchiveMediaButton';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import { MessageSearch } from './MessageSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { FlowTriggerDropdown } from './FlowTriggerDropdown';
import { AIContextBar } from './AIContextBar';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { AIFeedbackDialog } from './AIFeedbackDialog';
import { ChatFollowUpDialog } from './ChatFollowUpDialog';
import { Sparkles } from 'lucide-react';
import { useFollowUpStatus } from '@/hooks/useFollowUpStatus';

interface ConversationDetailProps {
  conversation: DbConversation;
  headerActions?: React.ReactNode;
}

// Helper to get initials
const getInitialsFromName = (name: string | null, phone?: string) => {
  if (name) {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  }
  return phone?.slice(-2) || '??';
};

const statusLabels: Record<string, string> = {
  open: 'Aberto',
  resolved: 'Resolvido',
  archived: 'Arquivado',
};

export function ConversationDetail({ conversation, headerActions }: ConversationDetailProps) {
  const { session } = useAuth();
  const { sendPresence, sendRecording } = useWhatsAppPresence();
  const [newMessage, setNewMessage] = useState('');
  const [isAIActive, setIsAIActive] = useState(() => (conversation as any).service_mode === 'ia');
  const [showHistoryLimitMessage, setShowHistoryLimitMessage] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ file: File; type: 'image' | 'document' | 'audio' } | null>(null);
  const [attachedMedia, setAttachedMedia] = useState<{ file: File; type: 'image' | 'document' | 'audio'; previewUrl: string } | null>(null);
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ id: string; content: string; metadata: any } | null>(null);
  const [replyingTo, setReplyingTo] = useState<DbMessage | null>(null);
  const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false);
  const [followUpMessage, setFollowUpMessage] = useState<DbMessage | null>(null);

  const { data: followUpMap } = useFollowUpStatus();

  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { signatureEnabled, toggleSignature } = useSignatureSettings();
  const { data: messages, isLoading: loadingMessages } = useMessages(conversation.id);
  const { isTyping, isRecording, isOnline } = useContactPresence(conversation.contact?.id || null);
  const sendMessage = useSendMessage();
  const { sendTyping } = useWhatsAppPresence();
  const { uploadFile, uploadAudioBlob, isUploading } = useMediaUpload();
  const {
    syncMessages,
    loadOlderMessages,
    resetPagination,
    isSyncing,
    isLoadingOlder,
    hasMoreMessages
  } = useSyncMessages(conversation.id);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const hasSyncedRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  // Sync messages when conversation changes (lazy-load)
  useEffect(() => {
    if (conversation.id && hasSyncedRef.current !== conversation.id) {
      hasSyncedRef.current = conversation.id;
      setShowHistoryLimitMessage(false);
      resetPagination();
      syncMessages().then((result) => {
        // If we got the multi-device limitation, show a message
        if (result?.multiDeviceLimitation) {
          setShowHistoryLimitMessage(true);
        }
      });
    }
  }, [conversation.id, syncMessages, resetPagination]);

  const getDisplayName = () => {
    if (conversation.contact?.name) return conversation.contact.name;
    if (conversation.contact?.phone) return conversation.contact.phone;
    return 'Desconhecido';
  };

  const getInitials = () => {
    const name = conversation.contact?.name;
    const phone = conversation.contact?.phone || '';
    if (name) {
      return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    }
    return phone.slice(-2);
  };

  // Scroll to bottom on initial load (instant) and new messages (smooth)
  const hasInitialScrolled = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    if (!messages || messages.length === 0) return;

    // First load: instant scroll, no animation
    if (!hasInitialScrolled.current && !loadingMessages && !isSyncing) {
      hasInitialScrolled.current = true;
      // Use setTimeout to ensure DOM is ready
      setTimeout(() => {
        scrollToBottom('instant');
      }, 50);
    } else if (!isLoadingOlder && hasInitialScrolled.current) {
      // Subsequent messages: smooth scroll
      scrollToBottom('smooth');
    }
  }, [messages, isLoadingOlder, loadingMessages, isSyncing, scrollToBottom]);

  // Reset scroll flag when conversation changes
  useEffect(() => {
    hasInitialScrolled.current = false;
    setShowScrollButton(false);
    setIsAIActive((conversation as any).service_mode === 'ia');
  }, [conversation.id]);

  // Handle scroll for infinite scroll (reverse) and show/hide scroll button
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;

    // If scrolled near top (first 100px) and we have messages
    if (container.scrollTop < 100 && !isLoadingOlder && hasMoreMessages && messages && messages.length > 0) {
      loadOlderMessages();
    }

    // Show scroll button when user is not at the bottom
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    setShowScrollButton(!isNearBottom);
  }, [isLoadingOlder, hasMoreMessages, messages, loadOlderMessages]);

  // Send typing presence when user types
  const handleInputChange = useCallback((value: string) => {
    setNewMessage(value);

    // Only send typing status if user is actually typing something
    // and we haven't sent it recently (throttle to avoid spam)
    const now = Date.now();
    if (value.trim() && conversation.contact?.phone && now - lastTypingSentRef.current > 5000) {
      lastTypingSentRef.current = now;
      sendTyping(conversation.contact.phone, 5000);
    }

    // Clear any existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  }, [conversation.contact?.phone, sendTyping]);

  // Handle paste events for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Check for image data
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          // Create a proper file with name
          const extension = item.type.split('/')[1] || 'png';
          const namedFile = new File([file], `pasted-image-${Date.now()}.${extension}`, {
            type: file.type,
          });
          setMediaPreview({ file: namedFile, type: 'image' });
          toast({
            title: 'Imagem colada',
            description: 'Adicione uma legenda e envie.',
          });
        }
        return;
      }
    }

    // Text paste is handled normally by the input
  }, []);

  const handleSend = async () => {
    // If there's attached media, send it
    if (attachedMedia) {
      setIsSendingMedia(true);
      try {
        const result = await uploadFile(attachedMedia.file, conversation.id);
        if (!result) {
          setIsSendingMedia(false);
          return;
        }

        await sendMessage.mutateAsync({
          conversationId: conversation.id,
          content: newMessage.trim() || attachedMedia.file.name,
          type: attachedMedia.type,
          mediaUrl: result.url,
        });

        // Clear attached media and message
        URL.revokeObjectURL(attachedMedia.previewUrl);
        setAttachedMedia(null);
        setNewMessage('');

        toast({
          title: 'Mídia enviada',
          description: 'O arquivo foi enviado com sucesso.',
        });
      } catch (error) {
        toast({
          title: 'Erro ao enviar',
          description: 'Não foi possível enviar a mídia.',
          variant: 'destructive',
        });
      } finally {
        setIsSendingMedia(false);
      }
      return;
    }

    // Normal text message
    if (!newMessage.trim() || sendMessage.isPending) return;

    // Replace message variables with actual values
    const variables: Record<string, string> = {
      nome: conversation.contact?.name || conversation.contact?.phone || 'Cliente',
      telefone: conversation.contact?.phone || '',
    };
    let messageContent = parseMessageVariables(newMessage.trim(), variables);

    // Add signature if enabled
    if (signatureEnabled && profile?.full_name) {
      messageContent = `*_${profile.full_name}_*\n\n${messageContent}`;
    }

    setNewMessage('');

    // If AI was active, user is taking over - persist to DB
    if (isAIActive) {
      setIsAIActive(false);
      supabase
        .from('conversations')
        .update({ service_mode: 'ativo' } as any)
        .eq('id', conversation.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ['conversations'] }));
      toast({
        title: "Você assumiu a conversa",
        description: "A IA foi desativada e você está no controle.",
      });
    }

    try {
      await sendMessage.mutateAsync({
        conversationId: conversation.id,
        content: messageContent,
        type: 'text',
        quotedMessageId: replyingTo?.id,
        quotedContent: replyingTo?.content || undefined,
        quotedSender: replyingTo ? (replyingTo.direction === 'inbound' ? (conversation.contact?.name || 'Contato') : 'Você') : undefined,
      });
      setReplyingTo(null);
    } catch (error) {
      // Error is handled in the hook
      setNewMessage(messageContent); // Restore message on error
    }
  };

  const handleToggleAI = async (active: boolean) => {
    setIsAIActive(active);

    // Persist to DB
    const newMode = active ? 'ia' : 'ativo';
    await supabase
      .from('conversations')
      .update({ service_mode: newMode } as any)
      .eq('id', conversation.id);
    queryClient.invalidateQueries({ queryKey: ['conversations'] });

    if (active) {
      toast({
        title: "IA Ativada",
        description: "A IA está lendo o contexto da conversa e continuará o atendimento.",
      });
    } else {
      toast({
        title: "IA Desativada",
        description: "Você assumiu o controle do atendimento.",
      });
    }
  };

  // Handle file selection from MediaUploadButton
  const handleFileSelect = (file: File, type: 'image' | 'document' | 'audio') => {
    setMediaPreview({ file, type });
  };

  // Handle confirming media from preview dialog (attach, don't send)
  const handleConfirmMedia = async (caption: string) => {
    if (!mediaPreview) return;

    // Create preview URL and attach the media
    const previewUrl = URL.createObjectURL(mediaPreview.file);
    setAttachedMedia({
      file: mediaPreview.file,
      type: mediaPreview.type,
      previewUrl,
    });

    // Set caption as message
    if (caption) {
      setNewMessage(caption);
    }

    // Close preview dialog
    setMediaPreview(null);
  };

  // Remove attached media
  const handleRemoveAttachedMedia = () => {
    if (attachedMedia) {
      URL.revokeObjectURL(attachedMedia.previewUrl);
      setAttachedMedia(null);
    }
  };

  // Handle audio recording complete
  const handleAudioRecordComplete = async (audioBlob: Blob) => {
    try {
      const result = await uploadAudioBlob(audioBlob, conversation.id);
      if (!result) return;

      await sendMessage.mutateAsync({
        conversationId: conversation.id,
        content: 'Áudio',
        type: 'audio',
        mediaUrl: result.url,
      });

      toast({
        title: 'Áudio enviado',
        description: 'O áudio foi enviado com sucesso.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao enviar áudio',
        description: 'Não foi possível enviar o áudio.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {/* Header - Responsive */}
        <div className="flex items-center justify-between p-3 md:p-4 border-b border-border bg-card gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            <div className="relative flex-shrink-0">
              <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                {conversation.contact?.avatar_url ? (
                  <img
                    src={conversation.contact.avatar_url}
                    alt={getDisplayName()}
                    className="h-10 w-10 md:h-12 md:w-12 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-xs md:text-sm font-semibold text-primary">
                    {getInitials()}
                  </span>
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 md:gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground text-sm md:text-base truncate max-w-[120px] md:max-w-none">{getDisplayName()}</h3>
                <span className={cn(
                  "status-badge text-[9px] md:text-[10px] hidden xs:inline-flex",
                  (isTyping || isRecording) ? "bg-green-500/10 text-green-500 animate-pulse" : (
                    conversation.status === 'open' && "status-open",
                    conversation.status === 'resolved' && "bg-blue-500/10 text-blue-500",
                    conversation.status === 'archived' && "bg-muted text-muted-foreground"
                  )
                )}>
                  {isTyping ? 'Digitando...' : isRecording ? 'Gravando áudio...' : statusLabels[conversation.status]}
                </span>
                {/* Quick Note Badge - Hidden on very small screens */}
                {(() => {
                  const metadata = conversation.contact?.metadata as { note?: string } | null;
                  const note = metadata?.note;
                  if (note) {
                    return (
                      <span
                        className="hidden sm:inline-flex text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded truncate max-w-[100px] md:max-w-[150px]"
                        title={note}
                      >
                        {note}
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
              <p className="text-[10px] md:text-xs text-muted-foreground truncate flex items-center gap-2">
                {conversation.contact?.phone || 'Sem número'}
                {isOnline && !isTyping && !isRecording && (
                  <span className="flex h-1.5 w-1.5 rounded-full bg-green-500" />
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            {/* Message Search */}
            <MessageSearch
              messages={messages || []}
              onScrollToMessage={(messageId) => {
                setHighlightedMessageId(messageId);
                const element = document.getElementById(`message-${messageId}`);
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  setTimeout(() => setHighlightedMessageId(null), 2000);
                }
              }}
            />

            {/* Archive Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs hidden sm:flex"
                  onClick={async () => {
                    try {
                      await supabase
                        .from('conversations')
                        .update({ status: 'archived' })
                        .eq('id', conversation.id);
                      queryClient.invalidateQueries({ queryKey: ['conversations'] });
                      toast({
                        title: 'Conversa arquivada',
                        description: 'A conversa foi movida para o arquivo.',
                      });
                    } catch (error) {
                      toast({
                        title: 'Erro',
                        description: 'Não foi possível arquivar a conversa',
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  <Archive className="h-3.5 w-3.5" />
                  Arquivar Ticket
                </Button>
              </TooltipTrigger>
              <TooltipContent>Arquivar conversa</TooltipContent>
            </Tooltip>

            {/* AI Toggle - Compact on mobile */}
            <div className={cn(
              "flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 rounded-full border transition-colors",
              isAIActive
                ? "bg-primary/10 border-primary/30"
                : "bg-muted border-border"
            )}>
              {isAIActive ? (
                <Bot className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
              ) : (
                <User className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
              )}
              <span className="text-[10px] md:text-xs font-medium hidden sm:inline">
                {isAIActive ? 'IA Ativa' : 'Manual'}
              </span>
              <Switch
                checked={isAIActive}
                onCheckedChange={handleToggleAI}
                className="data-[state=checked]:bg-primary scale-90 md:scale-100"
              />
            </div>

            {/* Flow Trigger Dropdown - Hidden on small screens */}
            <FlowTriggerDropdown key={conversation.id} conversationId={conversation.id} />

            <Button variant="ghost" size="icon" className="h-8 w-8 md:h-9 md:w-9" onClick={() => setShowProfilePanel(!showProfilePanel)}>
              <UserCircle className="h-4 w-4" />
            </Button>
            <ConversationActionsMenu conversation={conversation} />

            {headerActions && (
              <>
                <div className="w-px h-5 bg-border hidden sm:block mx-1" />
                {headerActions}
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="relative flex-1 overflow-hidden">
          {/* Scroll to bottom button */}
          <ScrollToBottomButton
            visible={showScrollButton}
            onClick={() => scrollToBottom('smooth')}
          />
          <div
            ref={messagesContainerRef}
            className="h-full overflow-y-auto p-4 space-y-4 bg-muted/30"
            onScroll={handleScroll}
          >
            {/* History limit info */}
            {showHistoryLimitMessage && (
              <div className="flex items-center justify-center py-3">
                <div className="bg-amber-500/10 text-amber-600 dark:text-amber-400 px-4 py-2 rounded-lg text-xs text-center max-w-md">
                  <p className="font-medium">Histórico anterior indisponível</p>
                  <p className="opacity-80 mt-1">Mensagens anteriores não podem ser importadas pelo provedor. Novas mensagens serão sincronizadas automaticamente.</p>
                </div>
              </div>
            )}

            {/* Loading older messages indicator */}
            {isLoadingOlder && (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-xs text-muted-foreground">Carregando mensagens antigas...</span>
              </div>
            )}

            {/* Load more button when not at end */}
            {!isLoadingOlder && hasMoreMessages && messages && messages.length > 0 && !showHistoryLimitMessage && (
              <div className="flex items-center justify-center py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadOlderMessages()}
                  className="text-xs text-muted-foreground"
                >
                  <ArrowUp className="h-3 w-3 mr-1" />
                  Carregar mensagens anteriores
                </Button>
              </div>
            )}

            {(loadingMessages || isSyncing) && !messages?.length ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">{isSyncing ? 'Sincronizando...' : 'Carregando...'}</span>
              </div>
            ) : !messages || messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <MessageCircle className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">Nenhuma mensagem ainda</p>
                <p className="text-xs mt-2 text-center max-w-xs">
                  {showHistoryLimitMessage
                    ? 'Mensagens novas aparecerão aqui automaticamente.'
                    : 'Inicie uma conversa ou aguarde novas mensagens.'}
                </p>
              </div>
            ) : (
              <>
                {(() => {
                  // Get message IDs that need transcriptions
                  const mediaMessageIds = messages
                    .filter(m => (m.type === 'audio' || m.type === 'image' || m.type === 'video') && m.media_url)
                    .map(m => m.id);

                  return (
                    <MessageBubbleList
                      messages={messages}
                      mediaMessageIds={mediaMessageIds}
                      contactAvatar={conversation.contact?.avatar_url}
                      contactName={conversation.contact?.name}
                      contactPhone={conversation.contact?.phone}
                      contactId={conversation.contact?.id}
                       senderAvatar={profile?.avatar_url}
                       senderName={profile?.full_name}
                       highlightedMessageId={highlightedMessageId}
                       followUpMap={followUpMap || {}}
                       onReply={(msg) => setReplyingTo(msg)}
                       onFollowUp={(msg) => {
                         setFollowUpMessage(msg);
                         setFollowUpDialogOpen(true);
                       }}
                        onAdjustPrompt={(msg) => {
                          const aiMeta = (msg.metadata as any)?.ai_metadata || {};
                          setFeedbackMessage({
                            id: msg.id,
                            content: msg.content || '',
                            metadata: {
                              ...aiMeta,
                              agent_id: aiMeta.agent_id || conversation.ai_agent_id,
                              flow_id: aiMeta.flow_id || (conversation.metadata as any)?.flow_id,
                              master_prompt_id: aiMeta.master_prompt_id || (conversation.metadata as any)?.master_prompt_id
                            }
                          });
                          setFeedbackDialogOpen(true);
                        }}
                     />
                  );
                })()}
                <div ref={messagesEndRef} />
              </>
            )}
            {/* Typing/Recording Indicator */}
            {(isTyping || isRecording) && (
              <div className="flex items-center gap-2 px-4 py-2 animate-fade-in">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border">
                  {isTyping ? (
                    <>
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs text-muted-foreground">Digitando...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4 text-destructive animate-pulse" />
                      <span className="text-xs text-muted-foreground">Gravando áudio...</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Context Bar */}
        <AIContextBar
          conversationId={conversation.id}
          isAIActive={isAIActive}
        />

        {/* Input */}
        <div className="border-t border-border bg-card">
          {/* Reply Preview */}
          {replyingTo && (
            <div className="px-4 pt-3 pb-0">
              <div className="flex items-center gap-2 p-2 bg-primary/5 border-l-2 border-primary rounded-r-lg">
                <Reply className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-primary font-medium">
                    {replyingTo.direction === 'inbound' ? (conversation.contact?.name || 'Contato') : 'Você'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{replyingTo.content}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setReplyingTo(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
          {/* Attached Media Preview */}
          {attachedMedia && (
            <div className="px-4 pt-3 pb-0">
              <div className="relative inline-flex items-center gap-2 p-2 pr-8 bg-muted rounded-lg border border-border">
                {attachedMedia.type === 'image' && (
                  <img
                    src={attachedMedia.previewUrl}
                    alt="Anexo"
                    className="h-16 w-16 object-cover rounded"
                  />
                )}
                {attachedMedia.type === 'document' && (
                  <div className="h-16 w-16 bg-primary/10 rounded flex items-center justify-center">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                )}
                {attachedMedia.type === 'audio' && (
                  <div className="h-16 w-16 bg-primary/10 rounded flex items-center justify-center">
                    <Mic className="h-6 w-6 text-primary" />
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-xs text-muted-foreground">
                    {attachedMedia.type === 'image' && 'Imagem anexada'}
                    {attachedMedia.type === 'document' && 'Documento anexado'}
                    {attachedMedia.type === 'audio' && 'Áudio anexado'}
                  </span>
                  <span className="text-xs text-foreground truncate max-w-[150px]">
                    {attachedMedia.file.name}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6"
                  onClick={handleRemoveAttachedMedia}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1 md:gap-2 p-2 md:p-4">
            <MediaUploadButton
              onUpload={handleFileSelect}
              disabled={sendMessage.isPending || isUploading || isSendingMedia}
            />

            {/* Variable insertion button - hidden on mobile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 md:h-10 md:w-10 flex-shrink-0 hidden sm:flex"
                  title="Inserir variável"
                >
                  <Variable className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48 bg-popover">
                {messageVariables.map((variable) => (
                  <DropdownMenuItem
                    key={variable.key}
                    onClick={() => {
                      setNewMessage(prev => prev + `{${variable.key}}`);
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{`{${variable.key}}`}</span>
                      <span className="text-xs text-muted-foreground">{variable.label}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Signature toggle button - hidden on mobile */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={signatureEnabled ? "default" : "ghost"}
                  size="icon"
                  className={cn(
                    "h-9 w-9 md:h-10 md:w-10 flex-shrink-0 transition-colors hidden sm:flex",
                    signatureEnabled && "bg-primary/20 text-primary hover:bg-primary/30"
                  )}
                  onClick={() => toggleSignature(!signatureEnabled)}
                >
                  <PenLine className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {signatureEnabled ? 'Assinatura ativa' : 'Assinatura desativada'}
                  {profile?.full_name && signatureEnabled && (
                    <span className="block text-muted-foreground mt-0.5">
                      {profile.full_name}
                    </span>
                  )}
                </p>
              </TooltipContent>
            </Tooltip>

            <Input
              value={newMessage}
              onChange={(e) => handleInputChange(e.target.value)}
              onPaste={handlePaste}
              placeholder={
                attachedMedia
                  ? "Adicione uma legenda (opcional)..."
                  : isAIActive
                    ? "A IA está respondendo... Digite para assumir"
                    : "Digite sua mensagem ou cole uma imagem..."
              }
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              disabled={sendMessage.isPending || isSendingMedia}
            />
            {(newMessage.trim() || attachedMedia) ? (
              <Button
                onClick={handleSend}
                disabled={(!newMessage.trim() && !attachedMedia) || sendMessage.isPending || isSendingMedia}
                size="icon"
                className="h-9 w-9 md:h-10 md:w-auto md:px-4 flex-shrink-0"
              >
                {(sendMessage.isPending || isSendingMedia) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span className="hidden md:inline ml-2">
                  {(sendMessage.isPending || isSendingMedia) ? 'Enviando...' : 'Enviar'}
                </span>
              </Button>
            ) : (
              <AudioRecordButton
                onRecordComplete={handleAudioRecordComplete}
                onStart={() => {
                  if (conversation.contact?.phone) {
                    sendRecording(conversation.contact.phone, 15000);
                  }
                }}
                onStop={() => {
                  // Sending a short 'typing' effectively cancels the recording status
                  if (conversation.contact?.phone) {
                    sendPresence(conversation.contact.phone, 'typing', 100);
                  }
                }}
                disabled={sendMessage.isPending || isUploading || isSendingMedia}
              />
            )}
          </div>
        </div>

        {/* Media Preview Dialog */}
        <MediaPreviewDialog
          open={!!mediaPreview}
          onOpenChange={(open) => !open && setMediaPreview(null)}
          file={mediaPreview?.file || null}
          type={mediaPreview?.type || 'image'}
          onSend={handleConfirmMedia}
          isSending={false}
          confirmLabel="Anexar"
        />
      </div>

      {/* Contact Profile Panel */}
      {showProfilePanel && (
        <ContactProfilePanel
          conversation={conversation}
          onClose={() => setShowProfilePanel(false)}
        />
      )}

      {/* AI Feedback Dialog */}
      {feedbackMessage && (
        <AIFeedbackDialog
          open={feedbackDialogOpen}
          onOpenChange={setFeedbackDialogOpen}
          messageId={feedbackMessage.id}
          originalMessage={feedbackMessage.content}
          metadata={feedbackMessage.metadata}
          organizationId={conversation.organization_id}
        />
      )}

      {/* Chat Follow-up Dialog */}
      <ChatFollowUpDialog
        open={followUpDialogOpen}
        onOpenChange={setFollowUpDialogOpen}
        conversationId={conversation.id}
        organizationId={conversation.organization_id}
        lastMessage={followUpMessage}
      />
    </div>
  );
}

interface MessageBubbleListProps {
  messages: DbMessage[];
  mediaMessageIds: string[];
  contactAvatar?: string | null;
  contactName?: string | null;
  contactPhone?: string;
  contactId?: string | null;
  senderAvatar?: string | null;
  senderName?: string | null;
  highlightedMessageId?: string | null;
  followUpMap?: Record<string, { step: number; triggerMessageId?: string }>;
  onReply?: (message: DbMessage) => void;
  onFollowUp?: (message: DbMessage) => void;
  onAdjustPrompt?: (message: DbMessage) => void;
}

function MessageBubbleList({ messages, mediaMessageIds, contactAvatar, contactName, contactPhone, contactId, senderAvatar, senderName, highlightedMessageId, followUpMap, onReply, onFollowUp, onAdjustPrompt }: MessageBubbleListProps) {
  const { transcriptions, isLoading: transcriptionsLoading } = useMediaTranscriptions(mediaMessageIds);
  const [localTranscriptions, setLocalTranscriptions] = useState<Record<string, string>>({});

  const handleTranscriptionUpdate = useCallback((messageId: string, transcription: string) => {
    setLocalTranscriptions(prev => ({ ...prev, [messageId]: transcription }));
  }, []);

  // Merge remote + local transcriptions
  const mergedTranscriptions = useMemo(() => ({ ...transcriptions, ...localTranscriptions }), [transcriptions, localTranscriptions]);

  // Group messages by date for date separators
  const getDateKey = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, 'yyyy-MM-dd');
  };

  const formatDateSeparator = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
      return 'Hoje';
    }
    if (format(date, 'yyyy-MM-dd') === format(yesterday, 'yyyy-MM-dd')) {
      return 'Ontem';
    }
    return format(date, 'dd/MM/yyyy', { locale: ptBR });
  };

  // Find follow-up info for this conversation
  const conversationFollowUp = useMemo(() => {
    if (!messages.length || !followUpMap) return null;
    return followUpMap[messages[0]?.conversation_id] || null;
  }, [messages, followUpMap]);

  const followUpTargetId = useMemo(() => {
    if (!conversationFollowUp) return null;
    if (conversationFollowUp.triggerMessageId) return conversationFollowUp.triggerMessageId;
    // Fallback: last outbound human message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].direction === 'outbound' && !messages[i].is_from_bot) return messages[i].id;
    }
    return null;
  }, [messages, conversationFollowUp]);

  let lastDateKey: string | null = null;

  return (
    <>
      {messages.map((message) => {
        const currentDateKey = getDateKey(message.created_at);
        const showDateSeparator = currentDateKey !== lastDateKey;
        lastDateKey = currentDateKey;

        return (
          <div key={message.id}>
            {showDateSeparator && (
              <div className="flex items-center justify-center my-4">
                <span className="px-3 py-1 text-[11px] font-medium bg-muted text-muted-foreground rounded-full shadow-sm">
                  {formatDateSeparator(message.created_at)}
                </span>
              </div>
            )}
            <MessageBubble
              message={message}
              contactAvatar={contactAvatar}
              contactName={contactName}
              contactPhone={contactPhone}
              contactId={contactId}
              transcription={mergedTranscriptions[message.id]}
              isTranscriptionLoading={transcriptionsLoading && !mergedTranscriptions[message.id]}
              senderAvatar={senderAvatar}
              senderName={senderName}
              isHighlighted={highlightedMessageId === message.id}
              hasFollowUp={!!(conversationFollowUp && message.id === followUpTargetId)}
              onReply={onReply}
              onFollowUp={onFollowUp}
              onTranscriptionUpdate={handleTranscriptionUpdate}
              onAdjustPrompt={onAdjustPrompt}
             />
          </div>
        );
      })}
    </>
  );
}

interface MessageBubbleProps {
  message: DbMessage;
  contactAvatar?: string | null;
  contactName?: string | null;
  contactPhone?: string;
  contactId?: string | null;
  transcription?: string;
  isTranscriptionLoading?: boolean;
  senderAvatar?: string | null;
  senderName?: string | null;
  isHighlighted?: boolean;
  hasFollowUp?: boolean;
  onReply?: (message: DbMessage) => void;
  onFollowUp?: (message: DbMessage) => void;
  onTranscriptionUpdate?: (messageId: string, transcription: string) => void;
  onAdjustPrompt?: (message: DbMessage) => void;
}

function MessageBubble({ message, contactAvatar, contactName, contactPhone, contactId, transcription, isTranscriptionLoading, senderAvatar, senderName, isHighlighted, hasFollowUp, onReply, onFollowUp, onTranscriptionUpdate, onAdjustPrompt }: MessageBubbleProps) {
  const isInbound = message.direction === 'inbound';
  const isBot = message.is_from_bot;

  // Render media content based on type
  const renderMediaContent = () => {
    const { type, media_url, content } = message;

    if (type === 'image' && media_url) {
      return (
        <div className="mb-2">
          <img
            src={media_url}
            alt={content || 'Imagem'}
            className="max-w-full rounded-lg max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => window.open(media_url, '_blank')}
          />
          {content && <p className="text-sm mt-2">{content}</p>}
          <MediaTranscription
            transcription={transcription}
            isLoading={!!isTranscriptionLoading}
            type="image"
            isInbound={isInbound}
            messageId={message.id}
            mediaUrl={media_url}
            onTranscriptionUpdate={(t) => onTranscriptionUpdate?.(message.id, t)}
          />
          {contactId && (
            <ArchiveMediaButton
              contactId={contactId}
              messageId={message.id}
              mediaUrl={media_url}
              mediaType="image"
            />
          )}
        </div>
      );
    }

    if (type === 'audio' && media_url) {
      const metadata = message.metadata as any;
      const isPlayed = !!metadata?.played_at;

      return (
        <div className="min-w-[200px]">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex items-center justify-center h-10 w-10 rounded-full transition-colors",
              isPlayed ? "bg-blue-500/20" : "bg-primary/20"
            )}>
              <Mic className={cn(
                "h-5 w-5",
                isPlayed ? "text-blue-500" : "text-primary"
              )} />
            </div>
            <audio controls className="flex-1 max-w-[250px]" preload="metadata">
              <source src={media_url} />
              Seu navegador não suporta áudio.
            </audio>
          </div>
          <MediaTranscription
            transcription={transcription}
            isLoading={!!isTranscriptionLoading}
            type="audio"
            isInbound={isInbound}
            messageId={message.id}
            mediaUrl={media_url}
            onTranscriptionUpdate={(t) => onTranscriptionUpdate?.(message.id, t)}
          />
          {contactId && (
            <ArchiveMediaButton
              contactId={contactId}
              messageId={message.id}
              mediaUrl={media_url}
              mediaType="audio"
            />
          )}
        </div>
      );
    }

    if (type === 'video' && media_url) {
      return (
        <div className="mb-2">
          <video
            controls
            className="max-w-full rounded-lg max-h-64"
            preload="metadata"
          >
            <source src={media_url} />
            Seu navegador não suporta vídeo.
          </video>
          {content && <p className="text-sm mt-2">{content}</p>}
          <MediaTranscription
            transcription={transcription}
            isLoading={!!isTranscriptionLoading}
            type="video"
            isInbound={isInbound}
            messageId={message.id}
            mediaUrl={media_url}
            onTranscriptionUpdate={(t) => onTranscriptionUpdate?.(message.id, t)}
          />
        </div>
      );
    }

    if (type === 'document' && media_url) {
      const fileName = content || media_url.split('/').pop() || 'Documento';
      return (
        <a
          href={media_url}
          target="_blank"
          rel="noopener noreferrer"
          download={fileName}
          className="flex items-center gap-3 p-3 rounded-lg bg-background/50 hover:bg-background/80 transition-colors"
          onClick={(e) => {
            // Fallback: if blocked by ad blocker, try fetch + blob download
            e.preventDefault();
            fetch(media_url)
              .then(res => res.blob())
              .then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              })
              .catch(() => {
                // If fetch also fails, try direct open
                window.open(media_url, '_blank');
              });
          }}
        >
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/20">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{fileName}</p>
            <p className="text-xs opacity-60">Clique para baixar</p>
          </div>
        </a>
      );
    }

    if (type === 'sticker' && media_url) {
      return (
        <img
          src={media_url}
          alt="Sticker"
          className="max-w-[128px] max-h-[128px]"
        />
      );
    }

    if (type === 'location') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-background/50">
          <MapPin className="h-5 w-5 text-primary" />
          <span className="text-sm">{content || 'Localização compartilhada'}</span>
        </div>
      );
    }

    // Text or unknown type - format with WhatsApp markdown
    const formattedContent = formatWhatsAppMessage(content || '');
    return (
      <p
        className="text-sm leading-relaxed whitespace-pre-wrap"
        dangerouslySetInnerHTML={{ __html: formattedContent || '[Mídia não suportada]' }}
      />
    );
  };

  return (
    <div
      id={`message-${message.id}`}
      className={cn(
        "flex gap-1.5 group/msg",
        isInbound ? "justify-start" : "justify-end",
        isHighlighted && "animate-pulse bg-primary/10 rounded-lg -mx-2 px-2 py-1"
      )}
    >
      {isInbound && (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {contactAvatar ? (
            <img src={contactAvatar} alt={contactName || 'Contact'} className="h-8 w-8 object-cover" />
          ) : (
            <span className="text-xs font-medium text-white">
              {getInitialsFromName(contactName || null, contactPhone)}
            </span>
          )}
        </div>
      )}

      {/* Hover Action Buttons - inline next to bubble */}
      {!isInbound && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity self-start mt-1">
          {!isBot && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onFollowUp?.(message)}
                  className={cn(
                    "h-6 w-6 rounded-full bg-card border shadow-sm flex items-center justify-center hover:bg-muted transition-colors",
                    hasFollowUp ? "border-primary text-primary" : "border-border text-muted-foreground"
                  )}
                >
                  <Clock className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {hasFollowUp ? 'Follow-up ativo' : 'Programar follow-up'}
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onReply?.(message)}
                className="h-6 w-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center hover:bg-muted transition-colors"
              >
                <Reply className="h-3 w-3 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Responder</TooltipContent>
          </Tooltip>
        </div>
      )}
      {isInbound && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity self-start mt-1 order-last">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onReply?.(message)}
                className="h-6 w-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center hover:bg-muted transition-colors"
              >
                <Reply className="h-3 w-3 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Responder</TooltipContent>
          </Tooltip>
        </div>
      )}

      <div 
        className={cn(
          "max-w-[70%] rounded-2xl px-4 py-3 relative transition-all",
          isInbound
            ? "bg-card border border-border rounded-tl-sm"
            : isBot
              ? "bg-gradient-to-br from-primary to-purple-500 text-white rounded-tr-sm cursor-pointer hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]"
              : "bg-green-500 text-white rounded-tr-sm"
        )}
        onClick={() => {
          if (!isInbound && isBot && onAdjustPrompt) {
            onAdjustPrompt(message);
          }
        }}
      >
        {/* Quoted message block */}
        {(() => {
          const meta = message.metadata as any;
          const quoted = meta?.quoted_message;
          if (!quoted) return null;
          return (
            <div
              className={cn(
                "mb-2 p-2 rounded-lg border-l-2 cursor-pointer",
                isInbound
                  ? "bg-muted/50 border-primary/50"
                  : isBot
                    ? "bg-white/10 border-white/30"
                    : "bg-white/15 border-white/40"
              )}
              onClick={() => {
                if (quoted.id) {
                  const el = document.getElementById(`message-${quoted.id}`);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('animate-pulse', 'bg-primary/10');
                    setTimeout(() => el.classList.remove('animate-pulse', 'bg-primary/10'), 2000);
                  }
                }
              }}
            >
              <p className={cn(
                "text-[10px] font-semibold mb-0.5",
                isInbound ? "text-primary" : "opacity-80"
              )}>
                {quoted.sender || 'Mensagem'}
              </p>
              <p className={cn(
                "text-xs truncate",
                isInbound ? "text-muted-foreground" : "opacity-70"
              )}>
                {quoted.content || '📎 Mídia'}
              </p>
            </div>
          );
        })()}
        {/* Follow-up badge */}
        {hasFollowUp && !isInbound && !isBot && (
          <div className="flex items-center gap-1 mb-1">
            <Clock className="h-3 w-3 text-white/80" />
            <span className="text-[10px] text-white/80 font-medium">Follow-up ativo</span>
          </div>
        )}
        {/* Show contact name for inbound messages */}
        {isInbound && contactName && (
          <p className="text-xs font-semibold italic text-primary mb-1">
            {contactName}
          </p>
        )}
         {!isInbound && isBot && (
          <div className="flex items-center gap-1.5 mb-1 opacity-80">
            <Bot className="h-3 w-3" />
            <span className="text-xs font-medium">IA • Clique para treinar</span>
            <Sparkles className="h-3 w-3 ml-auto animate-pulse" />
          </div>
        )}
        {renderMediaContent()}
        <div className={cn(
          "flex items-center gap-1 mt-1",
          isInbound ? "text-muted-foreground" : "opacity-70 justify-end"
        )}>
          <span className="text-[10px]">
            {format(new Date(message.created_at), 'HH:mm', { locale: ptBR })}
          </span>
          {!isInbound && (
            (() => {
              const metadata = message.metadata as any;
              const isPlayed = metadata?.played_at;
              const isRead = !!message.read_at;
              const isDelivered = !!message.delivered_at;
 
              if (isPlayed || isRead) {
                return <CheckCheck className={cn("h-3 w-3 stroke-[3]", isPlayed ? "text-blue-500" : "text-blue-400")} />;
              }
              if (isDelivered) {
                return <CheckCheck className="h-3 w-3 stroke-[2]" />;
              }
              return <Check className="h-3 w-3 opacity-70 stroke-[2]" />;
            })()
          )}
        </div>
      </div>

      {!isInbound && (
        <div className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden",
          isBot
            ? "bg-gradient-to-br from-primary to-purple-500"
            : "bg-gradient-to-br from-green-500 to-emerald-500"
        )}>
          {isBot ? (
            <Bot className="h-4 w-4 text-white" />
          ) : senderAvatar ? (
            <img src={senderAvatar} alt={senderName || 'Sender'} className="h-8 w-8 object-cover" />
          ) : (
            <span className="text-xs font-medium text-white">
              {senderName ? senderName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : <User className="h-4 w-4" />}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

