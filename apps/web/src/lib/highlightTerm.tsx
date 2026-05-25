import React from 'react';

/**
 * Splits text around all occurrences of `term` (case-insensitive)
 * and wraps each match in a highlighted <mark>.
 */
export function highlightTerm(text: string, term: string): React.ReactNode {
  const trimmed = term.trim();
  if (!trimmed) return text;

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  if (parts.length === 1) return text;

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-transparent text-green-400 font-semibold">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}
