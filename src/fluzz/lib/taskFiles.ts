import { supabase } from "@/fluzz/integrations/supabase/client";

// Bucket `task-files` é privado (ver migration 20260710120000). A leitura não pode
// mais usar getPublicUrl — geramos signed URL sob demanda. Estes helpers lidam com
// os dois formatos que existem em task_attachments.file_url:
//   - path puro ("<taskId>/<arquivo>")  -> uploads novos
//   - URL pública legada (".../object/public/task-files/<path>") -> uploads antigos
// e deixam anexos do tipo "link" (URL externa arbitrária) passarem intactos.

const BUCKET = "task-files";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h — suficiente pra uma sessão de visualização

type AttachmentLike = {
  file_type: string | null;
  file_url: string;
};

// Extrai o path de storage de um valor que pode ser path puro ou URL pública legada.
// Retorna null quando o valor é uma URL externa que não é do nosso bucket.
export function toTaskFileStoragePath(value: string | null | undefined): string | null {
  if (!value) return null;
  const marker = `/${BUCKET}/`;
  const idx = value.indexOf(marker);
  if (idx >= 0) return value.slice(idx + marker.length);
  if (value.includes("://")) return null; // URL externa que não é nossa
  return value; // já é um path
}

// Resolve UMA linha de anexo para uma URL utilizável em <img>/<a>. Links passam direto.
export async function resolveAttachmentUrl(att: AttachmentLike): Promise<string> {
  if (att.file_type === "link") return att.file_url;
  const path = toTaskFileStoragePath(att.file_url);
  if (!path) return att.file_url;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? att.file_url;
}

// Enriquerce uma lista de anexos com `displayUrl`, assinando os arquivos de storage
// num único batch. Links recebem displayUrl = file_url.
export async function resolveAttachmentUrls<T extends AttachmentLike>(
  attachments: T[]
): Promise<(T & { displayUrl: string })[]> {
  const paths = attachments.map((a) =>
    a.file_type === "link" ? null : toTaskFileStoragePath(a.file_url)
  );

  const toSign = Array.from(new Set(paths.filter((p): p is string => !!p)));
  const signed = new Map<string, string>();
  if (toSign.length > 0) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(toSign, SIGNED_URL_TTL_SECONDS);
    data?.forEach((d) => {
      if (d.signedUrl && d.path) signed.set(d.path, d.signedUrl);
    });
  }

  return attachments.map((a, i) => {
    const path = paths[i];
    const displayUrl = path ? signed.get(path) ?? a.file_url : a.file_url;
    return { ...a, displayUrl };
  });
}
