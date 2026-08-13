import { describe, it, expect } from 'vitest';
import { parseCsv, detectDelimiter, suggestMapping } from '../spreadsheetParser';

describe('detectDelimiter', () => {
  it('detecta vírgula', () => {
    expect(detectDelimiter('nome,telefone,email')).toBe(',');
  });

  it('detecta ponto e vírgula (padrão do Excel pt-BR)', () => {
    expect(detectDelimiter('nome;telefone;email')).toBe(';');
  });

  it('detecta tabulação', () => {
    expect(detectDelimiter('nome\ttelefone\temail')).toBe('\t');
  });

  it('ignora o delimitador dentro de aspas', () => {
    // O ';' separa de verdade; a ',' só aparece dentro do campo entre aspas.
    expect(detectDelimiter('"Silva, João";telefone')).toBe(';');
  });
});

describe('parseCsv', () => {
  it('lê cabeçalho e linhas', () => {
    const { headers, rows } = parseCsv('nome,telefone\nJoão,11999999999\nMaria,11888888888');
    expect(headers).toEqual(['nome', 'telefone']);
    expect(rows).toEqual([
      { nome: 'João', telefone: '11999999999' },
      { nome: 'Maria', telefone: '11888888888' },
    ]);
  });

  it('remove o BOM do primeiro cabeçalho', () => {
    // O próprio app exporta CSV com BOM (ContactBulkActionsBar).
    const { headers } = parseCsv('﻿nome,telefone\nJoão,11999999999');
    expect(headers[0]).toBe('nome');
  });

  it('respeita vírgula dentro de campo entre aspas', () => {
    const { rows } = parseCsv('nome,obs\n"Silva, João",cliente');
    expect(rows[0].nome).toBe('Silva, João');
    expect(rows[0].obs).toBe('cliente');
  });

  it('trata aspas escapadas ("")', () => {
    const { rows } = parseCsv('nome,obs\n"Ele disse ""oi""",teste');
    expect(rows[0].nome).toBe('Ele disse "oi"');
  });

  it('trata quebra de linha dentro de campo entre aspas', () => {
    const { rows } = parseCsv('nome,msg\n"João","linha1\nlinha2"');
    expect(rows).toHaveLength(1);
    expect(rows[0].msg).toBe('linha1\nlinha2');
  });

  it('lida com CRLF', () => {
    const { rows } = parseCsv('nome,telefone\r\nJoão,11999999999\r\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].telefone).toBe('11999999999');
  });

  it('usa ; quando é o separador do arquivo', () => {
    const { headers, rows } = parseCsv('nome;telefone\nJoão;11999999999');
    expect(headers).toEqual(['nome', 'telefone']);
    expect(rows[0].telefone).toBe('11999999999');
  });

  it('ignora linhas totalmente vazias', () => {
    const { rows } = parseCsv('nome,telefone\nJoão,11999999999\n,\n');
    expect(rows).toHaveLength(1);
  });

  it('renomeia cabeçalhos duplicados para não sobrescrever a coluna', () => {
    const { headers, rows } = parseCsv('telefone,telefone\n111,222');
    expect(headers).toEqual(['telefone', 'telefone (2)']);
    expect(rows[0]['telefone']).toBe('111');
    expect(rows[0]['telefone (2)']).toBe('222');
  });

  it('nomeia cabeçalhos vazios', () => {
    const { headers } = parseCsv('nome,,email\nJoão,x,a@b.c');
    expect(headers[1]).toBe('Coluna 2');
  });

  it('preenche com vazio quando a linha tem menos colunas', () => {
    const { rows } = parseCsv('nome,telefone,email\nJoão,11999999999');
    expect(rows[0].email).toBe('');
  });

  it('devolve vazio para texto em branco', () => {
    expect(parseCsv('   ')).toEqual({ headers: [], rows: [] });
  });
});

describe('suggestMapping', () => {
  it('reconhece cabeçalhos comuns em português', () => {
    const mapping = suggestMapping(['Nome', 'Telefone', 'E-mail']);
    expect(mapping['Telefone']).toBe('phone');
    expect(mapping['Nome']).toBe('name');
    expect(mapping['E-mail']).toBe('email');
  });

  it('reconhece cabeçalhos em inglês', () => {
    const mapping = suggestMapping(['Name', 'Phone', 'Email']);
    expect(mapping['Phone']).toBe('phone');
    expect(mapping['Name']).toBe('name');
    expect(mapping['Email']).toBe('email');
  });

  it('ignora acentuação e caixa', () => {
    const mapping = suggestMapping(['NÚMERO']);
    expect(mapping['NÚMERO']).toBe('phone');
  });

  it('reconhece whatsapp e celular como telefone', () => {
    expect(suggestMapping(['WhatsApp'])['WhatsApp']).toBe('phone');
    expect(suggestMapping(['Celular'])['Celular']).toBe('phone');
  });

  it('não mapeia duas colunas para o mesmo destino', () => {
    const mapping = suggestMapping(['Telefone', 'Celular']);
    const targets = Object.values(mapping).filter((t) => t === 'phone');
    expect(targets).toHaveLength(1);
  });

  it('deixa colunas desconhecidas sem mapeamento', () => {
    const mapping = suggestMapping(['Telefone', 'Mensagem personalizada']);
    expect(mapping['Mensagem personalizada']).toBeUndefined();
  });

  it('prefere correspondência exata a parcial', () => {
    // "Contato" casa parcialmente com telefone, mas "Telefone" é exato e deve
    // vencer. Antes o primeiro cabeçalho da lista ganhava e a coluna real de
    // telefone ficava sem mapeamento.
    const mapping = suggestMapping(['Contato', 'Telefone']);
    expect(mapping['Telefone']).toBe('phone');
    expect(mapping['Contato']).not.toBe('phone');
  });

  it('não deixa a coluna de e-mail virar telefone', () => {
    // "Email do contato" contém "contato" (dica de telefone). Sem pontuação, o
    // e-mail era mapeado como telefone e as linhas entravam com número inválido.
    const mapping = suggestMapping(['Nome', 'Email do contato']);
    expect(mapping['Email do contato']).toBe('email');
    expect(mapping['Nome']).toBe('name');
  });

  it('não deixa a coluna de nome virar telefone', () => {
    const mapping = suggestMapping(['Nome do contato', 'Telefone']);
    expect(mapping['Telefone']).toBe('phone');
    expect(mapping['Nome do contato']).toBe('name');
  });

  it('mapeia planilha completa corretamente', () => {
    const mapping = suggestMapping(['Nome completo', 'Telefone celular', 'E-mail', 'Observação']);
    expect(mapping['Telefone celular']).toBe('phone');
    expect(mapping['E-mail']).toBe('email');
    expect(mapping['Nome completo']).toBe('name');
    expect(mapping['Observação']).toBeUndefined();
  });

  it('usa "Contato" como telefone quando não há coluna melhor', () => {
    const mapping = suggestMapping(['Contato', 'Observação']);
    expect(mapping['Contato']).toBe('phone');
  });
});
