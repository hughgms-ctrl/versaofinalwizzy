import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import { Rocket, Download, Search, Sparkles, FileText, Link2, Youtube, Loader2, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { useCarousel, useCarouselModels } from "@/components/carousel/hooks";
import { extractSource, fetchTrending, generateCarousel, saveAsTemplate } from "@/components/carousel/carouselApi";
import { SLIDE_COUNTS, ensureCarouselFonts } from "@/components/carousel/constants";
import { downloadCarouselZip } from "@/components/carousel/renderSlide";
import SlideCard from "@/components/carousel/SlideCard";
import SlideGrid from "@/components/carousel/SlideGrid";
import StyleGallery from "@/components/carousel/StyleGallery";
import TextEditor from "@/components/carousel/TextEditor";
import CarouselProgressBar from "@/components/carousel/ProgressBar";
import type { TrendingIdea, VisualStyle } from "@/components/carousel/types";

type IdeaSource = "idea" | "trending" | "text" | "link" | "youtube";

const SOURCE_OPTIONS: { value: IdeaSource; label: string; icon: typeof Sparkles }[] = [
  { value: "idea", label: "Minha ideia", icon: Sparkles },
  { value: "trending", label: "Tendência", icon: Search },
  { value: "text", label: "Colar texto", icon: FileText },
  { value: "link", label: "Link da web", icon: Link2 },
  { value: "youtube", label: "YouTube", icon: Youtube },
];

export default function CarouselWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { models, loading: modelsLoading } = useCarouselModels();
  const { carousel, loading, patchSlide, regenerateText, regenerateImage } = useCarousel(id);

  // ---- coluna esquerda (criação) ----
  const [modelId, setModelId] = useState("");
  const [ideaSource, setIdeaSource] = useState<IdeaSource>("idea");
  const [prompt, setPrompt] = useState("");
  const [ctaIdea, setCtaIdea] = useState("");
  const [imageStyle, setImageStyle] = useState<VisualStyle>("cinematic");
  const [slideCount, setSlideCount] = useState<5 | 7 | 10>(5);
  const [withImage, setWithImage] = useState<Set<number>>(new Set([1]));
  const [trending, setTrending] = useState<TrendingIdea[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [showExtractedPreview, setShowExtractedPreview] = useState(false);

  // ---- centro / direita ----
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

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

  const doExtractSource = async () => {
    if (!sourceUrl.trim()) {
      return toast.error(ideaSource === "youtube" ? "Cole o link do vídeo" : "Cole o link do artigo");
    }
    if (ideaSource !== "link" && ideaSource !== "youtube") return;
    setExtracting(true);
    try {
      const { title, content } = await extractSource(ideaSource, sourceUrl.trim());
      setSourceContent(content);
      setSourceTitle(title);
      if (!prompt.trim() && title) setPrompt(title);
      setShowExtractedPreview(true);
      toast.success("Conteúdo extraído com sucesso");
    } catch (e) {
      toast.error((e as Error).message ?? "Não foi possível extrair o conteúdo");
    } finally {
      setExtracting(false);
    }
  };

  const usesSource = ideaSource === "text" || ideaSource === "link" || ideaSource === "youtube";

  const generate = async () => {
    if (!modelId) return toast.error("Selecione um modelo");
    if (usesSource) {
      if (sourceContent.trim().length < 30) {
        return toast.error(
          ideaSource === "text"
            ? "Cole o texto que vai virar carrossel"
            : "Extraia o conteúdo antes de gerar",
        );
      }
    } else if (prompt.trim().length < 5) {
      return toast.error("Descreva o tema do carrossel");
    }

    const finalPrompt = prompt.trim() || sourceContent.trim().slice(0, 60) || "Carrossel";

    setSubmitting(true);
    try {
      const slidesCfg = Array.from({ length: slideCount }, (_, i) => ({
        order: i + 1,
        hasImage: withImage.has(i + 1),
      }));
      const { carouselId } = await generateCarousel({
        modelId,
        prompt: finalPrompt,
        slideCount,
        imageStyle,
        slides: slidesCfg,
        ctaIdea: ctaIdea.trim() || undefined,
        sourceType: ideaSource === "trending" ? "idea" : ideaSource,
        sourceContent: usesSource ? sourceContent.trim() : undefined,
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

  const handleSaveAsTemplate = async () => {
    if (!carousel) return;
    setSavingTemplate(true);
    try {
      await saveAsTemplate(carousel.id);
      toast.success("Salvo na biblioteca de Templates");
      navigate("/tools/carousel/templates");
    } catch {
      toast.error("Falha ao salvar como template");
    } finally {
      setSavingTemplate(false);
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
              <div className="flex flex-wrap gap-1.5">
                {SOURCE_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setIdeaSource(s.value)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition",
                      ideaSource === s.value
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-muted-foreground",
                    )}
                  >
                    <s.icon className="h-3.5 w-3.5" />
                    {s.label}
                  </button>
                ))}
              </div>

              {ideaSource === "text" && (
                <div className="space-y-1.5">
                  <Textarea
                    value={sourceContent}
                    onChange={(e) => setSourceContent(e.target.value)}
                    rows={6}
                    placeholder="Cole aqui um artigo, roteiro ou texto — a IA extrai os pontos mais fortes e transforma em carrossel."
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {sourceContent.trim().length} caracteres colados.
                  </p>
                </div>
              )}

              {(ideaSource === "link" || ideaSource === "youtube") && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder={
                        ideaSource === "youtube"
                          ? "Cole o link do vídeo do YouTube"
                          : "Cole o link do artigo"
                      }
                    />
                    <Button type="button" variant="outline" onClick={doExtractSource} disabled={extracting}>
                      {extracting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : ideaSource === "youtube" ? (
                        "Transcrever"
                      ) : (
                        "Extrair"
                      )}
                    </Button>
                  </div>
                  {sourceContent && (
                    <div className="rounded-md border border-border bg-background p-2 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-foreground">
                          {sourceTitle || "Conteúdo extraído"}
                        </p>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground underline"
                          onClick={() => setShowExtractedPreview((v) => !v)}
                        >
                          {showExtractedPreview ? "ocultar" : "ver texto"}
                        </button>
                      </div>
                      {showExtractedPreview && (
                        <p className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap text-muted-foreground">
                          {sourceContent.slice(0, 2000)}
                          {sourceContent.length > 2000 ? "…" : ""}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {usesSource && (
                <Input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Título do carrossel (opcional — a IA sugere um)"
                />
              )}

              {ideaSource === "idea" && (
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder="Ex: 5 erros que travam seu crescimento"
                />
              )}

              {ideaSource === "trending" && (
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

            {/* ideia de CTA (opcional) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Ideia do CTA <span className="text-muted-foreground/70">(opcional)</span>
              </Label>
              <Textarea
                value={ctaIdea}
                onChange={(e) => setCtaIdea(e.target.value)}
                rows={2}
                placeholder="Ex: comente ORCAMENTO que eu mando os detalhes no direct"
              />
              <p className="text-[11px] text-muted-foreground">
                A IA melhora sua ideia e mantém a palavra-chave. Se deixar em branco, ela cria o CTA sozinha.
              </p>
            </div>

            {/* estilo de imagem */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Estilo da imagem</Label>
              <StyleGallery value={imageStyle} onChange={setImageStyle} />
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
                      {!carousel.isTemplate && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleSaveAsTemplate}
                          disabled={savingTemplate}
                        >
                          <LayoutTemplate className="mr-2 h-4 w-4" />
                          {savingTemplate ? "Salvando..." : "Salvar como template"}
                        </Button>
                      )}
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
