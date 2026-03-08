import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle, Clock, Link2, LogOut, Loader2 } from 'lucide-react';
import { useCalendarConfig } from '@/hooks/useCalendarConfig';
import { useAuth } from '@/hooks/useAuth';

export function CalendarTab() {
  const { data: config, isLoading } = useCalendarConfig();
  const { profile } = useAuth();
  const isConnected = config?.is_connected ?? false;

  const handleSignInWithGoogle = () => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'zaobtetbjpuzibjymhzw';
    const state = btoa(JSON.stringify({ organization_id: profile?.organization_id }));
    window.location.href = `https://${projectId}.supabase.co/functions/v1/google-calendar-auth?action=login&state=${state}`;
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
                Agendamento automático via agentes de IA e link público
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isConnected ? (
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{config?.google_email}</p>
                  <p className="text-xs text-muted-foreground">Conectado • Calendário: {config?.calendar_id || 'primary'}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5">
                <LogOut className="h-3.5 w-3.5" />
                Desconectar
              </Button>
            </div>
          ) : (
            <div className="text-center py-8 space-y-4">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Conecte seu Google Agenda
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Permita que agentes de IA consultem sua disponibilidade e marquem reuniões.
                </p>
              </div>
              <Button onClick={handleSignInWithGoogle} size="lg" className="gap-2">
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Entrar com Google
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Features Preview */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground text-base">O que você poderá fazer</CardTitle>
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
                Envie um link para o cliente agendar direto com você
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
