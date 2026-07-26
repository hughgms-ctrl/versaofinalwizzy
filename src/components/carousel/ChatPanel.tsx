import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { chatWithCarousel, type ChatMessage } from "./carouselApi";

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Oi! Me conta o tema do carrossel que eu já crio — ou, se já tiver um aberto, me diga o que quer mudar num slide.",
};

export default function ChatPanel({
  modelId,
  carouselId,
  onCarouselChanged,
}: {
  modelId: string;
  carouselId: string | null;
  onCarouselChanged: (id: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!modelId) return toast.error("Selecione um projeto primeiro");

    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const { reply, carouselId: newCarouselId } = await chatWithCarousel({
        modelId,
        carouselId,
        messages: next,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      if (newCarouselId && newCarouselId !== carouselId) {
        onCarouselChanged(newCarouselId);
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Falha ao conversar com a IA");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[70vh] flex-col rounded-md border border-border">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-xs",
              m.role === "user" ? "ml-auto bg-primary/10 text-foreground" : "bg-muted text-foreground",
            )}
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> pensando...
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t border-border p-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Ex: quero um carrossel sobre 5 erros de quem tá começando..."
          className="resize-none text-xs"
        />
        <Button type="button" size="icon" onClick={send} disabled={sending || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
