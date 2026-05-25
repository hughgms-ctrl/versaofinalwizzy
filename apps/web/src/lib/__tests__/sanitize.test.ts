import { describe, it, expect } from 'vitest';
import { sanitizeHtml, escapeHtml, sanitizeInput } from '../sanitize';

describe('sanitizeHtml', () => {
  it('returns empty string for falsy input', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null as any)).toBe('');
    expect(sanitizeHtml(undefined as any)).toBe('');
  });

  it('preserves allowed tags', () => {
    expect(sanitizeHtml('<strong>bold</strong>')).toBe('<strong>bold</strong>');
    expect(sanitizeHtml('<em>italic</em>')).toBe('<em>italic</em>');
    expect(sanitizeHtml('<del>strike</del>')).toBe('<del>strike</del>');
    expect(sanitizeHtml('<code>code</code>')).toBe('<code>code</code>');
    expect(sanitizeHtml('<br>')).toContain('br');
  });

  it('removes script tags completely', () => {
    const result = sanitizeHtml('<script>alert("xss")</script>');
    expect(result).not.toContain('script');
    expect(result).not.toContain('alert');
  });

  it('removes iframe tags', () => {
    const result = sanitizeHtml('<iframe src="https://evil.com"></iframe>');
    expect(result).not.toContain('iframe');
    expect(result).not.toContain('evil.com');
  });

  it('removes object and embed tags', () => {
    expect(sanitizeHtml('<object data="x"></object>')).not.toContain('object');
    expect(sanitizeHtml('<embed src="x">')).not.toContain('embed');
  });

  it('removes event handler attributes', () => {
    const result = sanitizeHtml('<strong onclick="alert(1)">text</strong>');
    expect(result).not.toContain('onclick');
    expect(result).toContain('text');
  });

  it('removes onerror handlers', () => {
    const result = sanitizeHtml('<code onerror="steal()">x</code>');
    expect(result).not.toContain('onerror');
  });

  it('strips disallowed tags but keeps text content', () => {
    const result = sanitizeHtml('<div>hello</div>');
    expect(result).toContain('hello');
    expect(result).not.toContain('<div>');
  });

  it('strips disallowed attributes from allowed tags', () => {
    const result = sanitizeHtml('<span style="color:red" class="ok">text</span>');
    expect(result).not.toContain('style');
    expect(result).toContain('class="ok"');
  });

  it('handles nested dangerous content', () => {
    const result = sanitizeHtml('<strong><script>evil()</script>safe</strong>');
    expect(result).not.toContain('script');
    expect(result).toContain('safe');
  });
});

describe('escapeHtml', () => {
  it('escapes all dangerous characters', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('"quotes"')).toBe('&quot;quotes&quot;');
    expect(escapeHtml("'single'")).toBe('&#x27;single&#x27;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('handles combined dangerous input', () => {
    const input = '<img onerror="alert(\'xss\')" src="x">';
    const result = escapeHtml(input);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });
});

describe('sanitizeInput', () => {
  it('returns empty string for falsy input', () => {
    expect(sanitizeInput('')).toBe('');
    expect(sanitizeInput(null as any)).toBe('');
  });

  it('trims whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  it('removes null bytes', () => {
    expect(sanitizeInput('hello\0world')).toBe('helloworld');
  });

  it('enforces max length', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeInput(long, 100)).toHaveLength(100);
  });

  it('uses default max length of 10000', () => {
    const long = 'x'.repeat(20000);
    expect(sanitizeInput(long)).toHaveLength(10000);
  });
});
