import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  useDeleteInstagramFlow,
  useInstagramFlows,
  useToggleInstagramFlow,
  type InstagramFlow,
} from '@/hooks/useInstagramFlows';
import type { InstagramTriggerType } from '@/hooks/useInstagramAutomationRules';
import {
  EngageEmptyState,
  EngageListSkeleton,
  EngageNotConnected,
  EngagePanel,
  EngageToolbar,
} from '@/components/instagram/EngageUI';

const TRIGGER_LABELS: Record<InstagramTriggerType, string> = {
  comment_keyword: 'Comentário',
  dm_keyword: 'Direct',
  story_reply: 'Resposta a story',
  story_mention: 'Menção em story',
  first_message: 'Primeira mensagem',
};

export function InstagramFlowsTab({ connectedAccounts }: { connectedAccounts: number }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: flows = [], isLoading } = useInstagramFlows();
  const toggleFlow = useToggleInstagramFlow();
  const deleteFlow = useDeleteInstagramFlow();
  const [pendingDelete, setPendingDelete] = useState<InstagramFlow | null>(null);

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await toggleFlow.mutateAsync({ id, isActive });
    } catch (error: any) {
      toast({ title: 'Erro ao alterar o fluxo', description: error.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteFlow.mutateAsync(pendingDelete.id);
      toast({ title: 'Fluxo removido' });
    } catch (error: any) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
    } finally {
      setPendingDelete(null);
    }
  };

  if (connectedAccounts === 0) {
    return (
      <EngageNotConnected purpose="Os fluxos conversam a partir do que acontece na sua conta — um comentário, um direct, uma resposta a story." />
    );
  }

  const active = flows.filter((flow) => flow.is_active).length;

  return (
    <div className="space-y-5">
      <EngageToolbar>
        <p className="max-w-[68ch] text-[15px] leading-relaxed tracking-[-0.011em] text-muted-foreground">
          Fluxos são conversas de várias etapas: perguntar, esperar a resposta e
          seguir caminhos diferentes conforme o que a pessoa disser. Para algo
          simples como “comentou, recebe DM”, a aba Automações resolve em menos
          cliques.
        </p>
        <Button onClick={() => navigate('/tools/wizzy-engage/fluxo')} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden />
          Novo fluxo
        </Button>
      </EngageToolbar>

      {isLoading ? (
        <EngageListSkeleton rows={3} />
      ) : !flows.length ? (
        <EngageEmptyState
          icon={Workflow}
          title="Nenhum fluxo ainda"
          description="Um fluxo faz perguntas e ramifica pela resposta — é o caminho para qualificar antes de mandar o link."
          action={
            <Button variant="outline" onClick={() => navigate('/tools/wizzy-engage/fluxo')} className="gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              Criar o primeiro
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-[15px] tracking-[-0.011em] text-muted-foreground">
            {flows.length} {flows.length === 1 ? 'fluxo' : 'fluxos'} ·{' '}
            {active} {active === 1 ? 'ligado' : 'ligados'}
          </p>

          <EngagePanel>
            {/* Uma lista, e não uma tabela de cinco colunas: só três dos campos
                são texto, e as duas colunas restantes existiam para segurar um
                interruptor e dois ícones. */}
            <div className="divide-y">
              {flows.map((flow) => (
                <div
                  key={flow.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4 transition-colors duration-150 hover:bg-muted/40"
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150',
                      flow.is_active
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'bg-muted/60 text-muted-foreground',
                    )}
                  >
                    <Workflow className="h-4 w-4" aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-[15px] font-medium tracking-[-0.011em]">
                        {flow.name}
                      </p>
                      <Badge variant="outline" className="font-normal">
                        {TRIGGER_LABELS[flow.trigger_type] || flow.trigger_type}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[14px] tabular-nums tracking-[-0.009em] text-muted-foreground">
                      {flow.triggers_count
                        ? `${flow.triggers_count} ${flow.triggers_count === 1 ? 'disparo' : 'disparos'}`
                        : 'ainda não disparou'}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={flow.is_active}
                      aria-label={flow.is_active ? 'Pausar fluxo' : 'Ligar fluxo'}
                      onCheckedChange={(checked) => handleToggle(flow.id, checked)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${flow.name}`}
                      onClick={() => navigate(`/tools/wizzy-engage/fluxo?id=${flow.id}`)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover ${flow.name}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingDelete(flow)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </EngagePanel>
        </>
      )}

      {/* Apagar um fluxo ligado interrompe conversas em andamento. O ícone de
          lixeira fazia isso no primeiro clique, sem pergunta. */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.is_active
                ? 'Ele está ligado agora: quem estiver no meio da conversa para de receber as próximas etapas.'
                : 'O fluxo e o desenho dos blocos não podem ser recuperados.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
