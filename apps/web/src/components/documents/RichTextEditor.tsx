import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import FontFamily from "@tiptap/extension-font-family";
import { FontSize } from "./extensions/FontSize";
import { useEffect, useRef } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  Image as ImageIcon,
  Table as TableIcon,
  Undo2,
  Redo2,
  Highlighter,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  fields?: Array<{ name: string; label: string }>;
  organizationLogoUrl?: string | null;
}

const FONT_FAMILIES = [
  "Arial",
  "Times New Roman",
  "Helvetica",
  "Courier New",
  "Georgia",
  "Verdana",
];

const FONT_SIZES = ["10px", "12px", "14px", "16px", "18px", "20px", "24px", "32px"];

const TEXT_COLORS = [
  "#000000",
  "#374151",
  "#6b7280",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
];

export function RichTextEditor({ value, onChange, fields = [], organizationLogoUrl }: RichTextEditorProps) {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontFamily.configure({ types: ["textStyle"] }),
      FontSize,
      Color.configure({ types: ["textStyle"] }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || "<p></p>",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "tiptap-paper focus:outline-none",
        lang: "pt-BR",
      },
    },
  });

  // Sync external value into editor (e.g. when switching templates)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value && value !== current) {
      editor.commands.setContent(value, false);
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="h-[600px] rounded-md border bg-muted/40 animate-pulse" />
    );
  }

  const handleImageUpload = async (file: File) => {
    if (!profile?.organization_id) return;
    try {
      const safeName = file.name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${profile.organization_id}/document-images/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("contact-files").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("contact-files").getPublicUrl(path);
      editor.chain().focus().setImage({ src: urlData.publicUrl }).run();
    } catch (e: any) {
      toast.error("Erro ao enviar imagem: " + e.message);
    }
  };

  const insertVariable = (name: string) => {
    editor.chain().focus().insertContent(`{{${name}}}`).run();
  };

  const insertOrgLogo = () => {
    if (!organizationLogoUrl) {
      toast.error("Sua organização não tem logo configurada.");
      return;
    }
    editor.chain().focus().setImage({ src: organizationLogoUrl }).run();
  };

  return (
    <TooltipProvider>
      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 p-2 border-b bg-background">
          <ToolbarBtn
            tip="Desfazer"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            icon={<Undo2 className="h-4 w-4" />}
          />
          <ToolbarBtn
            tip="Refazer"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            icon={<Redo2 className="h-4 w-4" />}
          />
          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Font family */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1">
                Fonte
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {FONT_FAMILIES.map((font) => (
                <DropdownMenuItem
                  key={font}
                  style={{ fontFamily: font }}
                  onClick={() => editor.chain().focus().setFontFamily(font).run()}
                >
                  {font}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => editor.chain().focus().unsetFontFamily().run()}>
                Padrão
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Font size via inline mark style */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1">
                Tamanho
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {FONT_SIZES.map((size) => (
                <DropdownMenuItem
                  key={size}
                  onClick={() => editor.chain().focus().setFontSize(size).run()}
                >
                  {size}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => editor.chain().focus().unsetFontSize().run()}>
                Padrão
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Headings */}
          <ToolbarBtn
            tip="Título 1"
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            icon={<Heading1 className="h-4 w-4" />}
          />
          <ToolbarBtn
            tip="Título 2"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            icon={<Heading2 className="h-4 w-4" />}
          />
          <ToolbarBtn
            tip="Título 3"
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            icon={<Heading3 className="h-4 w-4" />}
          />
          <ToolbarBtn
            tip="Parágrafo"
            active={editor.isActive("paragraph")}
            onClick={() => editor.chain().focus().setParagraph().run()}
            icon={<Pilcrow className="h-4 w-4" />}
          />

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Inline marks */}
          <ToolbarBtn
            tip="Negrito (Ctrl+B)"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            icon={<Bold className="h-4 w-4" />}
          />
          <ToolbarBtn
            tip="Itálico (Ctrl+I)"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            icon={<Italic className="h-4 w-4" />}
          />
          <ToolbarBtn
            tip="Sublinhado (Ctrl+U)"
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            icon={<UnderlineIcon className="h-4 w-4" />}
          />
          <ToolbarBtn
            tip="Tachado"
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            icon={<Strikethrough className="h-4 w-4" />}
          />

          {/* Color */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Palette className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div className="grid grid-cols-4 gap-1 p-1">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => editor.chain().focus().setColor(c).run()}
                    className="h-6 w-6 rounded border"
                    style={{ background: c }}
                  />
                ))}
              </div>
              <DropdownMenuItem onClick={() => editor.chain().focus().unsetColor().run()}>
                Limpar cor
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Highlight */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Highlighter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div className="grid grid-cols-4 gap-1 p-1">
                {["#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fecaca", "#e9d5ff", "#fed7aa", "#cffafe"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
                    className="h-6 w-6 rounded border"
                    style={{ background: c }}
                  />
                ))}
              </div>
              <DropdownMenuItem onClick={() => editor.chain().focus().unsetHighlight().run()}>
                Limpar destaque
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Alignment */}
          <ToolbarBtn
            tip="Alinhar à esquerda"
            active={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            icon={<AlignLeft className="h-4 w-4" />}
          />
          <ToolbarBtn
            tip="Centralizar"
            active={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            icon={<AlignCenter className="h-4 w-4" />}
          />
          <ToolbarBtn
            tip="Alinhar à direita"
            active={editor.isActive({ textAlign: "right" })}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            icon={<AlignRight className="h-4 w-4" />}
          />
          <ToolbarBtn
            tip="Justificar"
            active={editor.isActive({ textAlign: "justify" })}
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            icon={<AlignJustify className="h-4 w-4" />}
          />

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Lists */}
          <ToolbarBtn
            tip="Lista com marcadores"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            icon={<List className="h-4 w-4" />}
          />
          <ToolbarBtn
            tip="Lista numerada"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            icon={<ListOrdered className="h-4 w-4" />}
          />

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Image */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Inserir imagem</TooltipContent>
          </Tooltip>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImageUpload(f);
              e.target.value = "";
            }}
          />

          {organizationLogoUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={insertOrgLogo}>
                  Logo
                </Button>
              </TooltipTrigger>
              <TooltipContent>Inserir logo da organização</TooltipContent>
            </Tooltip>
          )}

          {/* Table */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <TableIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() =>
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                }
              >
                Inserir tabela 3x3
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().addColumnAfter().run()}>
                Adicionar coluna
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().addRowAfter().run()}>
                Adicionar linha
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.chain().focus().deleteTable().run()}>
                Remover tabela
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Variables */}
          {fields.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-6 mx-1" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs">
                    {"{{ Variável }}"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-72 overflow-y-auto">
                  {fields.map((f) => (
                    <DropdownMenuItem key={f.name} onClick={() => insertVariable(f.name)}>
                      <span className="font-mono text-xs mr-2 text-muted-foreground">{`{{${f.name}}}`}</span>
                      {f.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        {/* Paper area — always white */}
        <div className="bg-muted/30 dark:bg-muted/10 p-4 sm:p-6 max-h-[70vh] overflow-auto">
          <div
            className={cn(
              "mx-auto w-[21cm] min-w-[21cm] bg-white text-black shadow-md",
              "min-h-[29.7cm]",
              "px-[2.5cm] py-[2.5cm]",
            )}
            style={{ fontFamily: "Arial, sans-serif", fontSize: "12pt", lineHeight: 1.6 }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

interface ToolbarBtnProps {
  tip: string;
  onClick: () => void;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}

function ToolbarBtn({ tip, onClick, icon, active, disabled }: ToolbarBtnProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="sm"
          className="h-8 w-8 p-0"
          onClick={onClick}
          disabled={disabled}
          type="button"
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}
