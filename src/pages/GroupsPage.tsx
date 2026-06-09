import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { useWhatsAppGroups, useSyncGroups, WhatsAppGroup } from '@/hooks/useWhatsAppGroups';
import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import { Search, X, UsersRound, Smartphone, Settings, RefreshCw, Plus, Loader2, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { GroupListItem } from '@/components/groups/GroupListItem';
import { GroupChatPanel } from '@/components/groups/GroupChatPanel';
import { CreateGroupDialog } from '@/components/groups/CreateGroupDialog';

const GroupsPage = () => {
  const { data: groups, isLoading } = useWhatsAppGroups();
  const { connected: whatsappConnected, isLoading: whatsappLoading } = useWhatsAppStatus();
  const syncGroups = useSyncGroups();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<WhatsAppGroup | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (!searchQuery.trim()) return groups;
    const query = searchQuery.toLowerCase().trim();
    return groups.filter(g => (g.name?.toLowerCase().includes(query) || g.group_jid.includes(query)));
  }, [groups, searchQuery]);

  if (!whatsappLoading && !whatsappConnected) {
    return (
      <MainLayout title="Grupos" subtitle="Gerencie seus grupos de WhatsApp" showSearch={false} fullWidth>
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center p-8 max-w-md">
            <div className="h-20 w-20 rounded-2xl bg-yellow-500/10 flex items-center justify-center mx-auto mb-6">
              <Smartphone className="h-10 w-10 text-yellow-500" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Conecte seu WhatsApp</h2>
            <p className="text-muted-foreground mb-6">
              Para visualizar seus grupos, conecte seu WhatsApp nas configurações.
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
    <MainLayout title="Grupos" subtitle="Gerencie seus grupos de WhatsApp" showSearch={false} fullWidth>
      <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {/* Groups List - left */}
          <div className={cn(
            "border-r border-border bg-card flex-shrink-0 overflow-hidden flex flex-col",
            "w-full md:w-80 lg:w-96 md:min-w-[320px] md:max-w-96",
            selectedGroup && "hidden md:flex"
          )}>
            {/* Search + actions */}
            <div className="p-2 border-b border-border flex flex-col gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar grupos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 bg-secondary/50 border-0 text-sm"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 flex-1"
                  onClick={() => syncGroups.mutate()}
                  disabled={syncGroups.isPending}
                >
                  {syncGroups.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Sincronizar
                </Button>
                <Button size="sm" className="gap-1.5 h-8 flex-1" onClick={() => setShowCreate(true)}>
                  <Plus className="h-3.5 w-3.5" /> Criar grupo
                </Button>
              </div>
            </div>

            {/* List content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {isLoading ? (
                <div className="divide-y divide-border">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-3.5 w-1/3" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                  <UsersRound className="h-16 w-16 mb-4 opacity-30" />
                  <p className="text-lg font-medium text-center">Nenhum grupo encontrado</p>
                  <p className="text-sm text-center mt-2 max-w-md">
                    {searchQuery
                      ? 'Tente ajustar a busca.'
                      : 'Clique em "Sincronizar" para importar os grupos da sua instância do WhatsApp.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredGroups.map(group => (
                    <GroupListItem
                      key={group.id}
                      group={group}
                      selected={selectedGroup?.id === group.id}
                      onSelect={setSelectedGroup}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Group Chat - right */}
          <div className={cn(
            "flex-1 min-w-0 overflow-hidden flex flex-col",
            !selectedGroup && "hidden md:flex"
          )}>
            {selectedGroup ? (
              <div className="h-full flex flex-col">
                {/* Mobile back button */}
                <div className="md:hidden flex items-center gap-2 p-2 border-b border-border bg-card flex-shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedGroup(null)}>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Voltar
                  </Button>
                  <span className="text-sm font-medium truncate">
                    {selectedGroup.name || selectedGroup.group_jid}
                  </span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <GroupChatPanel group={selectedGroup} key={selectedGroup.id} />
                </div>
              </div>
            ) : (
              <div className="hidden md:flex flex-col items-center justify-center h-full text-muted-foreground">
                <UsersRound className="h-16 w-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">Selecione um grupo</p>
                <p className="text-sm">Escolha um grupo da lista para visualizar</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateGroupDialog open={showCreate} onOpenChange={setShowCreate} />
    </MainLayout>
  );
};

export default GroupsPage;
