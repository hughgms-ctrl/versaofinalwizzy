import { useState } from 'react';
import { ArrowLeft, Save, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useCreateDocumentPack, useUpdateDocumentPack, DocumentPack } from '@/hooks/useDocumentPacks';
import { useDocumentTemplates } from '@/hooks/useDocumentTemplates';

interface PackEditorProps {
  pack: DocumentPack | null;
  onBack: () => void;
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

      <div>
        <Label>Selecione os templates</Label>
        <div className="grid gap-2 mt-2 md:grid-cols-2">
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
                  <p className="text-xs text-muted-foreground">{t.fields?.length || 0} campos</p>
                </div>
              </div>
            </Card>
          )) || (
            <p className="text-sm text-muted-foreground col-span-2">Nenhum template disponível. Crie um template primeiro.</p>
          )}
        </div>
      </div>
    </div>
  );
}
