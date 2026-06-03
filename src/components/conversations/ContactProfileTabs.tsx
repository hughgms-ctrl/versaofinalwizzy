import { useState } from 'react';
import { User, Star, Calendar, FileText, StickyNote, ChevronUp, Clock, FileSignature } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DbConversation } from '@/hooks/useConversations';
import { ContactNotesSection } from './ContactNotesSection';
import { ContactFilesSection } from './ContactFilesSection';
import { ContactContractsSection } from './ContactContractsSection';
import { ContactLogsSection } from './ContactLogsSection';
import { CreateScheduledMessageDialog } from '@/components/scheduled/CreateScheduledMessageDialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type TabId = 'profile' | 'favorites' | 'scheduled' | 'files' | 'contracts' | 'notes' | 'timeline';

interface ContactProfileTabsProps {
  conversation: DbConversation;
  contactId: string;
}

const tabs: { id: TabId; icon: typeof User; label: string }[] = [
  { id: 'profile', icon: User, label: 'Perfil' },
  { id: 'timeline', icon: Clock, label: 'Timeline' },
  { id: 'favorites', icon: Star, label: 'Favoritos' },
  { id: 'scheduled', icon: Calendar, label: 'Agendamentos' },
  { id: 'files', icon: FileText, label: 'Arquivos' },
  { id: 'contracts', icon: FileSignature, label: 'Contratos' },
  { id: 'notes', icon: StickyNote, label: 'Notas' },
];

export function ContactProfileTabs({ conversation, contactId }: ContactProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);

  // Fetch scheduled messages for this contact
  const { data: scheduledMessages } = useQuery({
    queryKey: ['scheduled-messages-contact', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduled_messages')
        .select('*')
        .eq('contact_id', contactId)
        .in('status', ['pending', 'scheduled'])
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: activeTab === 'scheduled',
  });




  const handleTabClick = (tabId: TabId) => {
    if (activeTab === tabId) {
      setActiveTab(null);
    } else {
      setActiveTab(tabId);
    }
  };

  const isOpen = activeTab !== null && activeTab !== 'profile';

  return (
    <div className="relative">
      {/* Tab Bar */}
      <div className="flex items-center justify-center border-b border-border bg-card">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center p-3 border-b-2 transition-colors",
                isActive 
                  ? "border-primary text-primary" 
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              title={tab.label}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {/* Overlay Content Panel */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-20 bg-card border-b border-border shadow-lg max-h-[300px] overflow-y-auto">
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                {tabs.find(t => t.id === activeTab)?.label}
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0"
                onClick={() => setActiveTab(null)}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
            </div>

            {activeTab === 'timeline' && (
              <ContactLogsSection conversationId={conversation.id} />
            )}

            {activeTab === 'favorites' && (
              <div className="text-center text-sm text-muted-foreground py-6">
                <Star className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>Nenhum favorito ainda</p>
                <p className="text-xs mt-1">Marque mensagens importantes como favoritas</p>
              </div>
            )}

            {activeTab === 'scheduled' && (
              <div className="space-y-3">
                <div className="flex items-center justify-end">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-xs"
                    onClick={() => setIsScheduleOpen(true)}
                  >
                    + Agendar
                  </Button>
                </div>
                
                {scheduledMessages && scheduledMessages.length > 0 ? (
                  <div className="space-y-2">
                    {scheduledMessages.map((msg) => (
                      <div 
                        key={msg.id} 
                        className="p-2 bg-muted/50 rounded-lg text-sm space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-[10px]">
                            {format(new Date(msg.scheduled_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {msg.content_type === 'message' ? 'Mensagem' : 'Fluxo'}
                          </Badge>
                        </div>
                        {msg.message_content && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {msg.message_content}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-sm text-muted-foreground py-4">
                    <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p>Nenhum agendamento</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'files' && (
              <ContactFilesSection contactId={contactId} />
            )}

            {activeTab === 'contracts' && (
              <ContactContractsSection
                contactId={contactId}
                conversationId={conversation.id}
                contactName={conversation.contact?.name}
                contactPhone={conversation.contact?.phone}
                contactEmail={conversation.contact?.email}
              />
            )}

            {activeTab === 'notes' && (
              <ContactNotesSection contactId={contactId} />
            )}
          </div>
        </div>
      )}

      {/* Schedule Dialog */}
      <CreateScheduledMessageDialog 
        open={isScheduleOpen}
        onOpenChange={setIsScheduleOpen}
        defaultContactId={contactId}
      />
    </div>
  );
}
