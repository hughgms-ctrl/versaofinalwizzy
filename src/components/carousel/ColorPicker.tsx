import { Label } from "@/components/ui/label";

interface Props {
  label?: string;
  color: string;
  onChange: (hex: string) => void;
}

/** Seletor de cor nativo (sem dependência extra), estilizado no padrão Wizzy. */
export default function ColorPicker({ label, color, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      {label ? <Label className="text-xs text-muted-foreground">{label}</Label> : null}
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5">
        <input
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-6 cursor-pointer rounded border border-border bg-transparent p-0"
          aria-label={label ?? "Cor"}
        />
        <input
          type="text"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent font-mono text-xs text-foreground outline-none"
        />
      </div>
    </div>
  );
}
