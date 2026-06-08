import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { useWhatsAppGroups, useSyncGroups, WhatsAppGroup } from '@/hooks/useWhatsAppGroups';
import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import { Search, X, UsersRound, Smartphone, Settings, RefreshCw, Plus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GroupListItem } from '@/components/groups/GroupListItem';
import { SendGroupMessageDialog } from '@/components/groups/SendGroupMessageDialog';
import { GroupParticipantsDialog } from '@/components/groups/GroupParticipantsDialog';
import { EditGroupDialog } from '@/components/groups/EditGroupDialog';
import { CreateGroupDialog } from '@/components/groups/CreateGroupDialog';

const GroupsPage = () => {
  const { data: groups, isLoading } = useWhatsAppGroups();
  const { connected: whatsappConnected, isLoading: whatsappLoading } = useWhatsAppStatus();
  const syncGroups = useSyncGroups();

  const [searchQuery, setSearchQuery] = useState('');
  const [sendGroup, setSendGroup] = useState<WhatsAppGroup | null>(null);
  const [showSend, setShowSend] = useState(false);
  const [participantsGroup, setParticipantsGroup] = useState<WhatsAppGroup | null>(null);
  const [editGroup, setEditGroup] = useState<WhatsAppGroup | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (!searchQuery.trim()) return groups;
    const query = searchQuery.toLowerCase().trim();
    return groups.filter(g => (g.name?.toLowerCase().includes(query) || g.group_jid.includes(query)));
  }, [groups, searchQuery]);

  const openSend = (group: WhatsAppGroup | null) => {
    setSendGroup(group);
    setShowSend(true);
  };

  if (!whatsappLoading && !whatsappConnected) {
    return (
      <MainLayout title="Grupos" subtitle="Gerencie seus grupos de WhatsApp" showSearch={false}>
        <div className="flex items-center justify-center h-64">
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
    <MainLayout title="Grupos" subtitle="Gerencie seus grupos de WhatsApp" showSearch={false}>
      {/* Actions bar */}
      <div className="flex items-center gap-2 md:gap-3 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[150px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar grupos..."
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

        <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => syncGroups.mutate()} disabled={syncGroups.isPending}>
          {syncGroups.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Sincronizar
        </Button>
        <Button size="sm" className="gap-1.5 h-8" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" /> Criar grupo
        </Button>
      </div>

      {/* Groups list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2.5">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <UsersRound className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">Nenhum grupo encontrado</p>
            <p className="text-sm text-center mt-2 max-w-md">
              {searchQuery
                ? 'Tente ajustar a busca.'
                : 'Clique em "Sincronizar" para importar os grupos da sua instância do WhatsApp.'}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-14rem)]">
            <div className="divide-y divide-border">
              {filteredGroups.map(group => (
                <GroupListItem
                  key={group.id}
                  group={group}
                  onSend={openSend}
                  onParticipants={(g) => setParticipantsGroup(g)}
                  onEdit={(g) => setEditGroup(g)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <SendGroupMessageDialog
        open={showSend}
        onOpenChange={setShowSend}
        groups={groups || []}
        initialGroup={sendGroup}
      />
      <GroupParticipantsDialog
        open={!!participantsGroup}
        onOpenChange={(o) => !o && setParticipantsGroup(null)}
        group={participantsGroup}
      />
      <EditGroupDialog
        open={!!editGroup}
        onOpenChange={(o) => !o && setEditGroup(null)}
        group={editGroup}
      />
      <CreateGroupDialog open={showCreate} onOpenChange={setShowCreate} />
    </MainLayout>
  );
};

export default GroupsPage;
