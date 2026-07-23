// Detecta áudio/vídeo PRÉ-GRAVADO embutido num fluxo de template (nós
// 'content-block'/'action-whatsapp-group', que guardam ContentItem[] em
// `data.items` -- ver src/types/flow.ts). Serve pra avisar quem vai aplicar
// o template que existe mídia genérica ali (voz/vídeo de outra pessoa) que
// talvez valha a pena regravar com a própria voz antes de usar de verdade
// (ver conversa com o usuário: "avaliar substituir, colocar sua voz").
export interface RecordedMediaSummary {
  audioCount: number;
  videoCount: number;
}

export function findRecordedMedia(nodes: any[] | undefined | null): RecordedMediaSummary {
  let audioCount = 0;
  let videoCount = 0;
  for (const node of nodes || []) {
    const items = node?.data?.items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item?.type === 'audio') audioCount++;
      else if (item?.type === 'video') videoCount++;
    }
  }
  return { audioCount, videoCount };
}

export function recordedMediaMessage(summary: RecordedMediaSummary): string | null {
  const { audioCount, videoCount } = summary;
  if (!audioCount && !videoCount) return null;
  const parts: string[] = [];
  if (audioCount) parts.push(`${audioCount} áudio${audioCount > 1 ? 's' : ''}`);
  if (videoCount) parts.push(`${videoCount} vídeo${videoCount > 1 ? 's' : ''}`);
  return `Este template tem ${parts.join(' e ')} pré-gravado${audioCount + videoCount > 1 ? 's' : ''} -- avalie se vale regravar com a própria voz/imagem antes de usar com clientes de verdade.`;
}
