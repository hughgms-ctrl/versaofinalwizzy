import { useState } from 'react';
import { FileText, Plus, Upload, Edit, Trash2, Copy, MoreHorizontal, Search, FileDown, Link2 } from 'lucide-react';
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
import { useDocumentTemplates, useDeleteDocumentTemplate, useCreateDocumentTemplate, DocumentTemplate } from '@/hooks/useDocumentTemplates';
import { UploadTemplateDialog } from './UploadTemplateDialog';
import { TemplateEditor } from './TemplateEditor';
import { TemplateFillForm } from './TemplateFillForm';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

export function TemplatesList() {
  const { data: templates, isLoading } = useDocumentTemplates();
  const { selectedWorkspaceId } = useWorkspaceContext();
  const deleteTemplate = useDeleteDocumentTemplate();
  const createTemplate = useCreateDocumentTemplate();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
  const [fillingTemplate, setFillingTemplate] = useState<DocumentTemplate | null>(null);
  const [showNewEditor, setShowNewEditor] = useState(false);

  const handleCopyLink = (template: DocumentTemplate) => {
    const url = `${window.location.origin}/form?id=${template.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copiado!', description: 'O link do formulário foi copiado para a área de transferência.' });
  };

  const filtered = templates?.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.category?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const handleDuplicate = (template: DocumentTemplate) => {
    createTemplate.mutate({
      name: `${template.name} (cópia)`,
      description: template.description || undefined,
      category: template.category || undefined,
      content: template.content,
      fields: template.fields,
    });
  };

  if (editingTemplate) {
    return <TemplateEditor template={editingTemplate} onBack={() => setEditingTemplate(null)} />;
  }

  if (fillingTemplate) {
    return <TemplateFillForm template={fillingTemplate} onBack={() => setFillingTemplate(null)} />;
  }

  if (showNewEditor) {
    return <TemplateEditor template={null} onBack={() => setShowNewEditor(false)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowUpload(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload modelo
          </Button>
          <Button onClick={() => setShowNewEditor(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Criar manualmente
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="h-5 bg-muted rounded w-3/4 mb-2" />
              <div className="h-4 bg-muted rounded w-1/2 mb-4" />
              <div className="h-3 bg-muted rounded w-1/3" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhum template ainda</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Faça upload de um modelo ou crie um template manualmente.
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => setShowUpload(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload modelo
            </Button>
            <Button onClick={() => setShowNewEditor(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar manualmente
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((template) => (
            <Card
              key={template.id}
              className="p-4 cursor-pointer hover:shadow-md transition-shadow group"
              onClick={() => setEditingTemplate(template)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm">{template.name}</h3>
                    {template.category && (
                      <Badge variant="secondary" className="text-xs mt-1">
                        {template.category}
                      </Badge>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setFillingTemplate(template); }}>
                      <FileDown className="h-4 w-4 mr-2" /> Gerar documento
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCopyLink(template); }}>
                      <Link2 className="h-4 w-4 mr-2" /> Copiar link público
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingTemplate(template); }}>
                      <Edit className="h-4 w-4 mr-2" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicate(template); }}>
                      <Copy className="h-4 w-4 mr-2" /> Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => { e.stopPropagation(); deleteTemplate.mutate(template.id); }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{template.fields?.length || 0} campos</span>
                <span>•</span>
                <span>{format(new Date(template.created_at), "dd MMM yyyy", { locale: ptBR })}</span>
              </div>
              {template.description && (
                <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{template.description}</p>
              )}
            </Card>
          ))}
        </div>
      )}

      <UploadTemplateDialog open={showUpload} onOpenChange={setShowUpload} />
    </div>
  );
}
