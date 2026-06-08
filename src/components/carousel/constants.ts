import type {
  Objective,
  PeopleInImages,
  TextAlign,
  Tone,
  VisualStyle,
} from "./types";

/** Fontes sem serifa carregadas via Google Fonts e suportadas no render. */
export const FONT_OPTIONS = [
  "Montserrat",
  "Poppins",
  "Bebas Neue",
  "DM Sans",
  "Oswald",
  "Raleway",
  "Nunito",
  "Space Grotesk",
] as const;

export const VISUAL_STYLE_OPTIONS: {
  value: VisualStyle;
  label: string;
  hint: string;
}[] = [
  { value: "cinematic", label: "Cinematográfico", hint: "Dramático, cinema" },
  { value: "photorealistic", label: "Fotorrealista", hint: "Fotos reais" },
  { value: "minimalist", label: "Minimalista", hint: "Limpo, espaço" },
  { value: "watercolor", label: "Aquarela", hint: "Pintado à mão" },
  { value: "dark", label: "Dark", hint: "Sombrio, contraste" },
  { value: "illustration", label: "Ilustração", hint: "Vetorial, editorial" },
];

export const SLIDE_COUNTS = [5, 7, 10] as const;

export const OBJECTIVE_OPTIONS: {
  value: Objective;
  label: string;
  hint: string;
}[] = [
  { value: "educate", label: "Educar", hint: "Ensinar algo de valor" },
  { value: "sell", label: "Vender", hint: "Converter / despertar desejo" },
  { value: "engage", label: "Engajar", hint: "Comentários e salvamentos" },
  { value: "inspire", label: "Inspirar", hint: "Motivar e emocionar" },
];

export const TONE_OPTIONS: { value: Tone; label: string; hint: string }[] = [
  { value: "professional", label: "Profissional", hint: "Autoridade" },
  { value: "casual", label: "Descontraído", hint: "Próximo, leve" },
  { value: "motivational", label: "Motivacional", hint: "Energia" },
  { value: "direct", label: "Direto", hint: "Sem rodeios" },
];

export const PEOPLE_OPTIONS: {
  value: PeopleInImages;
  label: string;
  hint: string;
}[] = [
  { value: "with", label: "Com pessoas", hint: "Presença humana" },
  { value: "without", label: "Sem pessoas", hint: "Objetos / cenário" },
  { value: "indifferent", label: "Tanto faz", hint: "A IA decide" },
];

export const TEXT_ALIGN_OPTIONS: {
  value: TextAlign;
  label: string;
  icon: string;
}[] = [
  { value: "left", label: "Esquerda", icon: "⬅" },
  { value: "center", label: "Centro", icon: "⬌" },
  { value: "right", label: "Direita", icon: "➡" },
];

/** Helper de label a partir do value. */
export const labelOf = <T extends { value: string; label: string }>(
  opts: T[],
  value: string | null | undefined,
) => opts.find((o) => o.value === value)?.label ?? value ?? "";

/** Injeta as fontes do Carrossel via Google Fonts (uma vez). */
export function ensureCarouselFonts() {
  if (typeof document === "undefined") return;
  if (document.getElementById("carousel-fonts")) return;
  const link = document.createElement("link");
  link.id = "carousel-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?" +
    [
      "family=Montserrat:wght@400;700",
      "family=Poppins:wght@400;700",
      "family=Bebas+Neue",
      "family=DM+Sans:wght@400;700",
      "family=Oswald:wght@400;700",
      "family=Raleway:wght@400;700",
      "family=Nunito:wght@400;700",
      "family=Space+Grotesk:wght@400;700",
    ].join("&") +
    "&display=swap";
  document.head.appendChild(link);
}
