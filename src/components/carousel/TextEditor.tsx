import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider as UiSlider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Sparkles, RefreshCw, Plus, Trash2, ChevronDown } from "lucide-react";
import { TEXT_ALIGN_OPTIONS } from "./constants";
import FontPicker from "./FontPicker";
import ColorPicker from "./ColorPicker";
import type { OverlayPosition, Slide, TextAlign } from "./types";

interface Props {
  slide: Slide;
  onPatch: (patch: Partial<Slide>) => Promise<void> | void;
  onRegenerateText: (instruction?: string) => Promise<void> | void;
  onRegenerateImage: () => Promise<void> | void;
  onToggleImage: (hasImage: boolean) => Promise<void> | void;
  busy?: boolean;
}

const OVERLAY_POSITIONS: { value: OverlayPosition; label: string }[] = [
  { value: "top", label: "Topo" },
  { value: "center", label: "Centro" },
  { value: "bottom", label: "Baixo" },
  { value: "full", label: "Full" },
];

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground hover:text-primary"
      >
        {title}
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground transition", open && "rotate-180")}
        />
      </button>
      {open && <div className="mx-3 mb-3 space-y-4 rounded-lg bg-muted/40 p-3">{children}</div>}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  suffix = "px",
  onInput,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onInput: (v: number) => void;
  onCommit: () => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <UiSlider
        min={min}
        max={max}
        value={[value]}
        onValueChange={(v) => onInput(v[0])}
        onValueCommit={onCommit}
      />
    </div>
  );
}

export default function TextEditor({
  slide,
  onPatch,
  onRegenerateText,
  onRegenerateImage,
  onToggleImage,
  busy,
}: Props) {
  const [title, setTitle] = useState(slide.title ?? "");
  const [body, setBody] = useState(slide.body ?? "");
  const [instruction, setInstruction] = useState("");
  const [showInstruction, setShowInstruction] = useState(false);

  const [overlay, setOverlay] = useState(slide.overlayIntensity ?? 0.85);
  const [titleSize, setTitleSize] = useState(slide.titleSize ?? 80);
  const [bodySize, setBodySize] = useState(slide.bodySize ?? 36);

  useEffect(() => {
    setTitle(slide.title ?? "");
    setBody(slide.body ?? "");
    setInstruction("");
    setShowInstruction(false);
    setOverlay(slide.overlayIntensity ?? 0.85);
    setTitleSize(slide.titleSize ?? 80);
    setBodySize(slide.bodySize ?? 36);
  }, [slide.id, slide.title, slide.body, slide.overlayIntensity, slide.titleSize, slide.bodySize]);

  const align = (slide.textAlign ?? "left") as TextAlign;
  const overlayPosition = slide.overlayPosition ?? "bottom";
  const titleBold = slide.titleBold ?? true;

  return (
    <div>
      {/* ============ TEXTO ============ */}
      <Section title="Texto">
        <FontPicker
          value={slide.fontFamily ?? "Montserrat"}
          onChange={(font) => onPatch({ fontFamily: font })}
        />

        <Slider
          label="Tamanho do título"
          value={titleSize}
          min={60}
          max={120}
          onInput={setTitleSize}
          onCommit={() => onPatch({ titleSize })}
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Negrito do título</span>
          <Switch
            checked={titleBold}
            onCheckedChange={(v) => onPatch({ titleBold: v })}
          />
        </div>

        <Slider
          label="Tamanho do corpo"
          value={bodySize}
          min={24}
          max={48}
          onInput={setBodySize}
          onCommit={() => onPatch({ bodySize })}
        />

        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Alinhamento</Label>
          <div className="flex gap-2">
            {TEXT_ALIGN_OPTIONS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => onPatch({ textAlign: a.value })}
                title={a.label}
                className={cn(
                  "flex-1 rounded-md border py-1.5 text-sm transition",
                  align === a.value
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:border-muted-foreground",
                )}
              >
                {a.icon}
              </button>
            ))}
          </div>
        </div>

        <ColorPicker
          label="Cor do texto"
          color={slide.textColor ?? "#ffffff"}
          onChange={(hex) => onPatch({ textColor: hex })}
        />

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Título</Label>
          <Textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== slide.title && onPatch({ title })}
            rows={2}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Corpo</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => body !== slide.body && onPatch({ body })}
            rows={4}
          />
        </div>

        {!showInstruction ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => setShowInstruction(true)}
          >
            <Sparkles className="mr-2 h-4 w-4" /> Regenerar texto
          </Button>
        ) : (
          <div className="space-y-2">
            <Input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Instrução (ex: mais direto, com emoji)"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                className="flex-1"
                disabled={busy}
                onClick={async () => {
                  await onRegenerateText(instruction || undefined);
                  setShowInstruction(false);
                }}
              >
                {busy ? "Gerando..." : "Regenerar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowInstruction(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Section>

      {/* ============ IMAGEM ============ */}
      <Section title="Imagem">
        <Slider
          label="Intensidade do overlay"
          value={Math.round(overlay * 100)}
          min={0}
          max={100}
          suffix="%"
          onInput={(v) => setOverlay(v / 100)}
          onCommit={() => onPatch({ overlayIntensity: overlay })}
        />

        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">
            Posição do overlay
          </Label>
          <div className="grid grid-cols-4 gap-2">
            {OVERLAY_POSITIONS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => onPatch({ overlayPosition: p.value })}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs transition",
                  overlayPosition === p.value
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:border-muted-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <ColorPicker
          label="Cor da linha divisória"
          color={slide.accentColor ?? "#3B82F6"}
          onChange={(hex) => onPatch({ accentColor: hex })}
        />

        {!slide.hasImage && (
          <ColorPicker
            label="Cor de fundo"
            color={slide.bgColor ?? "#0a0a0a"}
            onChange={(hex) => onPatch({ bgColor: hex })}
          />
        )}

        {slide.hasImage ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => onRegenerateImage()}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Regenerar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onToggleImage(false)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => onToggleImage(true)}
          >
            <Plus className="mr-2 h-4 w-4" /> Adicionar imagem (IA)
          </Button>
        )}
      </Section>
    </div>
  );
}
