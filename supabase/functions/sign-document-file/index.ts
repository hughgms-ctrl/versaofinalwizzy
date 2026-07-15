import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  authenticateUser,
  createServiceClient,
  parseJsonBody,
  AuthError,
} from "../_shared/middleware.ts";
import { signContactFileUrl } from "../_shared/storageDownload.ts";

// Assina, sob demanda e por org, os PDFs de documentos guardados no bucket
// contact-files (que está sendo privatizado — plano-seguranca-storage-buckets,
// BUCKET 4, Fase A.4). As telas AUTENTICADAS de gestão de documentos
// (GeneratedDocumentsList, SignaturesList, ContactContractsSection, SignaturePage)
// leem generated_documents.pdf_url / signed_pdf_url e document_signatures.*.
// Esses paths (generated/..., signatures/...) não têm org na pasta, então o cliente
// não consegue createSignedUrl direto depois do flip. Aqui a AUTORIZAÇÃO é feita pela
// RLS na LINHA do banco (generated_documents/document_signatures já são org-scoped):
// se o client autenticado consegue LER a linha, a org dele é dona; então assinamos a
// URL via service_role. Campos permitidos são allowlisted (nunca assina URL arbitrária).

const ALLOWED_FIELDS: Record<string, Set<string>> = {
  generated_documents: new Set(["pdf_url", "signed_pdf_url"]),
  document_signatures: new Set(["signed_pdf_url", "signature_url"]),
};

interface SignItem {
  key: string;
  table: keyof typeof ALLOWED_FIELDS | string;
  id: string;
  field: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { items } = await parseJsonBody<{ items: SignItem[] }>(req);
    if (!Array.isArray(items) || items.length === 0) {
      return errorResponse("items é obrigatório", 400);
    }
    if (items.length > 300) {
      return errorResponse("Muitos itens (máx. 300)", 400);
    }

    // Valida table/field e agrupa ids por tabela.
    const idsByTable: Record<string, Set<string>> = {};
    const fieldsByTable: Record<string, Set<string>> = {};
    for (const it of items) {
      const allowed = ALLOWED_FIELDS[it.table as string];
      if (!allowed) return errorResponse(`table inválida: ${it.table}`, 400);
      if (!allowed.has(it.field)) return errorResponse(`field inválido: ${it.field}`, 400);
      if (!it.id || !it.key) return errorResponse("id e key são obrigatórios em cada item", 400);
      (idsByTable[it.table as string] ??= new Set()).add(it.id);
      (fieldsByTable[it.table as string] ??= new Set()).add(it.field);
    }

    // Client RLS (org-scoped) para autorização; service_role só para assinar.
    const auth = await authenticateUser(req);
    const rls = auth.supabase;
    const service = createServiceClient();

    // Carrega as linhas visíveis à org do usuário (RLS filtra). Linhas de outra org
    // simplesmente não voltam -> a URL correspondente fica null.
    const rowsByTable: Record<string, Map<string, Record<string, any>>> = {};
    for (const table of Object.keys(idsByTable)) {
      const ids = Array.from(idsByTable[table]);
      const fields = Array.from(fieldsByTable[table]);
      const cols = ["id", ...fields].join(", ");
      const { data, error } = await rls.from(table).select(cols).in("id", ids);
      const map = new Map<string, Record<string, any>>();
      if (error) {
        console.error(`sign-document-file: erro lendo ${table}:`, error.message);
      } else {
        for (const row of (data as any[]) || []) map.set(row.id, row);
      }
      rowsByTable[table] = map;
    }

    const urls: Record<string, string | null> = {};
    for (const it of items) {
      const row = rowsByTable[it.table as string]?.get(it.id);
      const raw = row ? (row as any)[it.field] : null;
      urls[it.key] = raw ? await signContactFileUrl(raw, service) : null;
    }

    return jsonResponse({ urls });
  } catch (error: any) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    console.error("sign-document-file error:", error);
    return errorResponse(error?.message || "Erro interno", 500);
  }
});
