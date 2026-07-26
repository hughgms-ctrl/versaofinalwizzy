import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { generateStyleSamples } from "./carouselApi";
import { VISUAL_STYLE_OPTIONS } from "./constants";
import type { VisualStyle } from "./types";

// Mesmo bucket público/prefixo que a edge function carousel-style-samples usa pra subir as imagens.
const SAMPLE_BUCKET = "flow-media";
const SAMPLE_PREFIX = "carousel-style-samples";

function sampleUrl(style: VisualStyle): string {
  return supabase.storage.from(SAMPLE_BUCKET).getPublicUrl(`${SAMPLE_PREFIX}/${style}.png`).data.publicUrl;
}

/** Galeria de estilo visual com a amostra real gerada por IA de cada opção. */
export default function StyleGallery({
  value,
  onChange,
}: {
  value: VisualStyle;
  onChange: (style: VisualStyle) => void;
}) {
  const [broken, setBroken] = useState<Set<VisualStyle>>(new Set());
  const [generating, setGenerating] = useState(false);

  const anyMissing = VISUAL_STYLE_OPTIONS.some((s) => broken.has(s.value));

  const doGenerate = async () => {
    setGenerating(true);
    try {
      await generateStyleSamples();
      setBroken(new Set());
      toast.success("Amostras geradas");
    } catch (e) {
      toast.error((e as Error).message ?? "Falha ao gerar amostras (precisa ser admin da plataforma)");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {VISUAL_STYLE_OPTIONS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            title={s.hint}
            className={cn(
              "overflow-hidden rounded-lg border-2 bg-card transition",
              value === s.value ? "border-primary" : "border-border hover:border-muted-foreground",
            )}
          >
            <div className="relative aspect-square w-full bg-muted">
              {!broken.has(s.value) ? (
                <img
                  src={sampleUrl(s.value)}
                  alt={s.label}
                  className="h-full w-full object-cover"
                  onError={() => setBroken((prev) => new Set(prev).add(s.value))}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] text-muted-foreground">
                  {s.hint}
                </div>
              )}
            </div>
            <p className="truncate px-1.5 py-1 text-center text-xs font-medium">{s.label}</p>
          </button>
        ))}
      </div>

      {anyMissing && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={doGenerate}
          disabled={generating}
        >
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="mr-2 h-4 w-4" />
          )}
          {generating ? "Gerando amostras..." : "Gerar amostras de exemplo"}
        </Button>
      )}
    </div>
  );
}
