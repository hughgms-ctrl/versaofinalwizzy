import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Smartphone,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  QrCode,
  Zap,
  MessageSquare,
  Download,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useWhatsAppInstances, useDeleteWhatsAppInstance, useUpdateInstanceLabel, WhatsAppInstance } from '@/hooks/useWhatsAppInstances';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Progress } from '@/components/ui/progress';

export function WhatsAppInstancesSettings() {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: instances = [], isLoading } = useWhatsAppInstances();
  const { data: workspaces = [] } = useWorkspaces();
  const deleteInstance = useDeleteWhatsAppInstance();

  const [editingInstance, setEditingInstance] = useState<WhatsAppInstance | null>(null);
  const [connectingInstanceId, setConnectingInstanceId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);
  const [isAddingNumber, setIsAddingNumber] = useState(false);
  const [isBackfillingAvatars, setIsBackfillingAvatars] = useState(false);

  const handleBackfillAvatars = async () => {
    if (isBackfillingAvatars) return;
    setIsBackfillingAvatars(true);
    try {
      let totalPersisted = 0;
      let totalProcessed = 0;
      let totalFailed = 0;
      let totalCandidates = 0;
      let runs = 0;
      const maxRuns = 20; // safety cap

      toast({ title: 'Atualizando fotos...', description: 'Isso pode levar alguns minutos.' });

      let totalNoPicture = 0;
      const aggregatedStrategy: Record<string, number> = {};

      while (runs < maxRuns) {
        runs++;
        const { data, error } = await supabase.functions.invoke('backfill-contact-avatars', {
          body: {
            batchSize: 60,
            // First pass: retry contacts previously marked as 'avatar_unavailable'
            // so the new multi-endpoint strategy gets a chance on them.
            retryUnavailable: runs === 1,
          },
        });
        if (error) throw error;
        if (data?.success === false) throw new Error(data?.error || 'Falha desconhecida');

        const persistedNow = data?.persisted ?? 0;
        totalPersisted += persistedNow;
        totalProcessed += data?.processed ?? 0;
        totalFailed += data?.failed ?? 0;
        totalNoPicture += data?.noPicture ?? 0;
        totalCandidates = data?.total_candidates ?? totalCandidates;

        // Aggregate strategy hits across runs for diagnostics
        const ss = (data?.strategyStats ?? {}) as Record<string, number>;
        for (const [k, v] of Object.entries(ss)) {
          aggregatedStrategy[k] = (aggregatedStrategy[k] || 0) + (v as number);
        }

        // Stop if backend says no more, OR if this batch made zero progress
        // (avoids infinite loop when remaining contacts simply have no WhatsApp photo).
        if (!data?.hasMore || persistedNow === 0) break;

        // small pause between batches
        await new Promise((r) => setTimeout(r, 500));
      }

      const strategyParts = Object.entries(aggregatedStrategy)
        .filter(([k, v]) => k !== 'none' && (v as number) > 0)
        .map(([k, v]) => `${k}=${v}`).join(', ');
      const strategyMsg = strategyParts ? ` Fontes: ${strategyParts}.` : '';

      toast({
        title: 'Fotos atualizadas!',
        description:
          `${totalPersisted} fotos salvas em ${runs} lote(s). ` +
          `${totalProcessed} verificados, ${totalNoPicture} sem foto pública, ${totalFailed} falhas.${strategyMsg}`,
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch (e: any) {
      toast({
        title: 'Erro ao atualizar fotos',
        description: e.message || String(e),
        variant: 'destructive',
      });
    } finally {
      setIsBackfillingAvatars(false);
    }
  };

  // Poll for connection when showing QR code
  useEffect(() => {
    if (!connectingInstanceId || !qrCode) return;
    const interval = setInterval(async () => {
      try {
        const response = await supabase.functions.invoke('zapi-check-status', {
          headers: { Authorization: `Bearer ${session?.access_token}` }
        });

        // Check the specific connecting instance
        const inst = response.data?.instances?.find((i: any) => i.id === connectingInstanceId);
        const isConnected = inst?.connected || inst?.status === 'connected';

        if (isConnected) {
          setConnectingInstanceId(null);
          setQrCode(null);
          queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
          toast({ title: '✅ WhatsApp conectado!', description: 'Sincronizando conversas...' });
          handleSync(connectingInstanceId);
        }
      } catch (err) {
        console.error('[UAZAPI Polling Error]', err);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [connectingInstanceId, qrCode]);

  const handleAddNumber = async () => {
    if (!session?.access_token) return;
    setIsAddingNumber(true);
    try {
      // Create a new instance via zapi-create-instance
      // NOTE: Do NOT pass Authorization header manually.
      // The supabase client manages token refresh internally.
      const response = await supabase.functions.invoke('zapi-create-instance', {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });

      if (response.error) {
        const ctx = (response.error as any)?.context;
        let detail = response.error.message;
        if (ctx) {
          try {
            const ctxBody = typeof ctx === 'string' ? JSON.parse(ctx) : await ctx.json?.();
            detail = JSON.stringify(ctxBody);
          } catch {
            detail = String(ctx);
          }
        }
        throw new Error(detail);
      }
      if (response.data?.error) throw new Error(JSON.stringify(response.data));

      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });

      // Now get QR code for the new or existing instance
      const instanceDbId = response.data?.instanceId;
      if (instanceDbId) {
        // Fetch QR code
        const qrResponse = await supabase.functions.invoke('zapi-get-qrcode', {
          body: { instanceId: instanceDbId },
          headers: { Authorization: `Bearer ${session?.access_token}` }
        });
        if (qrResponse.data?.connected) {
          toast({ title: 'Já conectado!' });
          queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
        } else if (qrResponse.data?.qrCode) {
          setConnectingInstanceId(instanceDbId);
          setQrCode(qrResponse.data.qrCode);
        }
      }
    } catch (error: any) {
      const msg = error.message || 'Falha ao criar instância';
      console.error('[UAZAPI ERROR]', msg);
      toast({ title: 'Erro', description: msg.substring(0, 200), variant: 'destructive' });
    } finally {
      setIsAddingNumber(false);
    }
  };

  const handleConnect = async (instanceId: string) => {
    if (!session?.access_token) return;
    setIsActionLoading(instanceId);
    try {
      const response = await supabase.functions.invoke('zapi-get-qrcode', {
        body: { instanceId },
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      if (response.error) throw response.error;
      if (response.data.connected) {
        toast({ title: 'Já conectado!' });
        queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      } else {
        setConnectingInstanceId(instanceId);
        setQrCode(response.data.qrCode);
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleDisconnect = async (instanceId: string) => {
    if (!session?.access_token) return;
    setIsActionLoading(instanceId);
    try {
      const response = await supabase.functions.invoke('zapi-disconnect', {
        body: { instanceId },
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      if (response.error) throw response.error;
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      toast({ title: 'Desconectado' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleDelete = async (instanceId: string) => {
    try {
      await deleteInstance.mutateAsync(instanceId);
      toast({ title: 'Instância removida' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const handleSync = async (instanceId: string) => {
    if (!session?.access_token || isSyncing) return;
    setIsSyncing(instanceId);
    setSyncProgress(0);
    const progressInterval = setInterval(() => {
      setSyncProgress(prev => {
        if (prev < 30) return prev + 3;
        if (prev < 60) return prev + 2;
        if (prev < 85) return prev + 0.8;
        if (prev < 95) return prev + 0.3;
        return prev;
      });
    }, 600);

    try {
      const response = await supabase.functions.invoke('zapi-sync-chats', {
        body: { instanceId },
      });
      clearInterval(progressInterval);
      setSyncProgress(100);
      if (response.error) throw response.error;

      const data = response.data || {};
      const total = data.totalChats ?? 0;
      const valid = data.processedChats ?? 0;
      const synced = data.syncedConversations ?? 0;

      if (synced === 0 && total > 0) {
        toast({
          title: 'Sincronização concluída (Zerada)',
          description: `Achamos ${total} chats, mas o filtro barrou todos (${valid} válidos).`,
          variant: 'default'
        });
      } else {
        toast({
          title: 'Sincronização concluída!',
          description: `${synced} conversas sincronizadas (${total} total na UAZAPI).`
        });
      }
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (error: any) {
      clearInterval(progressInterval);
      setSyncProgress(100);
      toast({ title: 'Erro na sincronização', description: error.message, variant: 'destructive' });
    } finally {
      setTimeout(() => { setIsSyncing(null); setSyncProgress(0); }, 500);
    }
  };

  const getWorkspaceForInstance = (instanceId: string) => {
    return workspaces.find(w => w.whatsapp_instance_id === instanceId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Smartphone className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <CardTitle className="text-foreground">Conexões WhatsApp</CardTitle>
                <CardDescription>
                  Gerencie seus números WhatsApp conectados
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleBackfillAvatars}
                variant="outline"
                className="gap-2"
                disabled={isBackfillingAvatars}
                title="Baixa as fotos de perfil de todos os contatos e salva permanentemente"
              >
                {isBackfillingAvatars ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Atualizar fotos dos contatos
              </Button>
              <Button onClick={handleAddNumber} className="gap-2" disabled={isAddingNumber}>
                {isAddingNumber ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar Número
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* QR Code display */}
          {connectingInstanceId && qrCode && (
            <div className="space-y-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-start gap-3">
                <QrCode className="h-5 w-5 text-blue-500 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Escaneie o QR Code</p>
                  <ol className="mt-2 text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Abra o WhatsApp no celular</li>
                    <li>Configurações → Dispositivos Vinculados</li>
                    <li>Vincular Dispositivo → Escaneie o código</li>
                  </ol>
                </div>
              </div>
              <div className="flex justify-center">
                <div className="p-4 bg-white rounded-xl">
                  <img
                    src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR Code WhatsApp"
                    className="w-64 h-64"
                  />
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Aguardando conexão...
              </div>
              <div className="flex gap-2">
                <Button variant="default" className="flex-1" onClick={() => handleConnect(connectingInstanceId)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Gerar Novo QR Code
                </Button>
                <Button variant="outline" onClick={() => { setConnectingInstanceId(null); setQrCode(null); }}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Sync progress */}
          {isSyncing && (
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                <div className="flex-1">
                  <p className="font-medium text-foreground">Sincronizando conversas...</p>
                </div>
                <span className="text-sm font-medium text-blue-500">{Math.round(syncProgress)}%</span>
              </div>
              <Progress value={syncProgress} className="h-2" />
            </div>
          )}

          {/* Instance list - hide instance being connected while QR is showing */}
          {(() => {
            const visibleInstances = instances.filter(i =>
              !(connectingInstanceId && i.id === connectingInstanceId)
            );
            if (visibleInstances.length === 0 && !connectingInstanceId) return (
              <div className="text-center py-8">
                <Smartphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium">Nenhum número configurado</p>
                <p className="text-muted-foreground mb-4">Adicione um número WhatsApp para começar.</p>
              </div>
            );
            if (visibleInstances.length === 0) return null;
            return (
              <div className="space-y-3">
                {visibleInstances.map((instance) => {
                  const workspace = getWorkspaceForInstance(instance.id);
                  const isConnected = instance.status === 'connected';
                  const hasCredentials = !!instance.zapi_instance_id;

                  return (
                    <div key={instance.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isConnected ? 'bg-green-500' : 'bg-muted'}`}>
                          <MessageSquare className={`h-5 w-5 ${isConnected ? 'text-white' : 'text-muted-foreground'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground truncate">
                              {instance.label || 'Sem nome'}
                            </p>
                            {isConnected ? (
                              <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px]">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Conectado
                              </Badge>
                            ) : hasCredentials ? (
                              <Badge variant="secondary" className="text-[10px]">
                                <XCircle className="h-3 w-3 mr-1" />
                                Desconectado
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">Pendente</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            {instance.phone_number && <span>{instance.phone_number}</span>}
                            {workspace && (
                              <Badge variant="outline" className="text-[10px] py-0" style={{ borderColor: workspace.color, color: workspace.color }}>
                                {workspace.name}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {isConnected && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleSync(instance.id)} disabled={!!isSyncing} title="Sincronizar">
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDisconnect(instance.id)} disabled={isActionLoading === instance.id}>
                              {isActionLoading === instance.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            </Button>
                          </>
                        )}
                        {!isConnected && hasCredentials && (
                          <Button variant="ghost" size="sm" onClick={() => handleConnect(instance.id)} disabled={isActionLoading === instance.id}>
                            {isActionLoading === instance.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => setEditingInstance(instance)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!isConnected && (
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(instance.id)} disabled={deleteInstance.isPending}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {editingInstance && (
        <EditInstanceDialog
          open={!!editingInstance}
          onOpenChange={(open) => !open && setEditingInstance(null)}
          instance={editingInstance}
        />
      )}
    </div>
  );
}

function EditInstanceDialog({ open, onOpenChange, instance }: { open: boolean; onOpenChange: (open: boolean) => void; instance: WhatsAppInstance }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateLabel = useUpdateInstanceLabel();
  const { data: workspaces = [] } = useWorkspaces();

  const [label, setLabel] = useState(instance.label || '');
  const [isLoading, setIsLoading] = useState(false);

  const currentWorkspace = workspaces.find(w => w.whatsapp_instance_id === instance.id);
  const [workspaceId, setWorkspaceId] = useState(currentWorkspace?.id || 'none');

  useEffect(() => {
    const ws = workspaces.find(w => w.whatsapp_instance_id === instance.id);
    setWorkspaceId(ws?.id || 'none');
  }, [workspaces, instance.id]);

  useEffect(() => {
    setLabel(instance.label || '');
  }, [instance]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Update label
      await updateLabel.mutateAsync({ instanceId: instance.id, label: label.trim() });

      // Handle workspace linking
      if (currentWorkspace && currentWorkspace.id !== workspaceId && workspaceId === 'none') {
        await supabase.from('workspaces').update({ whatsapp_instance_id: null }).eq('id', currentWorkspace.id);
      } else if (currentWorkspace && currentWorkspace.id !== workspaceId && workspaceId !== 'none') {
        await supabase.from('workspaces').update({ whatsapp_instance_id: null }).eq('id', currentWorkspace.id);
        await supabase.from('workspaces').update({ whatsapp_instance_id: instance.id }).eq('id', workspaceId);
      } else if (!currentWorkspace && workspaceId && workspaceId !== 'none') {
        await supabase.from('workspaces').update({ whatsapp_instance_id: instance.id }).eq('id', workspaceId);
      }

      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast({ title: 'Instância atualizada!' });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Instância</DialogTitle>
          <DialogDescription>Altere o nome e o workspace vinculado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome/Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Número Principal" className="mt-1" />
          </div>
          <div>
            <Label>Workspace vinculado</Label>
            <Select value={workspaceId} onValueChange={setWorkspaceId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Nenhum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum (número geral)</SelectItem>
                {workspaces.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
