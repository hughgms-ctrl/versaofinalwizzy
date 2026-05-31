import { type ElementType, type ReactNode, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  PaymentGatewayProvider,
  useAdminPaymentGateways,
  useUpdatePaymentGatewayConnectionSettings,
  useUpdatePaymentGatewayStrategy,
} from '@/hooks/useAdminDashboard';
import { CheckCircle2, CreditCard, ExternalLink, RefreshCcw, Save, ShieldCheck, WalletCards } from 'lucide-react';

interface StrategyForm {
  active_provider: PaymentGatewayProvider;
  asaas_enabled: boolean;
  stripe_enabled: boolean;
  test_mode: boolean;
}

interface ConnectionForm {
  asaas_base_url: string;
  asaas_api_key: string;
  asaas_webhook_token: string;
  stripe_secret_key: string;
  stripe_publishable_key: string;
  stripe_webhook_secret: string;
  checkout_success_url: string;
  checkout_cancel_url: string;
}

const providerLabels: Record<PaymentGatewayProvider, string> = {
  asaas: 'ASAAS',
  stripe: 'Stripe',
};

export default function AdminPaymentGatewaysPage() {
  const { data, isLoading, refetch, isFetching } = useAdminPaymentGateways();
  const updateStrategy = useUpdatePaymentGatewayStrategy();
  const updateConnection = useUpdatePaymentGatewayConnectionSettings();

  const [strategy, setStrategy] = useState<StrategyForm>({
    active_provider: 'asaas',
    asaas_enabled: true,
    stripe_enabled: false,
    test_mode: true,
  });
  const [connection, setConnection] = useState<ConnectionForm>({
    asaas_base_url: '',
    asaas_api_key: '',
    asaas_webhook_token: '',
    stripe_secret_key: '',
    stripe_publishable_key: '',
    stripe_webhook_secret: '',
    checkout_success_url: '',
    checkout_cancel_url: '',
  });

  useEffect(() => {
    if (!data?.strategy) return;
    setStrategy({
      active_provider: data.strategy.active_provider,
      asaas_enabled: data.strategy.asaas_enabled,
      stripe_enabled: data.strategy.stripe_enabled,
      test_mode: data.strategy.test_mode,
    });
  }, [data?.strategy]);

  useEffect(() => {
    if (!data?.connection) return;
    setConnection({
      asaas_base_url: data.connection.asaas_base_url || '',
      asaas_api_key: data.connection.asaas_api_key_masked || '',
      asaas_webhook_token: data.connection.asaas_webhook_token_masked || '',
      stripe_secret_key: data.connection.stripe_secret_key_masked || '',
      stripe_publishable_key: data.connection.stripe_publishable_key || '',
      stripe_webhook_secret: data.connection.stripe_webhook_secret_masked || '',
      checkout_success_url: data.connection.checkout_success_url || '',
      checkout_cancel_url: data.connection.checkout_cancel_url || '',
    });
  }, [data?.connection]);

  const activeEnabled = strategy.active_provider === 'asaas' ? strategy.asaas_enabled : strategy.stripe_enabled;
  const canSaveStrategy = activeEnabled;

  const currentMode = useMemo(() => {
    if (!activeEnabled) return 'Gateway desabilitado';
    return `${providerLabels[strategy.active_provider]} ativo`;
  }, [activeEnabled, strategy.active_provider]);

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
            <h1 className="text-3xl font-bold text-foreground">Gateways de Pagamento</h1>
            <p className="mt-1 text-muted-foreground">
              Configure ASAAS e Stripe em caminhos separados e escolha qual gateway recebe novas cobrancas.
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            {isFetching ? 'Atualizando...' : 'Atualizar'}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatusMetric title="Gateway atual" value={currentMode} icon={WalletCards} isLoading={isLoading} />
          <StatusMetric
            title="Modo"
            value={strategy.test_mode ? 'Teste' : 'Producao'}
            description="aplicado ao provedor ativo"
            icon={ShieldCheck}
            isLoading={isLoading}
          />
          <StatusMetric
            title="Webhooks"
            value={data?.summary?.configured_webhooks || '0/2'}
            description="ASAAS e Stripe separados"
            icon={ExternalLink}
            isLoading={isLoading}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ProviderStatusCard
            title="ASAAS"
            role={strategy.active_provider === 'asaas' ? 'Recebendo cobrancas' : 'Configurado como alternativa'}
            enabled={strategy.asaas_enabled}
            configured={data?.provider_status?.asaas?.configured}
            webhookUrl={data?.provider_status?.asaas?.webhook_url}
            credentialLabel="API Key"
            credentialConfigured={data?.connection?.asaas_api_key_configured}
            isLoading={isLoading}
          />
          <ProviderStatusCard
            title="Stripe"
            role={strategy.active_provider === 'stripe' ? 'Recebendo cobrancas' : 'Configurado como alternativa'}
            enabled={strategy.stripe_enabled}
            configured={data?.provider_status?.stripe?.configured}
            webhookUrl={data?.provider_status?.stripe?.webhook_url}
            credentialLabel="Secret Key"
            credentialConfigured={data?.connection?.stripe_secret_key_configured}
            isLoading={isLoading}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-5 w-5 text-primary" />
                Estrategia de cobranca
              </CardTitle>
              <CardDescription>
                O gateway ativo sera usado nos novos checkouts. O outro pode ficar salvo para troca manual.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Gateway ativo</Label>
                <Select
                  value={strategy.active_provider}
                  onValueChange={(value) => setStrategy((current) => ({ ...current, active_provider: value as PaymentGatewayProvider }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asaas">ASAAS</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <ProviderSwitch
                label="ASAAS habilitado"
                description="Permite criar cobrancas, assinaturas e receber webhooks pelo caminho ASAAS."
                checked={strategy.asaas_enabled}
                onCheckedChange={(checked) => setStrategy((current) => ({ ...current, asaas_enabled: checked }))}
              />
              <ProviderSwitch
                label="Stripe habilitado"
                description="Permite criar checkouts, assinaturas e receber webhooks pelo caminho Stripe."
                checked={strategy.stripe_enabled}
                onCheckedChange={(checked) => setStrategy((current) => ({ ...current, stripe_enabled: checked }))}
              />
              <ProviderSwitch
                label="Modo de teste"
                description="Mantem as cobrancas em ambiente de teste enquanto a operacao nao estiver em producao."
                checked={strategy.test_mode}
                onCheckedChange={(checked) => setStrategy((current) => ({ ...current, test_mode: checked }))}
              />

              {!canSaveStrategy && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                  O gateway ativo precisa estar habilitado antes de salvar.
                </div>
              )}

              <Button onClick={saveStrategy} disabled={!canSaveStrategy || updateStrategy.isPending} className="w-full gap-2">
                <Save className="h-4 w-4" />
                {updateStrategy.isPending ? 'Salvando...' : 'Salvar gateway ativo'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ExternalLink className="h-5 w-5 text-primary" />
                Credenciais e URLs
              </CardTitle>
              <CardDescription>
                Chaves salvas aparecem mascaradas. ASAAS e Stripe ficam independentes para manter dois caminhos de pagamento.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <GatewayFieldsSection title="ASAAS">
                <div className="grid gap-4 md:grid-cols-2">
                  <ConnectionField
                    label="Base URL"
                    value={connection.asaas_base_url}
                    onChange={(value) => setConnection((current) => ({ ...current, asaas_base_url: value }))}
                    placeholder="https://api-sandbox.asaas.com/v3"
                  />
                  <ConnectionField
                    label="API Key"
                    value={connection.asaas_api_key}
                    onChange={(value) => setConnection((current) => ({ ...current, asaas_api_key: value }))}
                    placeholder="$aact_..."
                    type="password"
                  />
                  <ConnectionField
                    label="Webhook Token"
                    value={connection.asaas_webhook_token}
                    onChange={(value) => setConnection((current) => ({ ...current, asaas_webhook_token: value }))}
                    placeholder="token do webhook"
                    type="password"
                  />
                </div>
              </GatewayFieldsSection>

              <GatewayFieldsSection title="Stripe">
                <div className="grid gap-4 md:grid-cols-2">
                  <ConnectionField
                    label="Secret Key"
                    value={connection.stripe_secret_key}
                    onChange={(value) => setConnection((current) => ({ ...current, stripe_secret_key: value }))}
                    placeholder="sk_test_..."
                    type="password"
                  />
                  <ConnectionField
                    label="Publishable Key"
                    value={connection.stripe_publishable_key}
                    onChange={(value) => setConnection((current) => ({ ...current, stripe_publishable_key: value }))}
                    placeholder="pk_test_..."
                  />
                  <ConnectionField
                    label="Webhook Secret"
                    value={connection.stripe_webhook_secret}
                    onChange={(value) => setConnection((current) => ({ ...current, stripe_webhook_secret: value }))}
                    placeholder="whsec_..."
                    type="password"
                  />
                </div>
              </GatewayFieldsSection>

              <GatewayFieldsSection title="Checkout">
                <div className="grid gap-4 md:grid-cols-2">
                  <ConnectionField
                    label="URL sucesso checkout"
                    value={connection.checkout_success_url}
                    onChange={(value) => setConnection((current) => ({ ...current, checkout_success_url: value }))}
                    placeholder="https://app.seudominio.com/plans?checkout=success"
                  />
                  <ConnectionField
                    label="URL cancelamento checkout"
                    value={connection.checkout_cancel_url}
                    onChange={(value) => setConnection((current) => ({ ...current, checkout_cancel_url: value }))}
                    placeholder="https://app.seudominio.com/plans?checkout=cancel"
                  />
                </div>
              </GatewayFieldsSection>

              <div className="space-y-2">
                <Label>Endpoints de webhook</Label>
                <div className="grid gap-2 text-sm">
                  <code className="rounded-md bg-muted px-3 py-2 text-muted-foreground">{data?.webhooks?.asaas || '-'}</code>
                  <code className="rounded-md bg-muted px-3 py-2 text-muted-foreground">{data?.webhooks?.stripe || '-'}</code>
                </div>
              </div>
              <div>
                <Button onClick={saveConnection} disabled={updateConnection.isPending} className="gap-2">
                  <Save className="h-4 w-4" />
                  {updateConnection.isPending ? 'Salvando...' : 'Salvar credenciais'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
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

function ProviderStatusCard({ title, role, enabled, configured, webhookUrl, credentialLabel, credentialConfigured, isLoading }: {
  title: string;
  role: string;
  enabled: boolean;
  configured?: boolean;
  webhookUrl?: string;
  credentialLabel: string;
  credentialConfigured?: boolean;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{role}</CardDescription>
          </div>
          {isLoading ? <Skeleton className="h-6 w-24" /> : (
            <Badge variant="outline" className={enabled && configured ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600' : 'border-amber-500/20 bg-amber-500/10 text-amber-700'}>
              {enabled && configured ? 'Pronto' : configured ? 'Desligado' : 'Nao configurado'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <InfoRow label="Habilitado" value={enabled ? 'Sim' : 'Nao'} />
        <InfoRow label={credentialLabel} value={credentialConfigured ? 'Configurada' : 'Ausente'} />
        <InfoRow label="Webhook" value={webhookUrl || '-'} />
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Caminho separado para checkout, assinatura e webhook deste provedor.
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

function GatewayFieldsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="border-b pb-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">{title}</h3>
      </div>
      {children}
    </section>
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
