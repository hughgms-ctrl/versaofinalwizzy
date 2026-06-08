# Design System

Este documento extrai o design system atual do projeto a partir de `tailwind.config.ts`, `src/index.css`, `src/fluzz/index.css` e dos componentes `ui`.

## Base tecnica

- Stack visual: React, Tailwind CSS, shadcn/ui, Radix UI e lucide-react.
- Tokens: definidos como CSS variables em HSL e consumidos pelo Tailwind.
- Tema: suporte a modo claro e `.dark`.
- Fonte principal: `Inter`.
- Iconografia: `lucide-react`.
- Raio base: `--radius: 0.75rem`.
- Container Tailwind: centralizado, `padding: 2rem`, `2xl: 1400px`.

## Arquitetura de temas

O projeto tem dois sistemas visuais relacionados:

- Wizzy principal: `src/index.css`, `src/components/ui`, `src/components/layout`.
- Wizzy Flow / Fluzz: `src/fluzz/index.css`, `src/fluzz/components/ui`, `src/fluzz/components/layout`.

Ambos usam a mesma taxonomia semantica:

```css
--background
--foreground
--card
--card-foreground
--popover
--popover-foreground
--primary
--primary-foreground
--secondary
--secondary-foreground
--muted
--muted-foreground
--accent
--accent-foreground
--destructive
--destructive-foreground
--border
--input
--ring
--sidebar-background
--sidebar-foreground
--sidebar-primary
--sidebar-primary-foreground
--sidebar-accent
--sidebar-accent-foreground
--sidebar-border
--sidebar-ring
```

## Wizzy principal

### Personalidade visual

SaaS operacional com identidade magenta/coral, superficies neutras e foco em produtividade. A UI deve parecer compacta, clara e orientada a uso diario.

### Cores claras

| Token | HSL | Uso |
| --- | --- | --- |
| `background` | `0 0% 94%` | fundo geral grafite-claro neutro |
| `foreground` | `240 10% 10%` | texto principal |
| `card` | `0 0% 100%` | cards e superficies elevadas |
| `primary` | `340 82% 55%` | marca, CTA, foco |
| `secondary` | `0 0% 92%` | controles secundarios |
| `muted` | `0 0% 96%` | areas sutis |
| `muted-foreground` | `240 5% 45%` | texto secundario |
| `accent` | `0 0% 95%` | hover e estados ativos leves |
| `accent-foreground` | `340 82% 45%` | texto em destaque |
| `border` | `0 0% 86%` | bordas |
| `input` | `0 0% 88%` | inputs |
| `ring` | `340 82% 55%` | foco |

### Cores dark

| Token | HSL | Uso |
| --- | --- | --- |
| `background` | `240 12% 7%` | fundo profundo slate-violeta |
| `foreground` | `230 20% 94%` | texto principal |
| `card` | `240 14% 10%` | superficies elevadas |
| `primary` | `340 82% 58%` | marca |
| `secondary` | `240 12% 15%` | superficie intermediaria |
| `muted` | `240 10% 14%` | areas discretas |
| `muted-foreground` | `230 10% 60%` | texto secundario |
| `accent` | `340 40% 16%` | hover magenta sutil |
| `border` | `240 12% 18%` | bordas |
| `input` | `240 12% 16%` | inputs |

### Gradientes

```css
--gradient-primary: linear-gradient(135deg, hsl(340 82% 55%) 0%, hsl(20 90% 60%) 100%);
--gradient-success: linear-gradient(135deg, hsl(142 71% 45%) 0%, hsl(166 72% 44%) 100%);
--gradient-surface: linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(0 0% 98%) 100%);
--gradient-bg: linear-gradient(180deg, hsl(0 0% 94%) 0%, hsl(0 0% 96%) 100%);
```

No dark, o fundo fica solido e o gradiente principal muda para `340 82% 58%` -> `20 90% 62%`.

### Estados semanticos

| Token | Claro | Dark | Uso |
| --- | --- | --- | --- |
| `status-open` | `142 71% 45%` | `152 85% 50%` | aberto/sucesso |
| `status-pending` | `38 92% 50%` | `38 92% 55%` | pendente/atenção |
| `status-closed` | `240 5% 45%` | `230 10% 60%` | fechado/neutro |
| `status-urgent` | `0 84% 60%` | `0 84% 62%` | urgente/erro |
| `agent-ai` | `340 82% 55%` | `340 82% 58%` | agente IA |
| `agent-human` | `142 71% 45%` | `152 85% 50%` | humano |

### Tipografia e escala

