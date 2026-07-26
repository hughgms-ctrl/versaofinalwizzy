import type {
  Objective,
  OverlayPosition,
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

/** Amostra visual (gradiente CSS) de cada estilo de imagem, usada como preview no seletor. */
export const STYLE_PREVIEWS: Record<VisualStyle, string> = {
  cinematic:
    "linear-gradient(180deg, #0b0b12 0%, #1a1a2e 42%, #d4af37 50%, #1a1a2e 58%, #0b0b12 100%)",
  photorealistic: "linear-gradient(135deg, #a8c8e8 0%, #f5e6c8 55%, #e8a87c 100%)",
  minimalist: "radial-gradient(circle at 50% 45%, #ffffff 0%, #f2f2f2 55%, #e2e2e2 100%)",
  watercolor:
    "radial-gradient(circle at 25% 30%, #f6b8c9 0%, transparent 55%), " +
    "radial-gradient(circle at 75% 35%, #a9d8ea 0%, transparent 55%), " +
    "radial-gradient(circle at 50% 80%, #f7e59a 0%, transparent 55%), #fdfbf6",
  dark: "linear-gradient(135deg, #050505 0%, #1c1c1c 55%, #3d0000 100%)",
  illustration:
    "linear-gradient(135deg, #ff6b6b 0%, #ff6b6b 33%, #4ecdc4 33%, #4ecdc4 66%, #ffe66d 66%)",
};

/** Formato pré-pronto (biblioteca de formatos): preset de layout aplicado aos slides no lugar do padrão fixo. */
export interface LayoutPreset {
  id: string;
  label: string;
  hint: string;
  textAlign: TextAlign;
  overlayPosition: OverlayPosition;
  overlayIntensity: number;
  titleSize: number;
  bodySize: number;
  titleBold: boolean;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "classic",
    label: "Clássico",
    hint: "Texto embaixo, alinhado à esquerda",
    textAlign: "left",
    overlayPosition: "bottom",
    overlayIntensity: 0.85,
    titleSize: 80,
    bodySize: 36,
    titleBold: true,
  },
  {
    id: "headline",
    label: "Manchete",
    hint: "Texto grande, direto ao ponto",
    textAlign: "left",
    overlayPosition: "bottom",
    overlayIntensity: 0.9,
    titleSize: 100,
    bodySize: 40,
    titleBold: true,
  },
  {
    id: "impact",
    label: "Impacto Central",
    hint: "Frase centralizada sobre a imagem toda",
    textAlign: "center",
    overlayPosition: "center",
    overlayIntensity: 0.75,
    titleSize: 96,
    bodySize: 34,
    titleBold: true,
  },
  {
    id: "editorial",
    label: "Editorial",
    hint: "Texto no topo, tom mais leve",
    textAlign: "left",
    overlayPosition: "top",
    overlayIntensity: 0.7,
    titleSize: 64,
    bodySize: 32,
    titleBold: false,
  },
  {
    id: "board",
    label: "Quadro Cheio",
    hint: "Camada escura cobrindo tudo, texto centralizado",
    textAlign: "center",
    overlayPosition: "full",
    overlayIntensity: 0.55,
    titleSize: 72,
    bodySize: 34,
    titleBold: true,
  },
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
