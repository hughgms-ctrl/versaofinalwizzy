import { useState } from 'react';
import { Package, Plus, Edit, Trash2, MoreHorizontal, Search, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDocumentPacks, useDeleteDocumentPack, DocumentPack } from '@/hooks/useDocumentPacks';
import { useDocumentTemplates } from '@/hooks/useDocumentTemplates';
import { PackEditor } from './PackEditor';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function PacksList() {
  const { data: packs, isLoading } = useDocumentPacks();
  const { data: templates } = useDocumentTemplates();
  const deletePack = useDeleteDocumentPack();
  const [search, setSearch] = useState('');
  const [editingPack, setEditingPack] = useState<DocumentPack | null>(null);
  const [showNew, setShowNew] = useState(false);

  const filtered = packs?.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const getTemplateNames = (ids: string[]) => {
    return ids.map(id => templates?.find(t => t.id === id)?.name || 'Template removido');
  };

  if (editingPack || showNew) {
    return (
      <PackEditor
        pack={editingPack}
        onBack={() => { setEditingPack(null); setShowNew(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar packs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Pack
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2].map(i => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="h-5 bg-muted rounded w-3/4 mb-2" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhum pack ainda</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Agrupe templates para gerar múltiplos documentos de uma vez.
          </p>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-2" /> Criar pack
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(pack => (
            <Card
              key={pack.id}
              className="p-4 cursor-pointer hover:shadow-md transition-shadow group"
              onClick={() => setEditingPack(pack)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                    <Package className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm">{pack.name}</h3>
                    <p className="text-xs text-muted-foreground">{pack.template_ids.length} templates</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={e => { e.stopPropagation(); setEditingPack(pack); }}>
                      <Edit className="h-4 w-4 mr-2" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={e => { e.stopPropagation(); deletePack.mutate(pack.id); }}>
                      <Trash2 className="h-4 w-4 mr-2" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {getTemplateNames(pack.template_ids).map((name, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    <FileText className="h-3 w-3 mr-1" /> {name}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {format(new Date(pack.created_at), "dd MMM yyyy", { locale: ptBR })}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
