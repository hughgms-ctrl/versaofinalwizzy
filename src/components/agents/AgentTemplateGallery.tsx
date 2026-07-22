import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  FileCheck2,
  Briefcase,
  Landmark,
  CarFront,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TemplateDetailDialog } from "./TemplateDetailDialog";
import { useAgentInstanceConversion, type AppliedTemplateInstance } from "@/hooks/useAgentInstances";
import { useUpdateAgentTemplate, useDeleteAgentTemplate } from "@/hooks/useAgentTemplates";
import { AGENT_FUNCTION_ROLES } from "@/hooks/useAIAgents";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { CheckCircle2, Bot } from "lucide-react";

function agentRoleLabel(role?: string | null): string | null {
  if (!role) return null;
  return AGENT_FUNCTION_ROLES.find((r) => r.value === role)?.label || role;
}

export type TemplateCategory = "beneficios_inss" | "trabalhista" | "bancario";

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string | null;
  conversionRate: number;
  status: "published" | "draft";
  // true = template privado da própria organização (qualquer membro salvou via
  // "Salvar como template"); false/undefined = veio da galeria global curada.
  isOwnOrg?: boolean;
  // função do agente principal do template (agent_snapshot.function_role) --
  // pra dar uma resposta rápida a "qual agente está nele" sem precisar abrir o
  // detalhe (ver conversa com o usuário).
  agentFunctionRole?: string | null;
}

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  beneficios_inss: "Beneficios INSS",
  trabalhista: "Trabalhista",
  bancario: "Bancario",
};

function categoryLabel(cat: string | null): string {
  if (!cat) return "Sem categoria";
  return CATEGORY_LABEL[cat as TemplateCategory] || cat;
}

const TEMPLATE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  bpc_loas: FileCheck2,
  trabalhista_reclamante: Briefcase,
  rmc_rcc: Landmark,
  auxilio_acidente: CarFront,
};

interface AgentTemplateGalleryProps {
  templates: AgentTemplate[];
  isAdmin: boolean;
  appliedInstances?: AppliedTemplateInstance[];
  onApplyTemplate: (templateId: string) => void;
}

export function AgentTemplateGallery({
  templates,
  isAdmin,
  appliedInstances = [],
  onApplyTemplate,
}: AgentTemplateGalleryProps) {
  const [category, setCategory] = useState<string>("all");
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<AgentTemplate | null>(null);

  const visibleTemplates = useMemo(() => {
    return templates
      .filter((t) => t.status === "published" || isAdmin)
      .filter((t) => category === "all" || t.category === category);
  }, [templates, isAdmin, category]);

  const categories = useMemo(
    () => Array.from(new Set(templates.map((t) => t.category).filter((c): c is string => !!c))),
    [templates]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
          Todas
        </FilterChip>
        {categories.map((cat) => (
          <FilterChip key={cat} active={category === cat} onClick={() => setCategory(cat)}>
            {categoryLabel(cat)}
          </FilterChip>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visibleTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            isAdmin={isAdmin}
            applied={appliedInstances.filter((i) => i.templateId === template.id)}
            onApply={() => onApplyTemplate(template.id)}
            onOpen={() => setPreviewTemplateId(template.id)}
            onEdit={() => setEditingTemplate(template)}
          />
        ))}
      </div>

      {visibleTemplates.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Nenhum template nessa categoria ainda.
        </p>
      )}

      <TemplateDetailDialog
        templateId={previewTemplateId}
        open={!!previewTemplateId}
        onOpenChange={(open) => { if (!open) setPreviewTemplateId(null); }}
        onApply={onApplyTemplate}
      />

      <EditTemplateDialog
        template={editingTemplate}
        existingCategories={categories}
        open={!!editingTemplate}
        onOpenChange={(open) => { if (!open) setEditingTemplate(null); }}
      />
    </div>
  );
}

// Editar nome/descrição/categoria/status direto na galeria -- categoria
// continua sendo texto livre (sem tabela própria), mas sugere as categorias
// já usadas por outros templates via datalist pra não criar variações do
// mesmo nome sem querer (ver conversa com o usuário sobre categorias).
function EditTemplateDialog({
  template,
  existingCategories,
  open,
  onOpenChange,
}: {
  template: AgentTemplate | null;
  existingCategories: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateTemplate = useUpdateAgentTemplate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryValue, setCategoryValue] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');

  useEffect(() => {
    if (!template) return;
    setName(template.name);
    setDescription(template.description || '');
    setCategoryValue(template.category || '');
    setStatus(template.status);
  }, [template?.id]);

  const handleSave = () => {
    if (!template) return;
    updateTemplate.mutate(
      { id: template.id, name: name.trim(), description: description.trim() || null, category: categoryValue.trim() || null, status },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Editar template</DialogTitle>
          <DialogDescription>Ajusta como esse template aparece na galeria curada.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-template-name">Nome</Label>
            <Input id="edit-template-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-template-description">Descrição</Label>
            <Textarea id="edit-template-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-template-category">Categoria</Label>
            <Input
              id="edit-template-category"
              list="edit-template-category-options"
              placeholder="Ex.: beneficios_inss"
              value={categoryValue}
              onChange={(e) => setCategoryValue(e.target.value)}
            />
            <datalist id="edit-template-category-options">
              {existingCategories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as 'draft' | 'published')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Rascunho (visível só para admin)</SelectItem>
                <SelectItem value="published">Publicado (visível na galeria)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!name.trim() || updateTemplate.isPending} onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-xs px-3 py-1 rounded-md transition-colors",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      )}
    >
      {children}
    </button>
  );
}

