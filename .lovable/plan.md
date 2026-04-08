

## Plano: Melhorias no bloco de Vídeo + Botão WhatsApp + Disparo automático

### Contexto
O bloco de vídeo do Quizz Builder atualmente tem apenas URL e Autoplay. O usuário quer: (1) escolher formato vertical/horizontal, (2) botão CTA para WhatsApp, (3) disparo automático ao concluir o quizz.

### Sobre vídeos verticais no YouTube
YouTube sempre entrega vídeos no aspect ratio original. Se o vídeo foi enviado em formato vertical (9:16), o iframe mostrará vertical. Não é possível forçar crop via iframe do YouTube. Para vídeos enviados em 16:9, a solução é aplicar CSS `object-fit: cover` com container em aspect ratio 9:16, mas isso só funciona com tag `<video>` (MP4 direto), não com iframes do YouTube. Então ofereceremos:
- **Horizontal (16:9)** — padrão, funciona com qualquer fonte
- **Vertical (9:16)** — funciona nativamente com vídeos verticais do YouTube; para MP4 direto, aplica crop via CSS

---

### 1. Configuração de formato no bloco de Vídeo
**Arquivo**: `src/components/quiz/QuizNodeProperties.tsx`
- Adicionar Select com opções: **Horizontal (16:9)** e **Vertical (9:16)**
- Salvar como `d.orientation` (`horizontal` | `vertical`)

### 2. Renderização do vídeo no formato escolhido
**Arquivo**: `src/pages/PublicQuizPage.tsx`
- Se `orientation === 'vertical'`: container com `aspect-[9/16]` e `max-w-[360px] mx-auto`
- Se horizontal: manter `aspect-video` atual
- Para iframe (YouTube/Vimeo): aplica o aspect ratio no container
- Para MP4 direto (se detectado): usar `<video>` com `object-fit: cover` para crop real

### 3. Botão CTA para WhatsApp no bloco de Vídeo
**Arquivo**: `src/components/quiz/QuizNodeProperties.tsx`
- Adicionar campos opcionais:
  - Toggle "Botão WhatsApp"
  - Input: número do WhatsApp
  - Input: mensagem pré-preenchida
  - Input: texto do botão (padrão: "Falar no WhatsApp")

**Arquivo**: `src/pages/PublicQuizPage.tsx`
- Renderizar botão verde com ícone WhatsApp abaixo do vídeo, abrindo `https://wa.me/{numero}?text={mensagem}`

### 4. Novo bloco de Evento: "Disparo WhatsApp"
**Arquivo**: `src/components/quiz/QuizSidebar.tsx`
- Adicionar na categoria **Eventos**: `quiz-event-whatsapp-trigger` — "Disparo WhatsApp"
- Ícone: `MessageSquare` ou similar

**Arquivo**: `src/components/quiz/QuizNodeProperties.tsx`
- Configuração: número WhatsApp, mensagem template (pode usar variáveis/campos do contato)
- Esse bloco, quando alcançado no fluxo, dispara automaticamente uma mensagem via API

**Arquivo**: `src/components/quiz/QuizNodes.tsx`
- Adicionar visual do nó no canvas

**Arquivo**: `src/pages/PublicQuizPage.tsx`
- Ao processar esse bloco, fazer POST para a edge function `zapi-send-message` com os dados coletados

**Arquivo**: `src/components/quiz/QuizSidebar.tsx`
- Adicionar tipo ao `QuizNodeType`

### 5. Atualização da memória
Atualizar a memória do builder para incluir os novos recursos.

---

### Resumo técnico dos arquivos editados
| Arquivo | Mudança |
|---|---|
| `QuizSidebar.tsx` | Novo tipo + componente na sidebar |
| `QuizNodeProperties.tsx` | Config formato vídeo + CTA WhatsApp + config disparo |
| `QuizNodes.tsx` | Visual do nó de disparo WhatsApp |
| `PublicQuizPage.tsx` | Renderização vertical/horizontal + botão WhatsApp + lógica de disparo |

