import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, Clock, CheckCircle, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SlotInfo {
  start: string;
  end: string;
}

interface MemberAvailability {
  user_id: string;
  display_name: string;
  free_slots: SlotInfo[];
}

export default function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<SlotInfo | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<{ meet_link: string } | null>(null);

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');

  // Resolve slug to organization_id
  useEffect(() => {
    async function resolveSlug() {
      if (!slug) return;
      // Try booking_slug first, then organization_id directly
      const { data } = await supabase
        .from('calendar_configs' as any)
        .select('organization_id')
        .eq('booking_slug', slug)
        .eq('is_connected', true)
        .limit(1)
        .maybeSingle();

      if (data) {
        setOrgId((data as any).organization_id);
      } else {
        // Try as org id
        const { data: d2 } = await supabase
          .from('calendar_configs' as any)
          .select('organization_id')
          .eq('organization_id', slug)
          .eq('is_connected', true)
          .limit(1)
          .maybeSingle();
        if (d2) setOrgId((d2 as any).organization_id);
      }
    }
    resolveSlug();
  }, [slug]);

  // Load available dates (next 14 days)
  const availableDates = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(new Date(), i + 1);
    return format(d, 'yyyy-MM-dd');
  });

  // Load slots when date selected
  useEffect(() => {
    if (!selectedDate || !orgId) return;
    setSlotsLoading(true);
    setSlots([]);
    setSelectedSlot(null);

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'zaobtetbjpuzibjymhzw';
    fetch(`https://${projectId}.supabase.co/functions/v1/google-calendar-availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: orgId, date: selectedDate }),
    })
      .then(r => r.json())
      .then(data => {
        // Merge all members' free slots
        const allSlots: SlotInfo[] = [];
        (data.members || []).forEach((m: MemberAvailability) => {
          m.free_slots.forEach(s => {
            if (!allSlots.some(ex => ex.start === s.start)) {
              allSlots.push(s);
            }
          });
        });
        allSlots.sort((a, b) => a.start.localeCompare(b.start));
        setSlots(allSlots);
      })
      .catch(console.error)
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, orgId]);

  const handleBook = async () => {
    if (!selectedSlot || !orgId || !clientName) return;
    setBooking(true);

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'zaobtetbjpuzibjymhzw';
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/google-calendar-book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: orgId,
          assigned_user_id: 'random',
          starts_at: selectedSlot.start,
          client_name: clientName,
          client_phone: clientPhone,
          client_email: clientEmail,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBooked({ meet_link: data.meet_link });
    } catch (err: any) {
      console.error(err);
      alert('Erro ao agendar: ' + err.message);
    } finally {
      setBooking(false);
    }
  };

  if (!orgId && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Link de agendamento não encontrado.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (booked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Reunião Confirmada!</h2>
            <p className="text-sm text-muted-foreground">
              {format(parseISO(selectedSlot!.start), "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
            </p>
            {booked.meet_link && (
              <a
                href={booked.meet_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              >
                <Video className="h-4 w-4" />
                Entrar no Google Meet
              </a>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 flex items-start justify-center pt-12">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Agendar Reunião
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Pick date */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Escolha uma data</Label>
            <div className="flex flex-wrap gap-2">
              {availableDates.map(d => (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                    selectedDate === d
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border bg-muted/30 text-foreground hover:bg-muted'
                  }`}
                >
                  <div className="text-xs capitalize">{format(new Date(d + 'T12:00:00'), 'EEE', { locale: ptBR })}</div>
                  <div className="font-medium">{format(new Date(d + 'T12:00:00'), 'dd/MM')}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Pick slot */}
          {selectedDate && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Horários disponíveis</Label>
              {slotsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                </div>
              ) : slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum horário disponível nesta data.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {slots.map(s => (
                    <button
                      key={s.start}
                      onClick={() => setSelectedSlot(s)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        selectedSlot?.start === s.start
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-foreground hover:bg-muted'
                      }`}
                    >
                      {format(parseISO(s.start), 'HH:mm')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Client info */}
          {selectedSlot && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Seus dados</Label>
              <Input placeholder="Nome *" value={clientName} onChange={e => setClientName(e.target.value)} />
              <Input placeholder="Telefone" value={clientPhone} onChange={e => setClientPhone(e.target.value)} />
              <Input placeholder="Email" type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} />

              <Button
                onClick={handleBook}
                disabled={!clientName || booking}
                className="w-full gap-2"
                size="lg"
              >
                {booking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Confirmar Agendamento
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
