## Plano revisado: modelo primeiro, documento só depois do preenchimento

A regra central muda para: **antes do cliente preencher o link do modelo, não existe contrato/documento gerado e não existe link de assinatura**. O sistema só terá o template/modelo e o link público de preenchimento.

---

## 1. Link permanente do modelo

Cada modelo terá um link público fixo, reutilizável, como:

```text
/form?id=<template_id>
```

Esse link poderá ser enviado para quantas pessoas quiser. Cada pessoa que preencher cria uma execução independente.

Na lista de modelos, vamos deixar essa lógica mais clara no estilo Zapsign:
- Botão principal: **Enviar documento**
- Ao clicar, abre uma página/painel com o link do modelo para copiar
- Texto sem ambiguidade: **"Compartilhe este link para o cliente preencher e gerar o documento"**
- O botão **Gerenciar** continua levando para edição/configuração do modelo

---

## 2. Signatários fixos dentro do modelo

No editor do modelo haverá uma seção/aba **Signatários fixos**.

Ali será possível cadastrar pessoas que sempre assinam quando esse modelo for preenchido, por exemplo:
- Advogado
- Testemunha
- Sócio
- Responsável interno

Campos:
- Nome
- CPF
- E-mail
- Telefone/WhatsApp
- Papel no documento
- Método de autenticação
- Ordem

Importante: esses signatários ficam apenas como configuração do modelo. **Eles não aparecem na aba Assinaturas e não recebem link enquanto ninguém preencher o formulário.**

---

## 3. Fluxo correto após o cliente preencher

Quando o cliente abre o link do modelo e preenche o formulário:

1. O sistema cria um novo `generated_document` único.
2. Gera o PDF/contrato com os dados preenchidos.
3. Extrai os dados do próprio formulário para criar o signatário do cliente.
4. Clona os signatários fixos do modelo para esse novo documento.
5. Cria links de assinatura somente agora.
6. Redireciona o cliente para assinar o documento dele.
7. O documento passa a aparecer em **Assinaturas** e/ou **Documentos gerados**.

Resultado esperado:

```text
Modelo: Contrato BPC
  Link fixo: /form?id=abc

Cliente Maria preenche
  Documento gerado: Contrato BPC - Maria
  Signatários:
    1. Maria - pendente/assinado
    2. Advogado fixo - pendente
    3. Testemunha fixa - pendente

Cliente João preenche o mesmo link
  Documento gerado: Contrato BPC - João
  Signatários:
    1. João - pendente/assinado
    2. Advogado fixo - pendente
    3. Testemunha fixa - pendente
```

---

## 4. Remover a causa do erro atual

Não vamos mais trabalhar com o cenário problemático de "assinante fixo assinar antes do contrato existir".

Correção de arquitetura:
- Não criar `generated_documents` em rascunho só para liberar links.
- Não criar `document_signers` antes do preenchimento real.
- Não criar `document_signatures` antes do PDF existir.
- Não mostrar signatários fixos na lista de Assinaturas antes de existir documento.

Assim, não haverá mais conflito entre:
- Assinatura registrada antes do contrato
- PDF inexistente
- Link do cliente quebrado
- Assinatura vinculada a documento errado

---

## 5. Lista de Assinaturas

A aba **Assinaturas** passará a mostrar somente documentos realmente gerados após preenchimento.

Cada item mostrará:
- Nome do documento
- Data de criação/preenchimento
- Status geral
- Contador: `1/3 assinaturas`, `2/3 assinaturas`, etc.
- Quantas estão pendentes

Ao clicar no documento, abre uma página de detalhe, não toggle.

A página de detalhe mostrará:
- Documento gerado
- Todos os signatários daquele documento
- Link copiável de cada signatário
- Status individual
- Ações de envio por e-mail/WhatsApp
- Botão para regerar PDF consolidado quando necessário

---

## 6. Documentos gerados

A aba **Gerados** também só exibirá documentos que foram efetivamente criados após preenchimento manual ou público.

Para documentos vindos de link de modelo, mostrar origem:
- Nome do modelo usado
- Quem preencheu, quando houver dados extraídos
- Status de assinatura

---

## 7. Banco de dados

Adicionar tabela para signatários fixos do modelo:

```sql
public.template_fixed_signers
```

Campos principais:
- `id`
- `organization_id`
- `template_id`
- `signer_name`
- `signer_email`
- `signer_phone`
- `signer_cpf`
- `signer_role`
- `auth_methods`
- `order`
- `created_at`
- `updated_at`

Com RLS por organização.

Adicionar metadados em `generated_documents`:
- `source_template_id`
- `form_filled_at`
- `submission_group`
- `source_kind = 'template_public_link' | 'manual' | 'pack'`

Isso permite saber que aquele documento nasceu de um preenchimento público e agrupar corretamente.

---

## 8. Edge functions

### `public-document-fill`

Será a função principal do novo fluxo.

Ela deverá:
- Receber `template_id` ou token público do modelo
- Validar se o modelo existe e está ativo
- Criar o documento somente no submit
- Gerar PDF
- Criar signatário do cliente a partir dos dados preenchidos
- Clonar signatários fixos do modelo
- Criar tokens de assinatura para todos
- Retornar `signature_url` do cliente

### `signature-init` / `signature-complete`

Continuam validando assinatura, mas a regra principal passa a ser:
- Só devem receber tokens que já pertencem a um documento real
- Se por algum dado antigo existir token sem PDF, mostrar mensagem amigável e não deixar assinar

Mensagem:

```text
Este link ainda não está disponível para assinatura. O documento precisa ser gerado primeiro.
```

Mas no fluxo novo isso não deve acontecer, porque os links só nascem depois do documento.

### `send-signer-link`

Só envia links de signatários já vinculados a `generated_documents` com PDF existente.

---

## 9. UI inspirada no Zapsign

### Modelos

Layout parecido com a referência enviada:
- Menu/lista de modelos
- Seção **Pastas**
- Seção **Modelos**
- Linha com nome do modelo, status e ações
- Ações principais:
  - **Gerenciar**
  - **Enviar documento**

### Enviar documento

Ao clicar, abrir uma tela/página do modelo com:
- Nome do modelo
- Link público copiável
- Opção de preencher internamente antes de enviar
- Opção de cliente preencher pelo link
- Lista de signatários fixos configurados

### Assinaturas

Layout parecido com a página de detalhe do Zapsign:
- Voltar para documentos/assinaturas
- Status geral
- Card do documento
- Contador de assinaturas
- Lista numerada de signatários
- Link copiável por signatário

---

## Entrega técnica

1. Criar migration para `template_fixed_signers` e metadados em `generated_documents`.
2. Criar hook `useTemplateFixedSigners`.
3. Adicionar UI de signatários fixos no editor do modelo.
4. Ajustar `TemplatesList` para fluxo Zapsign: Gerenciar + Enviar documento.
5. Refatorar `public-document-fill` para só criar documento/signatários no submit.
6. Garantir que links de assinatura só são criados após o PDF existir.
7. Ajustar `SignaturesList` para mostrar apenas documentos realmente gerados e contador de pendências.
8. Ajustar página de detalhe de assinatura para exibir todos os links do documento.
9. Manter fallback amigável para links antigos quebrados, sem erro técnico para o cliente.