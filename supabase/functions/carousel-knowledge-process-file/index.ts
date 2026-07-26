// =====================================================================
// carousel-knowledge-process-file — extrai o texto de um arquivo (PDF/
// DOCX/Excel/txt) já enviado pro bucket carousel-knowledge-files, e salva
// em carousel_model_knowledge.content. Mesmo padrão de extração do
// process-agent-knowledge-file, sem embeddings/chunking: o conteúdo é
// concatenado direto no prompt de Tendências (ver resolveKnowledgeContext),
// não precisa de busca vetorial pro tamanho típico de um item de projeto.
// Roda depois que o cliente já fez upload do arquivo e inseriu a linha em
// carousel_model_knowledge (status 'processing').
// =====================================================================
import mammoth from "npm:mammoth@1.8.0";
import { extractText, getDocumentProxy } from "npm:unpdf@1.6.2";
import * as XLSX from "npm:xlsx@0.18.5";
import { authenticateUser, createServiceClient, errorResponse, handleCors, jsonResponse } from "../_shared/middleware.ts";

const KNOWLEDGE_BUCKET = "carousel-knowledge-files";
// Teto de segurança — mesmo raciocínio do MAX_CONTENT_CHARS de sourceExtract.ts.
const MAX_CONTENT_CHARS = 100000;

interface Body {
  itemId: string;
}

async function extractTextFromFile(bytes: Uint8Array, fileName: string): Promise<string> {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer: bytes });
    return result.value || "";
  }

  if (lowerName.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text || "";
  }

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const workbook = XLSX.read(bytes, { type: "array" });
    const parts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) parts.push(`# Planilha: ${sheetName}\n${csv.trim()}`);
    }
    return parts.join("\n\n");
  }

  if (lowerName.endsWith(".txt")) {
    return new TextDecoder().decode(bytes);
  }

  throw new Error(`Tipo de arquivo não suportado: ${fileName}. Use PDF, DOCX, Excel (.xlsx) ou .txt.`);
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const service = createServiceClient();
  let itemId: string | undefined;

  try {
    const { supabase } = await authenticateUser(req);
    const body = (await req.json()) as Body;
    itemId = body.itemId;
    if (!itemId) return errorResponse("itemId é obrigatório", 400);

    // RLS garante que o item pertence à organização do usuário.
    const { data: item, error: itemError } = await supabase
      .from("carousel_model_knowledge")
      .select("id, title, storage_path")
      .eq("id", itemId)
      .maybeSingle();
    if (itemError || !item || !item.storage_path) {
      return errorResponse("Item não encontrado ou sem permissão", 404);
    }

    const { data: fileBlob, error: downloadError } = await service.storage
      .from(KNOWLEDGE_BUCKET)
      .download(item.storage_path);
    if (downloadError || !fileBlob) {
      await service
        .from("carousel_model_knowledge")
        .update({ status: "error", error_message: "Não foi possível baixar o arquivo" })
        .eq("id", itemId);
      return errorResponse("Não foi possível baixar o arquivo", 500);
    }
    const bytes = new Uint8Array(await fileBlob.arrayBuffer());

    let extracted: string;
    try {
      extracted = await extractTextFromFile(bytes, item.title);
    } catch (extractError) {
      const message = (extractError as Error)?.message || "Erro ao ler o arquivo";
      await service.from("carousel_model_knowledge").update({ status: "error", error_message: message }).eq("id", itemId);
      return errorResponse(message, 400);
    }

    if (!extracted.trim()) {
      await service
        .from("carousel_model_knowledge")
        .update({ status: "error", error_message: "Não foi encontrado texto neste arquivo" })
        .eq("id", itemId);
      return errorResponse("Não foi encontrado texto neste arquivo", 400);
    }

    const { data: updated, error: updateError } = await service
      .from("carousel_model_knowledge")
      .update({ status: "ready", content: extracted.slice(0, MAX_CONTENT_CHARS), error_message: null })
      .eq("id", itemId)
      .select()
      .single();
    if (updateError) throw updateError;

    return jsonResponse(updated);
  } catch (err) {
    if (itemId) {
      await service
        .from("carousel_model_knowledge")
        .update({ status: "error", error_message: (err as Error)?.message || "Erro interno" })
        .eq("id", itemId);
    }
    const status = (err as { status?: number })?.status ?? 500;
    return errorResponse((err as Error).message ?? "Erro", status);
  }
});
