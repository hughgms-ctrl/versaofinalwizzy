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

/**
 * Gatilho "qualquer mensagem": campanha sem texto próprio, avaliada só depois de
 * todas as outras terem falhado. Mora no mesmo campo match_type, mas nunca é
 * comparada por texto -- nem no webhook, nem aqui.
 */
export const FALLBACK_MATCH_TYPE = 'fallback';

/** Os match_type que a tela mostra dentro do gatilho "Palavra-chave". */
export const KEYWORD_TRIGGER_MATCH_TYPES = [
    'exact',
    'contains',
    'all_words',
    'starts_with',
    FALLBACK_MATCH_TYPE,
];

/** Os que casam comparando texto -- 'fallback' de propósito fora da lista. */
const TEXT_MATCH_TYPES = ['exact', 'contains', 'starts_with', 'all_words'];

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
    // "Qualquer mensagem" casaria com tudo, e responder `true` aqui encheria o aviso
    // de colisão com uma linha que não é colisão: ela perde para toda campanha com
    // texto, por construção (dois passes no webhook), então nunca disputa nada.
    if (campaign.match_type === FALLBACK_MATCH_TYPE) return false;
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
    if (!TEXT_MATCH_TYPES.includes(draft.match_type)) return [];

    const myKeywords = draft.trigger_keyword
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
    if (!myKeywords.length) return [];

    const collisions: CampaignCollision[] = [];

    for (const other of others) {
        if (!other.is_active) continue;
        if (draft.id && other.id === draft.id) continue;
        if (!TEXT_MATCH_TYPES.includes(other.match_type)) continue;

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

export interface FallbackConflict {
    id: string;
    name: string;
    /** false = está em outro workspace, mas o webhook não filtra por workspace. */
    sameWorkspace: boolean;
}

/**
 * Outras campanhas "qualquer mensagem" ativas que disputariam a mesma mensagem.
 *
 * Duas delas ativas é sorteio: as duas casam com tudo, nenhuma tem texto para
 * desempatar, e o critério que sobra é created_at. Não é erro -- pode ser o passo
 * intermediário de quem está trocando uma campanha de boas-vindas por outra -- mas
 * precisa aparecer na tela.
 *
 * O webhook busca as campanhas por organização e NÃO filtra por workspace, então
 * uma campanha de outro workspace disputa igual. A lista que chega aqui vem do
 * useCampaigns, que já é escopado ao workspace selecionado (+ as sem workspace):
 * o que ele não carregou, este aviso não tem como ver.
 */
export function findFallbackConflicts(
    draft: { id?: string; match_type: string; workspace_id?: string | null },
    others: Array<{
        id: string;
        name: string;
        match_type: string;
        is_active: boolean;
        workspace_id?: string | null;
    }>,
): FallbackConflict[] {
    if (draft.match_type !== FALLBACK_MATCH_TYPE) return [];

    return others
        .filter((o) => o.is_active && o.match_type === FALLBACK_MATCH_TYPE && o.id !== draft.id)
        .map((o) => ({
            id: o.id,
            name: o.name,
            sameWorkspace: (o.workspace_id ?? null) === (draft.workspace_id ?? null),
        }));
}
