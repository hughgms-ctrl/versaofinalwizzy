import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Plus, LayoutGrid, Trash2, Images } from "lucide-react";
import { useCarousels } from "@/components/carousel/hooks";
import { ensureCarouselFonts } from "@/components/carousel/constants";
import SlideCard from "@/components/carousel/SlideCard";

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Na fila", variant: "secondary" },
  processing: { label: "Gerando...", variant: "default" },
  done: { label: "Pronto", variant: "outline" },
  failed: { label: "Falhou", variant: "destructive" },
};

export default function CarouselPage() {
  const navigate = useNavigate();
  const { carousels, loading, remove } = useCarousels();

  useEffect(() => {
    ensureCarouselFonts();
  }, []);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Images className="h-6 w-6 text-primary" /> Wizzy Carrossel
            </h1>
            <p className="text-muted-foreground">
              Crie carrosséis para o Instagram com IA — texto e imagem gerados automaticamente.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/tools/carousel/models")}>
              <LayoutGrid className="mr-2 h-4 w-4" /> Modelos
            </Button>
            <Button onClick={() => navigate("/tools/carousel/new")}>
              <Plus className="mr-2 h-4 w-4" /> Novo carrossel
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : carousels.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-3 border-dashed p-12 text-center">
            <p className="text-muted-foreground">Você ainda não criou nenhum carrossel.</p>
            <Button onClick={() => navigate("/tools/carousel/new")}>
              <Plus className="mr-2 h-4 w-4" /> Criar o primeiro
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {carousels.map((c) => {
              const thumb = c.slides?.[0];
              const st = STATUS[c.status] ?? STATUS.pending;
              return (
                <Card key={c.id} className="group overflow-hidden">
                  <button
                    type="button"
                    onClick={() => navigate(`/tools/carousel/${c.id}`)}
                    className="block w-full"
                  >
                    <div className="flex aspect-square items-center justify-center bg-muted">
                      {thumb && (thumb.title || (thumb.hasImage && thumb.imageUrl)) ? (
                        <SlideCard slide={thumb} total={c.slides.length} size={260} />
                      ) : (
                        <span className="px-4 text-center text-sm text-muted-foreground">
                          {thumb?.title ?? c.prompt}
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="space-y-1 p-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/tools/carousel/${c.id}`)}
                      className="block w-full text-left"
                    >
                      <p className="truncate text-sm font-medium">{c.prompt}</p>
                    </button>
                    <div className="flex items-center justify-between">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      <button
                        onClick={() => {
                          if (confirm("Excluir este carrossel?")) remove(c.id);
                        }}
                        className="text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
