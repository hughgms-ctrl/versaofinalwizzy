// Tipos de domínio (camelCase) do Carrossel IA — mapeados das linhas
// snake_case do Postgres pelos helpers em ./mappers.

export type VisualStyle =
  | "cinematic"
  | "photorealistic"
  | "minimalist"
  | "watercolor"
  | "dark"
  | "illustration";

export type Objective = "educate" | "sell" | "engage" | "inspire";
export type Tone = "professional" | "casual" | "motivational" | "direct";
export type PeopleInImages = "with" | "without" | "indifferent";
export type OverlayPosition = "top" | "center" | "bottom" | "full";
export type TextAlign = "left" | "center" | "right";

export interface CarouselModel {
  id: string;
  name: string;
  niche: string;
  objective: Objective;
  tone: Tone;
  audience: string;
  brandColor: string | null;
  peopleInImages: PeopleInImages;
  createdAt: string;
}

export interface Slide {
  id: string;
  carouselId: string;
  order: number;
  hasImage: boolean;
  imagePrompt: string | null;
  imageTheme: string | null;
  imageUrl: string | null;
  title: string | null;
  body: string | null;
  fontFamily: string | null;
  textAlign: TextAlign | null;
  textColor: string | null;
  bgColor: string | null;
  accentColor: string | null;
  textPosition: "top" | "center" | "bottom" | null;
  overlayPosition: OverlayPosition | null;
  overlayIntensity: number | null;
  titleSize: number | null;
  titleBold: boolean | null;
  bodySize: number | null;
}

export interface Carousel {
  id: string;
  modelId: string | null;
  prompt: string;
  slideCount: number;
  imageStyle: VisualStyle;
  status: "pending" | "processing" | "done" | "failed";
  instagramMediaId: string | null;
  niche: string | null;
  objective: Objective | null;
  tone: Tone | null;
  audience: string | null;
  brandColor: string | null;
  peopleInImages: PeopleInImages | null;
  createdAt: string;
  slides: Slide[];
}

export interface TrendingIdea {
  title: string;
  description: string;
}
