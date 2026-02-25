import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Save,
  Eye,
  Code,
  Settings2,
  Palette,
  FormInput,
  Webhook,
  BarChart3,
  Plus,
  Trash2,
  GripVertical,
  Copy,
  Check,
  Play,
} from 'lucide-react';
import { useWidget, useUpdateWidget, useUpdateWidgetCustomFields, Widget, WidgetCustomField } from '@/hooks/useWidgets';
import { useFlows } from '@/hooks/useFlows';
import { useTags } from '@/hooks/useTags';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { WidgetPreview } from '@/components/widgets/WidgetPreview';
import { WidgetCodeGenerator } from '@/components/widgets/WidgetCodeGenerator';

export default function WidgetEditorPage() {
  const { widgetId } = useParams<{ widgetId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const defaultTab = searchParams.get('tab') || 'button';
  
  const { data: widget, isLoading } = useWidget(widgetId || null);
  const { data: flows = [] } = useFlows();
  const { data: tags = [] } = useTags();
  const updateWidget = useUpdateWidget();
  const updateCustomFields = useUpdateWidgetCustomFields();
  const { availableWorkspaces, isAdmin } = useWorkspaceContext();
  
  const [formData, setFormData] = useState<Partial<Widget>>({});
  const [customFields, setCustomFields] = useState<Partial<WidgetCustomField>[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [showPreview, setShowPreview] = useState(false);

  // Initialize form data when widget loads
  useEffect(() => {
    if (widget) {
      setFormData(widget);
      setCustomFields(widget.custom_fields || []);
    }
  }, [widget]);

  const updateField = <K extends keyof Widget>(key: K, value: Widget[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!widgetId) return;
    
    // Save widget
    await updateWidget.mutateAsync({ id: widgetId, data: formData });
    
    // Save custom fields
    await updateCustomFields.mutateAsync({ 
      widgetId, 
      fields: customFields.map((f, i) => ({
        ...f,
        field_order: i,
      })),
    });
    
    setHasChanges(false);
  };

  const addCustomField = () => {
    setCustomFields([...customFields, {
      field_label: '',
      field_type: 'text',
      is_required: false,
    }]);
    setHasChanges(true);
  };

  const removeCustomField = (index: number) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const updateCustomField = (index: number, updates: Partial<WidgetCustomField>) => {
    setCustomFields(customFields.map((f, i) => i === index ? { ...f, ...updates } : f));
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </MainLayout>
    );
  }

  if (!widget) {
    return (
      <MainLayout>
        <div className="p-6 text-center">
          <p className="text-muted-foreground">Widget não encontrado</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/widgets')}>
            Voltar para Widgets
          </Button>
        </div>
      </MainLayout>
    );
  }

  const activeFlows = flows.filter(f => f.is_active);

  return (
    <MainLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/widgets')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold">{formData.name || widget.name}</h1>
                  <Badge variant={formData.is_active ? 'default' : 'secondary'}>
                    {formData.is_active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Editando widget de captação
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
                <Eye className="h-4 w-4 mr-2" />
                {showPreview ? 'Ocultar Preview' : 'Preview'}
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={!hasChanges || updateWidget.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                Salvar
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className={cn("flex h-full", showPreview && "gap-4 p-4")}>
            {/* Editor Panel */}
            <div className={cn("flex-1 min-w-0", showPreview ? "max-w-2xl" : "")}>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
                <div className="border-b px-4">
                  <TabsList className="h-12">
                    <TabsTrigger value="button" className="gap-2">
                      <Palette className="h-4 w-4" />
                      Botão
                    </TabsTrigger>
                    <TabsTrigger value="form" className="gap-2">
                      <FormInput className="h-4 w-4" />
                      Formulário
                    </TabsTrigger>
                    <TabsTrigger value="fields" className="gap-2">
                      <Settings2 className="h-4 w-4" />
                      Campos
                    </TabsTrigger>
                    <TabsTrigger value="integration" className="gap-2">
                      <Webhook className="h-4 w-4" />
                      Integração
                    </TabsTrigger>
                    <TabsTrigger value="pixel" className="gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Pixel
                    </TabsTrigger>
                    <TabsTrigger value="code" className="gap-2">
                      <Code className="h-4 w-4" />
                      Código
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="p-6 space-y-6 overflow-auto max-h-[calc(100vh-200px)]">
                  {/* Button Tab */}
                  <TabsContent value="button" className="mt-0 space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Aparência do Botão</CardTitle>
                        <CardDescription>Configure como o botão aparecerá no seu site</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Texto do botão</Label>
                            <Input 
                              value={formData.button_text || ''}
                              onChange={(e) => updateField('button_text', e.target.value)}
                              placeholder="Fale Conosco"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Tamanho</Label>
                            <Select 
                              value={formData.button_size || 'medium'}
                              onValueChange={(v) => updateField('button_size', v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="small">Pequeno</SelectItem>
                                <SelectItem value="medium">Médio</SelectItem>
                                <SelectItem value="large">Grande</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Cor do botão</Label>
                            <div className="flex gap-2">
                              <Input 
                                type="color"
                                value={formData.button_color || '#6366f1'}
                                onChange={(e) => updateField('button_color', e.target.value)}
                                className="w-12 h-10 p-1 cursor-pointer"
                              />
                              <Input 
                                value={formData.button_color || '#6366f1'}
                                onChange={(e) => updateField('button_color', e.target.value)}
                                placeholder="#6366f1"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Cor do texto</Label>
                            <div className="flex gap-2">
                              <Input 
                                type="color"
                                value={formData.button_text_color || '#ffffff'}
                                onChange={(e) => updateField('button_text_color', e.target.value)}
                                className="w-12 h-10 p-1 cursor-pointer"
                              />
                              <Input 
                                value={formData.button_text_color || '#ffffff'}
                                onChange={(e) => updateField('button_text_color', e.target.value)}
                                placeholder="#ffffff"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Posição</Label>
                            <Select 
                              value={formData.button_position || 'bottom-right'}
                              onValueChange={(v) => updateField('button_position', v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bottom-right">Inferior Direito</SelectItem>
                                <SelectItem value="bottom-left">Inferior Esquerdo</SelectItem>
                                <SelectItem value="bottom-center">Inferior Centro</SelectItem>
                                <SelectItem value="inline">Inline (onde inserir)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Borda arredondada (px)</Label>
                            <Input 
                              type="number"
                              value={formData.button_border_radius || 8}
                              onChange={(e) => updateField('button_border_radius', parseInt(e.target.value))}
                              min={0}
                              max={50}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Workspace</Label>
                          <Select
                            value={formData.workspace_id || 'all'}
                            onValueChange={(val) => updateField('workspace_id', val === 'all' ? null : val)}
                            disabled={!isAdmin}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos os Workspaces</SelectItem>
                              {availableWorkspaces.map(ws => (
                                <SelectItem key={ws.id} value={ws.id}>
                                  <div className="flex items-center gap-2">
                                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: ws.color }} />
                                    {ws.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">Define em qual workspace este widget será exibido.</p>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Widget Ativo</Label>
                            <p className="text-xs text-muted-foreground">Desative para parar de receber submissões</p>
                          </div>
                          <Switch 
                            checked={formData.is_active ?? true}
                            onCheckedChange={(v) => updateField('is_active', v)}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Form Tab */}
                  <TabsContent value="form" className="mt-0 space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Aparência do Formulário</CardTitle>
                        <CardDescription>Configure o visual do popup de formulário</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label>Título</Label>
                          <Input 
                            value={formData.form_title || ''}
                            onChange={(e) => updateField('form_title', e.target.value)}
                            placeholder="Entre em contato"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label>Subtítulo (opcional)</Label>
                          <Input 
                            value={formData.form_subtitle || ''}
                            onChange={(e) => updateField('form_subtitle', e.target.value)}
                            placeholder="Preencha seus dados para falar conosco"
                          />
                        </div>

                        <Separator />

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Cor de fundo</Label>
                            <div className="flex gap-2">
                              <Input 
                                type="color"
                                value={formData.form_background_color || '#ffffff'}
                                onChange={(e) => updateField('form_background_color', e.target.value)}
                                className="w-12 h-10 p-1 cursor-pointer"
                              />
                              <Input 
                                value={formData.form_background_color || '#ffffff'}
                                onChange={(e) => updateField('form_background_color', e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Cor do texto</Label>
                            <div className="flex gap-2">
                              <Input 
                                type="color"
                                value={formData.form_text_color || '#1f2937'}
                                onChange={(e) => updateField('form_text_color', e.target.value)}
                                className="w-12 h-10 p-1 cursor-pointer"
                              />
                              <Input 
                                value={formData.form_text_color || '#1f2937'}
                                onChange={(e) => updateField('form_text_color', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Cor de destaque (botão de envio)</Label>
                          <div className="flex gap-2">
                            <Input 
                              type="color"
                              value={formData.form_accent_color || '#6366f1'}
                              onChange={(e) => updateField('form_accent_color', e.target.value)}
                              className="w-12 h-10 p-1 cursor-pointer"
                            />
                            <Input 
                              value={formData.form_accent_color || '#6366f1'}
                              onChange={(e) => updateField('form_accent_color', e.target.value)}
                            />
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <Label>Mensagem de sucesso</Label>
                          <Textarea 
                            value={formData.success_message || ''}
                            onChange={(e) => updateField('success_message', e.target.value)}
                            placeholder="Obrigado! Entraremos em contato em breve."
                            rows={2}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>URL de redirecionamento (opcional)</Label>
                          <Input 
                            value={formData.success_redirect_url || ''}
                            onChange={(e) => updateField('success_redirect_url', e.target.value)}
                            placeholder="https://seusite.com/obrigado"
                          />
                          <p className="text-xs text-muted-foreground">Deixe vazio para apenas mostrar a mensagem</p>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Fields Tab */}
                  <TabsContent value="fields" className="mt-0 space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Campos Padrão</CardTitle>
                        <CardDescription>Ative/desative e configure os campos básicos</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Name field */}
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Switch 
                              checked={formData.field_name_enabled ?? true}
                              onCheckedChange={(v) => updateField('field_name_enabled', v)}
                            />
                            <div>
                              <p className="font-medium">Nome</p>
                              <p className="text-xs text-muted-foreground">Campo de nome do contato</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">Obrigatório</Label>
                            <Switch 
                              checked={formData.field_name_required ?? false}
                              onCheckedChange={(v) => updateField('field_name_required', v)}
                              disabled={!formData.field_name_enabled}
                            />
                          </div>
                        </div>

                        {/* Email field */}
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Switch 
                              checked={formData.field_email_enabled ?? true}
                              onCheckedChange={(v) => updateField('field_email_enabled', v)}
                            />
                            <div>
                              <p className="font-medium">Email</p>
                              <p className="text-xs text-muted-foreground">Endereço de email</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">Obrigatório</Label>
                            <Switch 
                              checked={formData.field_email_required ?? false}
                              onCheckedChange={(v) => updateField('field_email_required', v)}
                              disabled={!formData.field_email_enabled}
                            />
                          </div>
                        </div>

                        {/* CPF field */}
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <Switch 
                              checked={formData.field_cpf_enabled ?? false}
                              onCheckedChange={(v) => updateField('field_cpf_enabled', v)}
                            />
                            <div>
                              <p className="font-medium">CPF</p>
                              <p className="text-xs text-muted-foreground">Documento de identificação</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">Obrigatório</Label>
                            <Switch 
                              checked={formData.field_cpf_required ?? false}
                              onCheckedChange={(v) => updateField('field_cpf_required', v)}
                              disabled={!formData.field_cpf_enabled}
                            />
                          </div>
                        </div>

                        {/* WhatsApp field */}
                        <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                          <div className="flex items-center gap-3">
                            <Switch checked disabled />
                            <div>
                              <p className="font-medium">WhatsApp</p>
                              <p className="text-xs text-muted-foreground">Número de telefone (sempre ativo)</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">Obrigatório</Label>
                            <Switch 
                              checked={formData.field_whatsapp_required ?? true}
                              onCheckedChange={(v) => updateField('field_whatsapp_required', v)}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>Campos Personalizados</CardTitle>
                            <CardDescription>Adicione perguntas de qualificação</CardDescription>
                          </div>
                          <Button size="sm" onClick={addCustomField}>
                            <Plus className="h-4 w-4 mr-2" />
                            Adicionar Campo
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {customFields.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Nenhum campo personalizado adicionado
                          </p>
                        ) : (
                          customFields.map((field, index) => (
                            <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                              <GripVertical className="h-5 w-5 text-muted-foreground mt-2 cursor-move" />
                              <div className="flex-1 grid gap-3 md:grid-cols-3">
                                <div className="space-y-1">
                                  <Label className="text-xs">Label</Label>
                                  <Input 
                                    value={field.field_label || ''}
                                    onChange={(e) => updateCustomField(index, { field_label: e.target.value })}
                                    placeholder="Qual seu interesse?"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Tipo</Label>
                                  <Select 
                                    value={field.field_type || 'text'}
                                    onValueChange={(v) => updateCustomField(index, { field_type: v as any })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="text">Texto</SelectItem>
                                      <SelectItem value="textarea">Texto Longo</SelectItem>
                                      <SelectItem value="select">Seleção</SelectItem>
                                      <SelectItem value="checkbox">Checkbox</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex items-end gap-2">
                                  <div className="flex items-center gap-2">
                                    <Switch 
                                      checked={field.is_required ?? false}
                                      onCheckedChange={(v) => updateCustomField(index, { is_required: v })}
                                    />
                                    <Label className="text-xs">Obrigatório</Label>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => removeCustomField(index)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Integration Tab */}
                  <TabsContent value="integration" className="mt-0 space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Ação após Submissão</CardTitle>
                        <CardDescription>O que fazer quando alguém preencher o formulário</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-3">
                          <div 
                            className={cn(
                              "flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors",
                              formData.integration_type === 'register_only' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                            )}
                            onClick={() => updateField('integration_type', 'register_only')}
                          >
                            <div className={cn(
                              "w-4 h-4 rounded-full border-2 mt-0.5",
                              formData.integration_type === 'register_only' ? "border-primary bg-primary" : "border-muted-foreground"
                            )} />
                            <div>
                              <p className="font-medium">Apenas registrar</p>
                              <p className="text-sm text-muted-foreground">
                                Registra o contato e cria conversa, mas não envia mensagem automaticamente
                              </p>
                            </div>
                          </div>

                          <div 
                            className={cn(
                              "flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors",
                              formData.integration_type === 'send_message' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                            )}
                            onClick={() => updateField('integration_type', 'send_message')}
                          >
                            <div className={cn(
                              "w-4 h-4 rounded-full border-2 mt-0.5",
                              formData.integration_type === 'send_message' ? "border-primary bg-primary" : "border-muted-foreground"
                            )} />
                            <div className="flex-1">
                              <p className="font-medium">Enviar mensagem</p>
                              <p className="text-sm text-muted-foreground">
                                Envia uma mensagem automática para o WhatsApp do contato
                              </p>
                            </div>
                          </div>

                          <div 
                            className={cn(
                              "flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors",
                              formData.integration_type === 'trigger_flow' ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                            )}
                            onClick={() => updateField('integration_type', 'trigger_flow')}
                          >
                            <div className={cn(
                              "w-4 h-4 rounded-full border-2 mt-0.5",
                              formData.integration_type === 'trigger_flow' ? "border-primary bg-primary" : "border-muted-foreground"
                            )} />
                            <div className="flex-1">
                              <p className="font-medium">Iniciar fluxo de atendimento</p>
                              <p className="text-sm text-muted-foreground">
                                Inicia um fluxo de automação com o contato
                              </p>
                            </div>
                          </div>
                        </div>

                        {formData.integration_type === 'send_message' && (
                          <div className="space-y-2 mt-4">
                            <Label>Mensagem a enviar</Label>
                            <Textarea 
                              value={formData.message_template || ''}
                              onChange={(e) => updateField('message_template', e.target.value)}
                              placeholder="Olá {nome}! Recebemos seu contato e em breve um atendente entrará em contato."
                              rows={4}
                            />
                            <p className="text-xs text-muted-foreground">
                              Use {'{nome}'}, {'{email}'}, {'{whatsapp}'} para incluir dados do formulário
                            </p>
                          </div>
                        )}

                        {formData.integration_type === 'trigger_flow' && (
                          <div className="space-y-2 mt-4">
                            <Label>Selecionar Fluxo</Label>
                            <Select 
                              value={formData.flow_id || ''}
                              onValueChange={(v) => updateField('flow_id', v)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione um fluxo..." />
                              </SelectTrigger>
                              <SelectContent>
                                {activeFlows.map(flow => (
                                  <SelectItem key={flow.id} value={flow.id}>
                                    {flow.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {activeFlows.length === 0 && (
                              <p className="text-xs text-muted-foreground">
                                Nenhum fluxo ativo encontrado. Crie um fluxo primeiro.
                              </p>
                            )}
                          </div>
                        )}

                        <Separator />

                        <div className="space-y-2">
                          <Label>Tags automáticas</Label>
                          <p className="text-xs text-muted-foreground">
                            Atribui automaticamente tags aos leads captados por este widget
                          </p>
                          <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/30">
                            {tags.length === 0 ? (
                              <span className="text-sm text-muted-foreground">Nenhuma tag cadastrada</span>
                            ) : (
                              tags.map(tag => {
                                const selected = (formData.tag_ids || []).includes(tag.id);
                                return (
                                  <button
                                    key={tag.id}
                                    type="button"
                                    className={cn(
                                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors",
                                      selected ? "ring-2 ring-offset-1 ring-primary/50" : "opacity-60 hover:opacity-100"
                                    )}
                                    style={{
                                      backgroundColor: `${tag.color}20`,
                                      borderColor: tag.color,
                                      color: tag.color,
                                    }}
                                    onClick={() => {
                                      const current = formData.tag_ids || [];
                                      const next = selected
                                        ? current.filter(id => id !== tag.id)
                                        : [...current, tag.id];
                                      updateField('tag_ids', next);
                                    }}
                                  >
                                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                                    {tag.name}
                                    {selected && <Check className="h-3 w-3" />}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Criar conversa automaticamente</Label>
                            <p className="text-xs text-muted-foreground">
                              Cria uma conversa no painel mesmo sem enviar mensagem
                            </p>
                          </div>
                          <Switch 
                            checked={formData.auto_create_conversation ?? true}
                            onCheckedChange={(v) => updateField('auto_create_conversation', v)}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Pixel Tab */}
                  <TabsContent value="pixel" className="mt-0 space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Rastreamento de Eventos</CardTitle>
                        <CardDescription>Configure pixels para rastrear conversões</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Ativar Pixel</Label>
                            <p className="text-xs text-muted-foreground">
                              Dispara evento quando o formulário é submetido
                            </p>
                          </div>
                          <Switch 
                            checked={formData.pixel_enabled ?? false}
                            onCheckedChange={(v) => updateField('pixel_enabled', v)}
                          />
                        </div>

                        {formData.pixel_enabled && (
                          <>
                            <div className="space-y-2">
                              <Label>Nome do Evento</Label>
                              <Input 
                                value={formData.pixel_event_name || ''}
                                onChange={(e) => updateField('pixel_event_name', e.target.value)}
                                placeholder="FormSubmit"
                              />
                              <p className="text-xs text-muted-foreground">
                                Este será o nome do evento disparado (ex: Lead, FormSubmit, Contact)
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label>Código do Pixel (opcional)</Label>
                              <Textarea 
                                value={formData.pixel_code || ''}
                                onChange={(e) => updateField('pixel_code', e.target.value)}
                                placeholder={`<!-- Cole seu código de pixel aqui -->\n<script>\n  fbq('track', 'Lead');\n</script>`}
                                rows={6}
                                className="font-mono text-xs"
                              />
                              <p className="text-xs text-muted-foreground">
                                Cole aqui código adicional de rastreamento (Facebook Pixel, Google Analytics, etc.)
                              </p>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Code Tab */}
                  <TabsContent value="code" className="mt-0 space-y-6">
                    <WidgetCodeGenerator widget={formData as Widget} widgetId={widgetId!} />
                  </TabsContent>
                </div>
              </Tabs>
            </div>

            {/* Preview Panel */}
            {showPreview && (
              <div className="w-96 flex-shrink-0 border rounded-lg bg-muted/30 overflow-hidden">
                <div className="p-3 border-b bg-background">
                  <p className="text-sm font-medium">Preview ao Vivo</p>
                </div>
                <div className="p-4">
                  <WidgetPreview widget={formData as Widget} customFields={customFields} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
