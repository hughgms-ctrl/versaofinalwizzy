

## Plano: Quiz sem login + Campos agrupados + Ações CRM no builder

### 1. Bug: Link do Quiz nao funciona sem login
A rota `/q/:token` ja esta fora do `ProtectedRoute` e as RLS policies permitem leitura publica. O problema provavelmente e que o `zapi-send-message` edge function exige autenticacao (Authorization header) ao ser chamado pelo `supabase.functions.invoke`. Solucao:
- Criar uma nova edge function `quiz-webhook` (ou ajustar `zapi-send-message`) que aceite chamadas publicas com um `quiz_id` + `organization_id` para autenticar o disparo
- Alternativamente, fazer o disparo WhatsApp via uma edge function publica dedicada ao quiz, que busca as credenciais UAZAPI pela organization_id do quiz

### 2. Novo bloco: Campos de Contato agrupados
Criar um novo tipo `quiz-input-contact-info` que mostra Nome, WhatsApp e Email em uma unica tela (um abaixo do outro). Configuravel no builder: o usuario escolhe quais campos exibir (checkboxes) e qual campo e obrigatorio.

**Arquivos:**
- `QuizSidebar.tsx` — novo tipo na categoria Entradas
- `QuizNodeProperties.tsx` — editor com checkboxes (Nome, WhatsApp, Email), cada um com toggle de obrigatorio
- `QuizNodes.tsx` — visual do bloco no canvas
- `PublicQuizPage.tsx` — renderizacao com 3 inputs empilhados, salvando cada campo na variavel correta

### 3. Acao CRM no bloco Disparo WhatsApp
Adicionar ao bloco `quiz-event-whatsapp-trigger` os campos:
- Tag (select com tags da org)
- Workspace (select)
- Pipeline + Coluna (selects encadeados)

Ao disparar, a edge function tambem atribui tag, workspace e pipeline/coluna ao contato.

### 4. Novo bloco: Acao CRM (independente)
Criar tipo `quiz-event-crm-action` para usar em qualquer ponto do fluxo (qualificacao, desqualificacao, etc). Configura:
- Tag(s) a aplicar
- Workspace destino
- Pipeline + Coluna destino

Executa automaticamente ao passar pelo no (como pixel e whatsapp trigger).

**Arquivos:**
- `QuizSidebar.tsx` — novo componente na categoria Eventos
- `QuizNodeProperties.tsx` — editor com selects de Tag, Workspace, Pipeline, Coluna
- `QuizNodes.tsx` — visual do bloco
- `PublicQuizPage.tsx` — handler que chama edge function para aplicar as acoes CRM

### 5. Edge function para acoes CRM do Quiz
Criar/ajustar edge function que:
- Recebe `organization_id`, dados do contato (phone, name, email), acoes CRM (tag, workspace, pipeline, stage)
- Cria ou atualiza o contato na tabela `contacts`
- Aplica tags via `contact_tags`
- Define workspace e pipeline/stage via `conversation_pipeline_stages`
- Envia mensagem WhatsApp se configurado

Essa function sera publica (validada pelo organization_id do quiz).

### Resumo de arquivos editados
| Arquivo | Mudanca |
|---|---|
| `QuizSidebar.tsx` | Novos tipos: `quiz-input-contact-info`, `quiz-event-crm-action` |
| `QuizNodeProperties.tsx` | Editores dos novos blocos + campos CRM no WhatsApp trigger |
| `QuizNodes.tsx` | Visuais dos novos blocos no canvas |
| `PublicQuizPage.tsx` | Renderizacao contact-info + handlers CRM + fix chamada sem auth |
| Nova edge function `quiz-actions` | Disparo WhatsApp + acoes CRM publicas |
| Migration SQL | Nenhuma (usa tabelas existentes) |

