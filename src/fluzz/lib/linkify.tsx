import { ExternalLink } from "lucide-react";

// Utility function to convert URLs in text to clickable links
export const linkifyText = (text: string) => {
  if (!text) return null;
  
  // Regex to match URLs
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
  
  const parts = text.split(urlRegex);
  
  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      // Reset lastIndex since we're reusing the regex
      urlRegex.lastIndex = 0;
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-1 break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
          <ExternalLink size={12} className="flex-shrink-0" />
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
};

// Function to render text with line breaks and links
export const renderDocumentation = (text: string) => {
  if (!text) return null;
  
  const lines = text.split('\n');
  
  return lines.map((line, lineIndex) => (
    <span key={lineIndex}>
      {linkifyText(line)}
      {lineIndex < lines.length - 1 && <br />}
    </span>
  ));
};
