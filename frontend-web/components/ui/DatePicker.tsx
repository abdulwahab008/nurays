'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface DatePickerProps {
  value?: string; // YYYY-MM-DD format
  onChange: (value: string) => void;
  min?: string; // YYYY-MM-DD
  max?: string; // YYYY-MM-DD
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  error?: string;
  /** Id for the trigger button, so a label elsewhere can point at it. */
  id?: string;
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'Select date',
  label,
  disabled = false,
  className = '',
  error,
  id,
}: DatePickerProps) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial selected date or default to current month/year
  const selectedDate = value ? new Date(value + 'T00:00:00') : null;
  const [viewDate, setViewDate] = useState<Date>(selectedDate || new Date());

  // Close calendar on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Follow the value when it changes from outside (adjusted during the render, so there is no extra pass).
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    if (value) setViewDate(new Date(value + 'T00:00:00'));
  }

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  // Days in month calculation
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setViewDate(new Date(year, month + 1, 1));
  };

  const formatDateStr = (y: number, m: number, d: number): string => {
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  };

  const handleSelectDay = (day: number) => {
    const formatted = formatDateStr(year, month, day);
    onChange(formatted);
    setIsOpen(false);
  };

  const isDateDisabled = (y: number, m: number, d: number): boolean => {
    const targetStr = formatDateStr(y, m, d);
    if (min && targetStr < min) return true;
    if (max && targetStr > max) return true;
    return false;
  };

  const isToday = (day: number): boolean => {
    const today = new Date();
    return (
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day
    );
  };

  const isSelected = (day: number): boolean => {
    if (!selectedDate) return false;
    return (
      selectedDate.getFullYear() === year &&
      selectedDate.getMonth() === month &&
      selectedDate.getDate() === day
    );
  };

  // Format label for input
  const displayValue = selectedDate
    ? selectedDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label htmlFor={triggerId} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
        </label>
      )}

      <button
        id={triggerId}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border bg-surface px-3 text-start text-[15px] transition-colors focus:outline-none focus:ring-3 focus:ring-brand/30 disabled:cursor-not-allowed disabled:bg-raised disabled:opacity-60 ${
          error
            ? 'border-red-700'
            : isOpen
            ? 'border-brand-600 ring-3 ring-brand/30'
            : 'border-line-strong hover:border-ink/40'
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <span className={`truncate ${displayValue ? 'text-ink' : 'text-muted'}`}>{displayValue || placeholder}</span>
        </span>

        {value && !disabled && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="-me-1 rounded-full p-1.5 text-muted transition-colors hover:bg-raised hover:text-ink"
            title="Clear date"
          >
            <X className="h-4 w-4" aria-hidden />
          </span>
        )}
      </button>

      {error && <p className="mt-1.5 text-sm text-red-700">{error}</p>}

      {isOpen && (
        <div className="absolute start-0 z-50 mt-1.5 w-72 rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-hover)]">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-ink"
              title="Previous month"
            >
              <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
            </button>

            <span className="text-sm font-semibold text-ink">
              {monthNames[month]} {year}
            </span>

            <button
              type="button"
              onClick={handleNextMonth}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-ink"
              title="Next month"
            >
              <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1 text-center">
            {daysOfWeek.map((day) => (
              <span key={day} className="py-1 text-xs text-muted">
                {day}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <span key={`prev-${i}`} className="select-none py-2 text-sm text-muted/40">
                {daysInPrevMonth - firstDayOfMonth + i + 1}
              </span>
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const disabled = isDateDisabled(year, month, day);
              const selected = isSelected(day);
              const today = isToday(day);

              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelectDay(day)}
                  aria-pressed={selected}
                  aria-current={today ? 'date' : undefined}
                  className={`cursor-pointer rounded-lg py-2 text-sm tabular-nums transition-colors ${
                    disabled
                      ? 'cursor-not-allowed text-muted/40'
                      : selected
                      ? 'bg-brand font-semibold text-on-brand'
                      : today
                      ? 'bg-brand-soft font-semibold text-brand-soft-ink hover:bg-brand-100'
                      : 'text-ink hover:bg-raised'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                const formatted = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());
                onChange(formatted);
                setIsOpen(false);
              }}
              className="min-h-9 cursor-pointer rounded-lg px-2 text-sm font-medium text-brand-ink hover:bg-brand-soft"
            >
              Today
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="min-h-9 cursor-pointer rounded-lg px-2 text-sm text-muted hover:bg-raised hover:text-ink"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export default DatePicker;
