import { useState, useMemo } from 'react';
import { ArrowLeft, Save, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useCreateDocumentPack, useUpdateDocumentPack, DocumentPack } from '@/hooks/useDocumentPacks';
import { useDocumentTemplates } from '@/hooks/useDocumentTemplates';

interface PackEditorProps {
  pack: DocumentPack | null;
  onBack: () => void;
}

interface FieldAnalysis {
  name: string;
  count: number;
  templateNames: string[];
}

export function PackEditor({ pack, onBack }: PackEditorProps) {
  const { data: templates } = useDocumentTemplates();
  const createPack = useCreateDocumentPack();
  const updatePack = useUpdateDocumentPack();
  const isEditing = !!pack;

  const [name, setName] = useState(pack?.name || '');
  const [description, setDescription] = useState(pack?.description || '');
  const [selectedIds, setSelectedIds] = useState<string[]>(pack?.template_ids || []);

  const toggleTemplate = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Analyze fields across selected templates
  const fieldAnalysis = useMemo(() => {
    if (!templates || selectedIds.length < 2) return { shared: [], unique: [] };

    const fieldMap = new Map<string, FieldAnalysis>();

    selectedIds.forEach(templateId => {
      const template = templates.find(t => t.id === templateId);
      if (!template) return;

      const fields = (template.fields as any[]) || [];
      fields.forEach((field: any) => {
        const fieldName = field.name || field;
        if (!fieldMap.has(fieldName)) {
          fieldMap.set(fieldName, { name: fieldName, count: 0, templateNames: [] });
        }
        const analysis = fieldMap.get(fieldName)!;
        analysis.count++;
        analysis.templateNames.push(template.name);
      });
    });

    const shared: FieldAnalysis[] = [];
    const unique: FieldAnalysis[] = [];

    fieldMap.forEach(analysis => {
      if (analysis.count > 1) shared.push(analysis);
      else unique.push(analysis);
    });

    return { shared, unique };
  }, [templates, selectedIds]);

  const handleSave = () => {
    if (!name.trim() || selectedIds.length === 0) return;
    if (isEditing) {
      updatePack.mutate({ id: pack.id, name, description: description || null, template_ids: selectedIds }, { onSuccess: onBack });
    } else {
      createPack.mutate({ name, description: description || undefined, template_ids: selectedIds }, { onSuccess: onBack });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
        <Button onClick={handleSave} disabled={!name.trim() || selectedIds.length === 0}>
          <Save className="h-4 w-4 mr-2" /> {isEditing ? 'Salvar' : 'Criar pack'}
        </Button>
      </div>

      <div className="grid gap-4 max-w-lg">
        <div>
          <Label>Nome do pack</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Pack Auxílio Reclusão" />
        </div>
        <div>
          <Label>Descrição (opcional)</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Breve descrição" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <Label>Selecione os templates</Label>
          <div className="grid gap-2 mt-2">
            {templates?.map(t => (
              <Card
                key={t.id}
                className={`p-3 cursor-pointer transition-colors ${selectedIds.includes(t.id) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                onClick={() => toggleTemplate(t.id)}
              >
                <div className="flex items-center gap-3">
                  <Checkbox checked={selectedIds.includes(t.id)} />
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{(t.fields as any[])?.length || 0} campos</p>
                  </div>
                </div>
              </Card>
            )) || (
              <p className="text-sm text-muted-foreground">Nenhum template disponível. Crie um template primeiro.</p>
            )}
          </div>
        </div>

        {/* Field Analysis Panel */}
        {selectedIds.length >= 2 && (fieldAnalysis.shared.length > 0 || fieldAnalysis.unique.length > 0) && (
          <div>
            <Label>Campos detectados</Label>
            <div className="mt-2 space-y-3">
              {fieldAnalysis.shared.length > 0 && (
                <Card className="p-3">
                  <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                    <Link2 className="h-4 w-4 text-primary" />
                    Campos compartilhados
                  </h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    Serão preenchidos uma vez e aplicados em vários documentos
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {fieldAnalysis.shared.map(f => (
                      <Badge key={f.name} variant="default" className="text-xs">
                        {f.name} ({f.count} docs)
                      </Badge>
                    ))}
                  </div>
                </Card>
              )}

              {fieldAnalysis.unique.length > 0 && (
                <Card className="p-3">
                  <h4 className="text-sm font-medium mb-2">Campos únicos</h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    Específicos de apenas um documento
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {fieldAnalysis.unique.map(f => (
                      <Badge key={f.name} variant="secondary" className="text-xs">
                        {f.name} ({f.templateNames[0]})
                      </Badge>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
