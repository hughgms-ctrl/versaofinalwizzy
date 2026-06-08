import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Rocket, Download, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useCarousel, useCarouselModels } from "@/components/carousel/hooks";
import { fetchTrending, generateCarousel } from "@/components/carousel/carouselApi";
import { SLIDE_COUNTS, VISUAL_STYLE_OPTIONS, ensureCarouselFonts } from "@/components/carousel/constants";
import { downloadCarouselZip } from "@/components/carousel/renderSlide";
import SlideCard from "@/components/carousel/SlideCard";
import SlideGrid from "@/components/carousel/SlideGrid";
import TextEditor from "@/components/carousel/TextEditor";
import CarouselProgressBar from "@/components/carousel/ProgressBar";
import type { TrendingIdea, VisualStyle } from "@/components/carousel/types";

type IdeaSource = "idea" | "trending";

export default function CarouselWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { models, loading: modelsLoading } = useCarouselModels();
  const { carousel, loading, patchSlide, regenerateText, regenerateImage } = useCarousel(id);

  // ---- coluna esquerda (criação) ----
  const [modelId, setModelId] = useState("");
  const [ideaSource, setIdeaSource] = useState<IdeaSource>("idea");
  const [prompt, setPrompt] = useState("");
  const [imageStyle, setImageStyle] = useState<VisualStyle>("cinematic");
  const [slideCount, setSlideCount] = useState<5 | 7 | 10>(5);
  const [withImage, setWithImage] = useState<Set<number>>(new Set([1]));
  const [trending, setTrending] = useState<TrendingIdea[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ---- centro / direita ----
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    ensureCarouselFonts();
  }, []);

  const selectedModel = models.find((m) => m.id === modelId);

  useEffect(() => {
    if (!modelId && models.length) setModelId(models[0].id);
  }, [models, modelId]);

  const slides = carousel?.slides ?? [];
  const selected = useMemo(
    () => slides.find((s) => s.id === selectedId) ?? slides[0],
    [slides, selectedId],
  );
  const isProcessing = carousel?.status === "processing" || carousel?.status === "pending";

  useEffect(() => {
    if (slides.length && (!selectedId || !slides.some((s) => s.id === selectedId)))
      setSelectedId(slides[0].id);
  }, [slides, selectedId]);

  const readyCount = slides.filter((s) => s.title).length;

  const setCount = (n: 5 | 7 | 10) => {
    setSlideCount(n);
    setWithImage((prev) => new Set([...prev].filter((o) => o <= n)));
  };
  const toggle = (order: number) =>
    setWithImage((prev) => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });

  const doFetchTrending = async () => {
    if (!selectedModel) return;
    setTrendingLoading(true);
    try {
      setTrending(await fetchTrending(selectedModel.niche));
    } catch {
      toast.error("Não foi possível buscar tendências");
    } finally {
      setTrendingLoading(false);
    }
  };

  const generate = async () => {
    if (!modelId) return toast.error("Selecione um modelo");
    if (prompt.trim().length < 5) return toast.error("Descreva o tema do carrossel");
    setSubmitting(true);
    try {
      const slidesCfg = Array.from({ length: slideCount }, (_, i) => ({
        order: i + 1,
        hasImage: withImage.has(i + 1),
      }));
      const { carouselId } = await generateCarousel({
        modelId,
        prompt: prompt.trim(),
        slideCount,
        imageStyle,
        slides: slidesCfg,
      });
      navigate(`/tools/carousel/${carouselId}`);
    } catch (e) {
      toast.error((e as Error).message ?? "Falha ao iniciar a geração");
    } finally {
      setSubmitting(false);
    }
  };

  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message ?? "Falha na operação");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    if (!carousel) return;
    setDownloading(true);
    try {
      await downloadCarouselZip(carousel);
    } catch {
      toast.error("Falha ao gerar o .zip");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <MainLayout fullWidth>
      <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 overflow-hidden lg:grid-cols-[300px_1fr_320px]">
        {/* ============ ESQUERDA — CRIAÇÃO ============ */}
        <aside className="overflow-y-auto border-r border-border bg-card">
          <div className="space-y-5 p-4">
            <h2 className="text-sm font-semibold">Criar carrossel</h2>

            {/* modelo */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Modelo</Label>
              {modelsLoading ? (
                <p className="text-xs text-muted-foreground">Carregando...</p>
              ) : models.length === 0 ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate("/tools/carousel/models")}
                >
                  Crie um modelo primeiro
                </Button>
              ) : (
                <Select value={modelId} onValueChange={setModelId}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} · {m.niche}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* tema */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Tema</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["idea", "trending"] as IdeaSource[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setIdeaSource(s)}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-xs transition",
                      ideaSource === s
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-muted-foreground",
                    )}
                  >
                    {s === "idea" ? "Minha ideia" : "Buscar tendência"}
                  </button>
                ))}
              </div>

              {ideaSource === "idea" ? (
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder="Ex: 5 erros que travam seu crescimento"
                />
              ) : (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={doFetchTrending}
                    disabled={trendingLoading || !selectedModel}
                  >
                    <Search className="mr-2 h-4 w-4" />
                    {trendingLoading ? "Buscando..." : "Buscar tendências"}
                  </Button>
                  {trending.length > 0 && (
                    <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                      {trending.map((t, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            onClick={() => setPrompt(t.title)}
                            className={cn(
                              "w-full rounded-md border px-2 py-1.5 text-left text-xs transition",
                              prompt === t.title
                                ? "border-primary bg-primary/10"
                                : "border-border bg-background hover:border-primary",
                            )}
                          >
                            <div className="font-medium text-foreground">{t.title}</div>
                            {t.description && (
                              <div className="text-[11px] text-muted-foreground">
                                {t.description}
                              </div>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {prompt && (
                    <p className="text-[11px] text-muted-foreground">
                      Tema: <span className="text-foreground">{prompt}</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* estilo de imagem */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Estilo da imagem</Label>
              <Select value={imageStyle} onValueChange={(v) => setImageStyle(v as VisualStyle)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISUAL_STYLE_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* número de slides */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Número de slides</Label>
              <div className="flex gap-2">
                {SLIDE_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCount(n)}
                    className={cn(
                      "flex-1 rounded-md border py-1.5 text-sm transition",
                      slideCount === n
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:border-muted-foreground",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* grade de imagens */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Slides com imagem de fundo</Label>
              <SlideGrid count={slideCount} selected={withImage} onToggle={toggle} />
              <p className="text-[11px] text-muted-foreground">
                {withImage.size} de {slideCount} com imagem
              </p>
            </div>

            <Button
              type="button"
              className="w-full"
              onClick={generate}
              disabled={submitting || models.length === 0}
            >
              <Rocket className="mr-2 h-4 w-4" />
              {submitting ? "Iniciando..." : "Gerar carrossel"}
            </Button>
          </div>
        </aside>

        {/* ============ CENTRO — PREVIEW ============ */}
        <main className="overflow-y-auto bg-background">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 p-6">
            {!carousel && !loading && (
              <div className="mt-20 text-center text-sm text-muted-foreground">
                Selecione um modelo, defina o tema e gere seu carrossel.
              </div>
            )}

            {carousel && (
              <>
                <div className="flex w-full items-center justify-between gap-3">
                  <p className="truncate text-sm text-muted-foreground">{carousel.prompt}</p>
                  {!isProcessing && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" onClick={handleDownload} disabled={downloading}>
                        <Download className="mr-2 h-4 w-4" />
                        {downloading ? "Gerando..." : "Baixar .zip"}
                      </Button>
                      <Button size="sm" variant="outline" disabled title="Em breve">
                        Instagram
                        <Badge variant="secondary" className="ml-2">Em breve</Badge>
                      </Button>
                    </div>
                  )}
                </div>

                {isProcessing && (
                  <div className="w-full rounded-xl border border-border bg-card p-4">
                    <CarouselProgressBar
                      done={readyCount}
                      total={carousel.slideCount}
                      label="Gerando com IA..."
                    />
                  </div>
                )}

                {carousel.status === "failed" && (
                  <div className="w-full rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                    A geração falhou. Verifique a chave da OpenAI em Configurações &gt;
                    Integrações e tente novamente.
                  </div>
                )}

                {/* preview principal */}
                <div className="w-full max-w-[520px]">
                  {selected && (selected.title || (selected.hasImage && selected.imageUrl)) ? (
                    <SlideCard slide={selected} total={slides.length} size={520} className="w-full" />
                  ) : (
                    <div className="flex aspect-square w-full animate-pulse items-center justify-center rounded-xl border border-border bg-card text-xs text-muted-foreground">
                      {isProcessing ? "Renderizando..." : "Sem slide"}
                    </div>
                  )}
                </div>

                {/* miniaturas */}
                <div className="flex w-full gap-2 overflow-x-auto pb-2">
                  {slides.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className={cn(
                        "shrink-0 overflow-hidden rounded-lg border transition",
                        selected?.id === s.id
                          ? "border-primary"
                          : "border-border opacity-70 hover:opacity-100",
                      )}
                    >
                      {s.title || (s.hasImage && s.imageUrl) ? (
                        <SlideCard slide={s} total={slides.length} size={84} />
                      ) : (
                        <div className="flex h-[84px] w-[84px] animate-pulse items-center justify-center bg-card text-xs text-muted-foreground">
                          {s.order}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>

        {/* ============ DIREITA — EDIÇÃO ============ */}
        <aside className="hidden overflow-y-auto border-l border-border bg-card lg:block">
          {selected && carousel && !isProcessing ? (
            <TextEditor
              slide={selected}
              busy={busy}
              onPatch={async (patch) => {
                await patchSlide(selected.id, patch);
              }}
              onRegenerateText={(instruction) => wrap(() => regenerateText(selected.id, instruction))}
              onRegenerateImage={() => wrap(() => regenerateImage(selected.id))}
              onToggleImage={async (hasImage) => {
                if (hasImage) await wrap(() => regenerateImage(selected.id));
                else await patchSlide(selected.id, { hasImage: false, imageUrl: null });
              }}
            />
          ) : (
            <div className="p-4 text-xs text-muted-foreground">
              {isProcessing
                ? "Edição disponível ao terminar a geração."
                : "Selecione um slide para editar."}
            </div>
          )}
        </aside>
      </div>
    </MainLayout>
  );
}
