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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { Tag, FolderInput, Trash2, Download, Send, X, Loader2 } from 'lucide-react';

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
  const [tagPopoverOpen, setTagPopoverOpen] = useState<'add' | 'remove' | null>(null);
  const [workspacePopoverOpen, setWorkspacePopoverOpen] = useState(false);
  const [campaignPopoverOpen, setCampaignPopoverOpen] = useState(false);

  const bulkAddTag = useBulkAddTag();
  const bulkRemoveTag = useBulkRemoveTag();
  const bulkMoveWorkspace = useBulkMoveWorkspace();
  const bulkDelete = useBulkDeleteContacts();
  const bulkAddToCampaign = useBulkAddToCampaign();

  const contactIds = selectedContacts.map(c => c.id);
  const isBusy = bulkAddTag.isPending || bulkRemoveTag.isPending || bulkMoveWorkspace.isPending || bulkDelete.isPending || bulkAddToCampaign.isPending;

  const handleAddTag = (tagId: string) => {
    bulkAddTag.mutate({ contactIds, tagId });
    setTagPopoverOpen(null);
  };

  const handleRemoveTag = (tagId: string) => {
    bulkRemoveTag.mutate({ contactIds, tagId });
    setTagPopoverOpen(null);
  };

  const handleMoveWorkspace = (workspaceId: string | null) => {
    bulkMoveWorkspace.mutate({ contactIds, workspaceId });
    setWorkspacePopoverOpen(false);
  };

  const handleDelete = () => {
    bulkDelete.mutate(contactIds);
    setShowDeleteConfirm(false);
    onClearSelection();
  };

  const handleAddToCampaign = (campaignId: string) => {
    bulkAddToCampaign.mutate({ contactIds: contactIds.slice(0, MAX_CAMPAIGN_BATCH), campaignId });
    setCampaignPopoverOpen(false);
  };

  return (
    <>
      <div className="sticky bottom-0 left-0 right-0 mt-2 flex items-center gap-2 flex-wrap rounded-xl border border-border bg-card px-3 py-2 shadow-lg z-30">
        <span className="text-sm font-medium">{selectedContacts.length} selecionado(s)</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearSelection}>
          <X className="h-3.5 w-3.5 mr-1" />
          Limpar
        </Button>

        <div className="h-5 w-px bg-border mx-1" />

        {/* Add tag */}
        <Popover open={tagPopoverOpen === 'add'} onOpenChange={(open) => setTagPopoverOpen(open ? 'add' : null)}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" disabled={isBusy}>
              <Tag className="h-3.5 w-3.5" />
              Adicionar tag
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Escolha a tag</p>
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {tags?.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => handleAddTag(tag.id)}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent text-left"
                >
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </button>
              ))}
              {!tags?.length && <p className="text-xs text-muted-foreground px-2 py-1">Nenhuma tag criada.</p>}
            </div>
          </PopoverContent>
        </Popover>

        {/* Remove tag */}
        <Popover open={tagPopoverOpen === 'remove'} onOpenChange={(open) => setTagPopoverOpen(open ? 'remove' : null)}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" disabled={isBusy}>
              <Tag className="h-3.5 w-3.5" />
              Remover tag
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Escolha a tag para remover</p>
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {tags?.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => handleRemoveTag(tag.id)}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent text-left"
                >
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </button>
              ))}
              {!tags?.length && <p className="text-xs text-muted-foreground px-2 py-1">Nenhuma tag criada.</p>}
            </div>
          </PopoverContent>
        </Popover>

        {/* Move workspace */}
        <Popover open={workspacePopoverOpen} onOpenChange={setWorkspacePopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" disabled={isBusy}>
              <FolderInput className="h-3.5 w-3.5" />
              Mover de workspace
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Escolha o workspace de destino</p>
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              <button
                onClick={() => handleMoveWorkspace(null)}
                className="px-2 py-1.5 text-sm rounded-md hover:bg-accent text-left text-muted-foreground"
              >
                Sem workspace
              </button>
              {workspaces?.map(workspace => (
                <button
                  key={workspace.id}
                  onClick={() => handleMoveWorkspace(workspace.id)}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent text-left"
                >
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: workspace.color }} />
                  {workspace.name}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Add to campaign */}
        <Popover open={campaignPopoverOpen} onOpenChange={setCampaignPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" disabled={isBusy}>
              <Send className="h-3.5 w-3.5" />
              Adicionar à campanha
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Escolha a campanha</p>
            {contactIds.length > MAX_CAMPAIGN_BATCH && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 px-1 mb-1.5">
                Apenas os primeiros {MAX_CAMPAIGN_BATCH} contatos selecionados serão adicionados por chamada.
              </p>
            )}
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {campaigns?.filter(c => c.is_active).map(campaign => (
                <button
                  key={campaign.id}
                  onClick={() => handleAddToCampaign(campaign.id)}
                  className="px-2 py-1.5 text-sm rounded-md hover:bg-accent text-left"
                >
                  {campaign.name}
                </button>
              ))}
              {!campaigns?.filter(c => c.is_active).length && (
                <p className="text-xs text-muted-foreground px-2 py-1">Nenhuma campanha ativa.</p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Export CSV */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => downloadCsv(selectedContacts)}
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </Button>

        <div className="h-5 w-px bg-border mx-1" />

        {/* Delete */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5 text-red-600 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
          disabled={isBusy}
          onClick={() => setShowDeleteConfirm(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Excluir
        </Button>

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
