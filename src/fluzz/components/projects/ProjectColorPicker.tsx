import { cn } from "@/fluzz/lib/utils";
import { Check } from "lucide-react";

const projectColorOptions = [
  { value: "primary", bg: "bg-primary", label: "Primária" },
  { value: "blue", bg: "bg-blue-500", label: "Azul" },
  { value: "emerald", bg: "bg-emerald-500", label: "Verde" },
  { value: "amber", bg: "bg-amber-500", label: "Amarelo" },
  { value: "purple", bg: "bg-purple-500", label: "Roxo" },
  { value: "pink", bg: "bg-pink-500", label: "Rosa" },
  { value: "cyan", bg: "bg-cyan-500", label: "Ciano" },
  { value: "rose", bg: "bg-rose-500", label: "Vermelho" },
  { value: "orange", bg: "bg-orange-500", label: "Laranja" },
  { value: "teal", bg: "bg-teal-500", label: "Turquesa" },
];

interface ProjectColorPickerProps {
  value?: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ProjectColorPicker({ value, onChange, disabled }: ProjectColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {projectColorOptions.map((color) => (
        <button
          key={color.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(color.value)}
          className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary",
            color.bg,
            disabled && "opacity-50 cursor-not-allowed"
          )}
          title={color.label}
        >
          {value === color.value && (
            <Check className="h-4 w-4 text-white" />
          )}
        </button>
      ))}
    </div>
  );
}

export { projectColorOptions };
