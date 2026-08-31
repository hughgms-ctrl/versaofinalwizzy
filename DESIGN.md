# Design — "violet pulse" (referência SpatialChat adaptada ao produto)

## Theme
Light (padrão) + Dark (tradução do mesmo sistema; violeta continua o único acento).

## Colors (light)
- Canvas: #f9fafb (hsl 210 20% 98%) · Surface/card: #ffffff · Tinted highlight: #f2f2ff (hsl 244 100% 97%)
- Ink (headline/corpo forte): #030712 (hsl 224 71% 4%) · Body: #4b5563 · Muted: #6b7280 (hsl 220 9% 46%)
- Border hairline: #e5e7eb (hsl 220 13% 91%) · Input border: #d1d5db (hsl 216 12% 84%)
- Acento único: violeta #5727e7 (hsl 255 80% 53%) — só em CTA primário, estado ativo, badge de destaque, bullets. Nunca em texto corrido ou borda estrutural.

## Colors (dark)
- Background: hsl 240 10% 6% · Card: hsl 240 8% 9% · Border: hsl 240 8% 16%
- Acento: violeta claro hsl 255 80% 62% · Tinted accent: hsl 255 45% 18%

## Typography
Inter (substituta oficial de Satoshi na referência), única família. 700 = display/headings; 600 = subheadings/ênfase; 500 = botões/badges; 400 = corpo. Sem pesos <400 ou >700.

## Shape
Radius: cards/dialogs 16px (`rounded-lg` = var(--radius)=1rem), botões/inputs 12px (`rounded-md`), badges 8px (`rounded-sm`). Logos/avatares full.

## Elevation
Sombras sempre rgba(0,0,0,0.06): botões 0 1px 2px · cards 0 4px 16px · mídia/hero 0 4px 28px. Sem glow colorido, sem sombra + borda pesadas juntas.

## Componentes
- Botão primário: violeta sólido, texto branco, hover escurece levemente (sem gradiente).
- Estado ativo de navegação: fundo #f2f2ff + texto violeta (dark: hsl 255 45% 18% + violeta claro).
- Sidebar: superfície branca com borda hairline no light; superfície card no dark (o navy fixo antigo foi aposentado).
- Status/semânticas (verde/âmbar/vermelho, status de tarefa) permanecem — são funcionais.

## Proibições
Segunda cor cromática de marca; gradiente magenta→coral (identidade antiga); gradient text multicolor; sombras coloridas; violeta sobre violeta.
