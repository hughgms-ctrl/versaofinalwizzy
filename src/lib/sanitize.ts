/**
 * HTML Sanitization Utility
 * Prevents XSS attacks by stripping dangerous HTML tags and attributes.
 * Lightweight alternative to DOMPurify for our use case.
 */

// Allowed tags for WhatsApp-style formatting
const ALLOWED_TAGS = new Set([
  'strong', 'em', 'del', 'code', 'br', 'p', 'span',
]);

// Allowed attributes per tag
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  code: new Set(['class']),
  span: new Set(['class']),
  p: new Set(['class']),
};

/**
 * Sanitize HTML string by removing dangerous tags/attributes.
 * Only allows safe formatting tags (strong, em, del, code, br, span).
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  // Use DOMParser for robust parsing
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';

  sanitizeNode(root);
  return root.innerHTML;
}

function sanitizeNode(node: Element): void {
  const children = Array.from(node.childNodes);

  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) continue;

    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tagName = el.tagName.toLowerCase();

      // Script/style tags — remove entirely
      if (tagName === 'script' || tagName === 'style' || tagName === 'iframe' || tagName === 'object' || tagName === 'embed') {
        node.removeChild(el);
        continue;
      }

      // Remove event handlers (onclick, onerror, etc.)
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:')) {
          el.removeAttribute(attr.name);
        }
      }

      if (!ALLOWED_TAGS.has(tagName)) {
        // Replace disallowed tag with its text content
        const text = document.createTextNode(el.textContent || '');
        node.replaceChild(text, el);
        continue;
      }

      // Strip disallowed attributes
      const allowedSet = ALLOWED_ATTRS[tagName] || new Set();
      for (const attr of attrs) {
        if (!allowedSet.has(attr.name.toLowerCase())) {
          el.removeAttribute(attr.name);
        }
      }

      // Recurse into children
      sanitizeNode(el);
    }
  }
}

/**
 * Escape HTML entities — use when you need pure text output, no HTML at all.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Sanitize user input for safe storage/display.
 * Trims, limits length, removes null bytes.
 */
export function sanitizeInput(input: string, maxLength = 10000): string {
  if (!input) return '';
  return input
    .replace(/\0/g, '') // Remove null bytes
    .trim()
    .slice(0, maxLength);
}
