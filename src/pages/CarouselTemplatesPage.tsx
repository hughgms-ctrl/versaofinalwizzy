import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LayoutTemplate, Loader2, Trash2, Upload, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTemplates } from "@/components/carousel/hooks";
import { cloneTemplate, importTemplateFromScreenshots } from "@/components/carousel/carouselApi";
import { ensureCarouselFonts } from "@/components/carousel/constants";
import SlideCard from "@/components/carousel/SlideCard";

const MAX_IMAGES = 10;
const MAX_DIMENSION = 1080;

/** Lê um arquivo de imagem como data URL, redimensionando pra não estourar o payload. */
function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        return reject(new Error("Canvas indisponível"));
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Falha ao ler a imagem"));
    };
    img.src = objectUrl;
  });
}

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Importando...", variant: "secondary" },
  processing: { label: "Importando...", variant: "default" },
  done: { label: "Pronto", variant: "outline" },
  failed: { label: "Falhou", variant: "destructive" },
};

export default function CarouselTemplatesPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { templates, loading, reload, remove } = useTemplates();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [usingId, setUsingId] = useState<string | null>(null);

  useEffect(() => {
    ensureCarouselFonts();
  }, []);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, MAX_IMAGES);
    setFiles(next);
  };

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const doImport = async () => {
    if (!files.length) return toast.error("Selecione ao menos um print");
    setImporting(true);
    try {
      const images = await Promise.all(files.map(readImageAsDataUrl));
      const { carouselId } = await importTemplateFromScreenshots(images);
      setDialogOpen(false);
      setFiles([]);
      navigate(`/tools/carousel/${carouselId}`);
    } catch (e) {
      toast.error((e as Error).message ?? "Falha ao importar o template");
    } finally {
      setImporting(false);
    }
  };

  const doUseTemplate = async (templateId: string) => {
    if (!profile?.organization_id || !user?.id) return toast.error("Sessão inválida");
    setUsingId(templateId);
    try {
      const { carouselId } = await cloneTemplate(templateId, profile.organization_id, user.id);
      navigate(`/tools/carousel/${carouselId}`);
    } catch (e) {
      toast.error((e as Error).message ?? "Falha ao usar o template");
    } finally {
      setUsingId(null);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <LayoutTemplate className="h-6 w-6 text-primary" /> Templates
            </h1>
            <p className="text-muted-foreground">
              Carrosséis prontos pra usar como ponto de partida — os seus, salvos como template, ou importados de um print de referência.
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Importar de um print
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : templates.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-3 border-dashed p-12 text-center">
            <p className="text-muted-foreground">
              Nenhum template ainda. Salve um carrossel seu como template ou importe um print de referência.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Importar de um print
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {templates.map((t) => {
              const thumb = t.slides?.[0];
              const st = STATUS[t.status] ?? STATUS.pending;
              const ready = t.status === "done";
              return (
                <Card key={t.id} className="group overflow-hidden">
                  <div className="flex aspect-square items-center justify-center bg-muted">
                    {thumb && (thumb.title || (thumb.hasImage && thumb.imageUrl)) ? (
                      <SlideCard slide={thumb} total={t.slides.length} size={260} />
                    ) : (
                      <span className="px-4 text-center text-sm text-muted-foreground">
                        {thumb?.title ?? t.prompt}
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="truncate text-sm font-medium">{t.prompt}</p>
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      <button
                        onClick={() => {
                          if (confirm("Excluir este template?")) remove(t.id);
                        }}
                        className="text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!ready || usingId === t.id}
                      onClick={() => doUseTemplate(t.id)}
                    >
                      {usingId === t.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="mr-2 h-4 w-4" />
                      )}
                      Usar este template
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !importing && setDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar template de um print</DialogTitle>
            <DialogDescription>
              Suba os prints do carrossel que você gostou (um por slide, na ordem). A IA analisa a estrutura e o
              estilo e gera um carrossel novo e original inspirado nele — nunca copia o texto nem reaproveita a foto
              de pessoas reais que apareçam nos prints.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground hover:border-primary"
          >
            <Upload className="h-5 w-5" />
            Clique pra selecionar os prints (até {MAX_IMAGES})
          </button>

          {files.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  {f.name}
                  <button type="button" onClick={() => removeFile(i)} aria-label="Remover">
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={importing}>
              Cancelar
            </Button>
            <Button onClick={doImport} disabled={importing || !files.length}>
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {importing ? "Importando..." : "Importar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
