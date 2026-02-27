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

  // Poll for connection when showing QR code
  useEffect(() => {
    if (!connectingInstanceId || !qrCode || !session?.access_token) return;
    const interval = setInterval(async () => {
      try {
        const response = await supabase.functions.invoke('zapi-check-status');
        const inst = response.data?.instances?.find((i: any) => i.id === connectingInstanceId);
        if (inst?.connected) {
          setConnectingInstanceId(null);
          setQrCode(null);
          queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
          toast({ title: 'WhatsApp conectado!', description: 'Sincronizando conversas...' });
          handleSync(connectingInstanceId);
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [connectingInstanceId, qrCode, session?.access_token]);

  const handleAddNumber = async () => {
    if (!session?.access_token) return;
    setIsAddingNumber(true);
    try {
      // Create a new instance via zapi-create-instance
      const response = await supabase.functions.invoke('zapi-create-instance');
      if (response.error) throw response.error;
      if (response.data?.error) throw new Error(response.data.error);

      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });

      // Now get QR code for the new or existing instance
      const instanceDbId = response.data?.instanceId;
      if (instanceDbId) {
        // Fetch QR code
        const qrResponse = await supabase.functions.invoke('zapi-get-qrcode', {
          body: { instanceId: instanceDbId },
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
      toast({ title: 'Erro', description: error.message || 'Falha ao criar instância', variant: 'destructive' });
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
      toast({ title: 'Sincronização concluída!', description: `${response.data?.syncedConversations || 0} conversas sincronizadas.` });
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
            <Button onClick={handleAddNumber} className="gap-2" disabled={isAddingNumber}>
              {isAddingNumber ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar Número
            </Button>
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

          {/* Instance list */}
          {instances.length === 0 ? (
            <div className="text-center py-8">
              <Smartphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">Nenhum número configurado</p>
              <p className="text-muted-foreground mb-4">Adicione um número WhatsApp para começar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {instances.map((instance) => {
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
          )}
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
