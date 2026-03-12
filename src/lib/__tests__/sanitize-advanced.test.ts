import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeInput, escapeHtml } from '../sanitize';

describe('sanitizeHtml — advanced XSS vectors', () => {
  it('strips SVG-based XSS', () => {
    const input = '<svg onload="alert(1)"><circle r="10"/></svg>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<svg');
    expect(result).not.toContain('onload');
  });

  it('strips nested script in allowed tag', () => {
    const input = '<strong><script>alert(1)</script>safe</strong>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<script');
    expect(result).toContain('safe');
  });

  it('strips data URI in img src', () => {
    const input = '<img src="data:text/html,<script>alert(1)</script>" />';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<img');
    expect(result).not.toContain('data:');
  });

  it('strips javascript: in href', () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
  });

  it('strips event handlers with mixed case', () => {
    const input = '<div onMouseOver="alert(1)">hover</div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onMouseOver');
    expect(result).not.toContain('onmouseover');
  });

  it('strips iframe tags completely', () => {
    const input = '<iframe src="https://evil.com"></iframe>safe text';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<iframe');
    expect(result).toContain('safe text');
  });

  it('strips object/embed tags', () => {
    const input = '<object data="evil.swf"></object><embed src="evil.swf">text';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<object');
    expect(result).not.toContain('<embed');
  });

  it('handles deeply nested malicious content', () => {
    const input = '<strong><em><code><script>alert(1)</script></code></em></strong>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<script');
    expect(result).toContain('<strong>');
  });

  it('preserves safe formatting', () => {
    const input = '<strong>bold</strong> <em>italic</em> <del>strike</del> <code>code</code>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
    expect(result).toContain('<del>strike</del>');
    expect(result).toContain('<code>code</code>');
  });

  it('handles empty/null input', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null as any)).toBe('');
    expect(sanitizeHtml(undefined as any)).toBe('');
  });
});

describe('sanitizeInput — edge cases', () => {
  it('removes null bytes', () => {
    expect(sanitizeInput('hello\0world')).toBe('helloworld');
  });

  it('trims whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  it('respects maxLength', () => {
    const long = 'a'.repeat(20000);
    expect(sanitizeInput(long, 100).length).toBe(100);
  });

  it('handles empty input', () => {
    expect(sanitizeInput('')).toBe('');
    expect(sanitizeInput(null as any)).toBe('');
  });

  it('handles multiple null bytes', () => {
    expect(sanitizeInput('\0\0\0test\0')).toBe('test');
  });
});

describe('escapeHtml', () => {
  it('escapes all dangerous characters', () => {
    const input = '<script>alert("xss" & \'test\')</script>';
    const result = escapeHtml(input);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).toContain('&quot;');
    expect(result).toContain('&#x27;');
  });
});
