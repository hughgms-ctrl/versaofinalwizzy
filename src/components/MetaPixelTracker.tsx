import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { loadMetaPixel, MetaPixelSettings, trackMetaEvent } from '@/lib/metaPixel';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zaobtetbjpuzibjymhzw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emlianltaHp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzc5MzksImV4cCI6MjA4NzcxMzkzOX0.HBUI1OK1eYq9FE2SzIvuAkxuCG0frApCQZqcjjDx43k';

async function fetchMetaPixelSettings(): Promise<MetaPixelSettings | null> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/billing-plans?tracking=1&t=${Date.now()}`, {
    cache: 'no-store',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'Nao foi possivel carregar o pixel.');
  return payload?.tracking?.meta_pixel || null;
}

export function MetaPixelTracker() {
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    fetchMetaPixelSettings()
      .then((settings) => {
        if (cancelled) return;
        loadMetaPixel(settings);
      })
      .catch((error) => console.warn('Meta Pixel settings failed', error));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    trackMetaEvent('PageView');
  }, [location.pathname, location.search]);

  return null;
}
