/**
 * Países e códigos de discagem, para o seletor de bandeira do telefone.
 *
 * Existe porque o cadastro de contato era brasileiro por construção: qualquer
 * número com 10 ou 11 dígitos levava um `55` na frente, o que corrompe número
 * estrangeiro (ver `withCountryCode` em phoneVariants.ts, que já é
 * country-aware). Com o país escolhido na tela não há adivinhação: o E.164 sai
 * pronto de quem digitou.
 *
 * A ordem de RAW importa para a DETECÇÃO (quem cola "+1..." é Estados Unidos,
 * não Canadá); a ordem alfabética só vale para MOSTRAR. Por isso as duas listas.
 */

export interface Country {
  /** ISO 3166-1 alpha-2, minúsculo (é o que a URL da bandeira usa). */
  iso2: string;
  name: string;
  /** Código do país, só dígitos, sem o '+'. */
  dialCode: string;
  /**
   * Tamanhos aceitos do número nacional (sem o código do país). Só é
   * preenchido onde a regra é certa e estável -- constraint errada barra
   * número legítimo, que é pior que aceitar um dígito a mais.
   */
  nationalLengths?: number[];
}

type CountryRow = [iso2: string, name: string, dialCode: string, nationalLengths?: number[]];

// Ordem = prioridade na detecção por prefixo. Onde vários países dividem o
// mesmo código (+1, +7), o dono "natural" vem primeiro.
const RAW: CountryRow[] = [
  ['br', 'Brasil', '55', [10, 11]],
  ['us', 'Estados Unidos', '1', [10]],
  ['pt', 'Portugal', '351', [9]],
  ['ar', 'Argentina', '54'],
  ['py', 'Paraguai', '595'],
  ['uy', 'Uruguai', '598'],
  ['cl', 'Chile', '56'],
  ['co', 'Colômbia', '57', [10]],
  ['mx', 'México', '52', [10]],
  ['es', 'Espanha', '34', [9]],
  ['ca', 'Canadá', '1', [10]],
  ['ru', 'Rússia', '7', [10]],
  ['af', 'Afeganistão', '93'],
  ['za', 'África do Sul', '27'],
  ['al', 'Albânia', '355'],
  ['de', 'Alemanha', '49'],
  ['ad', 'Andorra', '376'],
  ['ao', 'Angola', '244', [9]],
  ['ai', 'Anguilla', '1'],
  ['ag', 'Antígua e Barbuda', '1'],
  ['sa', 'Arábia Saudita', '966'],
  ['dz', 'Argélia', '213'],
  ['am', 'Armênia', '374'],
  ['aw', 'Aruba', '297'],
  ['au', 'Austrália', '61'],
  ['at', 'Áustria', '43'],
  ['az', 'Azerbaijão', '994'],
  ['bs', 'Bahamas', '1'],
  ['bh', 'Bahrein', '973'],
  ['bd', 'Bangladesh', '880'],
  ['bb', 'Barbados', '1'],
  ['be', 'Bélgica', '32'],
  ['bz', 'Belize', '501'],
  ['bj', 'Benin', '229'],
  ['bm', 'Bermudas', '1'],
  ['by', 'Bielorrússia', '375'],
  ['bo', 'Bolívia', '591'],
  ['ba', 'Bósnia e Herzegovina', '387'],
  ['bw', 'Botsuana', '267'],
  ['bn', 'Brunei', '673'],
  ['bg', 'Bulgária', '359'],
  ['bf', 'Burquina Faso', '226'],
  ['bi', 'Burundi', '257'],
  ['bt', 'Butão', '975'],
  ['cv', 'Cabo Verde', '238'],
  ['cm', 'Camarões', '237'],
  ['kh', 'Camboja', '855'],
  ['qa', 'Catar', '974'],
  ['kz', 'Cazaquistão', '7'],
  ['td', 'Chade', '235'],
  ['cn', 'China', '86'],
  ['cy', 'Chipre', '357'],
  ['km', 'Comores', '269'],
  ['kp', 'Coreia do Norte', '850'],
  ['kr', 'Coreia do Sul', '82'],
  ['ci', 'Costa do Marfim', '225'],
  ['cr', 'Costa Rica', '506'],
  ['hr', 'Croácia', '385'],
  ['cu', 'Cuba', '53'],
  ['cw', 'Curaçao', '599'],
  ['dk', 'Dinamarca', '45'],
  ['dj', 'Djibuti', '253'],
  ['dm', 'Dominica', '1'],
  ['eg', 'Egito', '20'],
  ['sv', 'El Salvador', '503'],
  ['ae', 'Emirados Árabes Unidos', '971'],
  ['ec', 'Equador', '593'],
  ['er', 'Eritreia', '291'],
  ['sk', 'Eslováquia', '421'],
  ['si', 'Eslovênia', '386'],
  ['ss', 'Sudão do Sul', '211'],
  ['ee', 'Estônia', '372'],
  ['sz', 'Essuatíni', '268'],
  ['et', 'Etiópia', '251'],
  ['fj', 'Fiji', '679'],
  ['ph', 'Filipinas', '63'],
  ['fi', 'Finlândia', '358'],
  ['fr', 'França', '33', [9]],
  ['ga', 'Gabão', '241'],
  ['gm', 'Gâmbia', '220'],
  ['gh', 'Gana', '233'],
  ['ge', 'Geórgia', '995'],
  ['gi', 'Gibraltar', '350'],
  ['gd', 'Granada', '1'],
  ['gr', 'Grécia', '30'],
  ['gl', 'Groenlândia', '299'],
  ['gp', 'Guadalupe', '590'],
  ['gu', 'Guam', '1'],
  ['gt', 'Guatemala', '502'],
  ['gy', 'Guiana', '592'],
  ['gf', 'Guiana Francesa', '594'],
  ['gn', 'Guiné', '224'],
  ['gq', 'Guiné Equatorial', '240'],
  ['gw', 'Guiné-Bissau', '245'],
  ['ht', 'Haiti', '509'],
  ['hn', 'Honduras', '504'],
  ['hk', 'Hong Kong', '852'],
  ['hu', 'Hungria', '36'],
  ['ye', 'Iêmen', '967'],
  ['ky', 'Ilhas Cayman', '1'],
  ['fo', 'Ilhas Faroé', '298'],
  ['fk', 'Ilhas Malvinas', '500'],
  ['mh', 'Ilhas Marshall', '692'],
  ['sb', 'Ilhas Salomão', '677'],
  ['tc', 'Ilhas Turcas e Caicos', '1'],
  ['vi', 'Ilhas Virgens Americanas', '1'],
  ['vg', 'Ilhas Virgens Britânicas', '1'],
  ['in', 'Índia', '91', [10]],
  ['id', 'Indonésia', '62'],
  ['ir', 'Irã', '98'],
  ['iq', 'Iraque', '964'],
  ['ie', 'Irlanda', '353'],
  ['is', 'Islândia', '354'],
  ['il', 'Israel', '972'],
  ['it', 'Itália', '39'],
  ['jm', 'Jamaica', '1'],
  ['jp', 'Japão', '81'],
  ['jo', 'Jordânia', '962'],
  ['ki', 'Kiribati', '686'],
  ['kw', 'Kuwait', '965'],
  ['la', 'Laos', '856'],
  ['ls', 'Lesoto', '266'],
  ['lv', 'Letônia', '371'],
  ['lb', 'Líbano', '961'],
  ['lr', 'Libéria', '231'],
  ['ly', 'Líbia', '218'],
  ['li', 'Liechtenstein', '423'],
  ['lt', 'Lituânia', '370'],
  ['lu', 'Luxemburgo', '352'],
  ['mo', 'Macau', '853'],
  ['mk', 'Macedônia do Norte', '389'],
  ['mg', 'Madagascar', '261'],
  ['my', 'Malásia', '60'],
  ['mw', 'Malaui', '265'],
  ['mv', 'Maldivas', '960'],
  ['ml', 'Mali', '223'],
  ['mt', 'Malta', '356'],
  ['mp', 'Marianas do Norte', '1'],
  ['ma', 'Marrocos', '212'],
  ['mq', 'Martinica', '596'],
  ['mu', 'Maurício', '230'],
  ['mr', 'Mauritânia', '222'],
  ['fm', 'Micronésia', '691'],
  ['mz', 'Moçambique', '258'],
  ['md', 'Moldávia', '373'],
  ['mc', 'Mônaco', '377'],
  ['mn', 'Mongólia', '976'],
  ['me', 'Montenegro', '382'],
  ['ms', 'Montserrat', '1'],
  ['mm', 'Myanmar', '95'],
  ['na', 'Namíbia', '264'],
  ['nr', 'Nauru', '674'],
  ['np', 'Nepal', '977'],
  ['ni', 'Nicarágua', '505'],
  ['ne', 'Níger', '227'],
  ['ng', 'Nigéria', '234'],
  ['no', 'Noruega', '47'],
  ['nc', 'Nova Caledônia', '687'],
  ['nz', 'Nova Zelândia', '64'],
  ['om', 'Omã', '968'],
  ['nl', 'Países Baixos', '31'],
  ['bq', 'Países Baixos Caribenhos', '599'],
  ['pw', 'Palau', '680'],
  ['ps', 'Palestina', '970'],
  ['pa', 'Panamá', '507'],
  ['pg', 'Papua-Nova Guiné', '675'],
  ['pk', 'Paquistão', '92'],
  ['pe', 'Peru', '51', [9]],
  ['pf', 'Polinésia Francesa', '689'],
  ['pl', 'Polônia', '48'],
  ['pr', 'Porto Rico', '1'],
  ['ke', 'Quênia', '254'],
  ['kg', 'Quirguistão', '996'],
  ['gb', 'Reino Unido', '44'],
  ['cf', 'República Centro-Africana', '236'],
  ['cd', 'República Democrática do Congo', '243'],
  ['cg', 'República do Congo', '242'],
  ['do', 'República Dominicana', '1'],
  ['cz', 'República Tcheca', '420'],
  ['re', 'Reunião', '262'],
  ['ro', 'Romênia', '40'],
  ['rw', 'Ruanda', '250'],
  ['eh', 'Saara Ocidental', '212'],
  ['ws', 'Samoa', '685'],
  ['as', 'Samoa Americana', '1'],
  ['sm', 'San Marino', '378'],
  ['sh', 'Santa Helena', '290'],
  ['lc', 'Santa Lúcia', '1'],
  ['kn', 'São Cristóvão e Névis', '1'],
  ['st', 'São Tomé e Príncipe', '239'],
  ['vc', 'São Vicente e Granadinas', '1'],
  ['sc', 'Seicheles', '248'],
  ['sn', 'Senegal', '221'],
  ['sl', 'Serra Leoa', '232'],
  ['rs', 'Sérvia', '381'],
  ['sg', 'Singapura', '65'],
  ['sx', 'Sint Maarten', '1'],
  ['sy', 'Síria', '963'],
  ['so', 'Somália', '252'],
  ['lk', 'Sri Lanka', '94'],
  ['sd', 'Sudão', '249'],
  ['se', 'Suécia', '46'],
  ['ch', 'Suíça', '41'],
  ['sr', 'Suriname', '597'],
  ['th', 'Tailândia', '66'],
  ['tw', 'Taiwan', '886'],
  ['tj', 'Tajiquistão', '992'],
  ['tz', 'Tanzânia', '255'],
  ['tl', 'Timor-Leste', '670'],
  ['tg', 'Togo', '228'],
  ['to', 'Tonga', '676'],
  ['tt', 'Trinidad e Tobago', '1'],
  ['tn', 'Tunísia', '216'],
  ['tm', 'Turcomenistão', '993'],
  ['tr', 'Turquia', '90'],
  ['tv', 'Tuvalu', '688'],
  ['ua', 'Ucrânia', '380'],
  ['ug', 'Uganda', '256'],
  ['uz', 'Uzbequistão', '998'],
  ['vu', 'Vanuatu', '678'],
  ['va', 'Vaticano', '379'],
  ['ve', 'Venezuela', '58'],
  ['vn', 'Vietnã', '84'],
  ['zm', 'Zâmbia', '260'],
  ['zw', 'Zimbábue', '263'],
];

