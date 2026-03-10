import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserPlus, X, Check } from 'lucide-react';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useConversationShares, useShareConversation, useUnshareConversation } from '@/hooks/useConversationShares';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface ShareConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  contactName?: string;
}

export function ShareConversationDialog({ open, onOpenChange, conversationId, contactName }: ShareConversationDialogProps) {
  const [search, setSearch] = useState('');
  const { data: teamMembers = [], isLoading: loadingMembers } = useTeamMembers();
  const { user } = useAuth();
  const shareConversation = useShareConversation();
  const unshareConversation = useUnshareConversation();

  // Fetch existing shares for this conversation
  const { data: existingShares = [] } = useQuery({
    queryKey: ['conversation-shares-for', conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_shares' as any)
        .select('*')
        .eq('conversation_id', conversationId);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: open && !!conversationId,
  });

  const sharedUserIds = existingShares.map((s: any) => s.user_id);

  // Filter members (exclude current user, owners, admins)
  const filteredMembers = teamMembers.filter(m => {
    if (m.user_id === user?.id) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return m.name?.toLowerCase().includes(q) || m.phone?.includes(q);
    }
    return true;
  });

  const handleToggle = async (memberId: string) => {
    const isShared = sharedUserIds.includes(memberId);
    try {
      if (isShared) {
        await unshareConversation.mutateAsync({ conversationId, userId: memberId });
        toast({ title: 'Acesso removido' });
      } else {
        await shareConversation.mutateAsync({ conversationId, userId: memberId });
        toast({ title: 'Lead compartilhado' });
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Compartilhar Lead
          </DialogTitle>
          <DialogDescription>
            {contactName 
              ? `Compartilhe "${contactName}" com membros específicos da equipe.`
              : 'Compartilhe este lead com membros específicos da equipe.'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Buscar membro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="max-h-64 overflow-y-auto space-y-1">
            {loadingMembers ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum membro encontrado
              </p>
            ) : (
              filteredMembers.map(member => {
                const isShared = sharedUserIds.includes(member.user_id);
                return (
                  <button
                    key={member.user_id}
                    onClick={() => handleToggle(member.user_id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left border ${
                      isShared
                        ? 'bg-green-500/10 border-green-500/20 hover:bg-green-500/15'
                        : 'border-transparent hover:bg-muted/50'
                    }`}
                    disabled={shareConversation.isPending || unshareConversation.isPending}
                  >
                    <Avatar className={`h-8 w-8 ${isShared ? 'ring-2 ring-green-500' : ''}`}>
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">
                        {member.name?.charAt(0)?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.role}</p>
                    </div>
                    {isShared ? (
                      <Badge className="gap-1 text-xs bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                        <Check className="h-3 w-3" />
                        Compartilhado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Adicionar
                      </Badge>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
