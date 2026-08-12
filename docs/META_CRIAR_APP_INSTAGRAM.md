# Criar o app do Instagram na Meta — do zero

> Escrito em 2026-08-11, para quem nunca criou o app. Quando terminar este
> documento, o Wizzy Engage estará testável ponta a ponta com as suas próprias
> contas. O App Review (para atender cliente real) vem depois, em
> `META_APP_REVIEW_INSTAGRAM.md`.

> ⚠️ **Correção de 2026-08-12.** A primeira versão deste guia dizia que dava
> para testar em modo Development. **Não dá.** A documentação da Meta é
> explícita: *"Apps must be set to Live in the App Dashboard to receive webhook
> notifications."* Sem Live Mode nenhum webhook chega — nem para conta testadora
> — e como todo o Engage é disparado por webhook de comentário, nada acontece.
>
> Isso **não** significa esperar o App Review. Live Mode e Advanced Access são
> coisas separadas: Live Mode é um botão que você liga assim que os campos
> básicos estiverem preenchidos (Passo 7.5 abaixo). Com o app em Live e sem
> Advanced Access, você recebe webhooks das contas que têm papel de testador —
> suficiente para validar o produto inteiro.

## Antes de começar: o que você está criando

**Um app, uma vez, para o SaaS inteiro.** Não é um app por cliente. Todos os
clientes do Wizzy vão autorizar esse mesmo app através do OAuth, cada um
conectando a própria conta do Instagram. Você é o dono do app; eles são apenas
usuários que autorizam.

Isso tem uma consequência que vale entender agora: o App Review é seu, não deles.
Enquanto ele não sair, **nenhum cliente consegue usar o módulo** — mesmo que
cada um tenha conta profissional e tudo mais. Não há como um cliente "fazer o
próprio review".

O que você precisa em mãos:

- Uma conta pessoal no Facebook (é ela que vira conta de desenvolvedor).
- Uma conta do Instagram **profissional** (Business ou Creator) para testar. Se a
  sua for pessoal, converta em Configurações → Tipo de conta.
- O CNPJ, para a etapa de verificação (só é exigido no App Review, não agora).

> Não é preciso ter Página do Facebook. Este app usa *Instagram API with
> Instagram Login*, que dispensa a Página — diferente da documentação antiga da
> Meta, que ainda aparece em muitos tutoriais.

---

## Passo 1 — Virar desenvolvedor Meta

