import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useDeleteInstagramFlow,
  useInstagramFlows,
  useToggleInstagramFlow,
} from '@/hooks/useInstagramFlows';
import type { InstagramTriggerType } from '@/hooks/useInstagramAutomationRules';

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

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      await toggleFlow.mutateAsync({ id, isActive });
    } catch (error: any) {
      toast({ title: 'Erro ao alterar o fluxo', description: error.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFlow.mutateAsync(id);
      toast({ title: 'Fluxo removido' });
    } catch (error: any) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
    }
  };

  if (connectedAccounts === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Conecte uma conta do Instagram em Configurações antes de criar fluxos.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Fluxos permitem conversas com várias etapas: perguntar, esperar a
          resposta e seguir caminhos diferentes conforme o que a pessoa disser.
          Para algo simples como “comentou, recebe DM”, use a aba Automações.
        </p>
        <Button onClick={() => navigate('/tools/wizzy-engage/fluxo')}>
          <Plus className="mr-1.5 h-4 w-4" />
          Novo fluxo
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !flows.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Workflow className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhum fluxo ainda</p>
              <p className="text-sm text-muted-foreground">
                Crie um para montar conversas com perguntas e caminhos.
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate('/tools/wizzy-engage/fluxo')}>
              <Plus className="mr-1.5 h-4 w-4" />
              Criar o primeiro
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Gatilho</TableHead>
                  <TableHead className="text-center">Disparos</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {flows.map((flow) => (
                  <TableRow key={flow.id}>
                    <TableCell className="font-medium">{flow.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {TRIGGER_LABELS[flow.trigger_type] || flow.trigger_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {flow.triggers_count}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={flow.is_active}
                        onCheckedChange={(checked) => handleToggle(flow.id, checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/tools/wizzy-engage/fluxo?id=${flow.id}`)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleDelete(flow.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
