import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDriveConfig, useUpsertDriveConfig, useDriveBackupLogs, useTriggerDriveBackup } from '@/hooks/useDriveConfig';
import {
  HardDrive,
  CheckCircle,
  XCircle,
  Loader2,
  CloudUpload,
  RotateCcw,
  Clock,
  FileText,
  Tag,
  StickyNote,
  Columns,
  Image,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const BACKUP_INCLUDES_OPTIONS = [
  { key: 'conversations', label: 'Conversas e Mensagens', icon: FileText },
  { key: 'tags', label: 'Tags dos Contatos', icon: Tag },
  { key: 'notes', label: 'Notas dos Contatos', icon: StickyNote },
  { key: 'pipeline', label: 'Pipeline e Posições', icon: Columns },
  { key: 'files', label: 'Arquivos e Mídias', icon: Image },
];

export function DriveTab() {
  const { data: config, isLoading } = useDriveConfig();
  const upsertConfig = useUpsertDriveConfig();
  const { data: backupLogs, isLoading: logsLoading } = useDriveBackupLogs();
  const triggerBackup = useTriggerDriveBackup();

  const [frequency, setFrequency] = useState(config?.backup_frequency || 'manual');
  const [includes, setIncludes] = useState<Record<string, boolean>>(
    (config?.backup_includes as Record<string, boolean>) || {
      conversations: true, tags: true, notes: true, pipeline: true, files: true,
    }
  );

  const isConnected = config?.is_connected ?? false;

  const handleConnect = () => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'zaobtetbjpuzibjymhzw';
    const redirectUri = `https://${projectId}.supabase.co/functions/v1/google-drive-auth`;
    const clientId = ''; // Will be configured via secrets
    
    if (!clientId) {
      // For now, show instructions
      window.open(
        `https://console.cloud.google.com/apis/credentials`,
        '_blank'
      );
      return;
    }
    
    const scope = 'https://www.googleapis.com/auth/drive.file';
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
    window.location.href = url;
  };

  const handleSaveConfig = () => {
    upsertConfig.mutate({
      backup_frequency: frequency,
      backup_includes: includes,
    });
  };

  const handleBackupNow = () => {
    triggerBackup.mutate();
  };

  const toggleInclude = (key: string) => {
    setIncludes((prev) => ({ ...prev, [key]: !prev[key] }));
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
      {/* Connection Status */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <HardDrive className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-foreground">Google Drive</CardTitle>
              <CardDescription>
                Backup automático de todas as informações de atendimento
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
        <CardContent className="space-y-4">
          {isConnected ? (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
              <div>
                <p className="text-sm font-medium text-foreground">{config?.google_email}</p>
                <p className="text-xs text-muted-foreground">Pasta: Wizzy Backup</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleConnect}>
                Reconectar
              </Button>
            </div>
          ) : (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-muted-foreground">
                Conecte sua conta Google Drive para fazer backup automático de todas as conversas, 
                tags, notas, pipeline e arquivos de mídia.
              </p>
              <Button onClick={handleConnect} className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Conectar Google Drive
              </Button>
              <p className="text-xs text-muted-foreground">
                Necessário configurar Google OAuth no Google Cloud Console
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Backup Configuration */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <CloudUpload className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <CardTitle className="text-foreground">Configuração de Backup</CardTitle>
              <CardDescription>
                Defina o que incluir e a frequência dos backups
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Frequency */}
          <div className="space-y-2">
            <Label className="text-foreground">Frequência do Backup</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="daily">Diário</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Includes */}
          <div className="space-y-3">
            <Label className="text-foreground">O que incluir no backup</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {BACKUP_INCLUDES_OPTIONS.map(({ key, label, icon: Icon }) => (
                <label
                  key={key}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    includes[key] ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/30'
                  }`}
                >
                  <Checkbox
                    checked={includes[key] ?? true}
                    onCheckedChange={() => toggleInclude(key)}
                  />
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSaveConfig} disabled={upsertConfig.isPending}>
              {upsertConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar Configuração
            </Button>
            <Button
              variant="outline"
              onClick={handleBackupNow}
              disabled={!isConnected || triggerBackup.isPending}
              className="gap-2"
            >
              {triggerBackup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
              Fazer Backup Agora
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Backup History */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-foreground">Histórico de Backups</CardTitle>
              <CardDescription>Últimos backups realizados</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !backupLogs?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum backup realizado ainda
            </p>
          ) : (
            <div className="space-y-2">
              {backupLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${
                      log.status === 'completed' ? 'bg-green-500' :
                      log.status === 'running' ? 'bg-amber-500 animate-pulse' :
                      'bg-destructive'
                    }`} />
                    <div>
                      <p className="text-sm text-foreground">
                        {format(new Date(log.started_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {log.file_count} arquivos • {log.data_size_bytes ? `${(log.data_size_bytes / 1024 / 1024).toFixed(1)} MB` : '—'}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-xs ${
                    log.status === 'completed' ? 'text-green-600 border-green-500/30' :
                    log.status === 'running' ? 'text-amber-600 border-amber-500/30' :
                    'text-destructive border-destructive/30'
                  }`}>
                    {log.status === 'completed' ? 'Concluído' : log.status === 'running' ? 'Em andamento' : 'Falhou'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
