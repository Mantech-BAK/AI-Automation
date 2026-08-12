import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Wrench,
  Calendar as CalendarIcon,
  MapPin,
  User,
} from 'lucide-react';

interface ScheduleItem {
  id: string;
  equipment_name?: string | null;
  site_location?: string | null;
  due_date?: string | null;
  status?: string;
  technician_name?: string | null;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dueDateKey(dueDate?: string | null): string | null {
  if (!dueDate) return null;
  return dueDate.slice(0, 10);
}

function formatDueDate(dueDate?: string | null): string {
  if (!dueDate) return '-';
  const hasOffset = /[Zz]$|[+-]\d{2}:\d{2}$/.test(dueDate);
  const iso = hasOffset ? dueDate : `${dueDate.slice(0, 10)}T00:00:00Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return dueDate;
  return date.toLocaleString('en-GB', {
    timeZone: 'Asia/Bahrain',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function CalendarPage() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const response = await fetch('/api/dashboard/schedules');

      if (!response.ok) {
        throw new Error(`Failed to load schedules: ${response.statusText}`);
      }

      const json: ScheduleItem[] = await response.json();
      setSchedules(json);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching data:', fetchError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const item of schedules) {
      const key = dueDateKey(item.due_date);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
    }
    return map;
  }, [schedules]);

  const todayKey = toDateKey(new Date());
  const sevenDaysFromNowKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return toDateKey(d);
  }, []);

  const getEventColor = (item: ScheduleItem): 'red' | 'orange' | 'blue' => {
    const key = dueDateKey(item.due_date);
    if (!key) return 'blue';
    if (key < todayKey) return 'red';
    if (key <= sevenDaysFromNowKey) return 'orange';
    return 'blue';
  };

  const eventDotClass = (color: 'red' | 'orange' | 'blue') => {
    switch (color) {
      case 'red': return 'bg-red-500';
      case 'orange': return 'bg-amber-500';
      default: return 'bg-blue-500';
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-100 text-emerald-700';
      case 'open': return 'bg-blue-100 text-blue-700';
      case 'pending': return 'bg-amber-100 text-amber-700';
      case 'approved': return 'bg-cyan-100 text-cyan-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const getEventsForDate = (date: Date) => eventsByDate.get(toDateKey(date)) ?? [];

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };

  const isToday = (date: Date) => toDateKey(date) === todayKey;

  const isSelected = (date: Date) => {
    if (!selectedDate) return false;
    return toDateKey(date) === toDateKey(selectedDate);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600 bg-red-50 border border-red-200 rounded-xl p-6">
          <p className="font-semibold">Failed to load calendar data</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const days = getDaysInMonth(currentDate);
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Calendar</h1>
          <p className="text-slate-500 mt-1">View maintenance schedules and tasks</p>
        </div>
        <button
          onClick={goToToday}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <CalendarIcon size={18} />
          Today
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Month Navigation */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ChevronLeft size={20} className="text-slate-600" />
            </button>
            <h2 className="text-lg font-semibold text-slate-800">{monthName}</h2>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ChevronRight size={20} className="text-slate-600" />
            </button>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                className="px-2 py-3 text-center text-xs font-semibold text-slate-500 uppercase border-b border-slate-200"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7">
            {days.map((date, idx) => {
              if (!date) {
                return <div key={`empty-${idx}`} className="min-h-[80px] border-b border-r border-slate-100" />;
              }

              const events = getEventsForDate(date);
              const today = isToday(date);
              const selected = isSelected(date);

              return (
                <button
                  key={date.toISOString()}
                  onClick={() => setSelectedDate(date)}
                  className={`
                    min-h-[80px] p-2 border-b border-r border-slate-100 text-left
                    transition-colors hover:bg-slate-50
                    ${selected ? 'bg-cyan-50' : today ? 'bg-slate-50' : ''}
                  `}
                >
                  <div className={`
                    w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-1
                    ${today ? 'bg-cyan-500 text-white' : 'text-slate-700'}
                  `}>
                    {date.getDate()}
                  </div>
                  <div className="space-y-1">
                    {events.slice(0, 2).map((event) => (
                      <div
                        key={event.id}
                        className={`px-1.5 py-0.5 text-xs rounded truncate text-white ${eventDotClass(getEventColor(event))}`}
                      >
                        {event.equipment_name || 'Untitled'}
                      </div>
                    ))}
                    {events.length > 2 && (
                      <div className="text-xs text-slate-400 px-1">
                        +{events.length - 2} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Date Details */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-slate-800">
              {selectedDate ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a date'}
            </h3>
          </div>
          <div className="p-6">
            {!selectedDate ? (
              <div className="text-center py-8">
                <CalendarIcon size={40} className="mx-auto text-slate-300 mb-2" />
                <p className="text-slate-500">Click a date to see what's due</p>
              </div>
            ) : selectedEvents.length === 0 ? (
              <div className="text-center py-8">
                <CalendarIcon size={40} className="mx-auto text-slate-300 mb-2" />
                <p className="text-slate-500">No maintenance due on this date</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedEvents.map((event) => (
                  <div key={event.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${eventDotClass(getEventColor(event))}`}>
                        <Wrench size={16} className="text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 text-sm">{event.equipment_name || 'Untitled'}</p>
                        <div className="mt-1.5 space-y-1 text-xs text-slate-500">
                          {event.site_location && (
                            <p className="flex items-center gap-1.5">
                              <MapPin size={12} />
                              {event.site_location}
                            </p>
                          )}
                          {event.technician_name && (
                            <p className="flex items-center gap-1.5">
                              <User size={12} />
                              {event.technician_name}
                            </p>
                          )}
                          {event.due_date && (
                            <p className="flex items-center gap-1.5">
                              <CalendarIcon size={12} />
                              {formatDueDate(event.due_date)}
                            </p>
                          )}
                        </div>
                        <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(event.status)}`}>
                          {event.status || 'unknown'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
