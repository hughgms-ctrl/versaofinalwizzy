import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDriveConfig, useUpsertDriveConfig, useDriveBackupLogs, useTriggerDriveBackup } from '@/hooks/useDriveConfig';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
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
  LogOut,
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

  const [frequency, setFrequency] = useState('manual');
  const [includes, setIncludes] = useState<Record<string, boolean>>({
    conversations: true, tags: true, notes: true, pipeline: true, files: true,
  });

  useEffect(() => {
    if (config) {
      setFrequency(config.backup_frequency || 'manual');
      if (config.backup_includes) {
        setIncludes(config.backup_includes as Record<string, boolean>);
      }
    }
  }, [config]);

  const isConnected = config?.is_connected ?? false;

  const handleSignInWithGoogle = async () => {
    // O `state` do OAuth é montado e assinado no servidor a partir do JWT
    // (invoke anexa o header de auth). O front nunca escolhe organization_id.
    const { data, error } = await supabase.functions.invoke('google-drive-auth', {
      body: { action: 'login' },
    });
    if (error || !data?.authUrl) {
      toast({ title: 'Erro ao conectar Google Drive', description: error?.message, variant: 'destructive' });
      return;
    }
    window.location.href = data.authUrl;
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
                  <p className="text-xs text-muted-foreground">Conectado • Pasta: Wizzy Backup</p>
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
                <HardDrive className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Conecte seu Google Drive
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Faça backup automático de conversas, tags, notas, pipeline e arquivos.
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

      {/* Backup Configuration - only show when connected */}
      {isConnected && (
        <>
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
              <div className="space-y-2">
                <Label className="text-foreground">Frequência</Label>
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

              <div className="space-y-3">
                <Label className="text-foreground">O que incluir</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {BACKUP_INCLUDES_OPTIONS.map(({ key, label, icon: Icon }) => (
                    <label
                      key={key}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        includes[key] ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30'
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
                  {upsertConfig.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Salvar
                </Button>
                <Button
                  variant="outline"
                  onClick={handleBackupNow}
                  disabled={triggerBackup.isPending}
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
        </>
      )}
    </div>
  );
}