/** Ordem de detecção: quem divide código de discagem tem dono definido aqui. */
const BY_DETECTION_ORDER: Country[] = RAW.map(([iso2, name, dialCode, nationalLengths]) => ({
  iso2,
  name,
  dialCode,
  nationalLengths,
}));

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/** Ordem de exibição no seletor. */
export const COUNTRIES: Country[] = [...BY_DETECTION_ORDER].sort((a, b) => collator.compare(a.name, b.name));

export const DEFAULT_COUNTRY: Country = BY_DETECTION_ORDER[0];

export function findCountryByIso(iso2: string | null | undefined): Country | undefined {
  if (!iso2) return undefined;
  const wanted = iso2.toLowerCase();
  return BY_DETECTION_ORDER.find((c) => c.iso2 === wanted);
}

/**
 * País de um número já em E.164 (só dígitos). Casa o prefixo mais longo; entre
 * empates ganha quem vem primeiro em RAW (+1 -> Estados Unidos).
 */
export function findCountryByDialPrefix(digits: string): Country | undefined {
  const clean = digits.replace(/\D/g, '');
  if (!clean) return undefined;
  let best: Country | undefined;
  for (const country of BY_DETECTION_ORDER) {
    if (!clean.startsWith(country.dialCode)) continue;
    if (!best || country.dialCode.length > best.dialCode.length) best = country;
  }
  return best;
}

