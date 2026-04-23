

## Pacotes Verticais + Onboarding por Área/Objetivo + Base de Conhecimento da Empresa

Resposta direta às suas 3 dúvidas, depois o plano.

### 1) Agentes prontos vs prompt base/fluxo? Os dois.
- **Card pronto** vira a porta de entrada (leigo).
- **Prompt base continua existindo**, mas escondido em "Avançado". Quem quer mexer, mexe. Quem não quer, ignora.
- **Prompt de fluxo continua útil** — é o que dá personalidade pontual em automações específicas. Não some.

### 2) Onde a IA puxa dados da empresa? Nova "Base de Conhecimento da Empresa".
Em vez de cada agente ter um prompt enorme com endereço, horário, valores, tom de voz, formas de pagamento... a empresa preenche **uma vez** num lugar central (Settings → Empresa) e **todo agente injeta automaticamente** no prompt em runtime via placeholder `{{empresa.*}}`. Mais sustentável que repetir info em N agentes.

### 3) Card-vitrine pra leigo escolher: sim, é o caminho.

---

### Estrutura do produto (conceito)

```text
PACOTE DE ÁREA (vertical)
├── Direito Previdenciário
├── Imobiliário
├── Saúde
├── Estética
└── ...

Cada PACOTE traz:
 ├── Agentes prontos (Recepção, Triagem, Qualificação, Documentos, Agenda, Follow-up)
 ├── Master Prompt da área (tom, vocabulário, regras gerais)
 ├── Base de pipeline (colunas sugeridas)
 ├── Tags sugeridas
 └── OBJETIVOS (módulos plug-and-play da área)
      ├── BPC LOAS               → fluxo + agentes ativos + tags
      ├── Auxílio Reclusão        → fluxo + agentes ativos + tags
      ├── Aposentadoria por Idade → fluxo + agentes ativos + tags
      └── Agendamento de reunião  → fluxo + agentes ativos + tags
```

Cada **Objetivo** é um "card de campanha pronta" que o cliente ativa com 2 cliques.

---

### Fluxo do cliente novo (onboarding)

3 passos curtos, no primeiro login:

```text
┌─ Passo 1: Qual sua área? ─────────────────────────┐
│  [⚖️ Jurídico]  [🏠 Imobiliário]  [🏥 Saúde]       │
│  [💆 Estética]  [📚 Educação]    [⚙️ Outro]        │
└────────────────────────────────────────────────────┘
                       ↓
┌─ Passo 2: Conte sobre sua empresa ────────────────┐
│  Nome: [_____]  Site: [_____]  Telefone: [_____]   │
│  Endereço, horário, formas de pagamento, tom...    │
│  (preenche a Base de Conhecimento)                 │
└────────────────────────────────────────────────────┘
                       ↓
┌─ Passo 3: Quais objetivos quer ativar agora? ─────┐
│  ☑ BPC LOAS              ☐ Auxílio Reclusão        │
│  ☑ Agendar consulta      ☐ Recuperar inadimplente  │
│  → Pode ativar mais depois em "Ativar Pacote"      │
└────────────────────────────────────────────────────┘
                       ↓
   Tudo provisionado: agentes, fluxos, tags, master prompt
```

Skip disponível pra quem quer começar do zero.

### Botão "Ativar Pacote" permanente
Em Settings → "Pacotes & Objetivos". Mesmo wizard, acessível a qualquer momento. Útil pra trocar de área (cliente que expande) ou ativar mais objetivos.

---

### Painel admin (você)

Nova seção `/admin/pacotes` com:
- **Áreas** (CRUD): nome, ícone, cor, master prompt da área, agentes-template, tags-template, colunas-template.
- **Objetivos** (CRUD): vinculados a uma área, com fluxo-template (export do flow builder), agentes que ativam, tags que dispara.
- **Importar de organização existente**: você configura uma org de teste com tudo bonito → salva como pacote → vira disponível pra todos. (evita você ter que escrever JSON na mão)

---

### Detalhes técnicos

**Banco (migrations)**

```sql
-- Pacotes mantidos por você
platform_packages (
  id, kind ('area'|'objective'), parent_package_id,
  name, slug, icon, color, description,
  master_prompt text,
  agents_template jsonb,    -- [{role, name, prompt_base, ...}]
  flows_template jsonb,     -- [{nodes, edges, triggers}]
  tags_template jsonb,
  pipeline_template jsonb,
  is_published bool, sort_order int
)

-- Base de Conhecimento da Empresa (1 por org)
organization_knowledge (
  organization_id PK,
  company_name, website, phone, address, hours,
  payment_methods, tone_of_voice, differentials, faqs jsonb,
  custom_fields jsonb         -- expansível
)

-- Rastreio do que cada cliente ativou
activated_packages (
  organization_id, package_id, activated_at, activated_by
)
```

**Injeção automática no prompt da IA**
No `agent-orchestrator/index.ts`, antes de mandar pro LLM, substituir placeholders `{{empresa.nome}}`, `{{empresa.endereco}}`, `{{empresa.horario}}` etc. lendo de `organization_knowledge`. Agente pronto já vem com placeholders no prompt; cliente leigo só preenche o formulário da empresa e tudo se conecta.

**Frontend novo**
- `src/pages/OnboardingPage.tsx` — wizard 3 passos (mostra no primeiro login, redireciona se `organization.onboarded_at IS NULL`).
- `src/components/onboarding/AreaPicker.tsx`, `CompanyKnowledgeForm.tsx`, `ObjectivesPicker.tsx`.
- `src/pages/admin/AdminPackagesPage.tsx` — CRUD de áreas e objetivos + botão "exportar org atual como pacote".
- `src/components/settings/CompanyKnowledgeSettings.tsx` — formulário da Base de Conhecimento, sempre editável.
- `src/components/settings/ActivatePackageDialog.tsx` — botão permanente para ativar mais pacotes.

**Edge functions**
- `activate-package/index.ts` — recebe `package_id` + `organization_id`, materializa: cria `ai_agents`, `flows`, `tags`, colunas de `pipeline`, `master_prompts`. Idempotente (não duplica se já ativado).
- Ajuste em `agent-orchestrator/index.ts` — interpolar placeholders `{{empresa.*}}`.

**O que NÃO muda**
- `ai_agents`, `flows`, `master_prompts`, `tags` continuam exatamente como estão. Pacote só é uma "fábrica" que insere registros nessas tabelas. Cliente pode editar tudo depois.
- "Avançado" no card do agente continua mostrando prompt base editável.

**Versionamento simples**
`platform_packages.version int`. Quando você publica v2 de um objetivo, clientes que já ativaram v1 veem badge "Atualização disponível" (não força). Re-ativar é opcional.

### Ordem sugerida de entrega
1. Tabelas + Base de Conhecimento + Settings → Empresa (sozinho já vale muito).
2. Painel admin de Pacotes (CRUD básico, sem export).
3. Edge `activate-package` + botão "Ativar Pacote" em Settings.
4. Wizard de onboarding no primeiro login.
5. Export de organização-modelo como pacote (acelera você criar verticais).
6. Versionamento e badge de atualização.