1. Acesse [developers.facebook.com](https://developers.facebook.com).
2. Canto superior direito → **Entrar** com sua conta do Facebook.
3. Se for a primeira vez, ele pede para registrar como desenvolvedor: aceite os
   termos e confirme o e-mail/telefone.

É gratuito e leva dois minutos.

### Se aparecer "Não é possível acessar este serviço"

Tela branca com esse texto e a URL terminando em `/account_status/error/`:
a plataforma de desenvolvedor está **bloqueada para a sua conta pessoal do
Facebook**. Não é erro do app nem do guia — é anterior a tudo, e nenhuma
configuração contorna.

Causas, da mais comum para a menos:

| Causa | Como confirmar |
|---|---|
| Registro de desenvolvedor nunca concluído | Volte pela home do developers.facebook.com e clique em *Começar*, em vez de ir direto para `/apps` |
| Conta pessoal nova, sem telefone confirmado ou 2FA | Configurações da conta → Segurança |
| Restrição ativa herdada da conta do Facebook | [facebook.com/support](https://www.facebook.com/support) → Central de Contas |
| Falso positivo do antifraude | Só o suporte resolve |

O que fazer, nesta ordem:

1. Verificar restrições em [facebook.com/support](https://www.facebook.com/support).
   Se houver alguma ativa, resolva primeiro — o resto é consequência dela.
2. Confirmar telefone e e-mail, e ativar 2FA na conta pessoal.
3. Usar o link **"envie uma solicitação de suporte"** da própria tela de erro,
   explicando que quer registrar como desenvolvedor para integrar a API do
   Instagram ao seu produto. Resposta em alguns dias.

**Alternativa se não destravar:** criar o app por **outra conta pessoal do
Facebook** que seja estabelecida e de uso real — sua, de sócio, de alguém da
equipe. O app não fica preso a essa pessoa: depois de criado, vincula-se ao
Business Manager da empresa e outros administradores são adicionados.

> Não crie uma conta do Facebook nova só para isso. Conta recém-criada é
> justamente o perfil que mais cai nesse bloqueio, então o problema se repete.

---

## Passo 2 — Criar o app

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Criar app**.
2. **Caso de uso:** escolha **Outro** → **Avançar**.
3. **Tipo:** escolha **Empresa** (*Business*) → **Avançar**.

   > Esse tipo é o que expõe o produto Instagram com Instagram Login. Escolher
   > "Consumidor" leva a um app sem as permissões que precisamos.

4. **Nome do app:** `Wizzy-IG` (ou o nome que preferir — ele aparece para o
   cliente na tela de autorização, então use algo que ele reconheça).
5. **E-mail de contato:** o seu.
6. **Portfólio de negócios:** se você já tem um Business Manager, selecione. Se
   não, deixe em branco por enquanto — dá para vincular depois, e será
   necessário para a verificação de CNPJ.
7. **Criar app** (ele pede sua senha do Facebook para confirmar).

---

## Passo 3 — Adicionar o produto Instagram

No painel do app recém-criado:

1. Menu lateral → **Adicionar produto** (ou o card *Instagram* na lista).
2. Encontre **Instagram** → **Configurar**.
3. Dentro dele, escolha **API setup with Instagram login**.

   > ⚠️ Há duas opções parecidas. A outra é *API setup with Facebook login*, que
   > exige Página do Facebook e usa endpoints diferentes — o código do Wizzy
   > **não** funciona com ela. Confira que escolheu a de *Instagram login*.

---

## Passo 4 — Copiar as credenciais

Ainda em **Instagram → API setup with Instagram login**, seção
*3. Set up Instagram business login* → **Business login settings**.

Você precisa de três valores:

| Valor | Onde encontrar |
|---|---|
| **Instagram App ID** | Na própria seção *API setup with Instagram login* |
| **Instagram App Secret** | Mesma seção → botão *Show* (pede a senha do Facebook) |
| **Verify token** | **Você inventa.** É uma senha qualquer que você escolhe agora e vai repetir no Passo 6. Use algo longo e aleatório. |

> **Não confunda com o botão "Gerar token"** da seção *1. Gere tokens de acesso*.
> Aquele é um token de acesso manual, para testar chamadas à API na mão — o
> Wizzy **não usa**, porque obtém o próprio token pelo OAuth quando o cliente
> clica em "Conectar". O painel chama as duas coisas de "token", mas só o
> *verify token* (que você inventa) entra na configuração do Wizzy.

> Atenção: use o **Instagram App ID**, não o "App ID" geral que aparece no topo
> do painel em Configurações → Básico. São números diferentes, e o errado faz o
> OAuth falhar com uma mensagem genérica.

Guarde os três num lugar seguro. O secret não é mostrado de novo sem
reautenticar.

---

## Passo 5 — Cadastrar as credenciais no Wizzy

**Não existe tela para isso no Wizzy.** As chaves são lidas de duas fontes, nesta
ordem de prioridade: uma linha em `platform_settings` no banco, ou secrets de
ambiente do Supabase.

Escolha **um** dos dois caminhos.

### Caminho A — Secrets do Supabase (recomendado)

Painel do Supabase → **Project Settings → Edge Functions → Secrets** →
*Add new secret*, três vezes:

| Nome | Valor |
|---|---|
| `IG_APP_ID` | o Instagram App ID do Passo 4 |
| `IG_APP_SECRET` | o Instagram App Secret do Passo 4 |
| `IG_WEBHOOK_VERIFY_TOKEN` | o verify token que você inventou |

O segredo fica fora do banco, que é o lugar certo para credencial.

### Caminho B — Linha em `platform_settings`

Se preferir tudo no banco (ou quiser trocar sem redeploy), rode no SQL Editor:

```sql
INSERT INTO public.platform_settings (key, value)
VALUES (
  'instagram_connection_settings',
  jsonb_build_object(
    'ig_app_id',              'COLE_O_APP_ID_AQUI',
    'ig_app_secret',          'COLE_O_APP_SECRET_AQUI',
    'ig_webhook_verify_token','COLE_O_VERIFY_TOKEN_AQUI'
  )
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

> Esta linha tem **precedência** sobre os secrets. Se você usar os dois caminhos
> com valores diferentes, o do banco vence — o que é uma fonte clássica de
> confusão ao trocar as chaves depois. Ver [[evolution-stale-instance-apikey]]
> para o mesmo padrão mordendo no canal do WhatsApp.

---

## Passo 6 — Configurar o webhook

Volte ao painel da Meta, **Instagram → API setup with Instagram login** → seção
*2. Configure webhooks*:

| Campo | Valor |
|---|---|
| **Callback URL** | `https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/instagram-webhook` |
| **Verify token** | exatamente o mesmo do Passo 4/5 |

Clique em **Verify and save**. A Meta chama a URL na hora; se o token bater, ela
salva. Se der erro:

- token diferente do que está no Wizzy (o erro mais comum);
- as edge functions ainda não foram deployadas — a URL precisa responder.

Depois de salvar, **assine os campos** (botão *Subscribe* ao lado de cada um):

- `comments` — o gatilho principal do produto
- `messages` — DMs recebidas, e o toque no quick reply
- `messaging_postbacks` — cliques em botões

> Sem assinar os campos, a Meta não envia nada mesmo com a URL verificada. Essa
> é uma pegadinha comum: o webhook fica "configurado" e silencioso.

---

## Passo 7 — Liberar as URLs de OAuth

Mesma seção, **Business login settings** → *Set up Instagram business login*:

| Campo | Valor |
|---|---|
| **OAuth redirect URI** | `https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/instagram-oauth-callback` |
| **Deauthorize callback URL** | `https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/instagram-deauthorize` |
| **Data deletion request URL** | `https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/instagram-data-deletion` |

O redirect URI precisa ser **idêntico** ao que o código envia, caractere por
caractere — a Meta compara como string exata. Ele é montado em
`instagram-oauth-start` como `${SUPABASE_URL}/functions/v1/instagram-oauth-callback`.

Os dois últimos são exigidos no App Review; preencher agora evita voltar depois.

---

## Passo 7.5 — Ligar o Live Mode

**Obrigatório para receber webhook**, inclusive em teste. O painel avisa isso na
seção de webhooks: *"Para receber webhooks, o modo do app precisa estar definido
como Publicado"*.

Antes de ligar, a Meta exige alguns campos em **Configurações do app → Básico**:

| Campo | Valor |
|---|---|
| Ícone do app | 1024×1024, sem transparência |
| Categoria | Business and Pages |
| URL da Política de Privacidade | `https://<seu-domínio>/privacidade` |
| URL dos Termos de Serviço | `https://<seu-domínio>/termos` |

> Use o domínio público do Wizzy (onde o cliente acessa), não a URL do Supabase.
> As três páginas já existem no app.

Depois: alternador no topo do painel → **Ao vivo** (*Live*).

Não confunda com App Review. Ligar o Live Mode **não** dá Advanced Access — ele
só faz a Meta passar a entregar webhooks, e apenas para contas com papel no app.
Para atender cliente real ainda é preciso o review.

Em modo Development, só contas **com papel no app** conseguem autorizar. Sem
isto, o OAuth falha mesmo com tudo configurado.

1. Painel do app → **Funções do app → Funções** (*App roles → Roles*).
2. **Adicionar pessoas** → escolha *Instagram Tester*.
3. Informe o **@ da sua conta profissional do Instagram** → enviar convite.
4. Aceite o convite: entre no Instagram → **Configurações → Apps e sites →
   Convites de testador** → *Aceitar*.

> O passo 4 é esquecido com frequência. O convite fica pendente e a conexão
> continua falhando sem explicar por quê.

---

## Passo 9 — Testar a conexão

No Wizzy: **Configurações → Integrações → Instagram → Conectar**.

O que deve acontecer: abre a tela da Meta, você autoriza, volta ao Wizzy e a
conta aparece com @ e foto.

Se algo falhar, o erro quase sempre é um destes:

| Sintoma | Causa provável |
|---|---|
| "Instagram ainda não está configurado neste ambiente" | Passo 5 não foi feito, ou o secret tem nome errado |
| Erro de `redirect_uri` na tela da Meta | Passo 7: a URI não bate exatamente |
| "Invalid platform app" | Você usou o App ID geral em vez do **Instagram** App ID (Passo 4) |
| Autoriza mas volta com erro | Conta não é testadora, ou o convite não foi aceito (Passo 8) |
| Conecta mas nenhuma automação dispara | Normal em Development para contas de terceiros — ver abaixo |

---

## O que funciona agora, e o que não

Com tudo acima feito — incluindo o **Live Mode** do Passo 7.5:

✅ Conectar sua conta e as contas de testadores que você adicionar
✅ Criar regras no Wizzy Engage
✅ Comentar num post seu e ver a automação rodar inteira — resposta pública, DM,
   quick reply, follow-up
✅ Ver a conversa chegar em Conversas → Instagram

❌ **Qualquer conta que não tenha papel no app.** Um cliente real conecta, a tela
   diz sucesso, e nada dispara — sem Advanced Access a Meta não entrega o webhook
   dele.

Ou seja: dá para validar o produto inteiro agora, com você mesmo. Para vender,
falta o App Review.

> Se o Live Mode ficar **desligado**, nem o seu próprio teste funciona: a
> conexão OAuth conclui normalmente, a conta aparece conectada, e nenhum
> comentário dispara nada. É o sintoma mais confuso do módulo, porque tudo
> parece certo.

---

## Próximo passo

Quando tiver testado e visto o fluxo funcionando ponta a ponta, siga para
`META_APP_REVIEW_INSTAGRAM.md`. Ele parte exatamente daqui: verificação de CNPJ,
Live Mode, screencasts e submissão.

Uma decisão já aplicada no código (2026-08-12): `instagram_business_content_publish`
foi removido de `REQUESTED_SCOPES` em `instagram-oauth-start` e do espelho em
`instagram-oauth-callback`. Nenhuma função publica conteúdo, e pedir permissão que
não dá para demonstrar no vídeo é motivo comum de rejeição. Não inclua essa
permissão na submissão.
