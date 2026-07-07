import { useState } from 'react';
import { Contact } from '@/hooks/useContacts';
import { useTags } from '@/hooks/useTags';
import { useVisibleWorkspaces } from '@/hooks/useWorkspaces';
import { useCampaigns } from '@/hooks/useCampaigns';
import {
  useBulkAddTag,
  useBulkRemoveTag,
  useBulkMoveWorkspace,
  useBulkDeleteContacts,
  useBulkAddToCampaign,
} from '@/hooks/useContactBulkActions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Tag, FolderInput, Trash2, Download, Send, X, Loader2, SlidersHorizontal } from 'lucide-react';

interface ContactBulkActionsBarProps {
  selectedContacts: Contact[];
  onClearSelection: () => void;
}

// Máximo de contatos aceito na ação "Adicionar à campanha" numa única chamada
// (mesmo limite do lado do servidor em safe-record-actions/bulk_add_to_campaign).
const MAX_CAMPAIGN_BATCH = 100;

function downloadCsv(contacts: Contact[]) {
  const header = ['Nome', 'Telefone', 'E-mail', 'Tags'];
  const rows = contacts.map(c => [
    c.name || '',
    c.phone,
    c.email || '',
    (c.tags || []).map(t => t.tag.name).join('; '),
  ]);
  const csv = [header, ...rows]
    .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `contatos-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ContactBulkActionsBar({ selectedContacts, onClearSelection }: ContactBulkActionsBarProps) {
  const { data: tags } = useTags();
  const { data: workspaces } = useVisibleWorkspaces();
  const { data: campaigns } = useCampaigns();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const bulkAddTag = useBulkAddTag();
  const bulkRemoveTag = useBulkRemoveTag();
  const bulkMoveWorkspace = useBulkMoveWorkspace();
  const bulkDelete = useBulkDeleteContacts();
  const bulkAddToCampaign = useBulkAddToCampaign();

  const contactIds = selectedContacts.map(c => c.id);
  const isBusy = bulkAddTag.isPending || bulkRemoveTag.isPending || bulkMoveWorkspace.isPending || bulkDelete.isPending || bulkAddToCampaign.isPending;
  const activeCampaigns = campaigns?.filter(c => c.is_active);

  const handleAddTag = (tagId: string) => bulkAddTag.mutate({ contactIds, tagId });
  const handleRemoveTag = (tagId: string) => bulkRemoveTag.mutate({ contactIds, tagId });
  const handleMoveWorkspace = (workspaceId: string | null) => bulkMoveWorkspace.mutate({ contactIds, workspaceId });
  const handleAddToCampaign = (campaignId: string) =>
    bulkAddToCampaign.mutate({ contactIds: contactIds.slice(0, MAX_CAMPAIGN_BATCH), campaignId });

  const handleDelete = () => {
    bulkDelete.mutate(contactIds);
    setShowDeleteConfirm(false);
    onClearSelection();
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap rounded-xl border border-border bg-card px-3 py-2 mb-3">
        <span className="text-sm font-medium">{selectedContacts.length} selecionado(s)</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearSelection}>
          <X className="h-3.5 w-3.5 mr-1" />
          Limpar
        </Button>

        <div className="h-5 w-px bg-border mx-1" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" disabled={isBusy}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Ações
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 z-50 bg-popover">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Tag className="h-3.5 w-3.5 mr-2" />
                Adicionar tag
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-64 overflow-y-auto z-50 bg-popover">
                {tags?.map(tag => (
                  <DropdownMenuItem key={tag.id} onSelect={() => handleAddTag(tag.id)}>
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0 mr-2" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </DropdownMenuItem>
                ))}
                {!tags?.length && <DropdownMenuItem disabled>Nenhuma tag criada</DropdownMenuItem>}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Tag className="h-3.5 w-3.5 mr-2" />
                Remover tag
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-64 overflow-y-auto z-50 bg-popover">
                {tags?.map(tag => (
                  <DropdownMenuItem key={tag.id} onSelect={() => handleRemoveTag(tag.id)}>
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0 mr-2" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </DropdownMenuItem>
                ))}
                {!tags?.length && <DropdownMenuItem disabled>Nenhuma tag criada</DropdownMenuItem>}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="h-3.5 w-3.5 mr-2" />
                Mover de workspace
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-64 overflow-y-auto z-50 bg-popover">
                <DropdownMenuItem onSelect={() => handleMoveWorkspace(null)}>Sem workspace</DropdownMenuItem>
                {workspaces?.map(workspace => (
                  <DropdownMenuItem key={workspace.id} onSelect={() => handleMoveWorkspace(workspace.id)}>
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0 mr-2" style={{ backgroundColor: workspace.color }} />
                    {workspace.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Send className="h-3.5 w-3.5 mr-2" />
                Adicionar à campanha
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-64 overflow-y-auto z-50 bg-popover">
                {contactIds.length > MAX_CAMPAIGN_BATCH && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 px-2 py-1 max-w-[220px]">
                    Apenas os primeiros {MAX_CAMPAIGN_BATCH} contatos selecionados serão adicionados.
                  </p>
                )}
                {activeCampaigns?.map(campaign => (
                  <DropdownMenuItem key={campaign.id} onSelect={() => handleAddToCampaign(campaign.id)}>
                    {campaign.name}
                  </DropdownMenuItem>
                ))}
                {!activeCampaigns?.length && <DropdownMenuItem disabled>Nenhuma campanha ativa</DropdownMenuItem>}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            <DropdownMenuItem onSelect={() => downloadCsv(selectedContacts)}>
              <Download className="h-3.5 w-3.5 mr-2" />
              Exportar CSV
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={() => setShowDeleteConfirm(true)}
              className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/50"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedContacts.length} contato(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir os contatos selecionados? As conversas e dados associados a eles também poderão ser perdidos no sistema. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
