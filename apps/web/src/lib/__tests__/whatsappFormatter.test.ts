import { describe, it, expect } from 'vitest';
import { formatWhatsAppMessage, parseMessageVariables } from '../whatsappFormatter';

describe('formatWhatsAppMessage', () => {
  it('returns empty string for falsy input', () => {
    expect(formatWhatsAppMessage('')).toBe('');
    expect(formatWhatsAppMessage(null as any)).toBe('');
  });

  it('formats bold text', () => {
    expect(formatWhatsAppMessage('*bold*')).toContain('<strong>bold</strong>');
  });

  it('formats italic text', () => {
    expect(formatWhatsAppMessage('_italic_')).toContain('<em>italic</em>');
  });

  it('formats strikethrough text', () => {
    expect(formatWhatsAppMessage('~strike~')).toContain('<del>strike</del>');
  });

  it('formats inline code', () => {
    const result = formatWhatsAppMessage('`code`');
    expect(result).toContain('<code');
    expect(result).toContain('code');
  });

  it('formats code blocks', () => {
    const result = formatWhatsAppMessage('```block```');
    expect(result).toContain('<code');
    expect(result).toContain('block');
  });

  it('preserves line breaks', () => {
    expect(formatWhatsAppMessage('line1\nline2')).toContain('<br />');
  });

  // XSS Prevention Tests
  it('escapes HTML tags to prevent XSS', () => {
    const result = formatWhatsAppMessage('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    const result = formatWhatsAppMessage('say "hello"');
    expect(result).toContain('&quot;');
  });

  it('escapes single quotes', () => {
    const result = formatWhatsAppMessage("it's");
    expect(result).toContain('&#x27;');
  });

  it('escapes img onerror attack', () => {
    const result = formatWhatsAppMessage('<img onerror="alert(1)" src=x>');
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;img');
  });

  it('handles combined formatting', () => {
    const result = formatWhatsAppMessage('*bold* and _italic_ and ~strike~');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
    expect(result).toContain('<del>strike</del>');
  });
});

describe('parseMessageVariables', () => {
  it('replaces known variables', () => {
    const result = parseMessageVariables('Olá {nome}!', { nome: 'João' });
    expect(result).toBe('Olá João!');
  });

  it('keeps unknown variables unchanged', () => {
    const result = parseMessageVariables('{unknown}', {});
    expect(result).toBe('{unknown}');
  });

  it('replaces multiple variables', () => {
    const result = parseMessageVariables('{nome} - {telefone}', {
      nome: 'Ana',
      telefone: '11999999999',
    });
    expect(result).toBe('Ana - 11999999999');
  });
});
