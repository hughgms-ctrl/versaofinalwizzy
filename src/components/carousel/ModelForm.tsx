import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OBJECTIVE_OPTIONS, PEOPLE_OPTIONS, TONE_OPTIONS } from "./constants";
import ColorPicker from "./ColorPicker";
import type { CarouselModel, Objective, PeopleInImages, Tone } from "./types";
import { enhanceModelField, type ModelInput } from "./carouselApi";

interface Props {
  initial?: CarouselModel;
  onSubmit: (data: ModelInput) => Promise<void> | void;
  onCancel?: () => void;
}

function Choice({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3 text-left transition",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-foreground hover:border-muted-foreground",
      )}
    >
      <div className="text-sm font-medium">{label}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </button>
  );
}

export default function ModelForm({ initial, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [niche, setNiche] = useState(initial?.niche ?? "");
  const [objective, setObjective] = useState<Objective>(initial?.objective ?? "educate");
  const [tone, setTone] = useState<Tone>(initial?.tone ?? "professional");
  const [audience, setAudience] = useState(initial?.audience ?? "");
  const [brandColor, setBrandColor] = useState(initial?.brandColor ?? "#E11D74");
  const [peopleInImages, setPeopleInImages] = useState<PeopleInImages>(
    initial?.peopleInImages ?? "indifferent",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState<"niche" | "audience" | null>(null);

  const enhance = async (field: "niche" | "audience") => {
    const value = field === "niche" ? niche : audience;
    if (!value.trim() || enhancing) return;
    setEnhancing(field);
    setError(null);
    try {
      const improved = await enhanceModelField(field, value.trim(), {
        niche: field === "audience" ? niche.trim() || undefined : undefined,
        objective,
        tone,
      });
      if (improved) {
        if (field === "niche") setNiche(improved);
        else setAudience(improved);
      }
    } catch {
      setError("Não foi possível melhorar com IA. Tente novamente.");
    } finally {
      setEnhancing(null);
    }
  };

  const enhanceBtn = (field: "niche" | "audience", value: string) => (
    <button
      type="button"
      onClick={() => enhance(field)}
      disabled={!value.trim() || enhancing !== null}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary transition hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
    >
      <Sparkles className={cn("h-3 w-3", enhancing === field && "animate-pulse")} />
      {enhancing === field ? "Melhorando..." : "Melhorar com IA"}
    </button>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !niche.trim() || !audience.trim()) {
      setError("Nome, nicho e audiência são obrigatórios");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        niche: niche.trim(),
        objective,
        tone,
        audience: audience.trim(),
        brandColor,
        peopleInImages,
      });
    } catch {
      setError("Falha ao salvar modelo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Nome do modelo</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Minha Marca Principal"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Nicho</Label>
            {enhanceBtn("niche", niche)}
          </div>
          <Input
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="Ex: Marketing Digital, Fitness, Direito"
          />
        </div>
      </div>

      <div>
        <Label className="mb-2 block text-xs text-muted-foreground">Objetivo</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {OBJECTIVE_OPTIONS.map((o) => (
            <Choice
              key={o.value}
              active={objective === o.value}
              label={o.label}
              hint={o.hint}
              onClick={() => setObjective(o.value)}
            />
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2 block text-xs text-muted-foreground">Tom</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TONE_OPTIONS.map((t) => (
            <Choice
              key={t.value}
              active={tone === t.value}
              label={t.label}
              hint={t.hint}
              onClick={() => setTone(t.value)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Audiência</Label>
          {enhanceBtn("audience", audience)}
        </div>
        <Input
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder="Ex: Empreendedores, Mães, Estudantes"
        />
      </div>

      <div className="flex flex-wrap items-end gap-8">
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">
            Cor predominante da marca
          </Label>
          <ColorPicker color={brandColor} onChange={setBrandColor} />
        </div>
        <div className="flex-1">
          <Label className="mb-2 block text-xs text-muted-foreground">
            Pessoas nas imagens
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {PEOPLE_OPTIONS.map((p) => (
              <Choice
                key={p.value}
                active={peopleInImages === p.value}
                label={p.label}
                hint={p.hint}
                onClick={() => setPeopleInImages(p.value)}
              />
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : "Salvar modelo"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