- Fonte: `Inter`, fallback `system-ui`.
- Peso comum: `400`, `500`, `600`, `700`.
- Texto de controles: `text-sm font-medium`.
- Cards shadcn: `CardTitle` usa `text-2xl font-semibold leading-none tracking-tight`.
- Em telas `>= 1024px`, o `html` usa `font-size: 75%`, reduzindo a escala geral da interface.

### Componentes principais

#### Button

Arquivo: `src/components/ui/button.tsx`.

Base:

```txt
inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium
focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
disabled:pointer-events-none disabled:opacity-50
```

Variantes:

- `default`: gradiente magenta/coral, texto branco, sombra primaria.
- `destructive`: fundo destructive.
- `outline`: borda `input`, fundo `background`, hover `accent`.
- `secondary`: fundo `secondary`.
- `ghost`: hover `accent`.
- `link`: texto primary com underline no hover.

Tamanhos:

- `default`: `h-10 px-4 py-2`
- `sm`: `h-9 px-3`
- `lg`: `h-11 px-8`
- `icon`: `h-10 w-10`

#### Card

Arquivo: `src/components/ui/card.tsx`.

- Container: `rounded-lg border bg-card text-card-foreground shadow-sm`.
- Header: `p-6`.
- Content: `p-6 pt-0`.
- Footer: `p-6 pt-0`.

#### Badge

Arquivo: `src/components/ui/badge.tsx`.

- Forma: pill, `rounded-full`, `text-xs font-semibold`.
- Variantes: `default`, `secondary`, `destructive`, `outline`.

#### Input

Arquivo: `src/components/ui/input.tsx`.

- Altura: `h-10`.
- Raio: `rounded-md`.
- Borda: `border-input`.
- Fundo: `bg-background`.
- Foco: `ring-2 ring-ring ring-offset-2`.

### Padroes de layout

#### Sidebar Wizzy

Arquivo: `src/components/layout/Sidebar.tsx`.

- Largura expandida: `w-64`.
- Largura recolhida: `w-20`.
- Posição: `fixed left-0 top-0 h-screen`.
- Fundo: `bg-sidebar`.
- Navegação: itens com `rounded-xl px-3 py-2.5 text-sm font-medium`.
- Ativo: `bg-sidebar-accent text-sidebar-primary shadow-sm`.
- Hover: `hover:bg-sidebar-accent/50`.
- Icones: lucide, normalmente `h-5 w-5`.

#### Cards operacionais

Classes globais em `src/index.css`:

- `.metric-card`: card elevado com `rounded-xl`, `p-6`, borda e sombra.
- `.pipeline-column`: coluna kanban de `w-[260px]`, `rounded-lg`, borda e fundo translucido.
- `.pipeline-card`: card compacto de pipeline com `rounded-md p-2`, cursor de drag.
- `.conversation-item`: item de lista com `gap-3 p-4 rounded-lg`.
- `.agent-card`: card de agente com hover elevado.

### Utilitarios visuais

- `.text-gradient`: texto com gradiente magenta/coral.
- `.shadow-glow`: sombra com glow primario.
- `.bg-gradient-primary`: fundo magenta/coral.
- `.bg-gradient-primary-subtle`: fundo magenta/coral sutil.
- `.border-gradient`: borda via gradiente.
- `.glass`: fundo translucido com blur.
- `.page-transition`: fade com deslocamento vertical.
- `.scrollbar-hide`: oculta scrollbar mantendo scroll.

## Fluzz / Wizzy Flow

### Personalidade visual

Produto de gestao de tarefas/workspace mais leve e colaborativo. No tema claro usa branco, cinzas frios e laranja como marca. No dark assume uma estetica mais densa, azul/roxo, inspirada em apps colaborativos.

### Cores claras

| Token | HSL | Uso |
| --- | --- | --- |
| `background` | `0 0% 99%` | fundo quase branco |
| `foreground` | `222 47% 11%` | texto principal |
| `card` | `0 0% 100%` | cards |
| `primary` | `24 95% 50%` | laranja da marca |
| `secondary` | `220 14% 96%` | superficie secundaria |
| `muted` | `220 14% 96%` | areas sutis |
| `muted-foreground` | `220 9% 46%` | texto secundario |
| `accent` | `24 100% 97%` | hover/ativo laranja claro |
| `accent-foreground` | `24 95% 40%` | texto sobre accent |
| `border` | `220 13% 91%` | bordas |
| `ring` | `24 95% 50%` | foco |

### Cores dark

