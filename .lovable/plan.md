

# Página de Certificação ZapSign-style + Verificação de Autenticidade

Implementação do padrão de certificação visual da ZapSign para documentos assinados internamente, com rodapé de hash em cada página, página final de evidências e portal público de verificação.

## O que será entregue

### 1. Rodapé de certificação em cada página do PDF assinado
Toda página do documento original receberá um rodapé fino (cinza, 8pt) com:
```
Documento assinado eletronicamente por [NOME DO SIGNATÁRIO]
Hash: [12 primeiros caracteres do SHA-256] | Página X de Y | Verifique em wizzybr.com/verificar/[CÓDIGO]
```

### 2. Página final "Página de Assinaturas" (padrão ZapSign)
Após a última página do documento original, será anexada **uma nova página** contendo:

```text
┌────────────────────────────────────────────────────────────┐
│ [LOGO WIZZY]                          PÁGINA DE ASSINATURAS │
│                                                              │
│ Documento: NOME_DO_DOCUMENTO.pdf                            │
│ Hash do documento original (SHA-256):                       │
│ a3f5b8c9d2e1...                                             │
│                                                              │
│ ─────────────────────────────────────────                   │
│ DADOS DO DOCUMENTO                                          │
│ • ID: <uuid>                                                │
│ • Data de criação: 23/04/2026 14:32:15                      │
│ • Número de páginas: 3                                      │
│ • Tamanho: 142 KB                                           │
│                                                              │
│ ─────────────────────────────────────────                   │
│ SIGNATÁRIO                                                  │
│                                                              │
│ NOME COMPLETO          [imagem assinatura]   [selfie]       │
│ CPF: 000.000.000-00                                         │
│ E-mail: x@y.com                                             │
│ Telefone: +55...                                            │
│                                                              │
│ Autenticado em: 23/04/2026 14:35:22 (UTC-3)                 │
│ Método: OTP via E-mail + Selfie + Assinatura manuscrita     │
│ IP: 200.150.x.x                                             │
│ Dispositivo: Chrome 120 / Windows 11 / Desktop              │
│ Geolocalização: -23.55, -46.63 (se autorizada)              │
│                                                              │
│ ─────────────────────────────────────────                   │
│ VALIDAÇÃO JURÍDICA                                          │
│ Este documento foi assinado eletronicamente conforme        │
│ MP 2.200-2/2001 (art. 10, §2º) e Lei 14.063/2020.           │
│                                                              │
│ [QR CODE]    Para verificar a autenticidade, acesse:        │
│              wizzybr.com/verificar/ABC123XYZ                │
│              ou escaneie o QR Code ao lado.                 │
└────────────────────────────────────────────────────────────┘
```

### 3. Comportamento para Packs (vários documentos)
Cada documento gerado por um pack receberá **individualmente** seu próprio rodapé + página de assinaturas + código de verificação único. O download na lista mostra cada arquivo separadamente (já é assim hoje, só ganha a certificação).

Botão extra **"Baixar todos (ZIP)"** no agrupamento por `submission_group` para facilitar o download em lote — cada PDF dentro do ZIP já é independente e auto-verificável.

### 4. Portal público de verificação `/verificar/:codigo`
Página pública (sem login) com:
- Campo de busca para colar o código curto OU o hash SHA-256 completo
- Resultado: dados do documento, signatário, data, IP, hash, link para baixar comprovante e o PDF assinado
- Layout limpo inspirado em zapsign.com.br/validacao-documento
- Selo "Documento autêntico" em verde / "Não encontrado" em vermelho

### 5. Comprovante de autenticidade aprimorado
O `signature-receipt` migra de HTML para **PDF real** (pdf-lib), seguindo o mesmo layout da página de assinaturas, mas como arquivo independente baixável.

### 6. Reserva para futura camada ICP-Brasil (A1 da Wizzy)
Estrutura preparada para, no futuro, anexar segunda camada de certificação ICP-Brasil. Será adicionado:
- Campo `metadata.icp_signature` em `signature_evidence` (JSONB, nullable)
- Espaço reservado na página de assinaturas para o selo "Assinado digitalmente com Certificado ICP-Brasil A1 — Wizzy LTDA"
- O fluxo de aplicação real do A1 (assinatura PAdES) será implementação separada quando o certificado for emitido

## Estrutura técnica

### Banco de dados
Adicionar à `signature_evidence`:
- `verification_code` (text, unique, indexed) — código curto de 10 caracteres alfanuméricos para URL pública
- `geolocation` (jsonb, nullable) — `{lat, lng, accuracy}`
- `original_pdf_url` (text) — backup do PDF antes do carimbo (preservar versão sem rodapé)

### Edge functions
- **`signature-complete`** (modificar): após a assinatura, chamar nova função `signature-stamp-pdf` que carrega o PDF original via pdf-lib, adiciona rodapé em todas as páginas + página de evidências, e salva como `signed_pdf_url`. Gera `verification_code` aleatório.
- **`signature-stamp-pdf`** (nova): isolar a lógica de pdf-lib (rodapé + página final + QR code via `qrcode` ESM).
- **`signature-receipt`** (reescrever): migrar de HTML para PDF via pdf-lib, layout idêntico à página de assinaturas mas standalone.
- **`signature-verify-public`** (nova, `verify_jwt = false`): recebe código ou hash e retorna dados públicos de verificação (sem expor IP completo, apenas mascarado).

### Frontend
- **`PublicVerificationPage.tsx`** (nova): rota `/verificar/:codigo`, registrada em `App.tsx`
- **`PublicSignaturePage.tsx`** (modificar): pedir geolocalização opcional antes da assinatura
- **`SignaturesList.tsx`** (modificar): botão "Verificar autenticidade" que abre `/verificar/:codigo` em nova aba; mostrar código de verificação ao lado do registro
- **`GeneratedDocumentsList.tsx`** (modificar): no agrupamento por `submission_group`, adicionar botão "Baixar todos (ZIP)" usando `jszip`

### Rodapé técnico — formato
PDF gerado via pdf-lib, fonte Helvetica 8pt cinza (#6b6b6b), linha horizontal de 0.5pt acima, posicionado a 1cm da borda inferior. Texto em uma linha só, com `…` se exceder largura útil.

## Domínio do QR Code
Conforme regra do projeto, força `wizzybr.com/verificar/:codigo` mesmo em ambientes de preview (usa `lib/publicOrigin.ts` que já existe).

## O que NÃO entra agora
- **Aplicação real do certificado A1 ICP-Brasil**: depende de emissão do certificado pela Wizzy. Estrutura ficará pronta para receber, mas sem implementar assinatura PAdES nesta etapa.
- **Carimbo de tempo TSA RFC 3161 externo**: timestamp do servidor é suficiente para nível "Avançada".
- **Integração com ZapSign**: a referência é apenas visual/funcional; toda a infra é interna.

## Resultado
Cada documento assinado terá visual e robustez probatória equivalente ao padrão ZapSign:
- Rodapé identificador em todas as páginas
- Página de evidências completa anexada
- Verificação pública por terceiros (juiz, advogado, contraparte)
- Em packs, cada arquivo é auto-suficiente e baixável individualmente
- Pronto para receber camada ICP-Brasil A1 no futuro

