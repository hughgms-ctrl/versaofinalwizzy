import { Download, Smartphone, Share, Plus, Check, Bell, ExternalLink } from 'lucide-react';
import { Button } from '@/fluzz/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/fluzz/components/ui/card';
import { usePWAInstall } from '@/fluzz/hooks/usePWAInstall';
import { useNavigate } from 'react-router-dom';
import logoFluzz from '@/fluzz/assets/logo-fluzz.png';

export default function Install() {
  const { isInstallable, isInstalled, isIOS, isAndroid, canShowPrompt, install } = usePWAInstall();
  const navigate = useNavigate();

  const handleInstall = async () => {
    const success = await install();
    if (success) {
      navigate('/');
    }
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-20 h-20 mb-4">
              <img src={logoFluzz} alt="Fluzz" className="w-full h-full object-contain" />
            </div>
            <CardTitle className="flex items-center justify-center gap-2 text-green-600">
              <Check className="h-6 w-6" />
              App Instalado!
            </CardTitle>
            <CardDescription>
              O Fluzz já está instalado no seu dispositivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full" onClick={() => navigate('/')}>
              Continuar para o App
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-20 h-20 mb-4">
            <img src={logoFluzz} alt="Fluzz" className="w-full h-full object-contain" />
          </div>
          <CardTitle>Instalar Fluzz</CardTitle>
          <CardDescription>
            Instale o app na sua tela inicial para acesso rápido e receber notificações push.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Benefits */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Acesso Rápido</p>
                <p className="text-xs text-muted-foreground">
                  Abra o Fluzz direto da tela inicial, como um app nativo
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Notificações Push</p>
                <p className="text-xs text-muted-foreground">
                  Receba alertas de tarefas e atualizações importantes
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Funciona Offline</p>
                <p className="text-xs text-muted-foreground">
                  Acesse mesmo sem conexão com a internet
                </p>
              </div>
            </div>
          </div>

          {/* Install Instructions */}
          {canShowPrompt && (
            <Button className="w-full gap-2" size="lg" onClick={handleInstall}>
              <Download className="h-5 w-5" />
              Instalar Agora
            </Button>
          )}

          {isIOS && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <p className="font-medium text-sm flex items-center gap-2">
                  🍎 Como instalar no iPhone/iPad:
                </p>
                <ol className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
                    <span>
                      Toque no botão <Share className="inline h-4 w-4 mx-1" /> <strong>Compartilhar</strong> na barra inferior do Safari
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
                    <span>
                      Role para baixo e toque em <Plus className="inline h-4 w-4 mx-1" /> <strong>"Adicionar à Tela de Início"</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
                    <span>Toque em <strong>"Adicionar"</strong> no canto superior direito</span>
                  </li>
                </ol>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                ⚠️ Notificações push no iPhone requerem iOS 16.4 ou superior
              </p>
            </div>
          )}

          {isAndroid && !canShowPrompt && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <p className="font-medium text-sm flex items-center gap-2">
                  🤖 Como instalar no Android:
                </p>
                <ol className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
                    <span>Toque no menu <strong>⋮</strong> (três pontos) no canto superior do Chrome</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
                    <span>Toque em <strong>"Instalar app"</strong> ou <strong>"Adicionar à tela inicial"</strong></span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
                    <span>Confirme tocando em <strong>"Instalar"</strong></span>
                  </li>
                </ol>
              </div>
            </div>
          )}

          {!isIOS && !isAndroid && !canShowPrompt && (
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <p className="font-medium text-sm">💻 Como instalar no computador:</p>
              <ol className="space-y-2 text-sm">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
                  <span>Clique no ícone de instalação <ExternalLink className="inline h-4 w-4 mx-1" /> na barra de endereços</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
                  <span>Clique em <strong>"Instalar"</strong></span>
                </li>
              </ol>
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
            Continuar no Navegador
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
