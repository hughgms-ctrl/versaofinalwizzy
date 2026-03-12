/**
 * WhatsApp message formatter
 * Converts WhatsApp-style markdown to HTML
 * 
 * Supported formats:
 * - *bold* -> <strong>bold</strong>
 * - _italic_ -> <em>italic</em>
 * - ~strikethrough~ -> <del>strikethrough</del>
 * - ```monospace``` -> <code>monospace</code>
 * - `code` -> <code>code</code>
 * - Line breaks are preserved
 */

export function formatWhatsAppMessage(text: string): string {
  if (!text) return '';
  
  let formatted = text;
  
  // Escape HTML first to prevent XSS
  formatted = formatted
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  // Handle code blocks first (triple backticks)
  formatted = formatted.replace(/```([^`]+)```/g, '<code class="block bg-black/20 px-2 py-1 rounded text-xs font-mono">$1</code>');
  
  // Handle inline code (single backticks)
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="bg-black/20 px-1 rounded text-xs font-mono">$1</code>');
  
  // Bold (*text*)
  formatted = formatted.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
  
  // Italic (_text_)
  formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
  
  // Strikethrough (~text~)
  formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');
  
  // Preserve line breaks
  formatted = formatted.replace(/\n/g, '<br />');
  
  return formatted;
}

/**
 * Parse message text and extract variables
 * Variables are in format {variable_name}
 */
export function parseMessageVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, varName) => {
    return variables[varName] || match;
  });
}

/**
 * Available message variables
 */
export const messageVariables = [
  { key: 'nome', label: 'Nome do Contato', description: 'Insere o nome do contato' },
  { key: 'telefone', label: 'Telefone', description: 'Insere o telefone do contato' },
];
