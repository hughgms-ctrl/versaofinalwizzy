import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Loader2, Megaphone, Edit, Trash2 } from "lucide-react";
import { CampaignDialog } from "@/components/campaigns/CampaignDialog";
import {
    useCampaigns,
    useUpdateCampaign,
    useDeleteCampaign,
    Campaign,
} from "@/hooks/useCampaigns";
import { Badge } from "@/components/ui/badge";

const CampaignsPage = () => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

    const { data: campaigns, isLoading } = useCampaigns();
    const updateCampaign = useUpdateCampaign();
    const deleteCampaign = useDeleteCampaign();

    const handleEdit = (campaign: Campaign) => {
        setEditingCampaign(campaign);
        setIsDialogOpen(true);
    };

    const handleCreate = () => {
        setEditingCampaign(null);
        setIsDialogOpen(true);
    };

    const handleToggleActive = (id: string, isActive: boolean) => {
        updateCampaign.mutate({ id, is_active: isActive });
    };

    const handleDelete = (id: string) => {
        if (confirm("Tem certeza que deseja excluir esta campanha?")) {
            deleteCampaign.mutate(id);
        }
    };

    if (isLoading) {
        return (
            <MainLayout
                title="Campanhas"
                subtitle="Gerencie gatilhos para seus fluxos de atendimento"
            >
                <div className="flex h-[50vh] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout
            title="Campanhas"
            subtitle="Gerencie gatilhos para seus fluxos de atendimento"
            showNewButton
            newButtonLabel="Nova Campanha"
            onNewClick={handleCreate}
        >
            <div className="space-y-4">
                {(!campaigns || campaigns.length === 0) ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center">
                        <Megaphone className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium">Nenhuma campanha criada</h3>
                        <p className="text-muted-foreground mb-4">
                            Crie uma campanha para disparar fluxos automaticamente por palavra-chave.
                        </p>
                        <Button onClick={handleCreate}>Criar Campanha</Button>
                    </div>
                ) : (
                    <div className="rounded-md border bg-card">
                        <Table>
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead className="w-[30%]">Nome</TableHead>
                                    <TableHead className="w-[20%]">Gatilho</TableHead>
                                    <TableHead className="w-[25%]">Fluxo</TableHead>
                                    <TableHead className="w-[10%] text-center">Status</TableHead>
                                    <TableHead className="w-[10%] text-center">Disparos</TableHead>
                                    <TableHead className="w-[10%] text-center">Em espera</TableHead>
                                    <TableHead className="w-[15%] text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {campaigns.map((campaign) => (
                                    <TableRow key={campaign.id}>
                                        <TableCell className="font-medium">
                                            {campaign.name}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                {['exact', 'contains', 'starts_with'].includes(campaign.match_type) ? (
                                                    <>
                                                        <span className="font-semibold text-primary">
                                                            {campaign.trigger_keyword}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                                            {campaign.match_type === "exact"
                                                                ? "Mensagem Exata"
                                                                : campaign.match_type === "contains"
                                                                    ? "Contém Palavra"
                                                                    : "Começa com"}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="font-semibold text-foreground">
                                                            {campaign.match_type === 'new_conversation' ? 'Nova Conversa' :
                                                                campaign.match_type === 'webhook' ? 'Webhook' :
                                                                    campaign.match_type === 'manual' ? 'Manual' : 'Desconhecido'}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                                            Gatilho de Sistema
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {campaign.flow ? (
                                                <Badge variant="outline" className="text-xs">
                                                    {campaign.flow.name}
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground text-sm">
                                                    Fluxo não encontrado
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <Switch
                                                    checked={campaign.is_active}
                                                    onCheckedChange={(checked) =>
                                                        handleToggleActive(campaign.id, checked)
                                                    }
                                                />
                                                <span className="text-xs text-muted-foreground w-12 text-left">
                                                    {campaign.is_active ? "Ativo" : "Inativo"}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center font-medium">
                                            {campaign.trigger_count || 0}
                                        </TableCell>
                                        <TableCell className="text-center font-medium text-amber-500">
                                            {campaign.pending_count || 0}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleEdit(campaign)}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => handleDelete(campaign.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>

            {isDialogOpen && (
                <CampaignDialog
                    open={isDialogOpen}
                    onOpenChange={setIsDialogOpen}
                    campaignToEdit={editingCampaign}
                />
            )}
        </MainLayout>
    );
};

export default CampaignsPage;