/** Emoji da bandeira a partir do ISO2 -- fallback de quando a imagem não carrega. */
export function flagEmoji(iso2: string): string {
  return iso2
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .split('')
    .map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65))
    .join('');
}

/**
 * Junta país + número nacional num E.164 só com dígitos.
 *
 * O zero de tronco (comum na Europa e na Ásia: "0 21 ...") não entra no E.164 e
 * é descartado. NÃO se tenta remover um código de país repetido no meio dos
 * dígitos: "5599..." no Brasil é o DDD 55 de Santa Maria, não um 55 sobrando.
 */
export function toE164(country: Country, national: string): string {
  const clean = national.replace(/\D/g, '').replace(/^0+/, '');
  if (!clean) return '';
  return `${country.dialCode}${clean}`;
}

const VALID_BR_DDDS = new Set([
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
 * O número nacional serve para este país? Devolve o motivo em português para a
 * tela mostrar, ou null quando está bom.
 *
 * Fora do Brasil a checagem é deliberadamente frouxa: o teto do E.164 (15
 * dígitos no total) e um piso de plausibilidade. Plano de numeração muda de
 * país para país e de ano para ano -- barrar um número válido é pior que deixar
 * passar um inválido, que o provedor recusa depois.
 */
export function validateNationalNumber(country: Country, national: string): string | null {
  const clean = national.replace(/\D/g, '').replace(/^0+/, '');
  if (!clean) return 'Digite o número de telefone.';

  const total = country.dialCode.length + clean.length;
  if (total > 15) return 'Número longo demais (o padrão internacional vai até 15 dígitos).';

  if (country.iso2 === 'br') {
    if (clean.length !== 10 && clean.length !== 11) {
      return 'No Brasil o número tem DDD + 8 ou 9 dígitos (ex: 11999999999).';
    }
    if (!VALID_BR_DDDS.has(parseInt(clean.slice(0, 2), 10))) return 'DDD inválido.';
    return null;
  }

  if (country.nationalLengths && !country.nationalLengths.includes(clean.length)) {
    const esperado = country.nationalLengths.join(' ou ');
    return `Em ${country.name} o número tem ${esperado} dígitos (sem o +${country.dialCode}).`;
  }

  if (total < 8) return 'Número curto demais.';
  return null;
}
