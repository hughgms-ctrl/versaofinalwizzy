import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Instagram, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { EngageStatus, type EngageTone } from '@/components/instagram/EngageUI';
import { useToast } from '@/hooks/use-toast';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import {
  useCheckInstagramStatus,
  useConnectInstagramAccount,
  useDisconnectInstagramAccount,
  useInstagramAccounts,
} from '@/hooks/useInstagramAccounts';

/**
 * O estado da conta, no mesmo vocabulário do Wizzy Engage.
 *
 * Antes eram cores cravadas na mão — `text-green-600`, `text-yellow-600` — que
 * não existem em lugar nenhum do resto do produto e ficam abaixo de 4.5:1 em
 * corpo pequeno. Aqui o estado é um ponto colorido com texto legível ao lado,
 * igual à lista de contatos e ao histórico de disparos: quem sai desta tela e
 * entra no Engage reconhece o mesmo sinal.
 */
const STATUS_LABEL: Record<string, { label: string; tone: EngageTone }> = {
  connected: { label: 'Conectado', tone: 'ok' },
  pending: { label: 'Conexão incompleta', tone: 'warn' },
  disconnected: { label: 'Desconectado', tone: 'idle' },
  error: { label: 'Acesso recusado', tone: 'error' },
  expired: { label: 'Acesso vencido', tone: 'error' },
};

// O que dizer ao dono em cada estado que não é "conectado". Sem isto a conta
// aparecia só como um selo vermelho, sem explicar que a automação está parada
// nem o que fazer — e 'expired' nem tinha selo: caía no rótulo "Desconectado".
const STATUS_HINT: Record<string, string> = {
  expired: 'O acesso ao Instagram venceu e a automação está parada. Clique em Reconectar para autorizar de novo.',
  error: 'A Meta recusou o acesso desta conta e a automação está parada. Clique em Reconectar para autorizar de novo.',
  disconnected: 'Conta desconectada. A automação não roda enquanto ela estiver assim.',
  pending: 'Conexão não concluída. Refaça a autorização para ativar a automação.',
};

// O callback do OAuth volta como redirect do navegador, então o motivo da
// falha chega na URL. Traduzido aqui porque "connection_failed" sozinho não
// dizia nada — e a etapa aponta direto para o culpado.
const ERROR_LABEL: Record<string, string> = {
  access_denied: 'A autorização foi recusada no Instagram.',
  missing_code_or_state: 'O Instagram voltou sem os dados da autorização.',
  invalid_or_expired_state: 'O pedido de conexão expirou. Tente de novo.',
  app_not_configured: 'O app do Instagram não está configurado neste ambiente (IG_APP_ID/IG_APP_SECRET).',
  connection_failed: 'A conexão falhou.',
};

const ERROR_STEP_LABEL: Record<string, string> = {
  token_exchange: 'Etapa: troca do código pelo token (confira o ID e a chave secreta do app na Meta).',
  long_lived_token: 'Etapa: geração do token de 60 dias.',
  profile: 'Etapa: leitura do perfil (permissões concedidas).',
  save: 'Etapa: gravação da conta no banco.',
};

export function InstagramAccountsSettings() {
  const { toast } = useToast();
  const { selectedOrganizationId } = useWorkspaceContext();
  const { data: accounts = [], isLoading } = useInstagramAccounts();
  const connectAccount = useConnectInstagramAccount();
  const disconnectAccount = useDisconnectInstagramAccount();
  const checkStatus = useCheckInstagramStatus();
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  // The OAuth callback (instagram-oauth-callback) redirects back here with
  // ?instagram_connected=1 or ?instagram_error=... — surface that as a toast
  // once and clean the URL so a refresh doesn't re-show it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('instagram_connected');
    const error = params.get('instagram_error');
    if (!connected && !error) return;

    if (connected) {
      const username = params.get('instagram_username');
      toast({
        title: 'Instagram conectado!',
        description: username ? `Conta @${username} conectada com sucesso.` : 'Conta conectada com sucesso.',
      });
    } else if (error) {
      const step = params.get('instagram_error_step');
      const detail = params.get('instagram_error_detail');
      const description = [
        ERROR_LABEL[error] || error,
        step ? ERROR_STEP_LABEL[step] : null,
        detail,
      ].filter(Boolean).join(' · ');
      toast({
        title: 'Falha ao conectar Instagram',
        description,
        variant: 'destructive',
        duration: 15000,
      });
    }

    params.delete('instagram_connected');
    params.delete('instagram_username');
    params.delete('instagram_error');
    params.delete('instagram_error_step');
    params.delete('instagram_error_detail');
    const newSearch = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : ''));
  }, [toast]);

  const handleConnect = async () => {
    try {
      const url = await connectAccount.mutateAsync({
        organizationId: selectedOrganizationId || undefined,
      });
      window.location.href = url;
    } catch (error: any) {
      toast({ title: 'Erro ao conectar Instagram', description: error.message, variant: 'destructive' });
    }
  };

  const handleDisconnect = async (accountId: string) => {
    setDisconnectingId(accountId);
    try {
      await disconnectAccount.mutateAsync(accountId);
      toast({ title: 'Instagram desconectado' });
    } catch (error: any) {
      toast({ title: 'Erro ao desconectar', description: error.message, variant: 'destructive' });
    } finally {
      setDisconnectingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-pink-500/10">
                <Instagram className="h-5 w-5 text-pink-500" />
              </div>
              <div>
                <CardTitle className="text-foreground">Instagram</CardTitle>
                <CardDescription>
                  Conecte um perfil profissional do Instagram (via Meta) para automatizar comentários e DMs
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              {accounts.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => checkStatus.mutate()}
                  disabled={checkStatus.isPending}
                  className="gap-2"
                >
                  {checkStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Verificar status
                </Button>
              )}
              <Button onClick={handleConnect} disabled={connectAccount.isPending} className="gap-2">
                {connectAccount.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="h-4 w-4" />}
                Conectar via Facebook
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Instagram className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhuma conta do Instagram conectada ainda. Clique em "Conectar via Facebook" para vincular um
                perfil profissional (Business/Creator) vinculado a uma Página do Facebook.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account, index) => {
                const statusInfo = STATUS_LABEL[account.status] || STATUS_LABEL.disconnected;
                const hint = account.status === 'connected' ? null : STATUS_HINT[account.status] || STATUS_HINT.disconnected;
                return (
                  <div key={account.id}>
                    {index > 0 && <Separator className="mb-3" />}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        {account.ig_profile_pic_url ? (
                          <img
                            src={account.ig_profile_pic_url}
                            alt={account.ig_username || 'Instagram'}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="p-2 rounded-lg bg-pink-500/10">
                            <Instagram className="h-4 w-4 text-pink-500" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-foreground">
                            {account.ig_name || (account.ig_username ? `@${account.ig_username}` : account.label || 'Conta Instagram')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {account.ig_username ? `@${account.ig_username}` : 'Conta Instagram'}
                          </p>
                          {hint && <p className="text-xs text-destructive mt-1 max-w-md">{hint}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <EngageStatus tone={statusInfo.tone} className="mr-1">
                          {statusInfo.label}
                        </EngageStatus>
                        {account.status !== 'connected' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={connectAccount.isPending}
                            onClick={handleConnect}
                          >
                            {connectAccount.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Reconectar
                          </Button>
                        )}
                        {account.status !== 'disconnected' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-muted-foreground hover:text-destructive"
                            disabled={disconnectingId === account.id}
                            onClick={() => handleDisconnect(account.id)}
                          >
                            {disconnectingId === account.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Unlink className="h-3.5 w-3.5" />
                            )}
                            Desconectar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