function TemplateCard({
  template,
  isAdmin,
  applied,
  onApply,
  onOpen,
  onEdit,
}: {
  template: AgentTemplate;
  isAdmin: boolean;
  applied: AppliedTemplateInstance[];
  onApply: () => void;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const isDraft = template.status === "draft";
  const Icon = TEMPLATE_ICON[template.id] ?? FileCheck2;
  const { selectedWorkspaceId } = useWorkspaceContext();
  // Selo "Ativo" só conta pro workspace selecionado no topo -- sem isso, um
  // template ativo em OUTRO workspace aparecia como ativo aqui também, mesmo
  // sem nenhuma instância rodando pra este (ver conversa com o usuário: "só os
  // templates do determinado workspace"). "Todos os Workspaces" (sem seleção)
  // continua mostrando qualquer aplicação, como antes.
  const activeApplications = applied.filter(
    (a) => a.status !== "draft" && (!selectedWorkspaceId || a.workspaceId === selectedWorkspaceId)
  );
  const deleteTemplate = useDeleteAgentTemplate();

  return (
    <Card
      className={cn(
        "p-4 flex flex-col gap-3 cursor-pointer transition-colors hover:border-primary/40",
        isDraft && "border-dashed border-muted-foreground/40"
      )}
      onClick={onOpen}
    >
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "w-9 h-9 rounded-md flex items-center justify-center",
            isDraft ? "bg-muted" : "bg-primary/10"
          )}
        >
          <Icon
            className={cn(
              "w-[18px] h-[18px]",
              isDraft ? "text-muted-foreground" : "text-primary"
            )}
          />
        </div>
        <div className="flex items-center gap-1.5">
          {template.isOwnOrg && (
            <Badge variant="outline" className="text-violet-600 border-violet-300 bg-violet-50 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900">
              Sua organização
            </Badge>
          )}
          {isDraft && (
            <Badge
              variant="outline"
              className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900"
            >
              Rascunho
            </Badge>
          )}
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 -mr-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Editar template
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    if (confirm(`Excluir o template "${template.name}"? Orquestrações já aplicadas continuam funcionando, só deixam de referenciar esse template.`)) {
                      deleteTemplate.mutate(template.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div>
        <p className={cn("text-sm font-medium", isDraft && "text-muted-foreground")}>
          {template.name}
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {template.description}
        </p>
        {agentRoleLabel(template.agentFunctionRole) && (
          <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
            <Bot className="h-3 w-3" />
            <span>Agente: {agentRoleLabel(template.agentFunctionRole)}</span>
          </div>
        )}
      </div>

      {!isDraft && activeApplications.length === 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Conversao em agendamento</span>
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            {template.conversionRate}%
          </span>
        </div>
      )}

      {activeApplications.length > 0 ? (
        <div className="space-y-1 rounded-md border border-emerald-300 bg-emerald-50 p-2 dark:border-emerald-900 dark:bg-emerald-950/30">
          {activeApplications.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
              <div className="flex items-center gap-1.5 min-w-0">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium">Ativo</span>
                {a.workspaceName && <span className="text-emerald-600/80 dark:text-emerald-400/70 truncate">· {a.workspaceName}</span>}
                {a.phoneNumber && <span className="text-emerald-600/80 dark:text-emerald-400/70 truncate">· {a.phoneNumber}</span>}
              </div>
              <InstanceConversionBadge instanceId={a.id} goalTagId={a.goalTagId} />
            </div>
          ))}
        </div>
      ) : (
        <Button
          size="sm"
          variant={isDraft ? "outline" : "default"}
          disabled={isDraft}
          onClick={(e) => { e.stopPropagation(); onApply(); }}
          className="w-full mt-1"
        >
          {isDraft ? (
            <>
              <Lock className="w-3.5 h-3.5 mr-1.5" />
              Visivel so para admin
            </>
          ) : (
            "Aplicar template"
          )}
        </Button>
      )}
    </Card>
  );
}

// Conversão real dessa instância (não o número estático do template) --
// só aparece quando a orquestração tem um objetivo (tag) definido em "Editar
// orquestração"; sem isso não tem o que calcular, então não mostra nada em
// vez de inventar um número.
function InstanceConversionBadge({ instanceId, goalTagId }: { instanceId: string; goalTagId: string | null }) {
  const { data } = useAgentInstanceConversion(instanceId, !!goalTagId);
  if (!goalTagId || !data || data.rate === null) return null;
  return (
    <span className="shrink-0 font-medium text-emerald-600 dark:text-emerald-400">
      {data.rate}% convertem
    </span>
  );
}

export function AgentsPageTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: "gallery" | "my-agents";
  onTabChange: (tab: "gallery" | "my-agents") => void;
}) {
  return (
    <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as any)}>
      <TabsList>
        <TabsTrigger value="gallery">Galeria de templates</TabsTrigger>
        <TabsTrigger value="my-agents">Meus agentes</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
