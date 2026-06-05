import { useCallback, useRef, useEffect, useState } from "react";
import { Button } from "@/fluzz/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/fluzz/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/fluzz/components/ui/dialog";
import { Input } from "@/fluzz/components/ui/input";
import { Label } from "@/fluzz/components/ui/label";
import { Bold, Italic, List, ListOrdered, Image as ImageIcon, Video, Link as LinkIcon, Heading1, Heading2, Quote, Palette, Type, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useEditor, EditorContent, NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";

const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "36px", "48px"];
const COLORS = [
  "#000000", "#374151", "#6b7280", "#9ca3af",
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#6366f1", "#a855f7",
  "#ec4899", "#ffffff"
];

// Custom extension for font size
const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: element => element.style.fontSize || null,
        renderHTML: attributes => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}` };
        },
      },
    };
  },
});

// Image component with resize/delete controls
function ImageNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [width, setWidth] = useState<number>(node.attrs.width || 400);
  
  const handleResize = (delta: number) => {
    const newWidth = Math.max(100, Math.min(1200, width + delta));
    setWidth(newWidth);
    updateAttributes({ width: newWidth });
  };

  return (
    <NodeViewWrapper className="relative inline-block my-4 group">
      <img 
        src={node.attrs.src} 
        alt={node.attrs.alt || ""} 
        style={{ width: `${width}px`, maxWidth: '100%' }}
        className={`rounded-lg ${selected ? 'ring-2 ring-primary' : ''}`}
      />
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm rounded-md p-1">
        <Button 
          type="button" 
          variant="ghost" 
          size="sm" 
          onClick={() => handleResize(-50)}
          className="h-7 w-7 p-0"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button 
          type="button" 
          variant="ghost" 
          size="sm" 
          onClick={() => handleResize(50)}
          className="h-7 w-7 p-0"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button 
          type="button" 
          variant="ghost" 
          size="sm" 
          onClick={() => deleteNode()}
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </NodeViewWrapper>
  );
}

// Custom resizable image extension with React node view
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: 400,
        parseHTML: element => {
          const width = element.getAttribute('width') || element.style.width;
          return width ? parseInt(width) : 400;
        },
        renderHTML: attributes => {
          if (!attributes.width) return {};
          return { width: attributes.width, style: `width: ${attributes.width}px` };
        },
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

interface RichTextEditorFullProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

export function RichTextEditorFull({ content, onChange, placeholder = "Escreva o conteúdo... (Cole imagens com Ctrl+V ou links de YouTube/Vimeo)" }: RichTextEditorFullProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      FontSize,
      Color,
      ResizableImage.configure({
        HTMLAttributes: {
          class: "rounded-lg my-4",
        },
      }),
      Youtube.configure({
        HTMLAttributes: {
          class: "w-full aspect-video rounded-lg my-4",
        },
        width: 640,
        height: 360,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose-base dark:prose-invert max-w-none focus:outline-none min-h-[400px] p-4",
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        // Handle pasted images
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              const reader = new FileReader();
              reader.onload = (e) => {
                const base64 = e.target?.result as string;
                view.dispatch(view.state.tr.replaceSelectionWith(
                  view.state.schema.nodes.image.create({ src: base64, width: 400 })
                ));
              };
              reader.readAsDataURL(file);
            }
            return true;
          }
        }

        // Handle pasted video links
        const rawText =
          event.clipboardData?.getData("text/plain") ||
          event.clipboardData?.getData("text") ||
          "";
        const text = rawText.trim();
        if (text) {
          const youtubeRegex = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
          const youtubeMatch = text.match(youtubeRegex);

          if (youtubeMatch) {
            event.preventDefault();
            const videoId = youtubeMatch[1];
            const embedUrl = `https://www.youtube.com/embed/${videoId}`;
            view.dispatch(
              view.state.tr.replaceSelectionWith(
                view.state.schema.nodes.youtube.create({ src: embedUrl })
              )
            );
            return true;
          }

          const vimeoRegex = /(?:https?:\/\/)?(?:www\.)?(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/;
          const vimeoMatch = text.match(vimeoRegex);

          if (vimeoMatch) {
            event.preventDefault();
            const videoId = vimeoMatch[1];
            const embedUrl = `https://player.vimeo.com/video/${videoId}`;
            view.dispatch(
              view.state.tr.replaceSelectionWith(
                view.state.schema.nodes.youtube.create({ src: embedUrl })
              )
            );
            return true;
          }
        }

        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        for (const file of Array.from(files)) {
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            const reader = new FileReader();
            reader.onload = (e) => {
              const base64 = e.target?.result as string;
              const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (pos) {
                view.dispatch(view.state.tr.insert(
                  pos.pos,
                  view.state.schema.nodes.image.create({ src: base64, width: 400 })
                ));
              }
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
    },
  });

  // Sync external content changes to editor
  useEffect(() => {
    if (editor && content !== undefined) {
      const currentContent = editor.getHTML();
      // Only update if content is different (to avoid cursor position issues)
      if (content !== currentContent && content !== "<p></p>" || (content && currentContent === "<p></p>")) {
        editor.commands.setContent(content);
      }
    }
  }, [content, editor]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && editor) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        editor.chain().focus().setImage({ src: base64 }).run();
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [editor]);

  const addImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const addVideo = useCallback(() => {
    const url = window.prompt("URL do vídeo (YouTube, Vimeo, etc):");
    if (url && editor) {
      editor.chain().focus().setYoutubeVideo({ src: url }).run();
    }
  }, [editor]);

  const addLink = useCallback(() => {
    const url = window.prompt("URL do link:");
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const setFontSize = (size: string) => {
    if (editor) {
      editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
    }
  };

  const setColor = (color: string) => {
    if (editor) {
      editor.chain().focus().setColor(color).run();
    }
  };

  if (!editor) return null;

  return (
    <div className="border rounded-md overflow-hidden bg-background">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 p-2 border-b bg-muted/50">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive("bold") ? "bg-muted" : ""}
        >
          <Bold size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive("italic") ? "bg-muted" : ""}
        >
          <Italic size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={editor.isActive("heading", { level: 1 }) ? "bg-muted" : ""}
        >
          <Heading1 size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor.isActive("heading", { level: 2 }) ? "bg-muted" : ""}
        >
          <Heading2 size={16} />
        </Button>
        
        <div className="w-px h-6 bg-border mx-1 self-center" />
        
        {/* Font Size */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" title="Tamanho da fonte">
              <Type size={16} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-32 p-2">
            <div className="space-y-1">
              {FONT_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setFontSize(size)}
                  className="w-full text-left px-2 py-1 text-sm hover:bg-muted rounded"
                >
                  {size}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Color Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" title="Cor da fonte">
              <Palette size={16} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2">
            <div className="grid grid-cols-7 gap-1">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setColor(color)}
                  className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="w-px h-6 bg-border mx-1 self-center" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive("bulletList") ? "bg-muted" : ""}
        >
          <List size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive("orderedList") ? "bg-muted" : ""}
        >
          <ListOrdered size={16} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor.isActive("blockquote") ? "bg-muted" : ""}
        >
          <Quote size={16} />
        </Button>

        <div className="w-px h-6 bg-border mx-1 self-center" />

        <Button type="button" variant="ghost" size="sm" onClick={addImage} title="Adicionar imagem">
          <ImageIcon size={16} />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={addVideo} title="Adicionar vídeo">
          <Video size={16} />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={addLink} title="Adicionar link">
          <LinkIcon size={16} />
        </Button>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
