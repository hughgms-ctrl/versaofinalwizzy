# Apagar para todos uma mensagem que saiu errada em massa

Procedimento de emergência para quando um disparo foi enviado com o conteúdo
errado e é preciso revogar a mensagem em TODOS os destinatários.

O seletor é o **texto da mensagem**, não o disparo. É de propósito: o pedido
nesses casos é "apaga ESTA mensagem de todo mundo que recebeu", e ela pode ter
saído por mais de um agendamento, ou por agendamento + reenvio manual. Filtrar
por `scheduled_id` deixaria sobreviventes.

## Antes de começar — o que o WhatsApp permite



- O **"apagar para todos" só funciona dentro de ~2 dias do envio.** Passou disso,
  o provedor até aceita a chamada, mas o destinatário continua vendo a mensagem.
  Rode o quanto antes.
- Quem já leu vai ver **"Esta mensagem foi apagada"** no lugar do texto. Não é
  como se nunca tivesse sido enviada.
- Quem já respondeu continua com a resposta dele no chat.

## Passo 1 — conferir o alcance (SQL Editor do Supabase)

Troque o texto pelo começo real da mensagem errada. Use uma frase inteira, não
duas palavras.

```sql
select count(*) as total,
       count(*) filter (where m.metadata->>'whatsapp_deleted' is null) as pendentes,
       count(distinct c.organization_id) as orgs,
       min(m.created_at) as primeira,
       max(m.created_at) as ultima
from messages m
join conversations c on c.id = m.conversation_id
where m.content ilike 'Santiago, essa é a última vez que eu vou te chamar sobre isso.%'
  and m.direction = 'outbound'
  and m.zapi_message_id is not null;
```

Se `orgs` for maior que 1, rode uma org por vez passando `organizationId`.

Para ver de qual disparo veio (opcional, só para entender o estrago):

```sql
select m.metadata->>'scheduled_id' as scheduled_id, count(*)
from messages m
where m.content ilike 'Santiago, essa é a última vez que eu vou te chamar sobre isso.%'
group by 1;
```

## Passo 2 — rodar

A ação vive em `zapi-message-actions`, `action: 'delete_blast'`.
Exige **owner/admin** da org.

Abra o app **logado**, F12 → Console, e cole:

```js
const REF = 'zaobtetbjpuzibjymhzw';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emlianltaHp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzc5MzksImV4cCI6MjA4NzcxMzkzOX0.HBUI1OK1eYq9FE2SzIvuAkxuCG0frApCQZqcjjDx43k';

// Lê o token a CADA chamada: a limpeza pode demorar mais que a validade do
// access_token, e o supabase-js renova sozinho no localStorage.
async function blast(body) {
  const token = JSON.parse(localStorage.getItem(`sb-${REF}-auth-token`)).access_token;
  const r = await fetch(`https://${REF}.supabase.co/functions/v1/zapi-message-actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'delete_blast', ...body }),
  });
  return r.json();
}

// SÓ mensagens que começam com este texto são apagadas. Mínimo 20 caracteres.
// Ignora maiúsculas/minúsculas e espaços repetidos.
const TEXTO = 'Santiago, essa é a última vez que eu vou te chamar sobre isso.';
```

### 2a. Conferir primeiro (não apaga nada)

```js
await blast({ contentStartsWith: TEXTO, dryRun: true });
```

Olhe o retorno: `total`, `pending`, e `preview` com os primeiros telefones e o
começo do texto. **Só siga se o preview mostrar a mensagem errada e o `total`
bater com o SQL do passo 1.**

Se `total` vier 0, o texto não bate — confira acentos e o "🚨" (o emoji vem
depois desta frase, então não precisa entrar no `TEXTO`).

### 2b. Apagar de verdade

Cada chamada processa um lote (o resto não cabe no wall clock da edge function).
O loop repete até `remaining` zerar:

```js
let r;
do {
  r = await blast({
    contentStartsWith: TEXTO,
    dryRun: false,   // <- sem isto, não apaga
    limit: 40,
    delayMs: 350,    // respiro entre revogações, para não queimar o número
  });
  console.log(`apagadas: ${r.deleted} | falhas: ${r.failed} | faltam: ${r.remaining}`, r.errors);
} while (r.remaining > 0 && r.deleted > 0);

console.log('fim', r);
```

A condição `r.deleted > 0` evita loop infinito: se um lote inteiro falhar, ele
para em vez de martelar o provedor.

## Passo 3 — conferir

Rode o SQL do passo 1 de novo: `pendentes` deve estar em 0.

Falhas ficam pendentes de propósito — rodar o loop de novo tenta só o que
sobrou, sem revogar duas vezes o que já foi.

## Parâmetros

| campo | obrigatório | efeito |
|---|---|---|
| `contentStartsWith` | sim (≥20 chars) | único seletor de conteúdo |
| `dryRun` | não (padrão `true`) | `false` é o que autoriza apagar |
| `organizationId` | só se o usuário tem mais de uma org | escopo |
| `scheduledId` | não | restringe a UM disparo |
| `since` / `until` | não | janela por `messages.created_at` (ISO) |
| `limit` | não (padrão 40, teto 200) | tamanho do lote |
| `delayMs` | não (padrão 350, teto 5000) | pausa entre revogações |

## Notas de implementação

- `supabase/functions/zapi-message-actions/index.ts` → `deleteBlastForEveryone`.
- Idempotente: pula o que já tem `metadata.whatsapp_deleted`.
- Dupla checagem do texto: `ILIKE` no banco e comparação normalizada em JS antes
  de revogar cada mensagem.
- Lê no máximo `BULK_SCAN_CAP` (5000) mensagens por chamada; se
  `scanCapped: true`, rode em janelas com `since`/`until`.
