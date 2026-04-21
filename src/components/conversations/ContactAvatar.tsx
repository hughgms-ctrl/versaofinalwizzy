import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

interface ContactAvatarProps {
  src?: string | null;
  name?: string | null;
  phone?: string | null;
  contactId?: string | null;
  instanceId?: string | null;
  size?: number; // pixel size (square)
  className?: string;
  /** When true, on image error tries to refetch profile from UAZAPI */
  autoRefetch?: boolean;
}

// Track in-flight refetches per contact to avoid duplicate calls,
// but allow retrying again later (different src) instead of permanently blocking.
const inflightRefetch = new Map<string, Promise<void>>();
const failedUrls = new Set<string>();
// Hosts whose URLs are temporary and expire (WhatsApp CDN). Anything else
// (our own Supabase storage URL) is considered permanent.
const TEMPORARY_HOSTS = ['pps.whatsapp.net', 'mmg.whatsapp.net', 'media.whatsapp.net'];
function isTemporaryUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return TEMPORARY_HOSTS.some((h) => u.hostname.endsWith(h));
  } catch {
    return false;
  }
}

function getInitials(name?: string | null, phone?: string | null) {
  if (name && name.trim()) {
    return name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    return digits.slice(-2) || '??';
  }
  return '??';
}

export function ContactAvatar({
  src,
  name,
  phone,
  contactId,
  instanceId,
  size = 40,
  className,
  autoRefetch = true,
}: ContactAvatarProps) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [errored, setErrored] = useState(false);
  const lastSrcRef = useRef<string | null | undefined>(src);

  // Reset error if src changes to a new value
  useEffect(() => {
    if (src !== lastSrcRef.current) {
      lastSrcRef.current = src;
      // Only reset if the new src hasn't been marked as failed
      setErrored(src ? failedUrls.has(src) : true);
    }
  }, [src]);

  const showImage = !!src && !errored && !failedUrls.has(src);
  const initials = getInitials(name, phone);

  const triggerRefetch = () => {
    if (!autoRefetch || !contactId || !session?.access_token) return;
    if (inflightRefetch.has(contactId)) return;

    const p = supabase.functions
      .invoke('zapi-contact-profile', {
        body: { contactId, instanceId: instanceId || undefined },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      .then(({ data }) => {
        if (data?.avatarUrl) {
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          queryClient.invalidateQueries({ queryKey: ['contacts'] });
        }
      })
      .catch(() => {
        /* silent */
      })
      .finally(() => {
        // Free the slot after a short cooldown so the same contact can be retried later
        setTimeout(() => inflightRefetch.delete(contactId), 30_000);
      });

    inflightRefetch.set(contactId, p);
  };

  const handleError = () => {
    if (src) failedUrls.add(src);
    setErrored(true);
    // Only auto-refetch when the failed URL is a known-temporary WhatsApp URL.
    // Permanent storage URLs that fail are likely transient network errors.
    if (isTemporaryUrl(src)) {
      triggerRefetch();
    }
  };

  return (
    <div
      className={cn(
        'rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center overflow-hidden relative',
        className
      )}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    >
      {/* Initials sit in background as fallback - always rendered */}
      <span
        data-sensitive
        className="absolute inset-0 flex items-center justify-center font-semibold text-primary select-none"
        style={{ fontSize: Math.max(10, Math.round(size * 0.32)) }}
      >
        {initials}
      </span>
      {showImage && (
        <img
          src={src!}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={handleError}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ width: size, height: size }}
        />
      )}
    </div>
  );
}
