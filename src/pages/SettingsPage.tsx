import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { useSignatureSettings } from '@/hooks/useSignatureSettings';
import { supabase } from '@/integrations/supabase/client';
import { TagsSettings } from '@/components/settings/TagsSettings';
import { ImportHistorySettings } from '@/components/settings/ImportHistorySettings';
import { CrmEntitiesSettings } from '@/components/settings/CrmEntitiesSettings';
import { WorkspacesSettings } from '@/components/settings/WorkspacesSettings';
import { WhatsAppInstancesSettings } from '@/components/settings/WhatsAppInstancesSettings';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MessageSquare,
  Bell,
  Shield,
  Zap,
  CheckCircle,
  XCircle,
  RefreshCw,
  Copy,
  Smartphone,
  Settings2,
  Building,
  Loader2,
  QrCode,
  Download,
  Tag,
  Upload,
  Volume2,
  VolumeX,
  PenLine,
  ListChecks,
  Building2
} from 'lucide-react';

interface WhatsAppStatus {
  status: 'pending' | 'connecting' | 'connected' | 'disconnected' | 'not_configured';
  connected: boolean;
  phoneNumber?: string | null;
  qrCode?: string;
  hasCredentials?: boolean;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { session, profile } = useAuth();
  const { settings: notificationSettings, updateSettings: updateNotificationSettings } = useNotificationSettings();
  const { signatureDefault, updateDefaultSignature } = useSignatureSettings();

  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus>({
    status: 'pending',
    connected: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [hasSynced, setHasSynced] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [showManualConfig, setShowManualConfig] = useState(false);
  const [manualCredentials, setManualCredentials] = useState({
    instanceId: '',
    instanceToken: '',
  });

  const [notifications, setNotifications] = useState({
    newConversation: true,
    mentionAlert: true,
    dailyReport: false,
    weeklyReport: true,
    soundEnabled: true,
  });

  const [generalSettings, setGeneralSettings] = useState({
    companyName: 'Minha Empresa',
    timezone: 'America/Sao_Paulo',
    language: 'pt-BR',
    darkMode: true,
  });

  const getWebhookUrl = () => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    return `https://${projectId}.supabase.co/functions/v1/zapi-webhook`;
  };

  // Sync chats - can be called automatically or manually
  const syncChats = useCallback(async (manual = false, isFirstConnection = false) => {
    if (!session?.access_token || isSyncing) return;
    // Only check hasSynced for automatic syncs that aren't first connection
    if (!manual && !isFirstConnection && hasSynced) return;

    setIsSyncing(true);
    setSyncProgress(0);

    // Simulate progress while waiting for the actual sync
    const progressInterval = setInterval(() => {
      setSyncProgress(prev => {
        // Slow down as we approach 95% to simulate real progress
        if (prev < 30) return prev + 3;
        if (prev < 60) return prev + 2;
        if (prev < 85) return prev + 0.8;
        if (prev < 95) return prev + 0.3;
        return prev;
      });
    }, 600);

    // Set a timeout to prevent infinite waiting (120 seconds max)
    const timeoutId = setTimeout(() => {
      clearInterval(progressInterval);
      // Complete the progress even on timeout
      setSyncProgress(100);
      setHasSynced(true);

      setTimeout(() => {
        setIsSyncing(false);
        setSyncProgress(0);
        toast({
          title: 'Sincronização concluída',
          description: 'As conversas disponíveis foram sincronizadas.',
        });
      }, 500);
    }, 120000);

    try {
      console.log(`Starting ${isFirstConnection ? 'first connection' : manual ? 'manual' : 'automatic'} chat sync...`);
      const response = await supabase.functions.invoke('zapi-sync-chats', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      clearTimeout(timeoutId);
      clearInterval(progressInterval);
      setSyncProgress(100);

      if (response.error) throw response.error;

      setHasSynced(true);

      const data = response.data || {};
      const total = data.totalChats ?? 0;
      const valid = data.processedChats ?? 0;
      const synced = data.syncedConversations ?? 0;

      if (synced === 0 && total > 0) {
        toast({
          title: 'Sincronização concluída (Zerada)',
          description: `Achamos ${total} chats, mas o filtro barrou todos (${valid} válidas).`,
        });
      } else {
        toast({
          title: isFirstConnection ? 'WhatsApp sincronizado!' : 'Conversas atualizadas!',
          description: `${synced} conversas sincronizadas (${total} total na UAZAPI).`,
        });
      }

      // Finish up
      setTimeout(() => {
        setIsSyncing(false);
        setSyncProgress(0);
      }, 500);
    } catch (error: any) {
      clearTimeout(timeoutId);
      clearInterval(progressInterval);
      console.error('Sync error:', error);

      // Complete the progress anyway - partial sync is better than stuck at 95%
      setSyncProgress(100);
      setHasSynced(true);

      toast({
        title: manual ? 'Erro na sincronização' : 'Sincronização parcial',
        description: manual
          ? (error.message || 'Ocorreu um erro, mas as conversas disponíveis foram sincronizadas.')
          : 'Algumas conversas podem não ter sido sincronizadas.',
        variant: manual ? 'destructive' : 'default',
      });

      setTimeout(() => {
        setIsSyncing(false);
        setSyncProgress(0);
      }, 500);
    }
  }, [session?.access_token, isSyncing, hasSynced, toast]);

  const handleManualSync = useCallback(() => {
    syncChats(true);
  }, [syncChats]);

  const checkStatus = useCallback(async (preserveQrCode = false) => {
    if (!session?.access_token) return;

    try {
      const response = await supabase.functions.invoke('zapi-check-status', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (response.error) throw response.error;

      const hasCredentials = response.data.status !== 'not_configured' && response.data.status !== 'pending';
      const wasConnecting = whatsappStatus.status === 'connecting';
      const isNowConnected = response.data.connected;

      // If connected, update status
      if (isNowConnected) {
        setWhatsappStatus({
          status: 'connected',
          connected: true,
          phoneNumber: response.data.phoneNumber,
          hasCredentials: true,
        });

        // Auto-sync when just connected (was connecting, now connected)
        if (wasConnecting) {
          toast({
            title: 'WhatsApp conectado!',
            description: 'Sincronizando contatos e conversas...',
          });
          // Trigger sync after a small delay - pass isFirstConnection=true to bypass hasSynced check
          setTimeout(() => syncChats(false, true), 1000);
        }
      } else if (!preserveQrCode) {
        // Only update if we're not preserving QR code
        setWhatsappStatus(prev => ({
          ...prev,
          status: response.data.status,
          connected: response.data.connected,
          phoneNumber: response.data.phoneNumber,
          hasCredentials,
        }));

        // Show manual config if no credentials configured
        if (!hasCredentials) {
          setShowManualConfig(true);
        }
      }
      // If preserveQrCode is true and not connected, keep existing QR code on screen
    } catch (error) {
      console.error('Error checking status:', error);
    } finally {
      setIsCheckingStatus(false);
    }
  }, [session?.access_token, whatsappStatus.status, syncChats, toast]);

  useEffect(() => {
    checkStatus();
  }, []);

  // Poll for status when connecting (preserve QR code)
  useEffect(() => {
    if (whatsappStatus.status === 'connecting' && whatsappStatus.qrCode) {
      const interval = setInterval(async () => {
        await checkStatus(true); // preserveQrCode = true
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [whatsappStatus.status, whatsappStatus.qrCode, checkStatus]);

  const handleSaveCredentials = async () => {
    if (!session?.access_token) return;
    if (!manualCredentials.instanceId.trim() || !manualCredentials.instanceToken.trim()) {
      toast({
        title: 'Dados incompletos',
        description: 'Preencha o Instance ID e o Token.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke('zapi-save-credentials', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          instanceId: manualCredentials.instanceId.trim(),
          instanceToken: manualCredentials.instanceToken.trim(),
        },
      });

      if (response.error) throw response.error;

      toast({
        title: 'Credenciais salvas!',
        description: 'Agora você pode conectar seu WhatsApp.',
      });

      setShowManualConfig(false);
      await checkStatus();
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        title: 'Erro ao salvar',
        description: error.message || 'Não foi possível salvar as credenciais.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectWhatsApp = async () => {
    if (!session?.access_token) return;
    setIsLoading(true);

    try {
      // Get QR code directly (credentials already saved)
      const qrResponse = await supabase.functions.invoke('zapi-get-qrcode', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (qrResponse.error) throw qrResponse.error;

      if (qrResponse.data.connected) {
        setWhatsappStatus({
          status: 'connected',
          connected: true,
          phoneNumber: qrResponse.data.phone,
        });
        toast({
          title: 'WhatsApp conectado!',
          description: 'Sua instância já estava conectada.',
        });
      } else {
        setWhatsappStatus({
          status: 'connecting',
          connected: false,
          qrCode: qrResponse.data.qrCode,
        });
        toast({
          title: 'Escaneie o QR Code',
          description: 'Abra o WhatsApp no celular e escaneie o código.',
        });
      }
    } catch (error: any) {
      console.error('Error:', error);
      toast({
        title: 'Erro ao conectar',
        description: error.message || 'Não foi possível iniciar a conexão.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!session?.access_token) return;
    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke('zapi-disconnect', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });

      if (response.error) throw response.error;

      setWhatsappStatus({
        status: 'disconnected',
        connected: false,
      });
      toast({
        title: 'WhatsApp desconectado',
        description: 'A conexão foi encerrada.',
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao desconectar',
        description: error.message || 'Não foi possível desconectar.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado!',
      description: 'Texto copiado para a área de transferência.',
    });
  };


  return (
    <MainLayout
      title="Configurações"
      subtitle="Gerencie as configurações do sistema"
    >
      <Tabs defaultValue="whatsapp" className="space-y-4 md:space-y-6">
        <TabsList className="bg-muted flex-wrap h-auto p-1 gap-1">
          <TabsTrigger value="whatsapp" className="flex items-center gap-1.5 text-xs md:text-sm px-2 md:px-3">
            <MessageSquare className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span className="hidden xs:inline">WhatsApp</span>
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-1.5 text-xs md:text-sm px-2 md:px-3">
            <Upload className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span className="hidden xs:inline">Importar</span>
          </TabsTrigger>
          <TabsTrigger value="tags" className="flex items-center gap-1.5 text-xs md:text-sm px-2 md:px-3">
            <Tag className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span className="hidden xs:inline">Tags</span>
          </TabsTrigger>
          <TabsTrigger value="crm" className="flex items-center gap-1.5 text-xs md:text-sm px-2 md:px-3">
            <ListChecks className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span className="hidden xs:inline">CRM</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-1.5 text-xs md:text-sm px-2 md:px-3">
            <Bell className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span className="hidden sm:inline">Notificações</span>
          </TabsTrigger>
          <TabsTrigger value="general" className="flex items-center gap-1.5 text-xs md:text-sm px-2 md:px-3">
            <Settings2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span className="hidden sm:inline">Geral</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-1.5 text-xs md:text-sm px-2 md:px-3">
            <Shield className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span className="hidden sm:inline">Segurança</span>
          </TabsTrigger>
          <TabsTrigger value="workspaces" className="flex items-center gap-1.5 text-xs md:text-sm px-2 md:px-3">
            <Building2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span className="hidden sm:inline">Workspaces</span>
          </TabsTrigger>
        </TabsList>

        {/* WhatsApp Settings */}
        <TabsContent value="whatsapp" className="space-y-6">
          <WhatsAppInstancesSettings />
        </TabsContent>

        {/* Import History Settings */}
        <TabsContent value="import" className="space-y-6">
          <ImportHistorySettings />
        </TabsContent>

        {/* Tags Settings */}
        <TabsContent value="tags" className="space-y-6">
          <TagsSettings />
        </TabsContent>

        {/* CRM Entities Settings */}
        <TabsContent value="crm" className="space-y-6">
          <CrmEntitiesSettings />
        </TabsContent>

        {/* Notifications Settings */}
        <TabsContent value="notifications" className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Preferências de Notificação</CardTitle>
              <CardDescription>
                Configure como e quando você deseja ser notificado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {/* New Message Notifications - Uses persisted settings */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Notificação de novas mensagens</p>
                      <p className="text-sm text-muted-foreground">Exibir alerta no topo da tela ao receber mensagens</p>
                    </div>
                  </div>
                  <Switch
                    checked={notificationSettings.newMessageEnabled}
                    onCheckedChange={(checked) => updateNotificationSettings({ newMessageEnabled: checked })}
                  />
                </div>

                {/* Sound Toggle - Uses persisted settings */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-3">
                    {notificationSettings.soundEnabled ? (
                      <Volume2 className="h-5 w-5 text-primary" />
                    ) : (
                      <VolumeX className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium text-foreground">Som de notificação</p>
                      <p className="text-sm text-muted-foreground">Reproduzir som ao receber novas mensagens</p>
                    </div>
                  </div>
                  <Switch
                    checked={notificationSettings.soundEnabled}
                    onCheckedChange={(checked) => updateNotificationSettings({ soundEnabled: checked })}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">Nova conversa</p>
                    <p className="text-sm text-muted-foreground">Receber alerta quando uma nova conversa iniciar</p>
                  </div>
                  <Switch
                    checked={notifications.newConversation}
                    onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, newConversation: checked }))}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">Menções</p>
                    <p className="text-sm text-muted-foreground">Notificar quando alguém mencionar você</p>
                  </div>
                  <Switch
                    checked={notifications.mentionAlert}
                    onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, mentionAlert: checked }))}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">Relatório diário</p>
                    <p className="text-sm text-muted-foreground">Receber resumo diário por email</p>
                  </div>
                  <Switch
                    checked={notifications.dailyReport}
                    onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, dailyReport: checked }))}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">Relatório semanal</p>
                    <p className="text-sm text-muted-foreground">Receber análise semanal de performance</p>
                  </div>
                  <Switch
                    checked={notifications.weeklyReport}
                    onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, weeklyReport: checked }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Building className="h-5 w-5" />
                Informações da Empresa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nome da Empresa</Label>
                  <Input
                    id="companyName"
                    value={generalSettings.companyName}
                    onChange={(e) => setGeneralSettings(prev => ({ ...prev, companyName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Fuso Horário</Label>
                  <Select
                    value={generalSettings.timezone}
                    onValueChange={(value) => setGeneralSettings(prev => ({ ...prev, timezone: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/Sao_Paulo">São Paulo (GMT-3)</SelectItem>
                      <SelectItem value="America/Fortaleza">Fortaleza (GMT-3)</SelectItem>
                      <SelectItem value="America/Manaus">Manaus (GMT-4)</SelectItem>
                      <SelectItem value="America/Rio_Branco">Rio Branco (GMT-5)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="language">Idioma</Label>
                  <Select
                    value={generalSettings.language}
                    onValueChange={(value) => setGeneralSettings(prev => ({ ...prev, language: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                      <SelectItem value="en-US">English (US)</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-foreground">Modo Escuro</p>
                    <p className="text-sm text-muted-foreground">Usar tema escuro na interface</p>
                  </div>
                  <Switch
                    checked={generalSettings.darkMode}
                    onCheckedChange={(checked) => setGeneralSettings(prev => ({ ...prev, darkMode: checked }))}
                  />
                </div>
              </div>

              <Separator className="my-4" />

              {/* Signature Settings */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <PenLine className="h-4 w-4" />
                  Assinatura nas Mensagens
                </h4>
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${signatureDefault ? 'bg-primary/20' : 'bg-muted'}`}>
                      <PenLine className={`h-5 w-5 ${signatureDefault ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Assinatura automática</p>
                      <p className="text-sm text-muted-foreground">
                        Adicionar seu nome no início das mensagens enviadas
                        {profile?.full_name && (
                          <span className="block text-xs mt-0.5">
                            Assinatura: <strong>{profile.full_name}</strong>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={signatureDefault}
                    onCheckedChange={(checked) => {
                      updateDefaultSignature(checked);
                      toast({
                        title: checked ? 'Assinatura ativada' : 'Assinatura desativada',
                        description: checked
                          ? 'Seu nome será adicionado às mensagens por padrão.'
                          : 'As mensagens serão enviadas sem assinatura por padrão.',
                      });
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Você pode ativar/desativar temporariamente no chat usando o botão de assinatura.
                </p>
              </div>

              <Button className="mt-4">Salvar Alterações</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-6">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Segurança da Conta</CardTitle>
              <CardDescription>
                Gerencie suas configurações de segurança
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Autenticação de Dois Fatores</p>
                      <p className="text-sm text-muted-foreground">Adicione uma camada extra de segurança</p>
                    </div>
                  </div>
                  <Button variant="outline">Configurar</Button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Alterar Senha</p>
                      <p className="text-sm text-muted-foreground">Atualize sua senha regularmente</p>
                    </div>
                  </div>
                  <Button variant="outline">Alterar</Button>
                </div>
              </div>

            </CardContent>
          </Card>
        </TabsContent>

        {/* Workspaces Settings */}
        <TabsContent value="workspaces">
          <WorkspacesSettings />
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
