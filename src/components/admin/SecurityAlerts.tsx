import React from 'react';
import { Shield, AlertTriangle, Building2, User, Globe, Clock } from 'lucide-react';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSecurityAlerts } from '@/hooks/useAdminDashboard';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function SecurityAlerts() {
  const { data, isLoading } = useSecurityAlerts();
  const alerts = data?.alerts || [];
  const hasAlerts = alerts.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className={`relative ${hasAlerts ? 'text-warning animate-pulse' : 'text-muted-foreground'}`}
        >
          <Shield className="h-5 w-5" />
          {hasAlerts && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 px-1 min-w-[1.2rem] h-5 flex items-center justify-center text-[10px]"
            >
              {alerts.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Alertas de Segurança
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Sign-ups suspeitos detectados via fingerprinting
          </p>
        </div>
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Carregando alertas...
            </div>
          ) : alerts.length === 0 ? (
            <div className="p-8 text-center">
              <Shield className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum alerta recente</p>
            </div>
          ) : (
            <div className="divide-y">
              {alerts.map((alert: any) => (
                <div key={alert.fingerprint_id} className="p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <div className="p-2 bg-destructive/10 rounded-full">
                        <User className="h-4 w-4 text-destructive" />
                      </div>
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        Tentativa de Re-cadastro
                      </p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        {alert.organization_name}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        IP: {alert.ip_address}
                      </div>
                      {alert.created_at && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {format(new Date(alert.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </div>
                      )}
                      <div className="mt-2 p-2 bg-warning/5 border border-warning/10 rounded text-[10px] text-warning-foreground italic">
                        "{alert.reason}"
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="p-2 border-t bg-muted/30">
          <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
            <a href="/admin/security">Ver histórico completo</a>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
