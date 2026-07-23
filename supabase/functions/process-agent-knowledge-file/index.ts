import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import mammoth from "npm:mammoth@1.8.0";
import { extractText, getDocumentProxy } from "npm:unpdf@1.6.2";
import * as XLSX from "npm:xlsx@0.18.5";
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  authenticateUser,
  createServiceClient,
  parseJsonBody,
  AuthError,
} from "../_shared/middleware.ts";
import { resolveOpenAIConfig } from "../_shared/aiStrategy.ts";

// Processa um arquivo da base de conhecimento (RAG): extrai texto, quebra em
// pedaços, gera embedding de cada um e guarda em agent_knowledge_chunks. Roda
// depois que o cliente já fez upload do arquivo pro bucket
// `agent-knowledge-files` e inseriu a linha em agent_knowledge_files (status
// 'processing') -- esta função só faz o processamento pesado.
//
// Extração por tipo: .docx via mammoth (mesmo padrão do
// process-document-template), .pdf via unpdf (leve, feito pra ambiente
// serverless/edge, sem dependência nativa de Node), .xlsx via SheetJS (cada
// aba vira CSV, uma linha de planilha vira uma linha de texto).

const OPENAI_EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1/embeddings";
const MAX_CHUNK_CHARS = 1800;
const OVERLAP_CHARS = 200;

function chunkText(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if (current && (current.length + para.length + 2) > MAX_CHUNK_CHARS) {
      chunks.push(current.trim());
      const tail = current.slice(-OVERLAP_CHARS);
      current = `${tail}\n\n${para}`;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Parágrafo sozinho maior que o limite (raro, ex.: tabela gigante numa
  // célula) -- quebra na força bruta em vez de gerar um chunk enorme demais.
  return chunks.flatMap((c) => {
    if (c.length <= MAX_CHUNK_CHARS * 1.5) return [c];
    const parts: string[] = [];
    for (let i = 0; i < c.length; i += MAX_CHUNK_CHARS) parts.push(c.slice(i, i + MAX_CHUNK_CHARS));
    return parts;
  });
}

async function extractTextFromFile(bytes: Uint8Array, fileName: string, mimeType: string | null): Promise<string> {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".docx") || mimeType?.includes("wordprocessingml")) {
    const result = await mammoth.extractRawText({ buffer: bytes });
    return result.value || "";
  }

  if (lowerName.endsWith(".pdf") || mimeType === "application/pdf") {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text || "";
  }

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls") || mimeType?.includes("spreadsheetml")) {
    const workbook = XLSX.read(bytes, { type: "array" });
    const parts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) parts.push(`# Planilha: ${sheetName}\n${csv.trim()}`);
    }
    return parts.join("\n\n");
  }

  if (lowerName.endsWith(".txt") || mimeType?.startsWith("text/")) {
    return new TextDecoder().decode(bytes);
  }

  throw new Error(`Tipo de arquivo não suportado: ${fileName}. Use PDF, DOCX, Excel (.xlsx) ou .txt.`);
}

async function embedChunks(chunks: string[], apiKey: string, model: string): Promise<number[][]> {
  const res = await fetch(OPENAI_EMBEDDINGS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: chunks }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro ao gerar embeddings: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return (data.data as any[]).sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const service = createServiceClient();
  let fileId: string | undefined;

  try {
    const body = await parseJsonBody<{ fileId?: string }>(req);
    fileId = body.fileId;
    const auth = await authenticateUser(req);
    if (!fileId) return errorResponse("fileId é obrigatório", 400);

    // Leitura via `rls` -- só processa um arquivo que o usuário já pode ver
    // (RLS de agent_knowledge_files já restringe pela organização).
    const { data: file, error: fileError } = await auth.supabase
      .from("agent_knowledge_files")
      .select("id, agent_id, organization_id, file_name, storage_path, mime_type")
      .eq("id", fileId)
      .maybeSingle();
    if (fileError || !file) return errorResponse("Arquivo não encontrado ou sem permissão", 404);

    const { data: fileBlob, error: downloadError } = await service.storage
      .from("agent-knowledge-files")
      .download(file.storage_path);
    if (downloadError || !fileBlob) {
      await service.from("agent_knowledge_files").update({ status: "error", error_message: "Não foi possível baixar o arquivo" }).eq("id", fileId);
      return errorResponse("Não foi possível baixar o arquivo", 500);
    }
    const bytes = new Uint8Array(await fileBlob.arrayBuffer());

    let extracted: string;
    try {
      extracted = await extractTextFromFile(bytes, file.file_name, file.mime_type);
    } catch (extractError: any) {
      await service.from("agent_knowledge_files").update({ status: "error", error_message: extractError?.message || "Erro ao ler o arquivo" }).eq("id", fileId);
      return errorResponse(extractError?.message || "Erro ao ler o arquivo", 400);
    }

    if (!extracted.trim()) {
      await service.from("agent_knowledge_files").update({ status: "error", error_message: "Não foi encontrado texto neste arquivo" }).eq("id", fileId);
      return errorResponse("Não foi encontrado texto neste arquivo", 400);
    }

    const chunks = chunkText(extracted);
    const aiConfig = await resolveOpenAIConfig(service, file.organization_id, "knowledge_base_embedding");
    if (!aiConfig) {
      await service.from("agent_knowledge_files").update({ status: "error", error_message: "IA não configurada para esta organização" }).eq("id", fileId);
      return errorResponse("IA não configurada para esta organização", 400);
    }

    // Lote único -- a API de embeddings da OpenAI aceita até 2048 entradas por
    // chamada, bem acima do que um documento comum gera de pedaços.
    const embeddings = await embedChunks(chunks, aiConfig.apiKey, aiConfig.model);

    const rows = chunks.map((content, i) => ({
      file_id: fileId,
      agent_id: file.agent_id,
      organization_id: file.organization_id,
      content,
      embedding: embeddings[i],
    }));
    const { error: insertError } = await service.from("agent_knowledge_chunks").insert(rows);
    if (insertError) {
      await service.from("agent_knowledge_files").update({ status: "error", error_message: insertError.message }).eq("id", fileId);
      return errorResponse(`Erro ao salvar pedaços: ${insertError.message}`, 500);
    }

    await service.from("agent_knowledge_files").update({ status: "ready", error_message: null }).eq("id", fileId);

    return jsonResponse({ success: true, chunksCreated: rows.length });
  } catch (error: any) {
    if (fileId) {
      await service.from("agent_knowledge_files").update({ status: "error", error_message: error?.message || "Erro interno" }).eq("id", fileId);
    }
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    console.error("process-agent-knowledge-file error:", error);
    return errorResponse(error?.message || "Erro interno", 500);
  }
});
