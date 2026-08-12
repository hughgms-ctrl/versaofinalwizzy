# App Review da Meta — Wizzy Engage (Instagram)

> Guia de submissão do app **Wizzy-IG**. Criado em 2026-08-11.
>
> **Se o app ainda não existe no painel da Meta, comece por
> `META_CRIAR_APP_INSTAGRAM.md`** — criação do app, credenciais, webhook e
> primeiro teste em modo Development. Este documento parte do ponto em que a
> conexão já funciona com a sua conta.
>
> **Por que isso trava o produto:** em modo Development a Meta não entrega webhooks
> nem permite ler comentários de contas que não têm papel no app. O OAuth conecta
> normalmente, o que engana — mas nenhuma automação dispara para um cliente real.
> Sem Advanced Access, o Wizzy Engage não funciona para ninguém além dos seus
> próprios testadores.

## A ordem importa

O erro de sequência mais comum é submeter o App Review antes da verificação de
negócio. Nesse caso a submissão é rejeitada por um motivo que não tem nada a ver
com o app, e você perde o ciclo de análise.

```
1. Verificação de Negócio (CNPJ)   ──►  2. App em Live Mode  ──►  3. App Review
   Business Manager                      App Dashboard             Advanced Access
   dias a semanas                        imediato                  dias a semanas
```

---

## Etapa 0 — Descobrir onde você está

Antes de qualquer coisa, confira estes três pontos no painel. Você mencionou não
saber o status atual; isto resolve em cinco minutos.

