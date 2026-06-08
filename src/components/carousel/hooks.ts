import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import * as api from "./carouselApi";
import { rowToSlide } from "./mappers";
import type { Carousel, CarouselModel, Slide } from "./types";

/* --------------------------- Modelos --------------------------- */

export function useCarouselModels() {
  const { user, profile } = useAuth();
  const [models, setModels] = useState<CarouselModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setModels(await api.listModels());
      setError(null);
    } catch {
      setError("Falha ao carregar modelos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const createModel = useCallback(
    async (input: api.ModelInput) => {
      if (!profile?.organization_id || !user?.id) {
        throw new Error("Sessão inválida");
      }
      const m = await api.createModel(input, profile.organization_id, user.id);
      await reload();
      return m;
    },
    [profile?.organization_id, user?.id, reload],
  );

  const updateModel = useCallback(
    async (id: string, input: Partial<api.ModelInput>) => {
      const m = await api.updateModel(id, input);
      await reload();
      return m;
    },
    [reload],
  );

  const deleteModel = useCallback(
    async (id: string) => {
      await api.deleteModel(id);
      await reload();
    },
    [reload],
  );

  return { models, loading, error, reload, createModel, updateModel, deleteModel };
}

/* ----------------------- Lista de carrosséis ----------------------- */

export function useCarousels() {
  const [carousels, setCarousels] = useState<Carousel[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setCarousels(await api.listCarousels());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    await api.deleteCarousel(id);
    setCarousels((p) => p.filter((c) => c.id !== id));
  }, []);

  return { carousels, loading, reload, remove };
}

/* ------------- Carrossel único + sincronização Realtime ------------- */

export function useCarousel(carouselId: string | undefined) {
  const [carousel, setCarousel] = useState<Carousel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!carouselId) {
      setCarousel(null);
      setLoading(false);
      return;
    }
    try {
      setCarousel(await api.getCarousel(carouselId));
      setError(null);
    } catch {
      setError("Falha ao carregar carrossel");
    } finally {
      setLoading(false);
    }
  }, [carouselId]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  // Realtime: status do carrossel + atualizações de cada slide.
  useEffect(() => {
    if (!carouselId) return;
    const channel = supabase
      .channel(`carousel:${carouselId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "carousels",
          filter: `id=eq.${carouselId}`,
        },
        (payload) => {
          const status = (payload.new as { status: Carousel["status"] }).status;
          setCarousel((prev) => (prev ? { ...prev, status } : prev));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "carousel_slides",
          filter: `carousel_id=eq.${carouselId}`,
        },
        (payload) => {
          const slide = rowToSlide(payload.new);
          setCarousel((prev) =>
            prev
              ? {
                  ...prev,
                  slides: prev.slides.map((s) => (s.id === slide.id ? slide : s)),
                }
              : prev,
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [carouselId]);

  const applySlide = (slide: Slide) =>
    setCarousel((prev) =>
      prev
        ? { ...prev, slides: prev.slides.map((s) => (s.id === slide.id ? slide : s)) }
        : prev,
    );

  const patchSlide = useCallback(async (slideId: string, patch: Partial<Slide>) => {
    const updated = await api.patchSlide(slideId, patch);
    applySlide(updated);
    return updated;
  }, []);

  const regenerateText = useCallback(
    async (slideId: string, instruction?: string) => {
      if (!carouselId) return;
      const updated = await api.regenerateText(carouselId, slideId, instruction);
      applySlide(updated);
      return updated;
    },
    [carouselId],
  );

  const regenerateImage = useCallback(
    async (slideId: string) => {
      if (!carouselId) return;
      const updated = await api.regenerateImage(carouselId, slideId);
      applySlide(updated);
      return updated;
    },
    [carouselId],
  );

  return { carousel, loading, error, reload, patchSlide, regenerateText, regenerateImage };
}
