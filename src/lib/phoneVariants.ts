/**
 * Formas em que o MESMO telefone pode estar gravado em `contacts.phone`.
 *
 * Porte do que o zapi-webhook já faz (phoneVariants/withCountryCode). Ali é
 * usado para achar o contato certo quando chega mensagem; aqui é para achar o
 * contato certo quando alguém cola uma lista de telefones na tela. Mesma
 * pergunta, mesma resposta -- e por isso a mesma lógica.
 *
 * O que varia na prática, e por que casar por igualdade crua não funciona:
 *   - o número pode ter ou não o 55 na frente (o WhatsApp manda com; planilha
 *     de evento quase sempre vem sem);
 *   - celular brasileiro pode ter ou não o nono dígito (cadastro antigo, lista
 *     exportada de outro sistema).
 *
 * Se mudar a regra no webhook, mude aqui: uma tela que não acha o contato que o
 * webhook acha é pior que uma tela que não existe.
 */

const VALID_DDDS = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49,
    51, 53, 54, 55,
    61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79,
    81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * E.164 completo, country-aware. Número que já começa com 55 fica como está;
 * nacional brasileiro (DDD válido) ganha o 55; qualquer outro é tratado como
 * internacional que já traz o código do país (ex.: EUA +1) e é preservado --
 * forçar 55 em tudo corromperia número estrangeiro.
 */
export function withCountryCode(phone: string): string {
    const clean = phone.replace(/\D/g, '');
    if (!clean) return '';
    if (clean.startsWith('55')) return clean;
    const ddd = parseInt(clean.substring(0, 2), 10);
    if (clean.length === 10 && VALID_DDDS.has(ddd)) return `55${clean}`;
    if (clean.length === 11 && clean[2] === '9' && VALID_DDDS.has(ddd)) return `55${clean}`;
    return clean;
}

export function withoutCountryCode(phone: string): string {
    const clean = phone.replace(/\D/g, '');
    return clean.startsWith('55') ? clean.slice(2) : clean;
}

function uniquePhones(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.filter((v): v is string => !!v && v.length >= 8)));
}

/** Todas as formas plausíveis do mesmo número, para buscar com `.in('phone', ...)`. */
export function phoneVariants(raw: string): string[] {
    const clean = raw.replace(/@.*$/, '').replace(/\D/g, '');
    if (!clean) return [];

    const variants = new Set<string>();
    const add = (value: string) => {
        if (!value) return;
        variants.add(value);
        const with55 = withCountryCode(value);
        if (with55) variants.add(with55);
        const no55 = withoutCountryCode(value);
        if (no55) variants.add(no55);
    };

    add(clean);

    const local = withoutCountryCode(clean);
    if (local.length === 10) {
        // DDD + 8 dígitos -> forma de celular com o 9 depois do DDD
        add(`${local.slice(0, 2)}9${local.slice(2)}`);
    }
    if (local.length === 11 && local[2] === '9') {
        // DDD + 9 + 8 dígitos -> forma antiga, sem o 9
        add(`${local.slice(0, 2)}${local.slice(3)}`);
    }

    return uniquePhones(Array.from(variants));
}

/**
 * Quebra o texto colado em telefones. Aceita o que sai de qualquer lugar:
 * uma por linha, separado por vírgula, ponto-e-vírgula ou tabulação, com ou sem
 * +, parênteses e traço. Devolve só dígitos, na ordem em que apareceram, sem
 * repetir -- e o que sobrou de lixo, para a tela poder mostrar.
 */
export function parsePhoneList(text: string): { phones: string[]; invalid: string[] } {
    const tokens = text
        .split(/[\n,;\t]+/)
        .map((t) => t.trim())
        .filter(Boolean);

    const phones: string[] = [];
    const invalid: string[] = [];
    const seen = new Set<string>();

    for (const token of tokens) {
        const digits = token.replace(/\D/g, '');
        // 8 dígitos é o piso do uniquePhones do webhook: abaixo disso não há
        // como ser telefone, é linha de cabeçalho ou nome que veio junto.
        if (digits.length < 8) {
            invalid.push(token);
            continue;
        }
        if (seen.has(digits)) continue;
        seen.add(digits);
        phones.push(digits);
    }

    return { phones, invalid };
}
