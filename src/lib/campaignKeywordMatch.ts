/**
 * Espelho, no front, do casamento de palavra-chave que o zapi-webhook faz
 * (checkCampaignTriggers). Serve para avisar na tela quando o texto que a pessoa
 * acabou de escrever colide com uma campanha que já existe.
 *
 * Colisão nunca deu erro: o webhook simplesmente devolvia a primeira campanha
 * que casasse. Antes da coluna trigger_priority isso era sorteio; agora é
 * previsível, mas continua sendo uma escolha que a pessoa precisa VER para
 * poder fazer de propósito.
 *
 * As três funções abaixo repetem, de propósito, a normalização do backend. Se
 * mudar lá, mude aqui: um aviso que discorda do motor é pior que aviso nenhum.
 */

export function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function stripPunctuation(text: string): string {
    return text.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export interface KeywordMatcher {
    trigger_keyword: string;
    match_type: string;
}

/** Uma mensagem hipotética dispararia esta campanha? Mesma regra do webhook. */
export function messageMatchesCampaign(message: string, campaign: KeywordMatcher): boolean {
    if (!campaign.trigger_keyword) return false;

    const keywords = campaign.trigger_keyword
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
    if (!keywords.length) return false;

    const msgNormalized = normalizeText(message.toLowerCase().trim());

    if (campaign.match_type === 'all_words') {
        const msgWords = stripPunctuation(msgNormalized);
        const terms = keywords.map((k) => stripPunctuation(normalizeText(k))).filter(Boolean);
        return terms.length > 0 && terms.every((t) => msgWords.includes(t));
    }

    return keywords.some((kw) => {
        const kwNormalized = normalizeText(kw);
        switch (campaign.match_type) {
            case 'contains':
                return msgNormalized.includes(kwNormalized);
            case 'starts_with':
                return msgNormalized.startsWith(kwNormalized);
            case 'exact':
            default:
                return msgNormalized === kwNormalized;
        }
    });
}

export interface CampaignCollision {
    id: string;
    name: string;
    /** O texto desta campanha que também cairia na outra. */
    keyword: string;
    /** Quem o webhook escolheria hoje entre as duas. */
    winner: 'esta' | 'outra';
}

/**
 * Quais campanhas ativas também seriam disparadas pelos textos escritos aqui.
 *
 * O teste é direto e sem adivinhação: pega cada palavra-chave desta campanha,
 * trata como se fosse uma mensagem do cliente, e pergunta se ela casaria na
 * outra campanha. Se casar, uma mensagem real cai nas duas.
 *
 * `winner` usa o mesmo desempate do webhook: trigger_priority DESC, e no empate
 * created_at ASC (a mais antiga ganha).
 */
export function findKeywordCollisions(
    draft: {
        id?: string;
        trigger_keyword: string;
        match_type: string;
        trigger_priority: number;
    },
    others: Array<{
        id: string;
        name: string;
        trigger_keyword: string;
        match_type: string;
        is_active: boolean;
        trigger_priority?: number | null;
        created_at?: string;
    }>,
): CampaignCollision[] {
    const KEYWORD_TYPES = ['exact', 'contains', 'starts_with', 'all_words'];
    if (!KEYWORD_TYPES.includes(draft.match_type)) return [];

    const myKeywords = draft.trigger_keyword
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
    if (!myKeywords.length) return [];

    const collisions: CampaignCollision[] = [];

    for (const other of others) {
        if (!other.is_active) continue;
        if (draft.id && other.id === draft.id) continue;
        if (!KEYWORD_TYPES.includes(other.match_type)) continue;

        const hit = myKeywords.find((kw) => messageMatchesCampaign(kw, other));
        if (!hit) continue;

        const otherPriority = other.trigger_priority ?? 0;
        // Campanha nova ainda não tem created_at: ela é a mais recente, então no
        // empate de prioridade quem ganha é a que já existe.
        const winner: 'esta' | 'outra' =
            draft.trigger_priority > otherPriority ? 'esta' : 'outra';

        collisions.push({ id: other.id, name: other.name, keyword: hit, winner });
    }

    return collisions;
}