| O que conferir | Onde | O que você quer ver |
|---|---|---|
| Status da verificação de negócio | [business.facebook.com](https://business.facebook.com) → Configurações do Negócio → **Central de Segurança** | "Verificado" |
| Modo do app | [developers.facebook.com/apps](https://developers.facebook.com/apps) → Wizzy-IG → topo da página | Alternador **Live** (não "Development") |
| Solicitações de permissão | App Dashboard → **App Review → Permissions and Features** | Status de cada uma das 4 permissões |

Na tabela de permissões, cada uma aparece como *Standard Access* (o que você tem
hoje, sem review) ou *Advanced Access* (o que você precisa). Se houver uma
submissão rejeitada, o motivo aparece aí — e vale ler antes de resubmeter,
porque resubmeter sem endereçar o motivo costuma ser rejeitado de novo.

---

## Etapa 1 — Verificação de Negócio

Feita uma vez por portfólio de negócios, não por app. Exige CNPJ ativo e
documentação que comprove o nome e o endereço da empresa.

- **Onde:** Business Manager → Configurações do Negócio → Central de Segurança → *Iniciar verificação*
- **Documentos aceitos:** cartão CNPJ, contrato social, conta de serviço público ou extrato bancário em nome da empresa. O nome e o endereço precisam bater **exatamente** com o que está cadastrado no Business Manager — divergência de grafia ou endereço antigo é a causa mais comum de recusa.
- **Prazo:** normalmente alguns dias úteis; pode passar de uma semana.

Se essa etapa já estiver concluída, pule para a Etapa 2.

---

## Etapa 2 — Configurar os callbacks no painel

**Esta etapa depende do deploy do código desta entrega** (ver seção "O que foi
implementado"). Sem os dois campos abaixo preenchidos, a submissão é rejeitada
automaticamente — é um dos itens que a Meta mais recusa por ausência.

No App Dashboard → **Instagram → API setup with Instagram login** → *Business login settings*:

| Campo | Valor |
|---|---|
| Deauthorize callback URL | `https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/instagram-deauthorize` |
| Data deletion request URL | `https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/instagram-data-deletion` |

E em **App Settings → Basic**:

| Campo | Valor |
|---|---|
| Privacy Policy URL | `https://<seu-domínio>/privacidade` |
| Terms of Service URL | `https://<seu-domínio>/termos` |
| User Data Deletion | *Data Deletion Instructions URL* → `https://<seu-domínio>/exclusao-de-dados` |
| App Icon | 1024×1024, sem transparência |
| Category | Business and Pages |

> Use o domínio público do app (o mesmo onde o cliente acessa o Wizzy), não a URL
> do Supabase, nos campos de política/termos.

---

## Etapa 3 — Live Mode

App Dashboard → alternador no topo → **Live**.

Requer os campos da Etapa 2 preenchidos. Um app em Development nunca recebe
Advanced Access, então isso não é opcional.

---

## Etapa 4 — Conta de teste para o revisor

O revisor da Meta é uma pessoa real que vai abrir o Wizzy e tentar reproduzir o
fluxo. Se ele não conseguir entrar, **a submissão inteira é rejeitada** — essa é
a regra mais dura do processo.

Prepare antes de submeter:

1. Um login no Wizzy (e-mail + senha) numa organização de demonstração, com o
   módulo `integrations` liberado e a flag `wizzy_engage` ligada para essa org
   (`platform_settings.tool_release_flags`, ou incluir o id da org em
   `internal_test_organization_ids`).
2. Uma conta profissional do Instagram de teste já conectada nessa organização,
   com pelo menos um post publicado onde o revisor possa comentar.
3. Confirmar que esse login funciona numa janela anônima, do zero. Vale testar de
   verdade — credencial errada é rejeição garantida.

---

## Etapa 5 — Justificativas de cada permissão

Cole os textos abaixo no campo de descrição de cada permissão. Eles descrevem o
que o código realmente faz — não prometa nada além disso, porque o revisor testa.

### `instagram_business_basic`

```
O Wizzy é uma plataforma de atendimento e CRM que centraliza conversas de
WhatsApp e Instagram para pequenas e médias empresas no Brasil.

Esta permissão é usada para identificar a conta profissional que o cliente
conecta: obtemos o ID, o nome de usuário e a foto de perfil para exibir na tela
de Configurações qual conta está conectada, e para associar as conversas e
automações à conta correta quando o cliente gerencia mais de uma.

Sem esta permissão não conseguimos identificar a conta autorizada nem vincular
os eventos recebidos ao cliente certo.
```

### `instagram_business_manage_comments`

```
O cliente do Wizzy cria regras de automação para os comentários dos próprios
posts. Quando alguém comenta uma palavra-chave definida pelo cliente (por
exemplo "quero"), o Wizzy:

1. lê o comentário através do webhook para verificar se ele corresponde à regra;
2. responde publicamente abaixo do comentário com uma mensagem escrita pelo
   próprio cliente.

Isso permite que a empresa atenda automaticamente o interesse demonstrado no
comentário sem precisar monitorar os posts manualmente. As regras são criadas e
ativadas pelo cliente na tela "Wizzy Engage", sempre para a conta que ele mesmo
autorizou.
```

### `instagram_business_manage_messages`

```
Após responder publicamente ao comentário, o Wizzy envia uma mensagem privada
(Private Reply) para a pessoa que comentou, com o conteúdo definido pelo cliente
— normalmente a informação que a pessoa pediu no comentário.

Se a pessoa responder a essa mensagem, a conversa aparece no painel de Conversas
do Wizzy, onde a equipe da empresa continua o atendimento manualmente, no mesmo
lugar em que já atende o WhatsApp.

Usamos esta permissão exclusivamente para: (a) enviar a Private Reply decorrente
de um comentário do usuário, (b) receber as respostas dessa pessoa e (c)
permitir que o atendente humano responda dentro da janela de mensagens. Não
enviamos mensagens não solicitadas: toda conversa começa por uma ação da própria
pessoa (comentário ou DM enviada para a empresa).
```

### `instagram_business_content_publish`

> ⚠️ **Recomendação: remova esta permissão da solicitação.** O código não publica
> conteúdo — nenhuma função chama endpoint de publicação. Pedir uma permissão que
> você não consegue demonstrar no screencast é motivo comum de rejeição, e ela
> pode ser solicitada depois, separadamente, quando houver a funcionalidade.
>
> Para removê-la, edite `REQUESTED_SCOPES` em
> `supabase/functions/instagram-oauth-start/index.ts` e não a inclua na submissão.

---

## Etapa 6 — Screencasts

Cada permissão precisa do seu próprio vídeo, e **screencast incompleto é a maior
causa de rejeição**. Regras que a Meta aplica:

- Interface em **inglês**, se possível. Se gravar em português, adicione legendas
  em inglês explicando cada passo — a Wizzy é em português, então planeje as
  legendas.
- Mostre o fluxo **completo**, incluindo o login no Wizzy e a tela de autorização
  da Meta. Não comece com a conta já conectada.
- Explique qualquer botão cujo propósito não seja óbvio.

### Roteiro sugerido (cobre as três permissões em uma gravação contínua)

1. Login no Wizzy com a conta de teste.
2. **Configurações → Integrações → Conectar Instagram.** Mostre a tela de
   autorização da Meta e as permissões sendo concedidas. → *cobre `instagram_business_basic`*
3. De volta ao Wizzy, mostre a conta conectada com @ e foto de perfil.
4. **Ferramentas → Wizzy Engage → Nova automação.** Crie uma regra: palavra-chave
   "quero", ação *responder comentário publicamente* e ação *enviar DM privada*.
   Salve e mostre a regra ativa.
5. Em outro dispositivo/conta, comente **"quero"** no post de teste.
6. Mostre o resultado no Instagram: a resposta pública aparecendo abaixo do
   comentário → *cobre `instagram_business_manage_comments`*; e a DM chegando na
   caixa de entrada de quem comentou → *cobre `instagram_business_manage_messages`*.
7. Responda à DM pela conta que comentou e mostre a mensagem aparecendo em
   **Conversas → Instagram** dentro do Wizzy, com o atendente respondendo dali.
8. Feche mostrando a aba **Logs** do Wizzy Engage, com a execução registrada
   passo a passo.

> O passo 7 é o que convence: demonstra que a permissão de mensagens serve para
> atendimento real, iniciado pelo usuário, e não para envio em massa.

---

## Etapa 7 — Submeter

App Dashboard → **Instagram → API setup with Instagram login** → seção *Complete
app review* → *Continue to app review*.

Anexe, para cada permissão: a justificativa (Etapa 5), o screencast (Etapa 6) e
as instruções de login (Etapa 4). Confirme a conformidade com as diretrizes de
uso e envie.

**Prazo:** alguns dias a algumas semanas. Se for rejeitado, o motivo vem no
painel — trate o motivo específico antes de resubmeter.

---

## O que foi implementado nesta entrega

Auditoria do que a Meta exige, contra o que o repositório tinha:

| Requisito | Estado antes | Agora |
|---|---|---|
| Política de Privacidade pública | ✅ `/privacidade` — já cita as permissões nominalmente | inalterado |
| Termos de Uso públicos | ✅ `/termos` | inalterado |
| Instruções de exclusão de dados | ✅ `/exclusao-de-dados` | inalterado |
| Verificação de assinatura no webhook | ✅ HMAC no `instagram-webhook` | inalterado |
| **Deauthorize callback** | ❌ **não existia** | ✅ `instagram-deauthorize` |
| **Data deletion callback** | ❌ **não existia** | ✅ `instagram-data-deletion` |

### `instagram-deauthorize`

Quando alguém remove o Wizzy pelas configurações do próprio Instagram, essa
revogação acontece fora do produto — ninguém chama o `instagram-disconnect`. Sem
este callback, a conta continuava marcada como `connected` para sempre, e o app
seguiria tentando enviar DMs com um token que a Meta já invalidou, gerando falhas
silenciosas para o cliente. Agora a conta é marcada como desconectada e os tokens
mortos são apagados.

### `instagram-data-deletion`

Recebe o pedido, apaga o contato do Instagram correspondente — o `ON DELETE
CASCADE` leva junto conversas, mensagens, tags e follow-ups pendentes — e devolve
`{ url, confirmation_code }` no formato que a Meta exige. O mesmo endpoint serve,
via GET, a página de status que o código de confirmação abre.

Decisão de escopo registrada no código: se o id recebido for de uma **conta
profissional conectada** (e não de um contato), o callback desconecta a conta em
vez de apagar a organização inteira. Apagar o workspace de um cliente pagante a
partir de um pedido não autenticado seria um raio de alcance desproporcional; a
exclusão de conta continua pelo processo documentado em `/exclusao-de-dados`.

Ambos validam o `signed_request` com HMAC-SHA256 contra o app secret e **falham
fechado** se o segredo não estiver configurado — diferente do verificador de
webhook, que falha aberto de propósito. A diferença é intencional: agir sem
verificação aqui significaria desconectar contas ou apagar dados a pedido de um
chamador não autenticado.

O parser foi testado contra payloads assinados de verdade, cobrindo assinatura
válida, segredo errado, payload adulterado, ausência de segredo, entradas
malformadas e casos de padding/caracteres específicos de base64url.

### Migration

`20260811140000_instagram_data_deletion_requests.sql` — tabela que registra os
pedidos (código, resultado, contagens). Precisa ser aplicada **antes** de publicar
as funções, porque a função escreve nela.

> Lembrete de deploy deste projeto: migrations sobem pelo Lovable sync / SQL
> Editor. Nunca `supabase db push`.

---

## Pendências que não dependem do review

Continuam abertas depois da aprovação, para referência:

- Gatilhos de DM, resposta a story e menção — o webhook recebe DMs e cria a
  conversa, mas nenhuma regra dispara a partir disso; só comentário aciona.
- Integração do canal Instagram ao construtor de fluxos visual e à IA.
- Unificação de contato entre WhatsApp e Instagram.
- A ação "curtir comentário" segue marcada como beta na interface — confirmar se
  a API oficial suporta antes de anunciar como recurso.
