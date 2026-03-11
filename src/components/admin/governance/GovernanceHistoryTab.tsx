import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useGovernanceActionLogs, useGovernanceCertifications } from '@/hooks/useGovernance';
import { ScrollText, Award, CheckCircle2, XCircle, ArrowUpDown } from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  create_check: 'Criar verificação',
  update_check: 'Atualizar verificação',
  delete_check: 'Remover verificação',
  create_prompt: 'Criar prompt',
  update_prompt: 'Atualizar prompt',
  delete_prompt: 'Remover prompt',
  issue_certification: 'Emitir certificação',
  revoke_certification: 'Revogar certificação',
};

const ACTION_COLORS: Record<string, string> = {
  create_check: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  update_check: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  delete_check: 'bg-destructive/10 text-destructive border-destructive/20',
  create_prompt: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  update_prompt: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  delete_prompt: 'bg-destructive/10 text-destructive border-destructive/20',
  issue_certification: 'bg-primary/10 text-primary border-primary/20',
  revoke_certification: 'bg-destructive/10 text-destructive border-destructive/20',
};

export function GovernanceHistoryTab() {
  const { data: logsData, isLoading: logsLoading } = useGovernanceActionLogs();
  const { data: certsData, isLoading: certsLoading } = useGovernanceCertifications();

  const logs = logsData?.logs || [];
  const certs = certsData?.certifications || [];

  return (
    <div className="space-y-6">
      {/* Certifications History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            Histórico de Certificações
          </CardTitle>
        </CardHeader>
        <CardContent>
          {certsLoading ? (
            <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-12" />)}</div>
          ) : certs.length > 0 ? (
            <div className="space-y-3">
              {certs.map((cert: any) => (
                <div key={cert.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  {cert.status === 'issued' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">Score: {cert.score}/100</span>
                      <Badge variant={cert.status === 'issued' ? 'default' : 'destructive'}>
                        {cert.status === 'issued' ? 'Ativa' : cert.status === 'revoked' ? 'Revogada' : 'Substituída'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Segurança: {cert.security_score}% · Emitida em {new Date(cert.issued_at).toLocaleDateString('pt-BR')}
                      {cert.revoked_at && ` · Revogada em ${new Date(cert.revoked_at).toLocaleDateString('pt-BR')}`}
                    </p>
                    {cert.revoke_reason && (
                      <p className="text-xs text-destructive mt-0.5">Motivo: {cert.revoke_reason}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma certificação emitida.</p>
          )}
        </CardContent>
      </Card>

      {/* Action Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" />
            Log de Ações
            <Badge variant="outline" className="ml-auto">{logs.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="p-6 space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Nome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <Badge className={ACTION_COLORS[log.action] || 'bg-muted text-muted-foreground'} variant="outline">
                        {ACTION_LABELS[log.action] || log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{log.entity_type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.entity_name || '—'}</TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Nenhuma ação registrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}