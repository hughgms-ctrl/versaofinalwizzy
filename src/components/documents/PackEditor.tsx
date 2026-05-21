import { useState, useMemo, useCallback } from 'react';
import { ArrowLeft, Save, Link2, GripVertical, Pencil, Info, Sparkles, Loader2, MessageCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useCreateDocumentPack, useUpdateDocumentPack, DocumentPack } from '@/hooks/useDocumentPacks';
import { useDocumentTemplates, DocumentTemplate } from '@/hooks/useDocumentTemplates';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SignersManager } from '@/components/documents/SignersManager';
import { SignerInput } from '@/hooks/useDocumentSigners';
import { TemplateEditor } from '@/components/documents/TemplateEditor';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface PackEditorProps {
  pack: DocumentPack | null;
  onBack: () => void;
}

export interface PackFieldConfig {
  originalName: string;
  label: string;
  description: string;
  type: string;
  required: boolean;
  sourceTemplateIds: string[];
  /** When AI unifies multiple original fields into one, store the mappings */
  mappedFields?: Array<{ fieldName: string; templateId: string }>;
}

export function PackEditor({ pack, onBack }: PackEditorProps) {
  const { data: templates } = useDocumentTemplates();
  const createPack = useCreateDocumentPack();
  const updatePack = useUpdateDocumentPack();
  const { toast } = useToast();
  const isEditing = !!pack;

  const [name, setName] = useState(pack?.name || '');
  const [description, setDescription] = useState(pack?.description || '');
  const [selectedIds, setSelectedIds] = useState<string[]>(pack?.template_ids || []);
  const [fieldConfigs, setFieldConfigs] = useState<PackFieldConfig[]>(
    (pack as any)?.field_config || []
  );
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [isUnifying, setIsUnifying] = useState(false);
  const [autoSendWhatsApp, setAutoSendWhatsApp] = useState((pack as any)?.auto_send_whatsapp || false);
  const [defaultSigners, setDefaultSigners] = useState<SignerInput[]>(
    ((pack as any)?.default_signers as SignerInput[]) || []
  );
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const toggleTemplate = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setFieldConfigs(prev => {
      const oldIndex = prev.findIndex(f => f.originalName === active.id);
      const newIndex = prev.findIndex(f => f.originalName === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  // Collect all fields from selected templates
  const allFields = useMemo(() => {
    if (!templates) return [];

    const fieldMap = new Map<string, { name: string; count: number; templateNames: string[]; templateIds: string[] }>();

    selectedIds.forEach(templateId => {
      const template = templates.find(t => t.id === templateId);
      if (!template) return;

      const fields = (template.fields as any[]) || [];
      fields.forEach((field: any) => {
        const fieldName = field.name || field;
        if (!fieldMap.has(fieldName)) {
          fieldMap.set(fieldName, { name: fieldName, count: 0, templateNames: [], templateIds: [] });
        }
        const entry = fieldMap.get(fieldName)!;
        entry.count++;
        entry.templateNames.push(template.name);
        entry.templateIds.push(template.id);
      });
    });

    return Array.from(fieldMap.values());
  }, [templates, selectedIds]);

  // Merge field configs with detected fields
  const mergedFields = useMemo(() => {
    // If we have AI-unified configs, use them directly
    if (fieldConfigs.length > 0 && fieldConfigs.some(c => c.mappedFields && c.mappedFields.length > 0)) {
      return fieldConfigs.map(c => ({
        originalName: c.originalName,
        label: c.label,
        description: c.description,
        type: c.type,
        required: c.required,
        sourceTemplateIds: c.sourceTemplateIds,
        mappedFields: c.mappedFields || [],
        count: c.mappedFields?.length || c.sourceTemplateIds.length,
        templateNames: c.mappedFields?.map(mf => {
          const t = templates?.find(t => t.id === mf.templateId);
          return t?.name || mf.templateId;
        }) || [],
      }));
    }

    return allFields.map(f => {
      const existing = fieldConfigs.find(c => c.originalName === f.name);
      return {
        originalName: f.name,
        label: existing?.label || f.name,
        description: existing?.description || '',
        type: existing?.type || 'text',
        required: existing?.required ?? true,
        sourceTemplateIds: f.templateIds,
        mappedFields: existing?.mappedFields || [],
        count: f.count,
        templateNames: f.templateNames,
      };
    });
  }, [allFields, fieldConfigs, templates]);

  const updateFieldConfig = (originalName: string, updates: Partial<PackFieldConfig>) => {
    setFieldConfigs(prev => {
      const idx = prev.findIndex(c => c.originalName === originalName);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...updates };
        return updated;
      }
      const field = mergedFields.find(f => f.originalName === originalName);
      return [...prev, {
        originalName,
        label: field?.label || originalName,
        description: field?.description || '',
        type: field?.type || 'text',
        required: field?.required ?? true,
        sourceTemplateIds: field?.sourceTemplateIds || [],
        ...updates,
      }];
    });
  };

  const handleAIUnify = async () => {
    if (!templates || selectedIds.length < 1) return;

    const selectedTemplates = selectedIds
      .map(id => templates.find(t => t.id === id))
      .filter(Boolean)
      .map(t => ({
        id: t!.id,
        name: t!.name,
        fields: (t!.fields as any[]) || [],
      }));

    setIsUnifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('unify-pack-fields', {
        body: { templates: selectedTemplates },
      });

      if (error) throw error;

      const unifiedFields: PackFieldConfig[] = (data.fields || []).map((f: any) => {
        // Build a unique key from the first original field
        const primaryField = f.originalFields[0];
        const originalName = primaryField?.fieldName || f.unifiedLabel;

        // Collect all template IDs
        const templateIds = [...new Set(f.originalFields.map((of: any) => of.templateId))];

        return {
          originalName,
          label: f.unifiedLabel,
          description: f.description || '',
          type: f.type || 'text',
          required: true,
          sourceTemplateIds: templateIds,
          mappedFields: f.originalFields,
        };
      });

      setFieldConfigs(unifiedFields);
      toast({ title: 'Campos unificados pela IA', description: `${unifiedFields.length} campos configurados` });
    } catch (err: any) {
      console.error('AI unify error:', err);
      toast({ title: 'Erro ao unificar campos', description: err.message, variant: 'destructive' });
    } finally {
      setIsUnifying(false);
    }
  };

  const handleSave = () => {
    if (!name.trim() || selectedIds.length === 0) return;

    const finalConfigs: PackFieldConfig[] = mergedFields.map(f => ({
      originalName: f.originalName,
      label: f.label,
      description: f.description,
      type: f.type,
      required: f.required,
      sourceTemplateIds: f.sourceTemplateIds,
      mappedFields: f.mappedFields,
    }));

    const payload: any = {
      name,
      description: description || null,
      template_ids: selectedIds,
      field_config: finalConfigs,
      auto_send_whatsapp: autoSendWhatsApp,
      default_signers: defaultSigners,
    };

    if (isEditing) {
      updatePack.mutate({ id: pack.id, ...payload }, { onSuccess: onBack });
    } else {
      createPack.mutate(payload, { onSuccess: onBack });
    }
  };

  const sharedFields = mergedFields.filter(f => {
    const uniqueTemplates = new Set(f.mappedFields?.map(mf => mf.templateId) || []).size;
    return uniqueTemplates > 1 || (!f.mappedFields?.length && f.count > 1);
  });
  const uniqueFields = mergedFields.filter(f => {
    const uniqueTemplates = new Set(f.mappedFields?.map(mf => mf.templateId) || []).size;
    return uniqueTemplates <= 1 && (f.mappedFields?.length ? true : f.count <= 1);
  });

  if (editingTemplate) {
    return <TemplateEditor template={editingTemplate} onBack={() => setEditingTemplate(null)} />;
  }

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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Nome do pack</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Pack Auxílio Reclusão" />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Breve descrição" />
            </div>
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <MessageCircle className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">Enviar automaticamente pelo WhatsApp</p>
                  <p className="text-xs text-muted-foreground">
                    No formulário público do pack, envia os documentos automaticamente ao finalizar.
                  </p>
                </div>
              </div>
              <Switch checked={autoSendWhatsApp} onCheckedChange={setAutoSendWhatsApp} />
            </div>
          </Card>

          <Label>Documentos do pack</Label>
          <div className="grid gap-2 mt-2">
            {templates?.map(t => (
              <Card
                key={t.id}
                className={`p-3 cursor-pointer transition-colors ${selectedIds.includes(t.id) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                onClick={() => toggleTemplate(t.id)}
              >
                <div className="flex items-center gap-3">
                  <Checkbox checked={selectedIds.includes(t.id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{(t.fields as any[])?.length || 0} campos</p>
                  </div>
                  {selectedIds.includes(t.id) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTemplate(t);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar modelo
                    </Button>
                  )}
                </div>
              </Card>
            )) || (
              <p className="text-sm text-muted-foreground">Nenhum template disponível.</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="font-medium text-sm mb-3">Signatários padrão</h3>
            <p className="text-[11px] text-muted-foreground mb-3">
              Estes signatários serão aplicados a todos os documentos gerados pelo pack.
            </p>
            <SignersManager
              signers={defaultSigners}
              onChange={setDefaultSigners}
              availableFields={mergedFields.map((f) => ({ name: f.originalName, label: f.label, type: f.type }))}
            />
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium text-sm">Resumo</h3>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Documentos: {selectedIds.length}</p>
              <p>Campos variáveis: {mergedFields.length}</p>
              <p>Signatários padrão: {defaultSigners.length}</p>
            </div>
          </Card>
        </div>

        {/* Field Configuration Panel */}
        {selectedIds.length >= 1 && (
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-1">
              <Label>Configuração dos campos ({mergedFields.length})</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAIUnify}
                disabled={isUnifying || selectedIds.length < 1}
                className="gap-1.5 text-xs"
              >
                {isUnifying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {isUnifying ? 'Analisando...' : 'Unificar com IA'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              A IA analisa os campos de todos os templates e unifica automaticamente campos similares para que o cliente preencha uma única vez.
            </p>

            {mergedFields.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <div className="space-y-2">
                  {sharedFields.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-primary font-medium">
                        <Link2 className="h-3.5 w-3.5" />
                        Campos compartilhados ({sharedFields.length})
                      </div>
                      <SortableContext items={sharedFields.map(f => f.originalName)} strategy={verticalListSortingStrategy}>
                        {sharedFields.map(field => (
                          <SortableFieldConfigCard
                            key={field.originalName}
                            field={field}
                            isExpanded={expandedField === field.originalName}
                            onToggle={() => setExpandedField(
                              expandedField === field.originalName ? null : field.originalName
                            )}
                            onUpdate={(updates) => updateFieldConfig(field.originalName, updates)}
                            templates={templates || []}
                          />
                        ))}
                      </SortableContext>
                    </div>
                  )}

                  {uniqueFields.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                        Campos únicos ({uniqueFields.length})
                      </div>
                      <SortableContext items={uniqueFields.map(f => f.originalName)} strategy={verticalListSortingStrategy}>
                        {uniqueFields.map(field => (
                          <SortableFieldConfigCard
                            key={field.originalName}
                            field={field}
                            isExpanded={expandedField === field.originalName}
                            onToggle={() => setExpandedField(
                              expandedField === field.originalName ? null : field.originalName
                            )}
                            onUpdate={(updates) => updateFieldConfig(field.originalName, updates)}
                            templates={templates || []}
                          />
                        ))}
                      </SortableContext>
                    </div>
                  )}
                </div>
              </DndContext>
            ) : (
              <p className="text-sm text-muted-foreground">Selecione templates para ver os campos.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type FieldConfigCardProps = {
  field: {
    originalName: string;
    label: string;
    description: string;
    type: string;
    required: boolean;
    count: number;
    templateNames: string[];
    mappedFields?: Array<{ fieldName: string; templateId: string }>;
  };
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<PackFieldConfig>) => void;
  templates: any[];
  dragHandleProps?: Record<string, any>;
};

function SortableFieldConfigCard(props: Omit<FieldConfigCardProps, 'dragHandleProps'>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.field.originalName });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <FieldConfigCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function FieldConfigCard({
  field,
  isExpanded,
  onToggle,
  onUpdate,
  templates,
  dragHandleProps,
}: FieldConfigCardProps) {
  const hasMappings = field.mappedFields && field.mappedFields.length > 1;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className="p-0 overflow-hidden">
        <CollapsibleTrigger className="w-full p-3 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left">
          <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing" onClick={e => e.stopPropagation()}>
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{field.label}</span>
              {(() => {
                const uniqueDocCount = hasMappings
                  ? new Set(field.mappedFields!.map(mf => mf.templateId)).size
                  : field.count;
                return uniqueDocCount > 1 ? (
                  <Badge variant="default" className="text-[10px] px-1.5 py-0">
                    <Link2 className="h-2.5 w-2.5 mr-0.5" />
                    {uniqueDocCount} docs
                  </Badge>
                ) : null;
              })()}
              {field.required && (
                <span className="text-destructive text-xs">*</span>
              )}
            </div>
            {field.description && (
              <p className="text-xs text-muted-foreground truncate">{field.description}</p>
            )}
          </div>
          <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 border-t space-y-3">
            <div>
              <Label className="text-xs">Label (como aparece no formulário)</Label>
              <Input
                value={field.label}
                onChange={e => onUpdate({ label: e.target.value })}
                placeholder={field.originalName}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Descrição / instrução para o cliente</Label>
              <Textarea
                value={field.description}
                onChange={e => onUpdate({ description: e.target.value })}
                placeholder="Ex: Informe o nome completo conforme RG"
                className="text-sm min-h-[60px]"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <select
                  value={field.type}
                  onChange={e => onUpdate({ type: e.target.value })}
                  className="w-full h-8 text-sm rounded-md border border-input bg-background px-2"
                >
                  <option value="text">Texto</option>
                  <option value="date">Data</option>
                  <option value="email">E-mail</option>
                  <option value="phone">Telefone</option>
                  <option value="number">Número</option>
                  <option value="address">Endereço</option>
                  <option value="cpf">CPF</option>
                </select>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Checkbox
                  id={`req-${field.originalName}`}
                  checked={field.required}
                  onCheckedChange={(checked) => onUpdate({ required: !!checked })}
                />
                <Label htmlFor={`req-${field.originalName}`} className="text-xs">Obrigatório</Label>
              </div>
            </div>

            {/* Show AI-mapped fields */}
            {hasMappings && (
              <div className="p-2 rounded bg-primary/5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                  <Sparkles className="h-3 w-3" />
                  Campos unificados pela IA
                </div>
                {field.mappedFields!.map((mf, i) => {
                  const tpl = templates.find(t => t.id === mf.templateId);
                  return (
                    <div key={i} className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <code className="bg-muted px-1 rounded">{mf.fieldName}</code>
                      <span>→</span>
                      <span>{tpl?.name || mf.templateId}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {!hasMappings && field.count > 1 && (
              <div className="flex items-start gap-1.5 p-2 rounded bg-primary/5 text-xs text-primary">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Presente em: {field.templateNames.join(', ')}</span>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground">
              Nome original: <code className="bg-muted px-1 rounded">{field.originalName}</code>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
