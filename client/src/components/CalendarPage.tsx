import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Wrench,
  Calendar as CalendarIcon,
} from 'lucide-react';

interface MaintenanceTask {
  id: string;
  title: string;
  status?: string;
  due_date?: string | null;
}

interface Schedule {
  id: string;
  title: string;
  next_due_date?: string | null;
}

export default function CalendarPage() {
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [tasksRes, schedulesRes] = await Promise.all([
        fetch('/api/dashboard/tasks'),
        fetch('/api/dashboard/schedules'),
      ]);

      if (!tasksRes.ok) {
        throw new Error(`Failed to load maintenance tasks: ${tasksRes.statusText}`);
      }
      if (!schedulesRes.ok) {
        throw new Error(`Failed to load schedules: ${schedulesRes.statusText}`);
      }

      const tasksJson = await tasksRes.json();
      const schedulesJson = await schedulesRes.json();

      setTasks(tasksJson.tasks ?? tasksJson ?? []);
      setSchedules(schedulesJson.schedules ?? schedulesJson ?? []);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Error fetching data:', fetchError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

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

  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];

    const taskEvents = tasks.filter((task) => {
      if (!task.due_date) return false;
      return task.due_date === dateStr;
    });

    const scheduleEvents = schedules.filter((schedule) => {
      if (!schedule.next_due_date) return false;
      return schedule.next_due_date === dateStr;
    });

    return [...taskEvents.map(t => ({ type: 'task' as const, data: t })), ...scheduleEvents.map(s => ({ type: 'schedule' as const, data: s }))];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-500';
      case 'in_progress': return 'bg-blue-500';
      case 'overdue': return 'bg-red-500';
      case 'pending': return 'bg-amber-500';
      default: return 'bg-slate-500';
    }
  };

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

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date: Date) => {
    if (!selectedDate) return false;
    return date.toDateString() === selectedDate.toDateString();
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
                    {events.slice(0, 2).map((event, i) => (
                      <div
                        key={i}
                        className={`
                          px-1.5 py-0.5 text-xs rounded truncate
                          ${event.type === 'task' ? getStatusColor((event.data as MaintenanceTask).status) : 'bg-purple-500'}
                          text-white
                        `}
                      >
                        {event.type === 'task' ? (event.data as MaintenanceTask).title : (event.data as Schedule).title}
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
            {selectedDate && selectedEvents.length === 0 ? (
              <div className="text-center py-8">
                <CalendarIcon size={40} className="mx-auto text-slate-300 mb-2" />
                <p className="text-slate-500">No events scheduled</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedEvents.map((event, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-start gap-3">
                      <div className={`
                        w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                        ${event.type === 'task' ? getStatusColor((event.data as MaintenanceTask).status) : 'bg-purple-500'}
                      `}>
                        <Wrench size={16} className="text-white" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800 text-sm">
                          {event.type === 'task' ? (event.data as MaintenanceTask).title : (event.data as Schedule).title}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 capitalize">
                          {event.type === 'task' ? (event.data as MaintenanceTask).status.replace('_', ' ') : `${(event.data as Schedule).frequency} schedule`}
                        </p>
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
