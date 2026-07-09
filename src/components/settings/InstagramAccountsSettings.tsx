import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Instagram, Loader2, RefreshCw, Unlink, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import {
  useCheckInstagramStatus,
  useConnectInstagramAccount,
  useDisconnectInstagramAccount,
  useInstagramAccounts,
} from '@/hooks/useInstagramAccounts';

const STATUS_LABEL: Record<string, { label: string; icon: JSX.Element; className: string }> = {
  connected: { label: 'Conectado', icon: <CheckCircle className="h-3.5 w-3.5" />, className: 'bg-green-500/10 text-green-600 border-green-500/20' },
  pending: { label: 'Pendente', icon: <Clock className="h-3.5 w-3.5" />, className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  disconnected: { label: 'Desconectado', icon: <XCircle className="h-3.5 w-3.5" />, className: 'bg-muted text-muted-foreground' },
  error: { label: 'Erro', icon: <XCircle className="h-3.5 w-3.5" />, className: 'bg-destructive/10 text-destructive border-destructive/20' },
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
      toast({ title: 'Falha ao conectar Instagram', description: error, variant: 'destructive' });
    }

    params.delete('instagram_connected');
    params.delete('instagram_username');
    params.delete('instagram_error');
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
                return (
                  <div key={account.id}>
                    {index > 0 && <Separator className="mb-3" />}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-pink-500/10">
                          <Instagram className="h-4 w-4 text-pink-500" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {account.ig_username ? `@${account.ig_username}` : account.label || 'Conta Instagram'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Página do Facebook: {account.facebook_page_id || '—'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`gap-1 ${statusInfo.className}`}>
                          {statusInfo.icon}
                          {statusInfo.label}
                        </Badge>
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
