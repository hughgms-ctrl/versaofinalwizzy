import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import {
  useAdminToolFlags,
  useUpdateToolFlags,
  useUpdateInternalTestOrgs,
} from '@/hooks/useAdminDashboard';

const BETA_TOOLS: { key: string; name: string; description: string }[] = [
  { key: 'wizzy_carrossel', name: 'Wizzy Carrossel', description: 'Geração de carrosséis para Instagram com IA.' },
  { key: 'wizzy_prev', name: 'Wizzy Prev', description: 'Análise de CNIS para fins de Auxílio Reclusão e outros.' },
  { key: 'wizzy_engage', name: 'Wizzy Engage', description: 'Automações estilo ManyChat para o Instagram.' },
];

export default function AdminFeatureFlagsPage() {
  const { data, isLoading } = useAdminToolFlags();
  const updateFlags = useUpdateToolFlags();
  const updateInternalOrgs = useUpdateInternalTestOrgs();

  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [internalOrgIds, setInternalOrgIds] = useState<string[]>([]);
  const [orgSearch, setOrgSearch] = useState('');

  useEffect(() => {
    if (data) {
      setFlags(data.flags || {});
      setInternalOrgIds(data.internal_org_ids || []);
    }
  }, [data]);

  const organizations: { id: string; name: string }[] = data?.organizations || [];

  const selectedOrgs = useMemo(
    () => organizations.filter((org) => internalOrgIds.includes(org.id)),
    [organizations, internalOrgIds],
  );

  const searchResults = useMemo(() => {
    if (!orgSearch.trim()) return [];
    const term = orgSearch.trim().toLowerCase();
    return organizations
      .filter((org) => !internalOrgIds.includes(org.id) && org.name?.toLowerCase().includes(term))
      .slice(0, 8);
  }, [orgSearch, organizations, internalOrgIds]);

  const handleToggleFlag = (key: string, value: boolean) => {
    const next = { ...flags, [key]: value };
    setFlags(next);
    updateFlags.mutate(next);
  };

  const handleAddOrg = (orgId: string) => {
    const next = [...internalOrgIds, orgId];
    setInternalOrgIds(next);
    setOrgSearch('');
    updateInternalOrgs.mutate(next);
  };

  const handleRemoveOrg = (orgId: string) => {
    const next = internalOrgIds.filter((id) => id !== orgId);
    setInternalOrgIds(next);
    updateInternalOrgs.mutate(next);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Funcionalidades em Desenvolvimento</h1>
          <p className="text-muted-foreground">
            Controle quais ferramentas ainda em construção aparecem liberadas em produção. Contas marcadas como
            "teste interno" sempre veem a ferramenta, mesmo desligada para o restante dos clientes.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Liberação de ferramentas</CardTitle>
            <CardDescription>
              Desligado = a ferramenta aparece como "Em breve" (bloqueada) para todas as contas, exceto as marcadas
              como teste interno abaixo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (
              BETA_TOOLS.map((tool) => (
                <div
                  key={tool.key}
                  className="flex items-center justify-between gap-4 rounded-lg border p-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{tool.name}</p>
                      {!flags[tool.key] && <Badge variant="secondary">Em breve para clientes</Badge>}
                      {flags[tool.key] && <Badge>Liberado</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{tool.description}</p>
                  </div>
                  <Switch
                    checked={Boolean(flags[tool.key])}
                    onCheckedChange={(checked) => handleToggleFlag(tool.key, checked)}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contas de teste interno</CardTitle>
            <CardDescription>
              Essas contas sempre enxergam todas as ferramentas (liberadas ou não), para você testar antes de liberar
              geral.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Input
                placeholder="Buscar organização pelo nome..."
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
              />
              {searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                  {searchResults.map((org) => (
                    <button
                      key={org.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => handleAddOrg(org.id)}
                    >
                      {org.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedOrgs.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma conta de teste marcada ainda.</p>
              )}
              {selectedOrgs.map((org) => (
                <Badge key={org.id} variant="outline" className="flex items-center gap-1 py-1 pl-3 pr-1">
                  {org.name}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => handleRemoveOrg(org.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