| Token | HSL | Uso |
| --- | --- | --- |
| `background` | `220 18% 10%` | fundo principal |
| `foreground` | `220 10% 95%` | texto principal |
| `card` | `220 18% 14%` | cards |
| `primary` | `230 80% 65%` | azul principal |
| `accent` | `260 70% 65%` | roxo de destaque |
| `secondary` | `220 18% 18%` | superficie secundaria |
| `muted-foreground` | `220 10% 55%` | texto secundario |
| `border` | `220 18% 20%` | bordas |

### Estados e graficos

| Token | HSL claro | Uso |
| --- | --- | --- |
| `status-todo` | `0 68% 72%` | tarefa a fazer |
| `status-in-progress` | `30 100% 65%` | em progresso |
| `status-completed` | `152 69% 53%` | concluido |
| `success` | `142 71% 45%` | sucesso |
| `warning` | `43 96% 56%` | alerta |
| `info` | `217 91% 60%` | informativo |
| `chart-1` | `217 91% 60%` | grafico |
| `chart-2` | `24 95% 50%` | grafico |
| `chart-3` | `142 71% 45%` | grafico |
| `chart-4` | `280 65% 60%` | grafico |
| `chart-5` | `340 75% 55%` | grafico |

### Tipografia

- Corpo: `Inter`.
- Titulos: `Plus Jakarta Sans`, fallback `Inter`.
- O CSS define `letter-spacing: -0.011em` no body e `-0.025em` nos headings.
- `CardTitle`: `font-display text-xl font-semibold leading-none tracking-tight`.

### Componentes Fluzz

#### Button

Arquivo: `src/fluzz/components/ui/button.tsx`.

Diferenças principais:

- Raio `rounded-lg`.
- Transição `transition-all duration-200`.
- Pressionado: `active:scale-[0.98]`.
- `default`: fundo solido `primary`, sombra suave.
- `sm`: `text-xs`.

#### Card

Arquivo: `src/fluzz/components/ui/card.tsx`.

- Container: `rounded-xl border bg-card text-card-foreground shadow-sm`.
- Hover: `hover:shadow-md`.
- Transição: `duration-200`.

#### Badge

Arquivo: `src/fluzz/components/ui/badge.tsx`.

Inclui variantes extras:

- `success`: `bg-success/15 text-success`.
- `warning`: `bg-warning/15 text-warning-foreground`.
- `info`: `bg-info/15 text-info`.

### Sidebar Fluzz

Arquivo: `src/fluzz/components/layout/AppSidebar.tsx`.

- Usa componentes shadcn de sidebar.
- Largura expandida: `w-64`.
- Largura recolhida: `w-16`.
- Grupos: "Menu Principal", "Empresa", "Foco", "Projetos".
- Item ativo: `bg-primary/15 text-primary font-medium`.
- Hover: `hover:bg-sidebar-accent/50`.
- Icones: lucide com `size={18}`.

## Motion

Tailwind adiciona:

- `accordion-down`: `0.2s ease-out`.
- `accordion-up`: `0.2s ease-out`.
- `slide-in-right`: `0.3s ease-out`.
- `slide-in-left`: `0.3s ease-out`.
- `fade-in`: `0.2s ease-out`.
- `scale-in`: `0.2s ease-out`.

Fluzz adiciona utilitarios:

- `.animate-fade-in`: `0.4s cubic-bezier(0.4, 0, 0.2, 1)`.
- `.animate-slide-up`: `0.4s cubic-bezier(0.4, 0, 0.2, 1)`.
- `.animate-scale-in`: `0.2s cubic-bezier(0.4, 0, 0.2, 1)`.

## Regras de uso recomendadas

- Use tokens semanticos (`bg-card`, `text-muted-foreground`, `border-border`) em vez de valores fixos.
- Use `primary` apenas para acoes principais, estado ativo e identidade.
- Use `accent` para hover/seleção leve.
- Prefira cards para itens repetidos, metricas, entidades e dialogs; evite empilhar cards dentro de cards.
- Para botoes com icone, use lucide-react.
- Preserve o contraste entre Wizzy e Fluzz: Wizzy e magenta/coral; Fluzz claro e laranja; Fluzz dark e azul/roxo.
- Em fluxos operacionais, priorize densidade, legibilidade e navegacao previsivel.

## Fontes no codigo

- `tailwind.config.ts`
- `src/index.css`
- `src/fluzz/index.css`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/input.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/fluzz/components/ui/button.tsx`
- `src/fluzz/components/ui/card.tsx`
- `src/fluzz/components/ui/badge.tsx`
- `src/fluzz/components/layout/AppSidebar.tsx`
