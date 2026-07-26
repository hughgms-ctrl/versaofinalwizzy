import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FileText, Link2, Loader2, Trash2, Upload, Wand2, Youtube } from "lucide-react";
import { toast } from "sonner";
import { useKnowledgeItems } from "./hooks";
import {
  addFileKnowledgeItem,
  addLinkKnowledgeItem,
  addTemplateKnowledgeItem,
  addTextKnowledgeItem,
  listTemplates,
} from "./carouselApi";
import type { Carousel, KnowledgeItemType } from "./types";

type AddMode = KnowledgeItemType;

const MODE_OPTIONS: { value: AddMode; label: string; icon: typeof FileText }[] = [
  { value: "text", label: "Texto", icon: FileText },
  { value: "link", label: "Link", icon: Link2 },
  { value: "template", label: "Template", icon: Wand2 },
];

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Na fila", variant: "secondary" },
  processing: { label: "Processando...", variant: "default" },
  ready: { label: "Pronto", variant: "outline" },
  error: { label: "Falhou", variant: "destructive" },
};

const TYPE_LABEL: Record<KnowledgeItemType, string> = {
  text: "Texto",
  file: "Arquivo",
  link: "Link",
  template: "Template",
};

export default function KnowledgeBase({
  modelId,
  organizationId,
}: {
  modelId: string;
  organizationId: string;
}) {
  const { items, loading, reload, remove } = useKnowledgeItems(modelId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<AddMode>("text");
  const [saving, setSaving] = useState(false);

  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");

  const [linkType, setLinkType] = useState<"link" | "youtube">("link");
  const [linkValue, setLinkValue] = useState("");

  const [templates, setTemplates] = useState<Carousel[]>([]);
  const [templateId, setTemplateId] = useState("");

  useEffect(() => {
    if (mode === "template" && templates.length === 0) {
      listTemplates()
        .then((all) => setTemplates(all.filter((t) => t.status === "done")))
        .catch(() => toast.error("Não foi possível carregar os templates"));
    }
  }, [mode, templates.length]);

  const addText = async () => {
    if (!textContent.trim()) return toast.error("Cole o texto da referência");
    setSaving(true);
    try {
      await addTextKnowledgeItem(modelId, organizationId, textTitle.trim() || textContent.trim().slice(0, 60), textContent.trim());
      setTextTitle("");
      setTextContent("");
      await reload();
      toast.success("Adicionado à base de conhecimento");
    } catch (e) {
      toast.error((e as Error).message ?? "Falha ao adicionar");
    } finally {
      setSaving(false);
    }
  };

  const addLink = async () => {
    if (!linkValue.trim()) return toast.error(linkType === "youtube" ? "Cole o link do vídeo" : "Cole o link do artigo");
    setSaving(true);
    try {
      await addLinkKnowledgeItem(modelId, linkType, linkValue.trim());
      setLinkValue("");
      await reload();
      toast.success("Adicionado à base de conhecimento");
    } catch (e) {
      toast.error((e as Error).message ?? "Falha ao extrair conteúdo");
    } finally {
      setSaving(false);
    }
  };

  const addFile = async (file: File) => {
    setSaving(true);
    try {
      await addFileKnowledgeItem(modelId, organizationId, file);
      await reload();
      toast.success("Arquivo enviado — extraindo texto...");
    } catch (e) {
      toast.error((e as Error).message ?? "Falha ao enviar arquivo");
    } finally {
      setSaving(false);
    }
  };

  const addTemplate = async () => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return toast.error("Selecione um template");
    setSaving(true);
    try {
      await addTemplateKnowledgeItem(modelId, organizationId, template.id, template.prompt);
      setTemplateId("");
      await reload();
      toast.success("Adicionado à base de conhecimento");
    } catch (e) {
      toast.error((e as Error).message ?? "Falha ao adicionar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Base de conhecimento</h3>
        <p className="text-xs text-muted-foreground">
          Referências, tema e material de pesquisa deste projeto — usados pra enriquecer as sugestões de Tendências.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {MODE_OPTIONS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition",
              mode === m.value
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:border-muted-foreground",
            )}
          >
            <m.icon className="h-3.5 w-3.5" />
            {m.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground transition hover:border-muted-foreground"
        >
          <Upload className="h-3.5 w-3.5" />
          Arquivo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.xls,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) addFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {mode === "text" && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <Input
            value={textTitle}
            onChange={(e) => setTextTitle(e.target.value)}
            placeholder="Título (opcional)"
          />
          <Textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            rows={4}
            placeholder="Notas, briefing, informações sobre o negócio..."
          />
          <Button type="button" size="sm" onClick={addText} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Adicionar
          </Button>
        </div>
      )}

      {mode === "link" && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setLinkType("link")}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                linkType === "link" ? "border-primary bg-primary/10" : "border-border text-muted-foreground",
              )}
            >
              <Link2 className="h-3.5 w-3.5" /> Artigo
            </button>
            <button
              type="button"
              onClick={() => setLinkType("youtube")}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                linkType === "youtube" ? "border-primary bg-primary/10" : "border-border text-muted-foreground",
              )}
            >
              <Youtube className="h-3.5 w-3.5" /> YouTube
            </button>
          </div>
          <div className="flex gap-2">
            <Input
              value={linkValue}
              onChange={(e) => setLinkValue(e.target.value)}
              placeholder={linkType === "youtube" ? "Link do vídeo" : "Link do artigo"}
            />
            <Button type="button" size="sm" onClick={addLink} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Extrair"}
            </Button>
          </div>
        </div>
      )}

      {mode === "template" && (
        <div className="space-y-2 rounded-md border border-border p-3">
          {templates.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum template pronto na biblioteca ainda.</p>
          ) : (
            <>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione um template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.prompt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" size="sm" onClick={addTemplate} disabled={saving || !templateId}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Vincular ao projeto
              </Button>
            </>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          {loading ? "Carregando..." : `${items.length} item(ns) salvos`}
        </Label>
        {items.map((item) => {
          const st = STATUS_LABEL[item.status] ?? STATUS_LABEL.ready;
          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2 text-xs"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{item.title}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[item.type]}</Badge>
                  <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                </div>
                {item.status === "error" && item.errorMessage && (
                  <p className="mt-1 text-destructive">{item.errorMessage}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Remover este item da base de conhecimento?")) remove(item.id);
                }}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Remover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
