import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle, XCircle, ExternalLink, Clock, Link2 } from 'lucide-react';
import { useCalendarConfig } from '@/hooks/useCalendarConfig';
import { Loader2 } from 'lucide-react';

export function CalendarTab() {
  const { data: config, isLoading } = useCalendarConfig();
  const isConnected = config?.is_connected ?? false;

  const handleConnect = () => {
    window.open('https://console.cloud.google.com/apis/credentials', '_blank');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Connection */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Calendar className="h-5 w-5 text-orange-500" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-foreground">Google Agenda</CardTitle>
              <CardDescription>
                Conecte seu Google Calendar para agendamento automático via agentes de IA
              </CardDescription>
            </div>
            {isConnected ? (
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                <CheckCircle className="h-3 w-3 mr-1" /> Conectado
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-muted text-muted-foreground">
                <XCircle className="h-3 w-3 mr-1" /> Desconectado
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isConnected ? (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
              <div>
                <p className="text-sm font-medium text-foreground">{config?.google_email}</p>
                <p className="text-xs text-muted-foreground">Calendário: {config?.calendar_id || 'primary'}</p>
              </div>
              <Button variant="outline" size="sm">
                Reconectar
              </Button>
            </div>
          ) : (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-muted-foreground">
                Conecte para que agentes de IA possam consultar disponibilidade e marcar reuniões 
                diretamente no seu Google Calendar.
              </p>
              <Button onClick={handleConnect} className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Conectar Google Agenda
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Features Preview */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Funcionalidades</CardTitle>
          <CardDescription>O que será possível com a integração do Google Agenda</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-2">
              <div className="p-2 rounded-lg bg-blue-500/10 w-fit">
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
              <h4 className="font-medium text-foreground text-sm">Disponibilidade</h4>
              <p className="text-xs text-muted-foreground">
                Configure dias e horários disponíveis para agendamento
              </p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-2">
              <div className="p-2 rounded-lg bg-green-500/10 w-fit">
                <Calendar className="h-5 w-5 text-green-500" />
              </div>
              <h4 className="font-medium text-foreground text-sm">Agendamento por IA</h4>
              <p className="text-xs text-muted-foreground">
                Agentes consultam sua agenda e marcam reuniões automaticamente
              </p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-2">
              <div className="p-2 rounded-lg bg-purple-500/10 w-fit">
                <Link2 className="h-5 w-5 text-purple-500" />
              </div>
              <h4 className="font-medium text-foreground text-sm">Link Público</h4>
              <p className="text-xs text-muted-foreground">
                Link para o cliente agendar diretamente com seus horários disponíveis
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
