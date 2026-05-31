import { Bell, BellOff, BellRing, Loader2, TestTube, LaptopMinimal } from 'lucide-react';
import { Button } from '@/fluzz/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/fluzz/components/ui/card';
import { usePushNotifications } from '@/fluzz/hooks/usePushNotifications';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

function endpointPreview(endpoint: string | null) {
  if (!endpoint) return '—';
  const suffix = endpoint.slice(-14);
  return `…${suffix}`;
}

export function PushNotificationSettings() {
  const navigate = useNavigate();

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    (navigator as any).standalone === true;

  const {
    permission,
    isSubscribed,
    isLoading,
    isSupported,
    localEndpoint,
    subscribe,
    unsubscribe,
    sendTestNotification,
  } = usePushNotifications();

  const handleRequestPermission = async () => {
    if (!isSupported) {
      toast.error('Seu navegador não suporta notificações push');
      return;
    }

    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        toast.success('Permissão concedida! Agora clique em "Ativar" para receber notificações.');
      } else if (result === 'denied') {
        toast.error('Permissão negada. Você pode alterar isso nas configurações do navegador.');
      } else {
        toast.info('Você fechou o prompt. Clique novamente para permitir notificações.');
      }
    } catch (error) {
      console.error('Error requesting permission:', error);
      toast.error('Erro ao solicitar permissão');
    }
  };

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5" />
            Notificações Push
          </CardTitle>
          <CardDescription>
            {isIOS
              ? 'No iPhone, notificações push só funcionam com o app instalado na Tela de Início (iOS 16.4+).'
              : 'Seu navegador não suporta notificações push.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isIOS && !isStandalone && (
            <Button className="w-full" onClick={() => navigate('/install')}>
              Ir para instalação do app
            </Button>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              toast.message('Recarregando...');
              setTimeout(() => window.location.reload(), 50);
            }}
          >
            Recarregar página
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notificações Push
        </CardTitle>
        <CardDescription>
          Receba notificações no seu dispositivo quando houver atualizações importantes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isSubscribed && (
          <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg space-y-3">
            <div className="flex items-start gap-3">
              <BellRing className="h-5 w-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Ative as notificações</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Clique no botão abaixo para ativar notificações push e receber alertas de tarefas e
                  atualizações importantes.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                onClick={subscribe}
                className="w-full"
                variant="default"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Bell className="h-4 w-4 mr-2" />
                )}
                Ativar Notificações Push
              </Button>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleRequestPermission}
                disabled={isLoading}
              >
                Solicitar permissão
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Status</p>
            <p className="text-sm text-muted-foreground">
              {permission === 'denied'
                ? 'Notificações bloqueadas pelo navegador'
                : isSubscribed
                  ? 'Notificações ativadas ✓'
                  : 'Notificações desativadas'}
            </p>
          </div>

          {isSubscribed && (
            <Button variant="outline" onClick={unsubscribe} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <BellOff className="h-4 w-4 mr-2" />
              )}
              Desativar
            </Button>
          )}
        </div>

        {isSubscribed && (
          <div className="pt-4 border-t space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-2 text-foreground">
                <LaptopMinimal className="h-4 w-4" />
                <span className="font-medium">Diagnóstico deste dispositivo</span>
              </div>
              <p>
                <span className="text-foreground">Permissão:</span> {permission}
              </p>
              <p>
                <span className="text-foreground">Subscription:</span> {endpointPreview(localEndpoint)}
              </p>
            </div>

            <Button variant="outline" size="sm" className="w-full" onClick={sendTestNotification}>
              <TestTube className="h-4 w-4 mr-2" />
              Enviar notificação de teste
            </Button>
          </div>
        )}

        {permission === 'denied' && (
          <div className="p-3 bg-destructive/10 rounded-md text-sm space-y-2">
            <p className="text-destructive font-medium">Notificações bloqueadas</p>
            <p className="text-muted-foreground">Para liberar as notificações:</p>
            <div className="text-muted-foreground space-y-3 text-xs">
              <div>
                <p className="font-medium text-foreground mb-1">💻 No computador:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>
                    <strong>Chrome/Edge:</strong> Clique no ícone à esquerda da URL → Permissões →
                    Notificações → Permitir
                  </li>
                  <li>
                    <strong>Firefox:</strong> Clique no cadeado → Conexão segura → Permissões
                  </li>
                  <li>
                    <strong>Safari:</strong> Safari → Preferências → Sites → Notificações
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground mb-1">📱 No celular Android:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Toque no ícone de cadeado/info na barra de endereço</li>
                  <li>Toque em "Permissões" ou "Configurações do site"</li>
                  <li>Ative "Notificações"</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground mb-1">🍎 No iPhone (iOS 16.4+):</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>
                    Primeiro, adicione o app à tela inicial (Compartilhar → Adicionar à Tela de
                    Início)
                  </li>
                  <li>Abra o app pela tela inicial</li>
                  <li>Vá em Ajustes → Notificações → [Nome do App] → Permitir</li>
                </ul>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
              Após liberar, recarregue a página e clique em "Ativar Notificações Push" novamente.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
