import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  usePlatformPackages,
  useUpsertPlatformPackage,
  useDeletePlatformPackage,
  PlatformPackage,
} from '@/hooks/usePlatformPackages';
import { Plus, Pencil, Trash2, Package, Layers, Loader2 } from 'lucide-react';

const EMPTY_PKG: Partial<PlatformPackage> = {
  kind: 'area',
  name: '',
  slug: '',
  icon: '',
  color: '#3b82f6',
  description: '',
  master_prompt: '',
  agents_template: [],
  flows_template: [],
  tags_template: [],
  pipeline_template: {},
  is_published: false,
  sort_order: 0,
  version: 1,
  parent_package_id: null,
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function AdminPackagesPage() {
  const [tab, setTab] = useState<'area' | 'objective'>('area');
  const { data: areas = [], isLoading: loadingAreas } = usePlatformPackages({ kind: 'area' });
  const { data: objectives = [], isLoading: loadingObj } = usePlatformPackages({ kind: 'objective' });
  const upsert = useUpsertPlatformPackage();
  const del = useDeletePlatformPackage();

  const [editing, setEditing] = useState<Partial<PlatformPackage> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PlatformPackage | null>(null);

  const list = tab === 'area' ? areas : objectives;
  const loading = tab === 'area' ? loadingAreas : loadingObj;

  const openNew = () => setEditing({ ...EMPTY_PKG, kind: tab });
  const openEdit = (pkg: PlatformPackage) => setEditing({ ...pkg });

  const save = async () => {
    if (!editing) return;
    const payload = { ...editing };
    if (!payload.slug && payload.name) payload.slug = slugify(payload.name);
    await upsert.mutateAsync(payload);
    setEditing(null);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pacotes da Plataforma</h1>
            <p className="text-sm text-muted-foreground">
              Templates verticais que clientes podem ativar com 2 cliques.
            </p>
          </div>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            Novo {tab === 'area' ? 'Pacote de Área' : 'Objetivo'}
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'area' | 'objective')}>
          <TabsList>
            <TabsTrigger value="area">
              <Package className="h-4 w-4 mr-2" />
              Áreas ({areas.length})
            </TabsTrigger>
            <TabsTrigger value="objective">
              <Layers className="h-4 w-4 mr-2" />
              Objetivos ({objectives.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-6">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : list.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Nenhum {tab === 'area' ? 'pacote de área' : 'objetivo'} cadastrado.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {list.map((pkg) => (
                  <Card key={pkg.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-base truncate flex items-center gap-2">
                            {pkg.icon && <span>{pkg.icon}</span>}
                            {pkg.name}
                          </CardTitle>
                          <CardDescription className="text-xs truncate">{pkg.slug}</CardDescription>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(pkg)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setConfirmDelete(pkg)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      {pkg.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{pkg.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <Badge variant={pkg.is_published ? 'default' : 'secondary'} className="text-[10px]">
                          {pkg.is_published ? 'Publicado' : 'Rascunho'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">v{pkg.version}</Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {(pkg.agents_template?.length || 0)} agentes
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {(pkg.flows_template?.length || 0)} fluxos
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {(pkg.tags_template?.length || 0)} tags
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Edit dialog */}
        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editing?.id ? 'Editar' : 'Novo'} {editing?.kind === 'area' ? 'Pacote de Área' : 'Objetivo'}
              </DialogTitle>
              <DialogDescription>
                Configure o template. JSONs são aplicados ao ativar para cada organização.
              </DialogDescription>
            </DialogHeader>

            {editing && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nome</Label>
                    <Input
                      value={editing.name || ''}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          name: e.target.value,
                          slug: editing.slug || slugify(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Slug</Label>
                    <Input
                      value={editing.slug || ''}
                      onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                    />
                  </div>
                </div>

                {editing.kind === 'objective' && (
                  <div>
                    <Label>Pacote pai (área)</Label>
                    <Select
                      value={editing.parent_package_id || 'none'}
                      onValueChange={(v) =>
                        setEditing({ ...editing, parent_package_id: v === 'none' ? null : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a área" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem vínculo</SelectItem>
                        {areas.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Ícone (emoji)</Label>
                    <Input
                      value={editing.icon || ''}
                      onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                      placeholder="⚖️"
                    />
                  </div>
                  <div>
                    <Label>Cor</Label>
                    <Input
                      type="color"
                      value={editing.color || '#3b82f6'}
                      onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Ordem</Label>
                    <Input
                      type="number"
                      value={editing.sort_order ?? 0}
                      onChange={(e) =>
                        setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label>Descrição curta</Label>
                  <Textarea
                    rows={2}
                    value={editing.description || ''}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  />
                </div>

                <div>
                  <Label>Master Prompt</Label>
                  <Textarea
                    rows={4}
                    value={editing.master_prompt || ''}
                    onChange={(e) => setEditing({ ...editing, master_prompt: e.target.value })}
                    placeholder="Tom e regras gerais. Use placeholders como {{empresa.nome}}, {{empresa.endereco}}..."
                  />
                </div>

                <JsonField
                  label="Agentes (JSON array)"
                  value={editing.agents_template || []}
                  onChange={(v) => setEditing({ ...editing, agents_template: v as any[] })}
                  placeholder='[{"name":"Recepção","function_role":"recepcao","prompt_base":"..."}]'
                />

                <JsonField
                  label="Fluxos (JSON array)"
                  value={editing.flows_template || []}
                  onChange={(v) => setEditing({ ...editing, flows_template: v as any[] })}
                  placeholder='[{"name":"BPC LOAS","nodes":[],"edges":[]}]'
                />

                <JsonField
                  label="Tags (JSON array)"
                  value={editing.tags_template || []}
                  onChange={(v) => setEditing({ ...editing, tags_template: v as any[] })}
                  placeholder='[{"name":"Quente","color":"#ef4444"}]'
                />

                <JsonField
                  label="Pipeline (JSON object)"
                  value={editing.pipeline_template || {}}
                  onChange={(v) => setEditing({ ...editing, pipeline_template: v as Record<string, any> })}
                  placeholder='{"name":"Atendimento","columns":[{"name":"Novo","color":"#94a3b8"}]}'
                />

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!editing.is_published}
                      onCheckedChange={(c) => setEditing({ ...editing, is_published: c })}
                    />
                    <Label className="cursor-pointer">Publicado (visível aos clientes)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label>Versão</Label>
                    <Input
                      type="number"
                      className="w-20"
                      value={editing.version ?? 1}
                      onChange={(e) =>
                        setEditing({ ...editing, version: Number(e.target.value) || 1 })
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save} disabled={upsert.isPending || !editing?.name}>
                {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir pacote?</AlertDialogTitle>
              <AlertDialogDescription>
                "{confirmDelete?.name}" será removido. Organizações que já ativaram mantêm os recursos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (confirmDelete) await del.mutateAsync(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}

function JsonField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState(() => JSON.stringify(value ?? (Array.isArray(value) ? [] : {}), null, 2));
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Label>{label}</Label>
      <Textarea
        rows={5}
        value={raw}
        placeholder={placeholder}
        className="font-mono text-xs"
        onChange={(e) => {
          setRaw(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value || (placeholder?.startsWith('[') ? '[]' : '{}'));
            setError(null);
            onChange(parsed);
          } catch (err: any) {
            setError(err.message);
          }
        }}
      />
      {error && <p className="text-xs text-destructive mt-1">JSON inválido: {error}</p>}
    </div>
  );
}
