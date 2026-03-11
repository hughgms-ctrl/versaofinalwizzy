import { useState } from 'react';
import { ArrowLeft, Save, Plus, X, Tag, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCreateDocumentTemplate, useUpdateDocumentTemplate, DocumentTemplate } from '@/hooks/useDocumentTemplates';

interface TemplateEditorProps {
  template: DocumentTemplate | null;
  onBack: () => void;
}

const CATEGORIES = ['contrato', 'procuração', 'declaração', 'petição', 'requerimento', 'outro'];

export function TemplateEditor({ template, onBack }: TemplateEditorProps) {
  const createTemplate = useCreateDocumentTemplate();
  const updateTemplate = useUpdateDocumentTemplate();
  const isEditing = !!template;

  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [category, setCategory] = useState(template?.category || '');
  const [content, setContent] = useState(template?.content || '');
  const [fields, setFields] = useState<Array<{ name: string; label: string; type: string; required: boolean }>>(
    template?.fields || []
  );
  const [autoSendWhatsApp, setAutoSendWhatsApp] = useState(template?.auto_send_whatsapp || false);

  const [newFieldName, setNewFieldName] = useState('');

  const handleAddField = () => {
    if (!newFieldName.trim()) return;
    const fieldName = newFieldName.trim().toLowerCase().replace(/\s+/g, '_');
    if (fields.some(f => f.name === fieldName)) return;
    setFields([...fields, { name: fieldName, label: newFieldName.trim(), type: 'text', required: true }]);
    setNewFieldName('');
  };

  const handleRemoveField = (fieldName: string) => {
    setFields(fields.filter(f => f.name !== fieldName));
  };

  const handleInsertField = (fieldName: string) => {
    setContent(prev => prev + `{{${fieldName}}}`);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (isEditing) {
      updateTemplate.mutate({
        id: template.id,
        name,
        description: description || null,
        category: category || null,
        content,
        fields,
      }, { onSuccess: onBack });
    } else {
      createTemplate.mutate({
        name,
        description: description || undefined,
        category: category || undefined,
        content,
        fields,
      }, { onSuccess: onBack });
    }
  };

  const extractedFields = content.match(/\{\{([^}]+)\}\}/g)?.map(m => m.slice(2, -2)) || [];
  const missingFields = extractedFields.filter(f => !fields.some(field => field.name === f));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <Button onClick={handleSave} disabled={!name.trim() || createTemplate.isPending || updateTemplate.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {isEditing ? 'Salvar alterações' : 'Criar template'}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main editor */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Nome do template</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Contrato de Honorários" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Breve descrição do template" />
          </div>
          <div>
            <Label>Conteúdo do template</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Use {"{{campo}}"} para marcar campos variáveis. Clique nos campos ao lado para inserir.
            </p>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Digite o conteúdo do template aqui..."
              className="min-h-[400px] font-mono text-sm"
            />
          </div>
        </div>

        {/* Fields sidebar */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="font-medium text-sm mb-3">Campos variáveis</h3>
            <div className="flex gap-2 mb-3">
              <Input
                value={newFieldName}
                onChange={e => setNewFieldName(e.target.value)}
                placeholder="Nome do campo"
                onKeyDown={e => e.key === 'Enter' && handleAddField()}
                className="text-sm"
              />
              <Button size="sm" variant="outline" onClick={handleAddField}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {fields.map(field => (
                <Badge
                  key={field.name}
                  variant="secondary"
                  className="cursor-pointer hover:bg-primary/10 group"
                  onClick={() => handleInsertField(field.name)}
                >
                  <Tag className="h-3 w-3 mr-1" />
                  {field.label}
                  <button
                    className="ml-1 opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); handleRemoveField(field.name); }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            {fields.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum campo adicionado ainda.</p>
            )}
          </Card>

          {missingFields.length > 0 && (
            <Card className="p-4 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
              <h3 className="font-medium text-sm mb-2 text-amber-800 dark:text-amber-200">Campos no texto sem registro</h3>
              <p className="text-xs text-muted-foreground mb-2">
                Estes campos estão no texto mas não foram adicionados à lista:
              </p>
              <div className="flex flex-wrap gap-1">
                {missingFields.map(f => (
                  <Badge
                    key={f}
                    variant="outline"
                    className="cursor-pointer text-xs border-amber-300"
                    onClick={() => {
                      setFields([...fields, { name: f, label: f, type: 'text', required: true }]);
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {f}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-4">
            <h3 className="font-medium text-sm mb-2">Resumo</h3>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Campos registrados: {fields.length}</p>
              <p>Campos no texto: {extractedFields.length}</p>
              <p>Caracteres: {content.length}</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
