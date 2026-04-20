import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Scale, Building2, MessageSquare, FileText, ListTodo, Calendar, Activity, ExternalLink, Trash2 } from 'lucide-react';
import { useCase, useUpdateCase, useDeleteCase } from '@/hooks/useOperationsCases';
import { useCaseStatuses } from '@/hooks/useOperationsCases';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { CaseTasksList } from './CaseTasksList';
import { CaseDeadlinesList } from './CaseDeadlinesList';
import { CaseTimeline } from './CaseTimeline';
import { CaseSummaryJudicial } from './CaseSummaryJudicial';
import { CaseSummaryAdministrative } from './CaseSummaryAdministrative';
import { ContactFilesSection } from '@/components/conversations/ContactFilesSection';
import { useState } from 'react';
import { PipelineChatModal } from '@/components/pipeline/PipelineChatModal';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface CaseDrawerProps {
  caseId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function CaseDrawer({ caseId, open, onOpenChange }: CaseDrawerProps) {
  const { data: c, isLoading } = useCase(caseId);
  const { data: statuses = [] } = useCaseStatuses();
  const { data: team = [] } = useTeamMembers();
  const update = useUpdateCase();
  const del = useDeleteCase();
  const [chatOpen, setChatOpen] = useState(false);

  const { data: conversation } = useQuery({
    queryKey: ['case-conversation', c?.conversation_id],
    queryFn: async () => {
      if (!c?.conversation_id) return null;
      const { data } = await supabase
        .from('conversations')
        .select('*, contact:contacts(*)')
        .eq('id', c.conversation_id)
        .maybeSingle();
      return data as any;
    },
    enabled: !!c?.conversation_id,
  });

  if (!caseId) return null;

  const Icon = c?.kind === 'judicial' ? Scale : Building2;
  const contactName = c?.contact?.name || c?.contact?.phone || 'Sem contato';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="p-6 pb-4 border-b">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={c?.contact?.avatar_url || undefined} />
                  <AvatarFallback>{contactName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-base truncate">{c?.title || (isLoading ? 'Carregando...' : 'Caso')}</SheetTitle>
                  <p className="text-sm text-muted-foreground truncate">{contactName}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" className="gap-1">
                      <Icon className="h-3 w-3" />
                      {c?.kind === 'judicial' ? 'Judicial' : 'Administrativo'}
                    </Badge>
                    {c?.category && <Badge variant="outline">{(c as any).category.name}</Badge>}
                  </div>
                </div>
              </div>
              {c && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir caso?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação não pode ser desfeita. Tarefas, prazos e histórico serão removidos.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          del.mutate(caseId);
                          onOpenChange(false);
                        }}
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            {c && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-xs text-muted-foreground">Status</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={c.status_id || ''}
                    onChange={(e) => update.mutate({ id: caseId, status_id: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {statuses.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Responsável</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={c.assignee_id || ''}
                    onChange={(e) => update.mutate({ id: caseId, assignee_id: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {team.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </SheetHeader>

          {c && (
            <Tabs defaultValue="summary" className="px-4 pt-3 pb-6">
              <TabsList className="grid grid-cols-6 w-full">
                <TabsTrigger value="summary"><FileText className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Resumo</span></TabsTrigger>
                <TabsTrigger value="tasks"><ListTodo className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Tarefas</span></TabsTrigger>
                <TabsTrigger value="docs"><FileText className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Docs</span></TabsTrigger>
                <TabsTrigger value="deadlines"><Calendar className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Prazos</span></TabsTrigger>
                <TabsTrigger value="timeline"><Activity className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Histórico</span></TabsTrigger>
                <TabsTrigger value="chat"><MessageSquare className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Chat</span></TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="mt-4">
                {c.kind === 'judicial' ? (
                  <CaseSummaryJudicial caseId={c.id} data={c.judicial_data || {}} />
                ) : (
                  <CaseSummaryAdministrative caseId={c.id} data={c.administrative_data || {}} />
                )}
              </TabsContent>

              <TabsContent value="tasks" className="mt-4">
                <CaseTasksList caseId={c.id} />
              </TabsContent>

              <TabsContent value="docs" className="mt-4">
                {c.contact_id ? (
                  <ContactFilesSection contactId={c.contact_id} />
                ) : (
                  <p className="text-sm text-muted-foreground">Caso sem contato vinculado.</p>
                )}
              </TabsContent>

              <TabsContent value="deadlines" className="mt-4">
                <CaseDeadlinesList caseId={c.id} />
              </TabsContent>

              <TabsContent value="timeline" className="mt-4">
                <CaseTimeline caseId={c.id} />
              </TabsContent>

              <TabsContent value="chat" className="mt-4">
                {conversation ? (
                  <Button onClick={() => setChatOpen(true)}>
                    <MessageSquare className="h-4 w-4 mr-2" /> Abrir conversa
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">Caso sem conversa vinculada.</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      {conversation && (
        <PipelineChatModal conversation={conversation} open={chatOpen} onOpenChange={setChatOpen} />
      )}
    </>
  );
}
