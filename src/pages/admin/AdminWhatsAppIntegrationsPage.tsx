import { type ElementType, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useAdminWhatsAppIntegrations,
  useUpdateWhatsAppConnectionSettings,
  useUpdateWhatsAppStrategy,
} from '@/hooks/useAdminDashboard';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  PlugZap,
  RefreshCcw,
  Save,
  Server,
  Smartphone,
} from 'lucide-react';

type Provider = 'evolution' | 'uazapi';

interface StrategyForm {
  primary_provider: Provider;
  backup_provider: Provider;
  evolution_enabled: boolean;
  uazapi_enabled: boolean;
  auto_fallback_enabled: boolean;
}

interface ConnectionForm {
  uazapi_base_url: string;
  uazapi_admin_token: string;
  evolution_base_url: string;
  evolution_api_key: string;
  webhook_url: string;
}

const providerLabels: Record<Provider, string> = {
  evolution: 'Evolution API',
  uazapi: 'UAZAPI',
};

export default function AdminWhatsAppIntegrationsPage() {
  const { data, isLoading, refetch, isFetching } = useAdminWhatsAppIntegrations();
  const updateStrategy = useUpdateWhatsAppStrategy();
  const updateConnection = useUpdateWhatsAppConnectionSettings();

  const [strategy, setStrategy] = useState<StrategyForm>({
    primary_provider: 'evolution',
    backup_provider: 'uazapi',
    evolution_enabled: true,
    uazapi_enabled: true,
    auto_fallback_enabled: false,
  });
  const [connection, setConnection] = useState<ConnectionForm>({
    uazapi_base_url: '',
    uazapi_admin_token: '',
    evolution_base_url: '',
    evolution_api_key: '',
    webhook_url: '',
  });

  useEffect(() => {
    if (!data?.strategy) return;
    setStrategy({
      primary_provider: data.strategy.primary_provider,
      backup_provider: data.strategy.backup_provider,
      evolution_enabled: data.strategy.evolution_enabled,
      uazapi_enabled: data.strategy.uazapi_enabled,
      auto_fallback_enabled: data.strategy.auto_fallback_enabled,
    });
  }, [data?.strategy]);

  useEffect(() => {
    if (!data?.connection) return;
    setConnection({
      uazapi_base_url: data.connection.uazapi_base_url || '',
      uazapi_admin_token: data.connection.uazapi_admin_token_masked || '',
      evolution_base_url: data.connection.evolution_base_url || '',
      evolution_api_key: data.connection.evolution_api_key_masked || '',
      webhook_url: data.connection.webhook_url || '',
    });
  }, [data?.connection]);

  const primaryEnabled = strategy.primary_provider === 'evolution' ? strategy.evolution_enabled : strategy.uazapi_enabled;
  const backupEnabled = strategy.backup_provider === 'evolution' ? strategy.evolution_enabled : strategy.uazapi_enabled;
  const canSaveStrategy = strategy.primary_provider !== strategy.backup_provider && primaryEnabled && backupEnabled;

  const currentMode = useMemo(() => {
    const evolutionOnline = !!data?.provider_status?.evolution?.online;
    const uazapiOnline = !!data?.provider_status?.uazapi?.online;

    if (strategy.uazapi_enabled && uazapiOnline && (!strategy.evolution_enabled || !evolutionOnline)) {
      return 'UAZAPI ativo';
    }
    if (strategy.evolution_enabled && evolutionOnline && (!strategy.uazapi_enabled || !uazapiOnline)) {
      return 'Evolution ativo';
    }
    if (strategy.evolution_enabled && strategy.uazapi_enabled) {
      return `${providerLabels[strategy.primary_provider]} principal`;
    }
    if (strategy.uazapi_enabled) return 'UAZAPI ativo';
    if (strategy.evolution_enabled) return 'Evolution ativo';
    return 'WhatsApp desabilitado';
  }, [data?.provider_status?.evolution?.online, data?.provider_status?.uazapi?.online, strategy]);

  const handlePrimaryChange = (provider: Provider) => {
    setStrategy((current) => ({
      ...current,
      primary_provider: provider,
      backup_provider: current.backup_provider === provider ? (provider === 'evolution' ? 'uazapi' : 'evolution') : current.backup_provider,
    }));
  };

  const handleBackupChange = (provider: Provider) => {
    setStrategy((current) => ({
      ...current,
      backup_provider: provider,
      primary_provider: current.primary_provider === provider ? (provider === 'evolution' ? 'uazapi' : 'evolution') : current.primary_provider,
    }));
  };

  const saveStrategy = () => {
    if (!canSaveStrategy) return;
    updateStrategy.mutate(strategy);
  };

  const saveConnection = () => {
    updateConnection.mutate(connection);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">WhatsApp APIs</h1>
            <p className="text-muted-foreground mt-1">
              Controle interno dos provedores, conexões e instâncias dos clientes.
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            {isFetching ? 'Atualizando...' : 'Atualizar status'}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatusMetric title="Modo atual" value={currentMode} icon={PlugZap} isLoading={isLoading} />
          <StatusMetric
            title="Instâncias"
            value={String(data?.summary?.total_instances || 0)}
            description={`${data?.summary?.active_instances || 0} ativas no Wizzy`}
            icon={Smartphone}
            isLoading={isLoading}
          />
          <StatusMetric
            title="Conectadas"
            value={String(data?.summary?.connected_instances || 0)}
            description="status interno conectado"
            icon={CheckCircle2}
            isLoading={isLoading}
          />
          <StatusMetric
            title="Desconectadas"
            value={String(data?.summary?.disconnected_instances || 0)}
            description="exigem atenção"
            icon={AlertTriangle}
            isLoading={isLoading}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ProviderStatusCard
            title="UAZAPI"
            role={strategy.backup_provider === 'uazapi' ? 'Backup operacional' : 'Principal'}
            enabled={strategy.uazapi_enabled}
            status={data?.provider_status?.uazapi}
            baseUrl={data?.connection?.uazapi_base_url}
            tokenConfigured={data?.connection?.uazapi_admin_token_configured}
            isLoading={isLoading}
          />
          <ProviderStatusCard
            title="Evolution API"
            role={strategy.primary_provider === 'evolution' ? 'Principal' : 'Backup operacional'}
            enabled={strategy.evolution_enabled}
            status={data?.provider_status?.evolution}
            baseUrl={data?.connection?.evolution_base_url}
            tokenConfigured={data?.connection?.evolution_api_key_configured}
            isLoading={isLoading}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="h-5 w-5 text-primary" />
                Estratégia da plataforma
              </CardTitle>
              <CardDescription>
                Os dois provedores podem ficar ligados. A troca define quem recebe novas operações.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Provedor principal</Label>
                <Select value={strategy.primary_provider} onValueChange={(value) => handlePrimaryChange(value as Provider)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="evolution">Evolution API</SelectItem>
                    <SelectItem value="uazapi">UAZAPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Backup operacional</Label>
                <Select value={strategy.backup_provider} onValueChange={(value) => handleBackupChange(value as Provider)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uazapi">UAZAPI</SelectItem>
                    <SelectItem value="evolution">Evolution API</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <ProviderSwitch
                label="Evolution API habilitado"
                description="Deixa a API disponível para criar instâncias, QR code e envio."
                checked={strategy.evolution_enabled}
                onCheckedChange={(checked) => setStrategy((current) => ({ ...current, evolution_enabled: checked }))}
              />
              <ProviderSwitch
                label="UAZAPI habilitado"
                description="Mantém a integração atual e as funções zapi-* funcionando."
                checked={strategy.uazapi_enabled}
                onCheckedChange={(checked) => setStrategy((current) => ({ ...current, uazapi_enabled: checked }))}
              />
              <ProviderSwitch
                label="Fallback automático"
                description="Preparado para health-check automático quando o roteador estiver ativo."
                checked={strategy.auto_fallback_enabled}
                onCheckedChange={(checked) => setStrategy((current) => ({ ...current, auto_fallback_enabled: checked }))}
              />

              {!canSaveStrategy && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                  Principal e backup precisam ser diferentes e ambos devem estar habilitados.
                </div>
              )}

              <Button onClick={saveStrategy} disabled={!canSaveStrategy || updateStrategy.isPending} className="w-full gap-2">
                <Save className="h-4 w-4" />
                {updateStrategy.isPending ? 'Salvando...' : 'Salvar estratégia'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ExternalLink className="h-5 w-5 text-primary" />
                Dados de conexão
              </CardTitle>
              <CardDescription>
                Configure aqui as URLs e chaves das APIs gerais. Tokens salvos aparecem mascarados.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <ConnectionField
                label="UAZAPI Base URL"
                value={connection.uazapi_base_url}
                onChange={(value) => setConnection((current) => ({ ...current, uazapi_base_url: value }))}
                placeholder="https://sua-uazapi.com"
              />
              <ConnectionField
                label="UAZAPI Admin Token"
                value={connection.uazapi_admin_token}
                onChange={(value) => setConnection((current) => ({ ...current, uazapi_admin_token: value }))}
                placeholder="admintoken"
                type="password"
              />
              <ConnectionField
                label="Evolution Base URL"
                value={connection.evolution_base_url}
                onChange={(value) => setConnection((current) => ({ ...current, evolution_base_url: value }))}
                placeholder="https://sua-evolution.com"
              />
              <ConnectionField
                label="Evolution API Key"
                value={connection.evolution_api_key}
                onChange={(value) => setConnection((current) => ({ ...current, evolution_api_key: value }))}
                placeholder="apikey global"
                type="password"
              />
              <div className="space-y-2 md:col-span-2">
                <Label>Webhook público</Label>
                <Input
                  value={connection.webhook_url}
                  onChange={(event) => setConnection((current) => ({ ...current, webhook_url: event.target.value }))}
                  placeholder="https://projeto.supabase.co/functions/v1/zapi-webhook"
                />
                <p className="text-xs text-muted-foreground">
                  Use este endpoint nas duas APIs para receber mensagens. O nome zapi-webhook será mantido.
                </p>
              </div>
              <div className="md:col-span-2">
                <Button onClick={saveConnection} disabled={updateConnection.isPending} className="gap-2">
                  <Save className="h-4 w-4" />
                  {updateConnection.isPending ? 'Salvando...' : 'Salvar dados de conexão'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5 text-primary" />
              Instâncias dos clientes
            </CardTitle>
            <CardDescription>
              Status interno por cliente. UAZAPI mostra as instâncias atuais; Evolution entra como segundo provedor quando for pareado.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-6">
                {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-10 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Instância</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>UAZAPI</TableHead>
                    <TableHead>Evolution</TableHead>
                    <TableHead className="text-right">Atualizada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.instances || []).map((instance: any) => (
                    <TableRow key={instance.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{instance.organization?.name || 'Sem organização'}</div>
                        <div className="text-xs text-muted-foreground">{instance.organization?.slug || instance.organization_id}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{instance.label || 'WhatsApp'}</div>
                        <div className="text-xs text-muted-foreground">{instance.zapi_instance_id || 'sem id externo'}</div>
                      </TableCell>
                      <TableCell>{instance.phone_number || '-'}</TableCell>
                      <TableCell>
                        <InstanceStatusBadge status={instance.providers?.uazapi?.status || instance.status} active={instance.is_active} />
                      </TableCell>
                      <TableCell>
                        <InstanceStatusBadge status={instance.providers?.evolution?.status || 'not_configured'} active={false} />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {instance.updated_at ? new Date(instance.updated_at).toLocaleString('pt-BR') : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!data?.instances || data.instances.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Nenhuma instância WhatsApp encontrada no banco.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

function StatusMetric({ title, value, description, icon: Icon, isLoading }: {
  title: string;
  value: string;
  description?: string;
  icon: ElementType;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-28" /> : <div className="text-2xl font-bold text-foreground">{value}</div>}
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}

function ProviderStatusCard({ title, role, enabled, status, baseUrl, tokenConfigured, isLoading }: {
  title: string;
  role: string;
  enabled: boolean;
  status?: any;
  baseUrl?: string;
  tokenConfigured?: boolean;
  isLoading?: boolean;
}) {
  const online = !!status?.online;
  const configured = !!status?.configured;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{role}</CardDescription>
          </div>
          {isLoading ? <Skeleton className="h-6 w-20" /> : (
            <Badge variant="outline" className={online ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600' : 'border-amber-500/20 bg-amber-500/10 text-amber-700'}>
              {online ? 'Online' : configured ? 'Atenção' : 'Não configurado'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <InfoRow label="Habilitado" value={enabled ? 'Sim' : 'Não'} />
        <InfoRow label="Base URL" value={baseUrl || '-'} />
        <InfoRow label="Chave global" value={tokenConfigured ? 'Configurada' : 'Ausente'} />
        <InfoRow label="Instâncias na API" value={String(status?.instance_count ?? 0)} />
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          {status?.message || 'Aguardando consulta.'}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function ConnectionField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} />
    </div>
  );
}

function ProviderSwitch({ label, description, checked, onCheckedChange }: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border p-3">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function InstanceStatusBadge({ status, active }: { status: string; active: boolean }) {
  const normalized = String(status || '').toLowerCase();
  const connected = normalized === 'connected' || normalized === 'open';
  const pending = normalized === 'connecting' || normalized === 'pending';
  const className = connected && active
    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
    : pending
      ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
      : 'bg-muted text-muted-foreground border-border';

  const label = normalized === 'not_configured' ? 'não pareada' : active ? status : `${status} / inativa`;

  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}
