'use client';

import { useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  getDay,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const SAMPLE_EVENTS: Record<string, string[]> = {
  [format(new Date(), 'yyyy-MM-dd')]: ['오늘 일정'],
  [format(addMonths(new Date(), 0), 'yyyy-MM-') + '15']: ['팀 미팅'],
  [format(addMonths(new Date(), 0), 'yyyy-MM-') + '20']: ['월간 보고'],
};

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const startPadding = getDay(monthStart);

  const selectedDateKey = format(selectedDate, 'yyyy-MM-dd');
  const selectedEvents = SAMPLE_EVENTS[selectedDateKey] ?? [];

  return (
    <div className="flex flex-col">
      <header className="bg-white border-b border-gray-100 px-5 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-gray-900">캘린더</h1>
        </div>
      </header>

      <div className="bg-white mx-4 mt-4 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
          <button
            onClick={() => setCurrentMonth((prev) => subMonths(prev, 1))}
            className="p-1 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <span className="font-bold text-gray-900 text-base">
            {format(currentMonth, 'yyyy년 M월', { locale: ko })}
          </span>
          <button
            onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))}
            className="p-1 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="grid grid-cols-7 px-2 py-1">
          {WEEKDAY_LABELS.map((label, idx) => (
            <div
              key={label}
              className={cn(
                'text-center text-xs font-semibold py-2',
                idx === 0 && 'text-red-400',
                idx === 6 && 'text-blue-400',
                idx > 0 && idx < 6 && 'text-gray-400'
              )}
            >
              {label}
            </div>
          ))}

          {Array.from({ length: startPadding }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}

          {days.map((day) => {
            const dayKey = format(day, 'yyyy-MM-dd');
            const isToday = isSameDay(day, new Date());
            const isSelected = isSameDay(day, selectedDate);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const hasEvent = Boolean(SAMPLE_EVENTS[dayKey]);
            const dayOfWeek = getDay(day);

            return (
              <button
                key={dayKey}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  'flex flex-col items-center justify-center py-1 mx-0.5 my-0.5 rounded-xl transition-colors relative',
                  isSelected && 'bg-primary text-primary-foreground',
                  !isSelected && isToday && 'bg-primary/10 text-primary font-bold',
                  !isSelected && !isToday && 'hover:bg-gray-50 active:bg-gray-100',
                  !isCurrentMonth && 'opacity-30'
                )}
              >
                <span
                  className={cn(
                    'text-sm leading-none',
                    !isSelected && dayOfWeek === 0 && 'text-red-400',
                    !isSelected && dayOfWeek === 6 && 'text-blue-400',
                    !isSelected && !isToday && dayOfWeek !== 0 && dayOfWeek !== 6 && 'text-gray-700',
                    isSelected && 'text-white font-semibold'
                  )}
                >
                  {format(day, 'd')}
                </span>
                {hasEvent && (
                  <span
                    className={cn(
                      'w-1 h-1 rounded-full mt-0.5',
                      isSelected ? 'bg-white' : 'bg-primary'
                    )}
                  />
                )}
                {!hasEvent && <span className="w-1 h-1 mt-0.5" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-4 mt-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-700">
            {format(selectedDate, 'M월 d일 (eee)', { locale: ko })}
          </span>
        </div>

        {selectedEvents.length > 0 ? (
          <div className="flex flex-col gap-2">
            {selectedEvents.map((event, idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm flex items-center gap-3"
              >
                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                <span className="text-sm text-gray-700">{event}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 px-4 py-6 shadow-sm flex flex-col items-center gap-2">
            <CalendarDays className="w-8 h-8 text-gray-200" />
            <p className="text-sm text-gray-400">등록된 일정이 없습니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
