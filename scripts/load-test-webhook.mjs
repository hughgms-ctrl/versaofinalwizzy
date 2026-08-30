#!/usr/bin/env node
/**
 * Teste de carga da entrada de mensagens — Semana 4 de
 * docs/REVISAO_ESCALA_LANCAMENTO.md.
 *
 * Simula N instancias do WhatsApp recebendo mensagens ao mesmo tempo, batendo
 * no `zapi-webhook` com o payload que a Evolution manda de verdade
 * (`messages.upsert`). A pergunta que ele responde e a mesma da revisao: o
 * sistema aguenta ~98 numeros conversando junto, sem perder mensagem e sem a
 * latencia explodir?
 *
 * MEDE: latencia por requisicao (p50/p95/p99), status devolvido, erros de rede
 * e a diferenca entre o ritmo pedido e o ritmo alcancado (se o proprio script
 * nao conseguir manter o passo, ele avisa em vez de mentir no relatorio).
 *
 * ============================ ATENCAO ============================
 * Isto injeta mensagens DE VERDADE no sistema: cada uma cria contato e conversa,
 * e pode acordar IA, campanha e fluxo — que por sua vez TENTAM ENVIAR mensagem
 * pelo provedor. Rodar contra producao significa mandar mensagem para gente de
 * verdade e sujar a base.
 *
 * Use um projeto de STAGING, com instancias de teste, e de preferencia numa org
 * sem IA e sem campanha ativa. O envio real so acontece com --confirmo-staging.
 * =================================================================
 *
 * Uso:
 *   node scripts/load-test-webhook.mjs \
 *     --url https://<ref>.supabase.co/functions/v1/zapi-webhook \
 *     --token <x-webhook-token> \
 *     --instances inst-teste-1,inst-teste-2,... \
 *     --rate 2 --duration 1800 --confirmo-staging
 *
 * Sem --confirmo-staging o script roda em ENSAIO: monta os payloads, imprime um
 * exemplo e nao manda nada.
 *
 * Flags:
 *   --url               (obrigatorio) endpoint do zapi-webhook
 *   --token             valor do header x-webhook-token
 *   --instances         nomes das instancias, separados por virgula
 *   --instances-file    arquivo com um nome por linha (alternativa a --instances)
 *   --rate              mensagens por segundo POR instancia (padrao 2)
 *   --duration          duracao em segundos (padrao 1800 = 30 min)
 *   --contacts          contatos distintos por instancia (padrao 20)
 *   --phone-prefix      prefixo dos telefones falsos (padrao 5500900)
 *   --max-in-flight     teto de requisicoes simultaneas (padrao 400)
 *   --confirmo-staging  manda de verdade (sem isso e ensaio)
 */

