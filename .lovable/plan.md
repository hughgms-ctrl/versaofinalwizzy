

## Diagnóstico de UX — Tema Claro Wizzy

### Problemas identificados (causa do "tudo branco demais")

| # | Problema | Onde | Impacto |
|---|---|---|---|
| 1 | **Background e card quase idênticos** | `--background: 220 20% 97%` vs `--card: 0 0% 100%` — diferença de só 3% de luminosidade | Cards "somem" no fundo, sem hierarquia visual |
| 2 | **Bordas fracas** | `--border: 220 13% 91%` (cinza muito claro) | Separação entre seções imperceptível |
| 3 | **Sombras quase invisíveis** | `shadow-sm: 0.05` opacity | Cards parecem planos, sem elevação |
| 4 | **Header transparente sobre fundo claro** | `bg-background/80 backdrop-blur` | Header se mistura com conteúdo, sem ancoragem visual |
| 5 | **`bg-secondary` = `bg-muted`** | ambos `220 14% 96%` | Inputs, badges e áreas secundárias têm a mesma cor — sem diferenciação |
| 6 | **Falta tonalidade de marca no fundo** | Tudo cinza neutro | Interface "fria", sem identidade |
| 7 | **Status badges com cores Tailwind hardcoded** | `bg-green-100`, `bg-amber-100` | Inconsistente com o sistema de tokens |

### Proposta — Reescala de profundidade (3 camadas claras)

```text
┌─────────────────────────────────────────────┐
│ CAMADA 1: Background (mais escuro)          │ ← 220 20% 94% (era 97%)
│  ┌──────────────────────────────────────┐   │
│  │ CAMADA 2: Card (intermediário)       │   │ ← 0 0% 100% + sombra real
│  │   ┌────────────────────────────┐     │   │
│  │   │ CAMADA 3: Input/secondary  │     │   │ ← 220 16% 97% (mais claro)
│  │   └────────────────────────────┘     │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Regra**: o olho precisa enxergar **diferença mínima de 4-5% de luminosidade** entre camadas adjacentes para perceber profundidade.

### Mudanças propostas (`src/index.css`)

**1. Reforçar contraste entre camadas (apenas tema claro `:root`)**
- `--background`: `220 20% 97%` → **`220 25% 94%`** (fundo levemente mais escuro e com leve toque azul/marca)
- `--card`: mantém `0 0% 100%` (cria contraste real com o fundo)
- `--secondary` / `--muted`: separar — secondary fica `220 20% 92%` (botões secundários visíveis), muted continua `220 14% 96%` (textos/áreas suaves)
- `--border`: `220 13% 91%` → **`220 15% 86%`** (bordas perceptíveis mas suaves)

**2. Sombras com mais presença**
- `--shadow-sm`: opacity `0.05` → **`0.08`** + segunda camada
- `--shadow-md`: adicionar leve tinta da cor primária (sombra "viva")
- Novo `--shadow-card`: dedicado para cards (mais soft e maior)

**3. Toque de marca no fundo (sutil)**
- Adicionar gradient muito sutil ao body: `linear-gradient(180deg, hsl(220 25% 94%), hsl(234 30% 95%))` — dá vida sem poluir

**4. Header ancorado**
- Trocar `bg-background/80` → **`bg-card/95`** + sombra inferior sutil → header "flutua" sobre o conteúdo

**5. Hover states mais visíveis**
- `.metric-card:hover`, `.pipeline-card:hover` ganham fundo levemente colorido (`hsl(var(--accent) / 0.4)`) em vez de só sombra

**6. Status badges usando tokens**
- Substituir `bg-green-100` etc. por classes baseadas em `hsl(var(--status-open) / 0.15)` — consistência total

### Comparação visual esperada

```text
ANTES:                          DEPOIS:
┌────────────────────┐          ┌────────────────────┐
│ ░░░░░░░░░░░░░░░░░░ │          │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ ← fundo distinto
│ ░ ┌──────────┐ ░░ │          │ ▓ ┌──────────┐ ▓▓ │
│ ░ │  card?   │ ░░ │          │ ▓ │  CARD ✓  │ ▓▓ │ ← card com elevação
│ ░ └──────────┘ ░░ │          │ ▓ └──────────┘ ▓▓ │   e sombra real
│ ░░░░░░░░░░░░░░░░░░ │          │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
└────────────────────┘          └────────────────────┘
Tudo plano                       Hierarquia clara
```

### Arquivos a editar
- **`src/index.css`** — atualizar `:root` (apenas tema claro), tokens de sombra, gradient sutil no body, hover states, status badges com tokens
- **`src/components/layout/Header.tsx`** — trocar `bg-background/80` por `bg-card/95` com sombra
- **Sem mudanças** no tema escuro (que já funciona bem) e sem tocar em componentes individuais

### Princípios respeitados
- 100% baseado em tokens semânticos (não quebra nada)
- Cores HSL (compatível com sistema atual)
- Reversível (só mudam variáveis CSS)
- Modo escuro intocado
- Modo privacidade intocado

