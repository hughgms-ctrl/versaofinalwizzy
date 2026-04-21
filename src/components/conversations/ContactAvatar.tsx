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

// Module-level set to avoid hammering the edge function for the same contact
const refetchedContacts = new Set<string>();
const failedUrls = new Set<string>();

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

  const handleError = () => {
    if (src) failedUrls.add(src);
    setErrored(true);

    // Try to refetch fresh profile picture (WhatsApp URLs expire)
    if (
      autoRefetch &&
      contactId &&
      session?.access_token &&
      !refetchedContacts.has(contactId)
    ) {
      refetchedContacts.add(contactId);
      supabase.functions
        .invoke('zapi-contact-profile', {
          body: { contactId, instanceId: instanceId || undefined },
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        .then(({ data }) => {
          if (data?.avatarUrl) {
            // New URL - invalidate so UI re-renders with fresh src
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
          }
        })
        .catch(() => {
          /* silent */
        });
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