import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------- argumentos

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const name = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[name] = true;
    } else {
      args[name] = next;
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const URL_ALVO = args.url || process.env.WEBHOOK_URL || '';
const TOKEN = args.token || process.env.WEBHOOK_TOKEN || '';
const RATE = Number(args.rate || 2);
const DURATION_S = Number(args.duration || 1800);
const CONTACTS_POR_INSTANCIA = Number(args.contacts || 20);
const PHONE_PREFIX = String(args['phone-prefix'] || '5500900');
const MAX_IN_FLIGHT = Number(args['max-in-flight'] || 400);
const ENVIAR = args['confirmo-staging'] === true;

function lerInstancias() {
  if (args['instances-file']) {
    return readFileSync(args['instances-file'], 'utf8')
      .split('\n')
      .map((linha) => linha.trim())
      .filter(Boolean);
  }
  if (args.instances && typeof args.instances === 'string') {
    return args.instances.split(',').map((nome) => nome.trim()).filter(Boolean);
  }
  return [];
}

const INSTANCIAS = lerInstancias();

if (!URL_ALVO || INSTANCIAS.length === 0) {
  console.error('Faltou --url e/ou --instances (ou --instances-file). Veja o cabecalho do arquivo.');
  process.exit(1);
}

if (!/^https?:\/\//.test(URL_ALVO)) {
  console.error('--url precisa ser a URL completa do zapi-webhook.');
  process.exit(1);
}

// ---------------------------------------------------------------- payload

/**
 * Mesmo formato que a Evolution manda em messages.upsert — o webhook le
 * `data.key.id` (dedup), `data.key.remoteJid` (telefone) e
 * `data.message.conversation` (texto). Qualquer desvio aqui testa outro caminho
 * de codigo que nao e o de producao.
 */
function montarPayload(instancia, telefone, indice) {
  const msgId = `LOADTEST_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`.toUpperCase();
  return {
    event: 'messages.upsert',
    instance: instancia,
    data: {
      key: {
        remoteJid: `${telefone}@s.whatsapp.net`,
        fromMe: false,
        id: msgId,
      },
      pushName: `Carga ${telefone.slice(-4)}`,
      message: {
        conversation: `[teste de carga] mensagem ${indice} de ${telefone}`,
      },
      messageTimestamp: Math.floor(Date.now() / 1000),
      instanceId: instancia,
    },
    destination: URL_ALVO,
    date_time: new Date().toISOString(),
    sender: `${telefone}@s.whatsapp.net`,
  };
}

function telefoneDe(instanciaIdx, contatoIdx) {
  // Faixa fixa e reconhecivel: facilita achar (e apagar) tudo depois.
  const sufixo = String(instanciaIdx * 1000 + contatoIdx).padStart(4, '0');
  return `${PHONE_PREFIX}${sufixo}`;
}

// ---------------------------------------------------------------- medicao

const stats = {
  enviadas: 0,
  respondidas: 0,
  erros: 0,
  porStatus: new Map(),
  latencias: [],
  primeiroErro: null,
};

let emVoo = 0;
let descartadasPorTeto = 0;

function registrarStatus(status) {
  stats.porStatus.set(status, (stats.porStatus.get(status) || 0) + 1);
}

function percentil(valores, p) {
  if (valores.length === 0) return 0;
  const ordenados = valores.slice().sort((a, b) => a - b);
  const indice = Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length));
  return Math.round(ordenados[indice]);
}

async function dispararUma(payload) {
  if (emVoo >= MAX_IN_FLIGHT) {
    // Nao adianta empilhar: o gargalo passa a ser o script, e o numero medido
    // deixaria de ser do sistema.
    descartadasPorTeto++;
    return;
  }

  emVoo++;
  stats.enviadas++;
  const inicio = performance.now();

  try {
    const resposta = await fetch(URL_ALVO, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(TOKEN ? { 'x-webhook-token': TOKEN } : {}),
      },
      body: JSON.stringify(payload),
    });

    stats.latencias.push(performance.now() - inicio);
    stats.respondidas++;
    registrarStatus(resposta.status);
    // O corpo precisa ser consumido para a conexao ser reaproveitada.
    await resposta.text().catch(() => '');
  } catch (erro) {
    stats.erros++;
    if (!stats.primeiroErro) stats.primeiroErro = String(erro?.message || erro);
  } finally {
    emVoo--;
  }
}

function imprimirParcial(segundosDecorridos) {
  const p95 = percentil(stats.latencias, 95);
  const ok = stats.porStatus.get(200) || 0;
  const taxa = segundosDecorridos > 0 ? (stats.enviadas / segundosDecorridos).toFixed(1) : '0';
  console.log(
    `[${String(segundosDecorridos).padStart(4)}s] enviadas=${stats.enviadas} ok=${ok} ` +
    `erros=${stats.erros} em_voo=${emVoo} p95=${p95}ms ritmo=${taxa}/s`,
  );
}

