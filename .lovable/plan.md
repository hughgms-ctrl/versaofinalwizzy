
# Plano de Correções e Novas Funcionalidades UAZAPI

## Problemas Identificados

### 1. Contatos salvos com números errados
Os contatos estão sendo salvos com números truncados (ex: `47983133` em vez de `5547983133xxxx`). A função `extractPhone` no `zapi-sync-chats` extrai o número do JID mas o UAZAPI pode retornar JIDs com formatos variados. O webhook (`zapi-webhook`) também usa `jidToPhone` que pode produzir o mesmo problema.

### 2. Erro ao enviar mensagens
O `zapi-send-message` usa o número armazenado (já errado) para enviar via UAZAPI `/send/text`. Como o número está incorreto, o envio falha.

### 3. Não está recebendo mensagens
O webhook pode estar ignorando mensagens de números que não batem com contatos existentes, ou o webhook pode não estar configurado corretamente.

### 4. Build error (pdf-lib)
O `generate-document-pdf` usa `npm:pdf-lib@1.17.1` que causa erro de build no Deno.

---

## Plano de Implementação

### Fase 1: Corrigir números de contatos e envio/recebimento

**1.1 Corrigir `extractPhone` em `zapi-sync-chats`**
- Usar o endpoint UAZAPI `POST /contact/info` com `{ "number": phone }` para obter dados completos do contato (nome, foto de perfil, número real)
- Garantir que o número salvo sempre inclua código de país (55 para Brasil)
- Se o número retornado pelo UAZAPI não tiver código de país, adicionar `55` como prefixo para números brasileiros

**1.2 Corrigir `jidToPhone` em `zapi-webhook`**
- Mesma lógica: garantir que o número extraído do JID tenha formato internacional
- Adicionar fallback para buscar contato pelo JID parcial caso não encontre pelo número completo

**1.3 Corrigir `zapi-send-message`**
- Atualizar para usar os endpoints corretos da UAZAPI v2:
  - `POST /send/text` com body `{ "number": "5511999999999", "text": "mensagem" }`
  - `POST /send/media` com body `{ "number": "...", "type": "image|audio|document|ptt", "file": "url", "text": "caption" }`
- Usar `delay` para efeito de digitação nativo da UAZAPI em vez de chamar `/send/typing` separadamente
- Garantir que o número enviado está no formato internacional

**1.4 Migração de contatos existentes**
- Criar edge function utilitária `zapi-fix-contacts` que:
  - Busca todos os contatos com números curtos (menos de 10 dígitos)
  - Usa `POST /contact/info` para obter o número real
  - Atualiza o contato no banco com nome e foto de perfil

### Fase 2: Perfil de contato (nome e imagem)

**2.1 Criar edge function `zapi-contact-profile`**
- Endpoint: `POST /contact/info` da UAZAPI
- Body: `{ "number": "5511999999999" }`
- Retorna: nome, foto de perfil, status, etc.
- Salvar no banco de dados (`contacts.name`, `contacts.avatar_url`)

**2.2 Atualizar webhook para buscar perfil**
- Quando um novo contato é criado pelo webhook, chamar `/contact/info` para obter nome e foto
- Atualizar o contato com as informações obtidas

### Fase 3: Ações de mensagem e busca

**3.1 Criar edge function `zapi-message-actions`**
- Buscar mensagens: `POST /message/find` com `{ "chatid": "number@s.whatsapp.net", "limit": 20 }`
- Marcar como lida: `POST /message/read` com `{ "number": "..." }`
- Reagir a mensagem: `POST /message/react` com `{ "id": "msgId", "emoji": "emoji" }`
- Apagar mensagem: `POST /message/delete` com `{ "id": "msgId" }`
- Editar mensagem: `POST /message/edit` com `{ "id": "msgId", "text": "novo texto" }`

**3.2 Atualizar UI do ConversationDetail**
- Adicionar menu de contexto nas mensagens (reagir, apagar, editar, responder)
- Usar `/message/find` como fallback para buscar mensagens quando sync falha

### Fase 4: Chamadas

**4.1 Criar edge function `zapi-call`**
- Oferecer chamada: `POST /call/offer` com `{ "number": "...", "type": "audio|video" }`
- Rejeitar chamada recebida (via webhook)

**4.2 Atualizar UI**
- Adicionar botões de chamada de voz e vídeo no header da conversa
- Atualizar webhook para processar eventos de chamada (já ignorados atualmente em `IGNORED_EVENT_TYPES`)

### Fase 5: CRM (armazenamento dual)

**5.1 Criar edge function `zapi-crm`**
- Salvar no CRM UAZAPI: `POST /crm/save` com dados do contato
- Buscar do CRM UAZAPI: `POST /crm/find` com filtros
- Estratégia dual: salvar sempre no Supabase (fonte primária) e sincronizar com UAZAPI CRM como backup

**5.2 Criar tabela `crm_entries`**
- Campos: contact_id, organization_id, custom_fields (jsonb), synced_to_uazapi (boolean), uazapi_crm_id
- RLS policies para isolamento por organização

**5.3 Atualizar hooks e UI**
- Hook `useCrmSync` para manter dados sincronizados
- Exibir dados do CRM no painel de perfil do contato

### Fase 6: Corrigir build error

**6.1 Corrigir `generate-document-pdf`**
- Adicionar `deno.json` na pasta da function com `{ "imports": { "pdf-lib": "npm:pdf-lib@1.17.1" } }`
- Ou usar importação via esm.sh: `import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'`

---

## Detalhes Técnicos

### Endpoints UAZAPI utilizados

| Endpoint | Método | Uso |
|---|---|---|
| `/send/text` | POST | Enviar texto |
| `/send/media` | POST | Enviar mídia |
| `/contact/info` | POST | Obter perfil |
| `/message/find` | POST | Buscar mensagens |
| `/message/read` | POST | Marcar como lida |
| `/message/react` | POST | Reagir |
| `/message/delete` | POST | Apagar |
| `/message/edit` | POST | Editar |
| `/call/offer` | POST | Iniciar chamada |
| `/crm/save` | POST | Salvar CRM |
| `/crm/find` | POST | Buscar CRM |

### Autenticação UAZAPI
Todos os endpoints usam header `token` com o token da instância.

### Formato de números
A UAZAPI espera números no formato internacional sem `@s.whatsapp.net`, ex: `5511999999999`.

### Arquivos a serem modificados/criados
- `supabase/functions/zapi-send-message/index.ts` - Corrigir envio
- `supabase/functions/zapi-webhook/index.ts` - Corrigir recebimento e números
- `supabase/functions/zapi-sync-chats/index.ts` - Corrigir sync de contatos
- `supabase/functions/zapi-contact-profile/index.ts` - Novo: perfil de contato
- `supabase/functions/zapi-message-actions/index.ts` - Novo: ações de mensagem
- `supabase/functions/zapi-call/index.ts` - Novo: chamadas
- `supabase/functions/zapi-crm/index.ts` - Novo: CRM
- `supabase/functions/zapi-fix-contacts/index.ts` - Novo: corrigir contatos existentes
- `supabase/functions/generate-document-pdf/index.ts` - Corrigir build error
- `src/components/conversations/ConversationDetail.tsx` - UI para ações, chamadas
- `src/hooks/useCrmSync.ts` - Novo: hook CRM
- Nova migração SQL para tabela `crm_entries`
