import { Contact } from '@/hooks/useContacts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, MessageSquare, Kanban, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDeleteContact } from '@/hooks/useContacts';
import { useState } from 'react';
import { usePipelines, usePipelineColumns, useMoveConversation } from '@/hooks/usePipelines';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ContactListItemProps {
  contact: Contact;
  onSelect: (contact: Contact) => void;
  isSelected: boolean;
  onToggleSelect: (contactId: string) => void;
}

const getInitials = (name: string | null, phone: string) => {
  if (name) {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  }
  return phone.slice(-2);
};

const formatPhoneNumber = (phone: string) => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 13) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  if (cleaned.length === 12) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
  }
  return phone;
};

export function ContactListItem({ contact, onSelect, isSelected, onToggleSelect }: ContactListItemProps) {
  const hasName = !!contact.name;
  const formattedPhone = formatPhoneNumber(contact.phone);
  const metadata = contact.metadata as { note?: string } | null;
  const note = metadata?.note;
  const deleteContact = useDeleteContact();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isMovingToPipeline, setIsMovingToPipeline] = useState(false);
  const { data: pipelines } = usePipelines();
  const moveConversation = useMoveConversation();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const handleMoveToPipeline = async (pipelineId: string, columnId: string) => {
    setIsMovingToPipeline(true);
    try {
      if (!profile?.organization_id) throw new Error("Organização não encontrada");

      const { data: activeInstance } = await supabase
        .from('whatsapp_instances')
        .select('id, phone_number')
        .eq('organization_id', profile.organization_id)
        .eq('status', 'connected')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 1. Check if an active conversation exists
      let conversationId = null;
      let existingConversationQuery = supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contact.id)
        .eq('organization_id', profile.organization_id)
        .in('status', ['open', 'pending']);

      existingConversationQuery = activeInstance?.id
        ? existingConversationQuery.eq('whatsapp_instance_id', activeInstance.id)
        : existingConversationQuery.is('whatsapp_instance_id', null);

      const { data: existingConv } = await existingConversationQuery.maybeSingle();

      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        // 2. Create one if it doesn't exist
        const { data: newConv, error } = await supabase
          .from('conversations')
          .insert({
            contact_id: contact.id,
            organization_id: profile.organization_id,
            whatsapp_instance_id: activeInstance?.id || null,
            source_phone: activeInstance?.phone_number || null,
            status: 'pending',
            service_mode: 'ia',
          })
          .select('id')
          .single();

        if (error) throw error;
        conversationId = newConv.id;
      }

      // 3. Move it to the pipeline
      await moveConversation.mutateAsync({
        conversationId: conversationId,
        pipelineId,
        columnId,
      });

      toast({
        title: 'Adicionado ao Pipeline',
        description: 'O contato foi movido para o pipeline com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });

    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Não foi possível adicionar ao pipeline.',
        variant: 'destructive',
      });
    } finally {
      setIsMovingToPipeline(false);
    }
  };

  const handleDelete = () => {
    deleteContact.mutate(contact.id);
    setShowDeleteConfirm(false);
  };

  return (
    <>
      <div
        onClick={() => onSelect(contact)}
        className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer transition-colors group"
      >
        {/* Selection checkbox */}
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(contact.id)}
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0"
        />

        {/* Avatar - Smaller */}
        <Avatar className="h-9 w-9 flex-shrink-0">
          <AvatarImage src={contact.avatar_url || undefined} />
          <AvatarFallback className="bg-gradient-to-br from-primary/20 to-purple-500/20 text-primary text-xs font-semibold">
            {getInitials(contact.name, contact.phone)}
          </AvatarFallback>
        </Avatar>

        {/* Content - Compact */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {/* Name or Phone as primary */}
            <span data-sensitive className="font-medium text-sm text-foreground truncate">
              {contact.name || formattedPhone}
            </span>
            {/* Quick Note Badge */}
            {note && (
              <span
                className="text-[9px] px-1 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded truncate max-w-[80px] flex-shrink-0"
                title={note}
              >
                {note}
              </span>
            )}
          </div>

          {/* Phone (if has name) + Tags inline */}
          <div className="flex items-center gap-1.5 mt-0.5">
            {hasName && (
              <span data-sensitive className="text-[10px] text-muted-foreground truncate">
                {formattedPhone}
              </span>
            )}
            {/* Tags - Show max 2 */}
            {contact.tags && contact.tags.length > 0 && (
              <>
                {hasName && <span className="text-muted-foreground text-[10px]">•</span>}
                {contact.tags.slice(0, 2).map(({ tag }) => (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    className="text-[9px] px-1 py-0 h-4"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </Badge>
                ))}
                {contact.tags.length > 2 && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                    +{contact.tags.length - 2}
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right side - Date + Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Date */}
          <span className="hidden sm:inline text-[10px] text-muted-foreground">
            {format(parseISO(contact.created_at), "dd/MM/yy", { locale: ptBR })}
          </span>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="z-50 bg-popover"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onSelect={() => onSelect(contact)}>
                Ver detalhes
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/conversations" className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Ver conversa
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={isMovingToPipeline} onSelect={(e) => e.preventDefault()}>
                  {isMovingToPipeline ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Kanban className="h-4 w-4 mr-2" />
                  )}
                  Adicionar ao Pipeline
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56" onClick={(e) => e.stopPropagation()}>
                  {!pipelines || pipelines.length === 0 ? (
                    <DropdownMenuItem disabled>Nenhum pipeline criado</DropdownMenuItem>
                  ) : (
                    pipelines.map(pipeline => (
                      <PipelineSubmenu
                        key={pipeline.id}
                        pipeline={pipeline}
                        onSelectColumn={(columnId) => handleMoveToPipeline(pipeline.id, columnId)}
                      />
                    ))
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                onSelect={() => setShowDeleteConfirm(true)}
                className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/50"
              >
                Excluir contato
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este contato? As conversas e dados associados a ele também poderão ser perdidos no sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Subcomponent for pipeline columns
function PipelineSubmenu({
  pipeline,
  onSelectColumn
}: {
  pipeline: { id: string; name: string };
  onSelectColumn: (columnId: string) => void;
}) {
  const { data: columns } = usePipelineColumns(pipeline.id);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger onSelect={(e) => e.preventDefault()}>{pipeline.name}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent onClick={(e) => e.stopPropagation()}>
        {!columns || columns.length === 0 ? (
          <DropdownMenuItem disabled>Sem colunas</DropdownMenuItem>
        ) : (
          columns.map(column => (
            <DropdownMenuItem
              key={column.id}
              onSelect={() => onSelectColumn(column.id)}
            >
              <div
                className="h-2 w-2 rounded-full mr-2"
                style={{ backgroundColor: column.color || '#888' }}
              />
              {column.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
