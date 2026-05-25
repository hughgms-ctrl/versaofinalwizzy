import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { useContacts, Contact } from '@/hooks/useContacts';
import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { isWithinInterval, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Search,
  X,
  Users,
  Smartphone,
  Settings,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ContactProfilePanel } from '@/components/conversations/ContactProfilePanel';
import { ContactFilters, ContactFiltersState, defaultContactFilters } from '@/components/contacts/ContactFilters';
import { ContactListItem } from '@/components/contacts/ContactListItem';
import { NewContactDialog } from '@/components/contacts/NewContactDialog';

const ContactsPage = () => {
  const { data: contacts, isLoading } = useContacts();
  const { connected: whatsappConnected, isLoading: whatsappLoading } = useWhatsAppStatus();
  const { selectedWorkspace, selectedWorkspaceId } = useWorkspaceContext();

  // Fetch contact tags for workspace filtering
  const { data: allContactTags = [] } = useQuery({
    queryKey: ['all-contact-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_tags')
        .select('contact_id, tag_id');
      if (error) throw error;
      return data || [];
    },
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<ContactFiltersState>(defaultContactFilters);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showNewContactDialog, setShowNewContactDialog] = useState(false);

  // Filter contacts
  const filteredContacts = useMemo(() => {
    if (!contacts) return [];

    return contacts.filter(contact => {
      // === WORKSPACE FILTER ===
      if (selectedWorkspaceId && selectedWorkspace) {
        const workspaceTagIds = selectedWorkspace.filter_tag_ids || [];
        if (workspaceTagIds.length > 0) {
          const contactTagIds = allContactTags?.filter(ct => ct.contact_id === contact.id).map(ct => ct.tag_id) || [];
          const hasWorkspaceTag = workspaceTagIds.some(tagId => contactTagIds.includes(tagId));
          if (!hasWorkspaceTag) return false;
        }
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const name = contact.name?.toLowerCase() || '';
        const phone = contact.phone.toLowerCase();
        const email = contact.email?.toLowerCase() || '';
        if (!name.includes(query) && !phone.includes(query) && !email.includes(query)) {
          return false;
        }
      }

      // Tag filter
      if (filters.tagFilter !== 'all') {
        const hasTag = contact.tags?.some(t => t.tag.id === filters.tagFilter);
        if (!hasTag) return false;
      }

      // Date filter
      if (filters.dateRange.from) {
        const contactDate = parseISO(contact.created_at);
        const from = filters.dateRange.from;
        const to = filters.dateRange.to || filters.dateRange.from;
        if (!isWithinInterval(contactDate, { start: from, end: to })) {
          return false;
        }
      }

      return true;
    });
  }, [contacts, searchQuery, filters, selectedWorkspaceId, selectedWorkspace, allContactTags]);

  // Show disconnected state if WhatsApp is not connected
  if (!whatsappLoading && !whatsappConnected) {
    return (
      <MainLayout
        title="Contatos"
        subtitle="Gerencie todos os seus contatos"
        showSearch={false}
        showNewButton={true}
        onNewClick={() => setShowNewContactDialog(true)}
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center p-8 max-w-md">
            <div className="h-20 w-20 rounded-2xl bg-yellow-500/10 flex items-center justify-center mx-auto mb-6">
              <Smartphone className="h-10 w-10 text-yellow-500" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Conecte seu WhatsApp</h2>
            <p className="text-muted-foreground mb-6">
              Para visualizar seus contatos, você precisa conectar seu WhatsApp nas configurações.
            </p>
            <Button asChild>
              <Link to="/settings">
                <Settings className="h-4 w-4 mr-2" />
                Ir para Configurações
              </Link>
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title="Contatos"
      subtitle="Gerencie todos os seus contatos"
      showSearch={false}
      showNewButton={true}
      onNewClick={() => setShowNewContactDialog(true)}
    >
      {/* Filters Bar */}
      <div className="flex items-center gap-2 md:gap-3 mb-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[150px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar contatos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9 h-8 bg-secondary/50 border-0 text-sm"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Filters Component */}
        <ContactFilters
          filters={filters}
          onFiltersChange={setFilters}
          filteredCount={filteredContacts.length}
        />
      </div>

      {/* Contacts List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Users className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">Nenhum contato encontrado</p>
            <p className="text-sm text-center mt-2 max-w-md">
              {searchQuery || filters.tagFilter !== 'all' || filters.datePreset !== 'all'
                ? 'Tente ajustar os filtros para encontrar o que procura.'
                : 'Os contatos aparecerão aqui quando você receber mensagens.'}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-14rem)]">
            <div className="divide-y divide-border">
              {filteredContacts.map(contact => (
                <ContactListItem
                  key={contact.id}
                  contact={contact}
                  onSelect={setSelectedContact}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Contact Detail Dialog */}
      {selectedContact && (
        <Dialog open={!!selectedContact} onOpenChange={() => setSelectedContact(null)}>
          <DialogContent className="max-w-lg p-0 max-h-[80vh] overflow-hidden">
            <DialogHeader className="sr-only">
              <DialogTitle>Detalhes do contato</DialogTitle>
              <DialogDescription>Visualizacao e edicao das informacoes do contato selecionado.</DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto max-h-[80vh]">
              <ContactProfilePanel
                conversation={{
                  id: '',
                  contact_id: selectedContact.id,
                  organization_id: selectedContact.organization_id,
                  status: 'open',
                  unread_count: 0,
                  last_message_at: null,
                  assigned_to: null,
                   ai_agent_id: null,
                   metadata: null,
                   closed_at: null,
                  created_at: selectedContact.created_at,
                  updated_at: selectedContact.updated_at,
                  contact: {
                    id: selectedContact.id,
                    name: selectedContact.name,
                    phone: selectedContact.phone,
                    avatar_url: selectedContact.avatar_url,
                    email: selectedContact.email,
                    created_at: selectedContact.created_at,
                    metadata: selectedContact.metadata,
                  },
                  last_message: null,
                }}
                onClose={() => setSelectedContact(null)}
                embedded
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* New Contact Dialog */}
      <NewContactDialog
        open={showNewContactDialog}
        onOpenChange={setShowNewContactDialog}
      />
    </MainLayout>
  );
};

export default ContactsPage;

