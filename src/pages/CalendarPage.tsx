import { MainLayout } from '@/components/layout/MainLayout';
import { useCalendarBookings, useAllCalendarConfigs } from '@/hooks/useCalendarConfig';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EventContentArg } from '@fullcalendar/core';

export default function CalendarPage() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { data: bookings = [], isLoading } = useCalendarBookings(selectedUserId);
  const { data: configs = [] } = useAllCalendarConfigs();

  const events = useMemo(() => {
    return bookings.map(booking => ({
      id: booking.id,
      title: booking.client_name || 'Agendamento',
      start: booking.starts_at,
      end: booking.ends_at,
      backgroundColor: booking.status === 'confirmed' ? 'hsl(var(--primary))' : 
                       booking.status === 'cancelled' ? 'hsl(var(--destructive))' : 
                       'hsl(var(--muted))',
      borderColor: booking.status === 'confirmed' ? 'hsl(var(--primary))' : 
                   booking.status === 'cancelled' ? 'hsl(var(--destructive))' : 
                   'hsl(var(--muted-foreground))',
      extendedProps: {
        client_email: booking.client_email,
        client_phone: booking.client_phone,
        meet_link: booking.meet_link,
        status: booking.status,
        internal_summary: booking.internal_summary,
      }
    }));
  }, [bookings]);

  const renderEventContent = (eventInfo: EventContentArg) => {
    return (
      <div className="px-1 py-0.5 text-xs overflow-hidden">
        <div className="font-medium truncate">{eventInfo.event.title}</div>
        {eventInfo.event.extendedProps.meet_link && (
          <div className="text-[10px] opacity-80 truncate">📹 Meet</div>
        )}
      </div>
    );
  };

  return (
    <MainLayout title="Agenda" subtitle="Visualize e gerencie todos os agendamentos">
      <div className="flex flex-col h-[calc(100vh-12rem)]">
        <div className="mb-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Agendamentos</h2>
            <p className="text-sm text-muted-foreground">Visualize reuniões marcadas</p>
          </div>
          <Select value={selectedUserId || 'all'} onValueChange={(val) => setSelectedUserId(val === 'all' ? null : val)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todos os membros" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os membros</SelectItem>
              {configs.map(config => (
                <SelectItem key={config.id} value={config.user_id || config.id}>
                  {config.display_name || config.google_email || 'Sem nome'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 bg-background border rounded-lg overflow-hidden calendar-container">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Carregando agendamentos...</p>
            </div>
          ) : (
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
              initialView="timeGridWeek"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
              }}
              buttonText={{
                today: 'Hoje',
                month: 'Mês',
                week: 'Semana',
                day: 'Dia',
                list: 'Lista'
              }}
              height="100%"
              locale="pt-br"
              events={events}
              eventContent={renderEventContent}
              slotMinTime="06:00:00"
              slotMaxTime="22:00:00"
              allDaySlot={false}
              nowIndicator={true}
              editable={false}
              selectable={true}
              selectMirror={true}
              dayMaxEvents={true}
              weekends={true}
              eventClick={(info) => {
                const props = info.event.extendedProps;
                alert(`
Agendamento: ${info.event.title}
Horário: ${info.event.start?.toLocaleString('pt-BR')}
Status: ${props.status}
${props.client_phone ? `Telefone: ${props.client_phone}` : ''}
${props.client_email ? `Email: ${props.client_email}` : ''}
${props.meet_link ? `Link: ${props.meet_link}` : ''}
${props.internal_summary ? `Resumo: ${props.internal_summary}` : ''}
                `.trim());
              }}
            />
          )}
        </div>

        <style>{`
          .calendar-container .fc {
            font-family: inherit;
          }
          
          .calendar-container .fc-theme-standard td,
          .calendar-container .fc-theme-standard th {
            border-color: hsl(var(--border));
          }
          
          .calendar-container .fc-scrollgrid {
            border-color: hsl(var(--border));
          }
          
          .calendar-container .fc-col-header-cell {
            background: hsl(var(--muted) / 0.3);
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.75rem;
            color: hsl(var(--muted-foreground));
            padding: 8px 4px;
          }
          
          .calendar-container .fc-daygrid-day-number,
          .calendar-container .fc-timegrid-slot-label {
            color: hsl(var(--foreground));
          }
          
          .calendar-container .fc-button {
            background: hsl(var(--primary));
            border-color: hsl(var(--primary));
            color: hsl(var(--primary-foreground));
            text-transform: capitalize;
            font-weight: 500;
            padding: 0.5rem 1rem;
          }
          
          .calendar-container .fc-button:hover {
            background: hsl(var(--primary) / 0.9);
            border-color: hsl(var(--primary) / 0.9);
          }
          
          .calendar-container .fc-button:disabled {
            opacity: 0.5;
          }
          
          .calendar-container .fc-button-active {
            background: hsl(var(--primary)) !important;
            border-color: hsl(var(--primary)) !important;
          }
          
          .calendar-container .fc-toolbar-title {
            font-size: 1.5rem;
            font-weight: 600;
            color: hsl(var(--foreground));
          }
          
          .calendar-container .fc-timegrid-slot {
            height: 3rem;
          }
          
          .calendar-container .fc-timegrid-slot-label {
            font-size: 0.75rem;
          }
          
          .calendar-container .fc-event {
            border-radius: 4px;
            border-width: 1px;
            padding: 2px;
            cursor: pointer;
          }
          
          .calendar-container .fc-event:hover {
            opacity: 0.85;
          }
          
          .calendar-container .fc-day-today {
            background: hsl(var(--accent) / 0.1) !important;
          }
          
          .calendar-container .fc-timegrid-now-indicator-line {
            border-color: hsl(var(--destructive));
          }
          
          .calendar-container .fc-timegrid-now-indicator-arrow {
            border-color: hsl(var(--destructive));
          }
          
          .calendar-container .fc-list-event:hover td {
            background: hsl(var(--accent));
          }
        `}</style>
      </div>
    </MainLayout>
  );
}
