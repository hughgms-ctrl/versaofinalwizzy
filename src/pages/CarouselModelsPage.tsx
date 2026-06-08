import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { useCarouselModels } from "@/components/carousel/hooks";
import ModelForm from "@/components/carousel/ModelForm";
import { OBJECTIVE_OPTIONS, PEOPLE_OPTIONS, TONE_OPTIONS, labelOf } from "@/components/carousel/constants";
import type { CarouselModel } from "@/components/carousel/types";

export default function CarouselModelsPage() {
  const navigate = useNavigate();
  const { models, loading, createModel, updateModel, deleteModel } = useCarouselModels();
  const [editing, setEditing] = useState<CarouselModel | null>(null);
  const [creating, setCreating] = useState(false);

  if (creating || editing) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="text-2xl font-bold text-foreground">
            {editing ? "Editar modelo" : "Novo modelo"}
          </h1>
          <ModelForm
            initial={editing ?? undefined}
            onCancel={() => {
              setCreating(false);
              setEditing(null);
            }}
            onSubmit={async (data) => {
              if (editing) await updateModel(editing.id, data);
              else await createModel(data);
              setCreating(false);
              setEditing(null);
            }}
          />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              onClick={() => navigate("/tools/carousel")}
              className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Voltar
            </button>
            <h1 className="text-2xl font-bold text-foreground">Modelos</h1>
            <p className="text-muted-foreground">
              A identidade da marca reutilizada em cada carrossel.
            </p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Novo modelo
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : models.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-3 border-dashed p-12 text-center">
            <p className="text-muted-foreground">Nenhum modelo salvo ainda.</p>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Criar o primeiro
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {models.map((m) => (
              <Card key={m.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium">{m.name}</h3>
                      <p className="text-xs text-muted-foreground">{m.niche}</p>
                    </div>
                    {m.brandColor && (
                      <span
                        className="h-6 w-6 rounded-full border border-border"
                        style={{ background: m.brandColor }}
                        title={m.brandColor}
                      />
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{labelOf(OBJECTIVE_OPTIONS, m.objective)}</Badge>
                    <Badge variant="secondary">{labelOf(TONE_OPTIONS, m.tone)}</Badge>
                    <Badge variant="outline">{m.audience}</Badge>
                    <Badge variant="outline">{labelOf(PEOPLE_OPTIONS, m.peopleInImages)}</Badge>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(m)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm("Excluir este modelo?")) deleteModel(m.id);
                      }}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
