import { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MainLayout } from '@/components/layout/MainLayout';
import { useContacts, Contact, CONTACTS_CAP } from '@/hooks/useContacts';
import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { isWithinInterval, parseISO } from 'date-fns';
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
import { ContactBulkActionsBar } from '@/components/contacts/ContactBulkActionsBar';
import { NewContactDialog } from '@/components/contacts/NewContactDialog';
import { Checkbox } from '@/components/ui/checkbox';

const ContactsPage = () => {
  const { data: contacts, isLoading } = useContacts();
  const { connected: whatsappConnected, isLoading: whatsappLoading } = useWhatsAppStatus();
  const { selectedWorkspace, selectedWorkspaceId } = useWorkspaceContext();

  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<ContactFiltersState>(defaultContactFilters);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showNewContactDialog, setShowNewContactDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter contacts
  const filteredContacts = useMemo(() => {
    if (!contacts) return [];

    return contacts.filter(contact => {
      // === WORKSPACE FILTER ===
      if (selectedWorkspaceId) {
        if (selectedWorkspaceId === 'unassigned') {
          if ((contact as any).workspace_id) return false;
        } else if (selectedWorkspace) {
          if ((contact as any).workspace_id !== selectedWorkspaceId) return false;
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

      // Tag filter (é / não é)
      if (filters.tagFilter !== 'all') {
        const hasTag = !!contact.tags?.some(t => t.tag.id === filters.tagFilter);
        const wantHasTag = filters.tagOperator !== 'is_not';
        if (hasTag !== wantHasTag) return false;
      }

      // Workspace filter (é / não é) — independente do seletor de workspace global
      if (filters.workspaceFilter !== 'all') {
        const contactWorkspaceId = (contact as any).workspace_id ?? null;
        const matchesWorkspace = filters.workspaceFilter === 'unassigned'
          ? !contactWorkspaceId
          : contactWorkspaceId === filters.workspaceFilter;
        const wantMatch = filters.workspaceOperator !== 'is_not';
        if (matchesWorkspace !== wantMatch) return false;
      }

      // Nota filter
      if (filters.hasNote !== 'all') {
        const hasNote = !!(contact.metadata as { note?: string } | null)?.note;
        if (filters.hasNote === 'yes' && !hasNote) return false;
        if (filters.hasNote === 'no' && hasNote) return false;
      }

      // E-mail filter
      if (filters.hasEmail !== 'all') {
        const hasEmail = !!contact.email;
        if (filters.hasEmail === 'yes' && !hasEmail) return false;
        if (filters.hasEmail === 'no' && hasEmail) return false;
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
  }, [contacts, searchQuery, filters, selectedWorkspaceId, selectedWorkspace]);

  // Seleção múltipla para ações em massa
  const selectedContacts = useMemo(
    () => (contacts ?? []).filter(c => selectedIds.has(c.id)),
    [contacts, selectedIds]
  );
  const allFilteredSelected = filteredContacts.length > 0 && filteredContacts.every(c => selectedIds.has(c.id));
  const someFilteredSelected = filteredContacts.some(c => selectedIds.has(c.id));

  const toggleSelectContact = (contactId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filteredContacts.forEach(c => next.delete(c.id));
        return next;
      }
      const next = new Set(prev);
      filteredContacts.forEach(c => next.add(c.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Aviso quando a lista atingiu o teto server-side (busca/filtros operam só
  // sobre os CONTACTS_CAP mais recentes carregados).
  const capReached = (contacts?.length ?? 0) >= CONTACTS_CAP;

  // Virtualização: só renderiza as linhas visíveis (lista pode ter ~1000 itens).
  const listParentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredContacts.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 57,
    overscan: 10,
  });

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

      {/* Cap reached notice */}
      {capReached && (
        <div className="mb-2 text-xs text-muted-foreground bg-secondary/40 rounded-md px-3 py-1.5">
          Mostrando os {CONTACTS_CAP.toLocaleString('pt-BR')} contatos mais recentes. A busca e os filtros operam sobre esse conjunto — contatos mais antigos podem não aparecer.
        </div>
      )}

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
              {searchQuery || filters.tagFilter !== 'all' || filters.workspaceFilter !== 'all' || filters.hasNote !== 'all' || filters.hasEmail !== 'all' || filters.datePreset !== 'all'
                ? 'Tente ajustar os filtros para encontrar o que procura.'
                : 'Os contatos aparecerão aqui quando você receber mensagens.'}
            </p>
          </div>
        ) : (
          <>
            {/* Select-all header */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-secondary/30">
              <Checkbox
                checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-xs text-muted-foreground">
                {someFilteredSelected ? `${selectedIds.size} selecionado(s)` : 'Selecionar todos'}
              </span>
            </div>
            <div
              ref={listParentRef}
              className="h-[calc(100vh-16rem)] overflow-y-auto"
            >
              <div
                style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}
              >
                {rowVirtualizer.getVirtualItems().map(virtualRow => {
                  const contact = filteredContacts[virtualRow.index];
                  return (
                    <div
                      key={contact.id}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="absolute left-0 top-0 w-full border-b border-border"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <ContactListItem
                        contact={contact}
                        onSelect={setSelectedContact}
                        isSelected={selectedIds.has(contact.id)}
                        onToggleSelect={toggleSelectContact}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bulk actions bar */}
      {selectedContacts.length > 0 && (
        <ContactBulkActionsBar
          selectedContacts={selectedContacts}
          onClearSelection={clearSelection}
        />
      )}

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