function imprimirRelatorio(segundosDecorridos) {
  const alvo = INSTANCIAS.length * RATE;
  console.log('\n================ RELATORIO ================');
  console.log(`instancias simuladas ..... ${INSTANCIAS.length}`);
  console.log(`ritmo alvo ............... ${alvo}/s (${RATE}/s por instancia)`);
  console.log(`ritmo alcancado .......... ${(stats.enviadas / Math.max(segundosDecorridos, 1)).toFixed(1)}/s`);
  console.log(`duracao .................. ${segundosDecorridos}s`);
  console.log(`requisicoes .............. ${stats.enviadas}`);
  console.log(`respondidas .............. ${stats.respondidas}`);
  console.log(`erros de rede ............ ${stats.erros}${stats.primeiroErro ? ` (1o: ${stats.primeiroErro})` : ''}`);
  if (descartadasPorTeto > 0) {
    console.log(`NAO ENVIADAS (teto) ...... ${descartadasPorTeto}  <- o gargalo foi o script, nao o servidor`);
  }
  console.log('status:');
  for (const [status, quantidade] of [...stats.porStatus.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${status} .................... ${quantidade}`);
  }
  console.log('latencia (ms):');
  console.log(`  p50 .................... ${percentil(stats.latencias, 50)}`);
  console.log(`  p95 .................... ${percentil(stats.latencias, 95)}`);
  console.log(`  p99 .................... ${percentil(stats.latencias, 99)}`);
  console.log(`  max .................... ${stats.latencias.length ? Math.round(Math.max(...stats.latencias)) : 0}`);
  console.log('===========================================');
  console.log('Agora rode a parte 3 de docs/teste-de-carga.md: mensagem que entrou,');
  console.log('inbound_events pendente, crons atrasados e as consultas mais caras.');
}

// ---------------------------------------------------------------- execucao

async function main() {
  console.log(`Alvo .............. ${URL_ALVO}`);
  console.log(`Instancias ........ ${INSTANCIAS.length}`);
  console.log(`Ritmo ............. ${RATE}/s por instancia = ${INSTANCIAS.length * RATE}/s no total`);
  console.log(`Duracao ........... ${DURATION_S}s`);
  console.log(`Token ............. ${TOKEN ? 'presente' : 'AUSENTE (o webhook so exige se estiver configurado)'}`);
  console.log(`Telefones ......... ${telefoneDe(0, 0)} … ${telefoneDe(INSTANCIAS.length - 1, CONTACTS_POR_INSTANCIA - 1)}`);

  if (!ENVIAR) {
    console.log('\nMODO ENSAIO — nada foi enviado. Exemplo de payload:\n');
    console.log(JSON.stringify(montarPayload(INSTANCIAS[0], telefoneDe(0, 0), 1), null, 2));
    console.log('\nPara valer, repita o comando com --confirmo-staging (e confira que a URL e de STAGING).');
    return;
  }

  console.log('\n*** ENVIANDO DE VERDADE. Isto cria contato e conversa e pode acordar IA/campanha/fluxo. ***');
  console.log('*** Ctrl+C interrompe e imprime o relatorio do que ja rodou. ***\n');

  const inicio = Date.now();
  const contadores = new Array(INSTANCIAS.length).fill(0);
  let encerrado = false;

  const encerrar = () => {
    if (encerrado) return;
    encerrado = true;
    const decorridos = Math.round((Date.now() - inicio) / 1000);
    imprimirRelatorio(decorridos);
    process.exit(0);
  };

  process.on('SIGINT', encerrar);

  // Um timer por instancia, cada um com uma defasagem inicial diferente: sem
  // isso as 98 instancias disparariam no mesmo milissegundo e o teste mediria
  // uma rajada sincronizada, que nao e o padrao real.
  const intervaloMs = Math.max(1, Math.round(1000 / RATE));
  const timers = INSTANCIAS.map((instancia, idx) => {
    const defasagem = Math.round((intervaloMs * idx) / INSTANCIAS.length);
    return setTimeout(() => {
      const timer = setInterval(() => {
        const contatoIdx = contadores[idx] % CONTACTS_POR_INSTANCIA;
        contadores[idx]++;
        void dispararUma(montarPayload(instancia, telefoneDe(idx, contatoIdx), contadores[idx]));
      }, intervaloMs);
      timers[idx] = timer;
    }, defasagem);
  });

  const parcial = setInterval(() => {
    imprimirParcial(Math.round((Date.now() - inicio) / 1000));
  }, 10_000);

  await new Promise((resolve) => setTimeout(resolve, DURATION_S * 1000));

  for (const timer of timers) clearInterval(timer);
  clearInterval(parcial);

  // Espera o que ainda esta em voo antes de fechar a conta.
  const limite = Date.now() + 30_000;
  while (emVoo > 0 && Date.now() < limite) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  encerrado = true;
  imprimirRelatorio(Math.round((Date.now() - inicio) / 1000));
}

main().catch((erro) => {
  console.error('Falha no teste de carga:', erro);
  process.exit(1);
});
