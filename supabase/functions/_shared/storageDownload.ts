// Leitura de objetos do bucket `contact-files` a partir de edge functions (service_role).
//
// O bucket está sendo privatizado (plano-seguranca-storage-buckets, BUCKET 4). As URLs
// persistidas no banco continuam no formato público (getPublicUrl), mas depois do flip
// (public=false) um `fetch(publicUrl)` deixa de resolver. Como as edge functions rodam
// com service_role (bypassa RLS), a leitura correta passa a ser baixar o objeto pelo
// path via storage.download.
//
// Este helper: se a URL aponta para o NOSSO bucket contact-files, extrai o path e baixa
// via service_role; caso contrário (logo externo, URL de terceiro), faz fetch normal.
// FASE A (backward-compatible): enquanto o bucket ainda é público, o download por path
// funciona igual; e se por acaso falhar, cai no fetch da própria URL. Só depois do flip
// o caminho de download passa a ser o único que resolve para contact-files.

const CONTACT_FILES_BUCKET = "contact-files";
const PUBLIC_MARKER = `/storage/v1/object/public/${CONTACT_FILES_BUCKET}/`;

// Extrai o path relativo dentro do bucket a partir de uma URL pública do contact-files.
// Retorna null se a URL não for do nosso bucket (ex.: logo em wizzybr.com).
export function contactFilesPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const idx = url.indexOf(PUBLIC_MARKER);
  if (idx < 0) return null;
  const raw = url.slice(idx + PUBLIC_MARKER.length).split("?")[0].split("#")[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// Converte uma URL pública do contact-files numa signed URL (via service_role), para
// devolver a fluxos PÚBLICOS sem login (páginas de assinatura/verificação) sem expor o
// bucket publicamente. URLs que NÃO são do nosso bucket (ex.: nulas) voltam como estão.
// Em falha de assinatura devolve a URL original (durante a Fase A o bucket ainda é
// público, então ela resolve; depois do flip, a validação garante que a assinatura
// funciona). TTL generoso por padrão: a sessão de assinatura pode demorar (OTP/selfie).
export async function signContactFileUrl(
  url: string | null | undefined,
  supabaseAdmin: any,
  ttlSeconds = 60 * 60 * 3,
): Promise<string | null> {
  if (!url) return url ?? null;
  const path = contactFilesPathFromUrl(url);
  if (!path || !supabaseAdmin) return url;
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(CONTACT_FILES_BUCKET)
      .createSignedUrl(path, ttlSeconds);
    if (!error && data?.signedUrl) return data.signedUrl;
    console.error("signContactFileUrl: createSignedUrl falhou:", error?.message || error);
  } catch (e) {
    console.error("signContactFileUrl: exceção:", e);
  }
  return url;
}

// Baixa os bytes de uma URL. Para URLs do contact-files, baixa via service_role pelo
// path (funciona com bucket privado). Para qualquer outra URL, faz fetch. Retorna null
// em falha (mantém o comportamento tolerante dos callers, que já tratavam null).
export async function fetchBytesOrDownload(
  url: string | null | undefined,
  supabaseAdmin: any,
): Promise<Uint8Array | null> {
  if (!url) return null;

  const path = contactFilesPathFromUrl(url);
  if (path && supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.storage.from(CONTACT_FILES_BUCKET).download(path);
      if (!error && data) {
        return new Uint8Array(await data.arrayBuffer());
      }
      console.error("storageDownload: download falhou, tentando fetch da URL:", error?.message || error);
    } catch (e) {
      console.error("storageDownload: exceção no download, tentando fetch da URL:", e);
    }
  }

  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch (e) {
    console.error("storageDownload: fetch falhou:", e);
    return null;
  }
}
