

## Fase 1 — Dashboard Jurídico estilo Profitfy (visual + mock)

Foco: criar a página nova com o visual premium das referências, usando dados mock. Sem integrações ainda. Valida o design antes de plugar dados reais.

### Rota e navegação
- Nova rota `/legal-dashboard` (registrada em `App.tsx`)
- Item no Sidebar: "Dashboard Jurídico" (ícone Scale/Gavel) — visível para todos por enquanto
- Página dedicada com tema escuro premium próprio (não altera tokens globais)

### Layout (1 coluna principal + grid responsivo)

```text
┌─────────────────────────────────────────────────────────────┐
│ [Avatar Cliente ▾]  [+ Adicionar custo de Ads]   [Hoje ▾]  │ ← Header contextual
├─────────────────────────────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                 │
│ │Receita │ │ Custo  │ │Marketing│ │Impostos│   ← 4 KPI Cards│
│ │Líquida │ │Serviços│ │         │ │ /Taxas │   gradient teal│
│ │ R$ XXk │ │ R$ XXk │ │ R$ XXk  │ │ R$ XXk │   +/- variação│
│ │ +12.5% │ │ -3.2%  │ │ +8.1%   │ │ +1.0%  │                │
│ └────────┘ └────────┘ └────────┘ └────────┘                 │
├─────────────────────────────────────────────────┬───────────┤
│  PERFORMANCE DE FUNIL                           │  LUCRO    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │  LÍQUIDO  │
│  │ Lead │→│Reuni.│→│Propos│→│Contr.│            │  R$ 84.3k │
│  │ 1240 │ │ 380  │ │ 142  │ │  47  │            │  ▆▅▇▆█▇▅  │
│  │      │ │ 30%  │ │ 37%  │ │ 33%  │            │           │
│  └──────┘ └──────┘ └──────┘ └──────┘            │  +18.2%   │
│  [SVG funil em gradient verde→teal]             │           │
├─────────────────────────────────────────────────┴───────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                     │
│ │ CPM │ │ CTR │ │ CPC │ │ CPA │ │ROAS │  ← Métricas de Ads  │
│ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                     │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                      │
│ │   ROI    │ │  Margem  │ │  Ticket  │  ← Mini-cards        │
│ │  187%    │ │  Lucro   │ │  Médio   │                      │
│ │          │ │   42%    │ │ R$ 1.8k  │                      │
│ └──────────┘ └──────────┘ └──────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

### Componentes a criar

```text
src/pages/LegalDashboardPage.tsx
src/components/legal-dashboard/
  LegalDashboardHeader.tsx     ← cliente + botão Ads + filtro período
  KpiCard.tsx                   ← card grande gradient + variação
  FunnelChart.tsx               ← 4 etapas + SVG funil
  ProfitCard.tsx                ← lucro + sparkline barras
  AdMetricsRow.tsx              ← linha CPM/CTR/CPC/CPA/ROAS
  MiniMetricCard.tsx            ← ROI/Margem/Ticket
  AddAdCostDialog.tsx           ← modal mock (sem persistência ainda)
src/data/legalDashboardMock.ts  ← dados de exemplo
```

### Decisões visuais (Profitfy-style, sem poluir resto da plataforma)
- Container da página com `bg-[#0a0e1a]` + sutil grid pattern
- KPI Cards: gradient `from-teal-500/20 to-cyan-500/5`, borda `teal-500/30`, ícone com glow
- Funil SVG: path com gradient `#10b981 → #06b6d4`, números brancos sobre fundo translúcido
- Lucro: verde neon `#10ff9d` para o valor, sparkline com mesmas barras
- Variações: verde `#10b981` ↑ / vermelho `#ef4444` ↓ com setas
- Tudo com fonte tabular-nums para alinhamento de números
- Filtro de período: dropdown shadcn com opções (Hoje, Ontem, 7d, 30d, Mês atual, Custom)
- 100% responsivo (grid colapsa em mobile)

### Dados mock realistas
- Receita Líquida: R$ 184.250 (+12.5%)
- Funil: 1240 leads → 380 reuniões → 142 propostas → 47 contratos
- CPA: R$ 287 / ROAS: 4.2x
- Sparkline: 7 barras com variação natural

### Arquivos editados
- `src/App.tsx` — registrar rota
- `src/components/layout/Sidebar.tsx` — adicionar item "Dashboard Jurídico"
- Novos arquivos listados acima

### Fora do escopo desta fase (próximas)
- Persistência real (vem na Fase 2 com tabelas `legal_cases`, `case_revenues`, `case_costs`)
- Meta Ads sync (Fase 3)
- DataJud integração (Fase 4)
- Asaas cobrança (Fase 5)

