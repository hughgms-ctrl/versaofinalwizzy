import { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { MainLayout } from '@/components/layout/MainLayout';
import { useInfiniteContacts, useContactsCount, Contact, CustomFieldFilter } from '@/hooks/useContacts';
import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useContactFilterJoins, ContactFilterJoins } from '@/hooks/useContactFilterJoins';
import { contactAppearsInWorkspace } from '@/lib/contactWorkspaces';
import { parseISO, isBefore, isAfter, isSameDay } from 'date-fns';
import {
  Search,
  X,
  Users,
  Smartphone,
  Settings,
  Upload,
  Loader2,
  Tag as TagIcon,
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
import { ContactFilters, ContactFiltersState, FilterCondition, defaultContactFilters } from '@/components/contacts/ContactFilters';
import { ContactListItem } from '@/components/contacts/ContactListItem';
import { ContactBulkActionsBar } from '@/components/contacts/ContactBulkActionsBar';
import { NewContactDialog } from '@/components/contacts/NewContactDialog';
import { ImportContactsDialog } from '@/components/contacts/ImportContactsDialog';
import { BulkTagByPhoneDialog } from '@/components/contacts/BulkTagByPhoneDialog';
import { Checkbox } from '@/components/ui/checkbox';

function matchesCondition(contact: Contact, condition: FilterCondition, joins?: ContactFilterJoins): boolean {
  if (condition.field === 'created_at') {
    let targetDate: Date;
    let contactDate: Date;
    try {
      targetDate = new Date(condition.value);
      contactDate = parseISO(contact.created_at);
    } catch {
      return true;
    }
    if (condition.operator === 'before') return isBefore(contactDate, targetDate);
    if (condition.operator === 'after') return isAfter(contactDate, targetDate);
    return isSameDay(contactDate, targetDate);
  }

  const wantMatch = condition.operator !== 'is_not';

  if (condition.field === 'tag') {
    const has = !!contact.tags?.some(t => t.tag.id === condition.value);
    return has === wantMatch;
  }

  if (condition.field === 'workspace') {
    // Origem OU compartilhamento: o contato compartilhado aparece no workspace
    // sem que workspace_id mude (ver src/lib/contactWorkspaces.ts).
    const matches = contactAppearsInWorkspace(contact, condition.value);
    return matches === wantMatch;
  }

  if (condition.field === 'pipeline') {
    const matches = !!joins?.pipelineColumnsByContact.get(contact.id)?.has(condition.value);
    return matches === wantMatch;
  }

  if (condition.field === 'assigned_to') {
    const matches = !!joins?.assignedToByContact.get(contact.id)?.has(condition.value);
    return matches === wantMatch;
  }

  if (condition.field === 'custom_field') {
    // Mesma avaliação que o servidor faz em SQL. Roda também aqui porque no
    // modo "qualquer uma" (OU) o filtro NÃO é empurrado para o servidor -- lá,
    // empurrar uma condição de um OU excluiria linhas que outra condição
    // aprovaria. No modo "todas", esta passada é redundante e inofensiva.
    const raw = contact.metadata?.custom_fields?.[condition.fieldKey || ''];
    const value = raw === undefined || raw === null ? '' : String(raw);

    switch (condition.operator) {
      case 'is': return value === condition.value;
      case 'is_not': return value !== condition.value;
      case 'contains': return value.toLowerCase().includes(condition.value.toLowerCase());
      case 'is_empty': return value.trim() === '';
      case 'is_not_empty': return value.trim() !== '';
      default: return true;
    }
  }

  return true;
}

const ContactsPage = () => {
  const [searchQuery, setSearchQuery] = useState('');

  // Debounce de 300ms: a busca agora roda no servidor (alcança a base inteira,
  // não só as páginas já carregadas), então não dispara a cada tecla.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const [filters, setFilters] = useState<ContactFiltersState>(defaultContactFilters);

  // Campo personalizado é o único filtro avançado que vai para o SERVIDOR: a
  // pergunta ("quem respondeu X") não pode depender de quanto a pessoa rolou a
  // lista. Só no modo "todas as condições" (E) -- empurrar uma condição de um
  // OU excluiria linhas que outra condição do mesmo OU aprovaria.
  const customFieldFilters = useMemo(() => {
    if (filters.matchMode !== 'all') return [];
    return filters.conditions
      .filter((c) => c.field === 'custom_field' && c.fieldKey)
      .map((c) => ({
        key: c.fieldKey!,
        operator: c.operator as CustomFieldFilter['operator'],
        value: c.value,
      }));
  }, [filters]);

  const {
    data: contactsPages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteContacts(debouncedSearch, customFieldFilters);
  const { data: totalCount } = useContactsCount(debouncedSearch, customFieldFilters);
  const { connected: whatsappConnected, isLoading: whatsappLoading } = useWhatsAppStatus();
  const { selectedWorkspaceId } = useWorkspaceContext();
  const { data: filterJoins } = useContactFilterJoins();

  const contacts = useMemo(
    () => contactsPages?.pages.flat() ?? [],
    [contactsPages]
  );

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showNewContactDialog, setShowNewContactDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showBulkTagDialog, setShowBulkTagDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter contacts
  const filteredContacts = useMemo(() => {
    if (!contacts) return [];

    return contacts.filter(contact => {
      // === WORKSPACE FILTER ===
      // O servidor já devolve exatamente os contatos deste workspace (origem +
      // compartilhados -- ver applyWorkspaceFilter). Este passo repete a MESMA
      // regra no cliente: comparar workspace_id cru aqui derrubava justamente o
      // contato compartilhado que o servidor tinha acabado de trazer, e o
      // usuário via "já existe/compartilhado" sem nunca achar o contato aqui.
      if (selectedWorkspaceId && !contactAppearsInWorkspace(contact, selectedWorkspaceId)) {
        return false;
      }

      // A busca por texto é aplicada no servidor (useInfiniteContacts), pra
      // alcançar a base inteira e não só as páginas já carregadas.

      // Condições do filtro avançado (tag/workspace/pipeline/data/responsável).
      // matchMode 'all' = precisa bater em todas (E); 'any' = basta bater em uma (OU).
      if (filters.conditions.length > 0) {
        const matches = filters.matchMode === 'any'
          ? filters.conditions.some(condition => matchesCondition(contact, condition, filterJoins))
          : filters.conditions.every(condition => matchesCondition(contact, condition, filterJoins));
        if (!matches) return false;
      }

      return true;
    });
  }, [contacts, filters, selectedWorkspaceId, filterJoins]);

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

  // Virtualização: só renderiza as linhas visíveis. A lista cresce conforme o
  // scroll (páginas de CONTACTS_PAGE_SIZE), então pode ficar grande.
  const listParentRef = useRef<HTMLDivElement>(null);

  // Uma linha extra no fim serve de sentinela: quando ela entra em cena, busca
  // a próxima página.
  const rowCount = filteredContacts.length + (hasNextPage ? 1 : 0);
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 57,
    overscan: 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastVirtualIndex = virtualItems.length ? virtualItems[virtualItems.length - 1].index : -1;

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    if (lastVirtualIndex >= filteredContacts.length - 1) {
      fetchNextPage();
    }
  }, [lastVirtualIndex, hasNextPage, isFetchingNextPage, filteredContacts.length, fetchNextPage]);

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

        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setShowImportDialog(true)}
        >
          <Upload className="mr-2 h-3.5 w-3.5" />
          Importar
        </Button>

        {/* A barra de ações em massa age sobre o que está SELECIONADO na lista,
            que serve para dez contatos já achados. Marcar cinquenta presenças
            depois de um evento é outro problema: a lista de telefones está na
            mão e não dá para caçar cada um na tela. */}
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setShowBulkTagDialog(true)}
        >
          <TagIcon className="mr-2 h-3.5 w-3.5" />
          Tag por lista
        </Button>
      </div>

      {/* Bulk actions bar */}
      {selectedContacts.length > 0 && (
        <ContactBulkActionsBar
          selectedContacts={selectedContacts}
          onClearSelection={clearSelection}
        />
      )}

      {/* Contador: quantos já carregaram vs. o total */}
      {!isLoading && filteredContacts.length > 0 && (
        <div className="mb-2 text-xs text-muted-foreground px-1">
          {typeof totalCount === 'number' && contacts.length < totalCount
            ? `Mostrando ${filteredContacts.length.toLocaleString('pt-BR')} de ${totalCount.toLocaleString('pt-BR')} contatos — role para carregar mais.`
            : `${filteredContacts.length.toLocaleString('pt-BR')} contato(s)`}
          {/* Campo personalizado vai para o servidor no modo "todas" — a
              contagem acima já é da base inteira. Os outros filtros continuam
              client-side, e o aviso precisa dizer qual é qual. */}
          {filters.conditions.some((c) => c.field !== 'custom_field') && hasNextPage && (
            <span className="ml-1">Tag, workspace, pipeline, responsável e data se aplicam aos contatos já carregados.</span>
          )}
          {customFieldFilters.length === 0
            && filters.matchMode === 'any'
            && filters.conditions.some((c) => c.field === 'custom_field')
            && hasNextPage && (
            <span className="ml-1">No modo "qualquer uma", o filtro de campo personalizado também só vê os já carregados.</span>
          )}
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
              {searchQuery || filters.conditions.length > 0
                ? 'Tente ajustar os filtros para encontrar o que procura.'
                : 'Os contatos aparecerão aqui quando você receber mensagens.'}
            </p>
            {/* Filtro avançado escondeu tudo o que já veio, mas ainda há páginas:
                sem linhas visíveis não há scroll para disparar a próxima. */}
            {hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                {isFetchingNextPage && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Carregar mais contatos
              </Button>
            )}
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
                {virtualItems.map(virtualRow => {
                  const contact = filteredContacts[virtualRow.index];

                  // Linha sentinela do fim da lista: dispara/mostra o carregamento.
                  if (!contact) {
                    return (
                      <div
                        key="load-more"
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        className="absolute left-0 top-0 w-full"
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                      >
                        <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Carregando mais contatos...
                        </div>
                      </div>
                    );
                  }

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

      {/* Import Contacts Dialog */}
      <ImportContactsDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
      />

      {/* Aplicar tag colando uma lista de telefones (check-in, reengajamento) */}
      <BulkTagByPhoneDialog
        open={showBulkTagDialog}
        onOpenChange={setShowBulkTagDialog}
      />
    </MainLayout>
  );
};

export default ContactsPage;
