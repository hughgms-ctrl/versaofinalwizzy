import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Calendar, CheckCircle, Clock, Link2, LogOut, Loader2, Users, Video, Trash2, Copy, ExternalLink } from 'lucide-react';
import { useCalendarConfig, useAllCalendarConfigs, useCalendarBookings, useUpsertCalendarConfig, useDisconnectCalendar, CalendarConfig } from '@/hooks/useCalendarConfig';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';
import { enforceEntryCreationLimit, enforceEntryFeatureAccess } from '@/lib/entryFlow';

const DAYS_OF_WEEK = [
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

export function CalendarTab() {
  const { data: myConfig, isLoading } = useCalendarConfig();
  const { data: allConfigs = [] } = useAllCalendarConfigs();
  const { profile } = useAuth();
  const upsertConfig = useUpsertCalendarConfig();
  const disconnectCalendar = useDisconnectCalendar();

  const [selectedMember, setSelectedMember] = useState<string>('all');
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const { data: bookings = [] } = useCalendarBookings(
    selectedMember === 'all' ? null : selectedMember
  );

  const handleSignInWithGoogle = async () => {
    if (!enforceEntryFeatureAccess('allow_connect_google_calendar', 'conectar Google Agenda')) return;
    if (!enforceEntryCreationLimit('max_google_calendars', allConfigs.length, 'agendas Google')) return;
    // O `state` do OAuth é montado e assinado no servidor a partir do JWT
    // (invoke anexa o header de auth). O front nunca escolhe organization_id.
    const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
      body: { action: 'login' },
    });
    if (error || !data?.authUrl) {
      toast({ title: 'Erro ao conectar Google Agenda', description: error?.message, variant: 'destructive' });
      return;
    }
    window.location.href = data.authUrl;
  };

  const handleCopyLink = () => {
    const slug = allConfigs[0]?.booking_slug || profile?.organization_id;
    const url = `${window.location.origin}/agendar/${slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copiado!' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Tabs defaultValue="accounts" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="accounts" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Contas
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Calendário
          </TabsTrigger>
          <TabsTrigger value="availability" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Disponibilidade
          </TabsTrigger>
          <TabsTrigger value="public-link" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Link Público
          </TabsTrigger>
        </TabsList>

        {/* ===== ACCOUNTS TAB ===== */}
        <TabsContent value="accounts">
          <div className="space-y-4">
            {/* My account */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground text-base">Minha Agenda</CardTitle>
                <CardDescription>Conecte sua conta Google para receber agendamentos</CardDescription>
              </CardHeader>
              <CardContent>
                {myConfig?.is_connected ? (
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{myConfig.google_email}</p>
                        <p className="text-xs text-muted-foreground">Conectado • {myConfig.display_name}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground gap-1.5"
                      onClick={() => disconnectCalendar.mutate(myConfig.id)}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Desconectar
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8 space-y-4">
                    <div className="mx-auto h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                      <Calendar className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">Conecte seu Google Agenda</p>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                        Permita que agentes de IA consultem sua disponibilidade e marquem reuniões com Google Meet.
                      </p>
                    </div>
                    <Button onClick={handleSignInWithGoogle} size="lg" className="gap-2">
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      Entrar com Google
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* All connected accounts */}
            {allConfigs.length > 0 && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground text-base">Agendas Conectadas da Equipe</CardTitle>
                  <CardDescription>{allConfigs.length} conta(s) conectada(s)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {allConfigs.map((cfg) => (
                    <div key={cfg.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">
                            {(cfg.display_name || cfg.google_email || '?')[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{cfg.display_name || 'Sem nome'}</p>
                          <p className="text-xs text-muted-foreground">{cfg.google_email}</p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">Ativa</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ===== CALENDAR TAB ===== */}
        <TabsContent value="calendar">
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-foreground text-base">Agendamentos</CardTitle>
                  <CardDescription>Visualize reuniões marcadas</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={selectedMember} onValueChange={setSelectedMember}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filtrar por membro" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os membros</SelectItem>
                      {allConfigs.map((cfg) => (
                        <SelectItem key={cfg.user_id || cfg.id} value={cfg.user_id || cfg.id}>
                          {cfg.display_name || cfg.google_email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CalendarView
                bookings={bookings}
                currentMonth={currentMonth}
                onMonthChange={setCurrentMonth}
                allConfigs={allConfigs}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== AVAILABILITY TAB ===== */}
        <TabsContent value="availability">
          <AvailabilityEditor config={myConfig} onSave={(rules, duration) => {
            upsertConfig.mutate({
              availability_rules: rules,
              meeting_duration_minutes: duration,
            });
          }} />
        </TabsContent>

        {/* ===== PUBLIC LINK TAB ===== */}
        <TabsContent value="public-link">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base">Link Público de Agendamento</CardTitle>
              <CardDescription>Compartilhe com clientes para que agendem automaticamente</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <code className="text-sm text-foreground flex-1 truncate">
                  {window.location.origin}/agendar/{allConfigs[0]?.booking_slug || profile?.organization_id || 'seu-slug'}
                </code>
                <Button variant="ghost" size="sm" onClick={handleCopyLink} className="gap-1.5">
                  <Copy className="h-3.5 w-3.5" />
                  Copiar
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Slug personalizado</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="minha-empresa"
                    defaultValue={allConfigs[0]?.booking_slug || ''}
                    onBlur={(e) => {
                      if (e.target.value) {
                        upsertConfig.mutate({ booking_slug: e.target.value });
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  O cliente escolherá um horário disponível e a reunião será criada automaticamente com link do Google Meet.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-2">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium text-foreground">Google Meet</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ao confirmar o agendamento, um link do Google Meet é gerado automaticamente e enviado ao cliente.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===== Calendar View Component =====
function CalendarView({ bookings, currentMonth, onMonthChange, allConfigs }: {
  bookings: any[];
  currentMonth: Date;
  onMonthChange: (d: Date) => void;
  allConfigs: CalendarConfig[];
}) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const dayBookings = selectedDate
    ? bookings.filter(b => isSameDay(parseISO(b.starts_at), selectedDate))
    : [];

  const getMemberName = (userId: string | null) => {
    if (!userId) return 'N/A';
    const cfg = allConfigs.find(c => c.user_id === userId);
    return cfg?.display_name || cfg?.google_email || 'N/A';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Calendar grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => {
            const d = new Date(currentMonth);
            d.setMonth(d.getMonth() - 1);
            onMonthChange(d);
          }}>←</Button>
          <span className="text-sm font-medium text-foreground capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <Button variant="ghost" size="sm" onClick={() => {
            const d = new Date(currentMonth);
            d.setMonth(d.getMonth() + 1);
            onMonthChange(d);
          }}>→</Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
            <div key={i} className="text-xs font-medium text-muted-foreground py-2">{d}</div>
          ))}
          {/* Offset for first day */}
          {Array.from({ length: monthStart.getDay() }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {days.map((day) => {
            const hasBooking = bookings.some(b => isSameDay(parseISO(b.starts_at), day));
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`relative p-2 rounded-lg text-sm transition-colors ${
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : isToday(day)
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                {day.getDate()}
                {hasBooking && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day detail */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">
          {selectedDate
            ? format(selectedDate, "d 'de' MMMM", { locale: ptBR })
            : 'Selecione um dia'}
        </h4>
        {dayBookings.length === 0 && selectedDate && (
          <p className="text-xs text-muted-foreground">Nenhum agendamento neste dia.</p>
        )}
        {dayBookings.map((b) => (
          <div key={b.id} className="p-3 rounded-lg border border-border bg-muted/30 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                {format(parseISO(b.starts_at), 'HH:mm')} - {format(parseISO(b.ends_at), 'HH:mm')}
              </span>
              <Badge variant="secondary" className="text-xs">{b.status}</Badge>
            </div>
            <p className="text-sm text-foreground">{b.client_name || 'Cliente'}</p>
            <p className="text-xs text-muted-foreground">{b.client_phone} • {getMemberName(b.assigned_user_id)}</p>
            {b.meet_link && (
              <a href={b.meet_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <Video className="h-3 w-3" /> Google Meet
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Availability Editor Component =====
function AvailabilityEditor({ config, onSave }: {
  config: CalendarConfig | null | undefined;
  onSave: (rules: any[], duration: number) => void;
}) {
  const defaultRules = [
    { day: 1, start: '09:00', end: '18:00', enabled: true },
    { day: 2, start: '09:00', end: '18:00', enabled: true },
    { day: 3, start: '09:00', end: '18:00', enabled: true },
    { day: 4, start: '09:00', end: '18:00', enabled: true },
    { day: 5, start: '09:00', end: '18:00', enabled: true },
    { day: 6, start: '09:00', end: '13:00', enabled: false },
    { day: 0, start: '09:00', end: '13:00', enabled: false },
  ];

  const existingRules = config?.availability_rules || [];
  const [rules, setRules] = useState(() =>
    defaultRules.map(dr => {
      const existing = existingRules.find((r: any) => r.day === dr.day);
      return existing ? { ...existing, enabled: true } : dr;
    })
  );
  const [duration, setDuration] = useState(config?.meeting_duration_minutes || 30);

  const updateRule = (day: number, field: string, value: any) => {
    setRules(rules.map(r => r.day === day ? { ...r, [field]: value } : r));
  };

  const handleSave = () => {
    const activeRules = rules.filter(r => r.enabled).map(({ enabled, ...rest }) => rest);
    onSave(activeRules, duration);
  };

  if (!config?.is_connected) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">Conecte sua conta Google primeiro na aba "Contas".</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground text-base">Minha Disponibilidade</CardTitle>
        <CardDescription>Configure seus horários disponíveis para agendamento</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Duração padrão da reunião</Label>
          <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 minutos</SelectItem>
              <SelectItem value="30">30 minutos</SelectItem>
              <SelectItem value="45">45 minutos</SelectItem>
              <SelectItem value="60">1 hora</SelectItem>
              <SelectItem value="90">1h30</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          {rules.map((rule) => {
            const dayLabel = DAYS_OF_WEEK.find(d => d.value === rule.day)?.label || '';
            return (
              <div key={rule.day} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(v) => updateRule(rule.day, 'enabled', v)}
                />
                <span className="text-sm font-medium text-foreground w-20">{dayLabel}</span>
                <Input
                  type="time"
                  value={rule.start}
                  onChange={(e) => updateRule(rule.day, 'start', e.target.value)}
                  disabled={!rule.enabled}
                  className="w-28"
                />
                <span className="text-muted-foreground text-sm">até</span>
                <Input
                  type="time"
                  value={rule.end}
                  onChange={(e) => updateRule(rule.day, 'end', e.target.value)}
                  disabled={!rule.enabled}
                  className="w-28"
                />
              </div>
            );
          })}
        </div>

        <Button onClick={handleSave}>Salvar Disponibilidade</Button>
      </CardContent>
    </Card>
  );
}
