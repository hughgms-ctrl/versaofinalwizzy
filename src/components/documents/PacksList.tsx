import { useState } from 'react';
import { Package, Plus, Edit, Trash2, MoreHorizontal, Search, FileText, ClipboardList, Link2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDocumentPacks, useDeleteDocumentPack, useGeneratePackToken, DocumentPack } from '@/hooks/useDocumentPacks';
import { useDocumentTemplates } from '@/hooks/useDocumentTemplates';
import { PackEditor } from './PackEditor';
import { PackFillForm } from './PackFillForm';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export function PacksList() {
  const { data: packs, isLoading } = useDocumentPacks();
  const { data: templates } = useDocumentTemplates();
  const deletePack = useDeleteDocumentPack();
  const generateToken = useGeneratePackToken();
  const [search, setSearch] = useState('');
  const [editingPack, setEditingPack] = useState<DocumentPack | null>(null);
  const [fillingPack, setFillingPack] = useState<DocumentPack | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = packs?.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const getTemplateNames = (ids: string[]) => {
    return ids.map(id => templates?.find(t => t.id === id)?.name || 'Template removido');
  };

  const handleCopyLink = async (pack: DocumentPack) => {
    let token = pack.public_token;

    if (!token) {
      try {
        const result = await generateToken.mutateAsync(pack.id);
        token = result.public_token;
      } catch {
        return;
      }
    }

    // Always use published URL for public links
    const isPreview = window.location.hostname.includes('preview') || window.location.hostname.includes('lovableproject.com');
    const origin = isPreview ? 'https://wizzyai.lovable.app' : window.location.origin;
    const url = `${origin}/pack-form?token=${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(pack.id);
    toast.success('Link copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (fillingPack) {
    return (
      <PackFillForm
        pack={fillingPack}
        onBack={() => setFillingPack(null)}
      />
    );
  }

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
            <Card key={pack.id} className="p-4 hover:shadow-md transition-shadow group">
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
                    <DropdownMenuItem onClick={() => setFillingPack(pack)}>
                      <ClipboardList className="h-4 w-4 mr-2" /> Preencher
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleCopyLink(pack)}>
                      {copiedId === pack.id ? (
                        <Check className="h-4 w-4 mr-2 text-primary" />
                      ) : (
                        <Link2 className="h-4 w-4 mr-2" />
                      )}
                      Copiar link público
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setEditingPack(pack)}>
                      <Edit className="h-4 w-4 mr-2" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => deletePack.mutate(pack.id)}>
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
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(pack.created_at), "dd MMM yyyy", { locale: ptBR })}
                  </p>
                  {pack.public_token && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-primary border-primary/30">
                      <Link2 className="h-2.5 w-2.5 mr-0.5" />
                      Link ativo
                    </Badge>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => setFillingPack(pack)}>
                  <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                  Preencher
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
