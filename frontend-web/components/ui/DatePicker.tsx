'use client';

import React, { useState, useRef, useEffect } from 'react';
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
}: DatePickerProps) {
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

  // Sync view date when value changes
  useEffect(() => {
    if (value) {
      setViewDate(new Date(value + 'T00:00:00'));
    }
  }, [value]);

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
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-start text-xs sm:text-sm transition-all focus:outline-hidden focus:ring-2 focus:ring-[#FF5500] cursor-pointer disabled:bg-slate-50 disabled:cursor-not-allowed ${
          error
            ? 'border-red-300 focus:ring-red-400'
            : isOpen
            ? 'border-[#FF5500] ring-2 ring-[#FF5500]/20'
            : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <div className="flex items-center gap-2.5 truncate">
          <CalendarIcon className="w-4 h-4 text-slate-400 shrink-0" />
          <span className={displayValue ? 'text-slate-900 font-semibold' : 'text-slate-400 font-normal'}>
            {displayValue || placeholder}
          </span>
        </div>

        {value && !disabled && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
            title="Clear date"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {error && <p className="text-red-500 text-xs mt-1 font-medium">{error}</p>}

      {/* Popover Calendar */}
      {isOpen && (
        <div className="absolute z-50 mt-1.5 p-3.5 bg-white rounded-2xl shadow-xl border border-slate-200/90 w-72 start-0 animate-in fade-in duration-150">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors cursor-pointer"
              title="Previous month"
            >
              <ChevronLeft className="rtl:-scale-x-100 w-4 h-4" />
            </button>

            <span className="text-xs font-bold text-slate-900">
              {monthNames[month]} {year}
            </span>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors cursor-pointer"
              title="Next month"
            >
              <ChevronRight className="rtl:-scale-x-100 w-4 h-4" />
            </button>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {daysOfWeek.map((day) => (
              <span key={day} className="text-[11px] font-bold text-slate-400 uppercase py-0.5">
                {day}
              </span>
            ))}
          </div>

          {/* Day Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {/* Previous month padding days */}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <span
                key={`prev-${i}`}
                className="text-[11px] text-slate-300 py-1.5 select-none"
              >
                {daysInPrevMonth - firstDayOfMonth + i + 1}
              </span>
            ))}

            {/* Current month days */}
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
                  className={`py-1.5 text-xs rounded-lg font-medium transition-all cursor-pointer ${
                    disabled
                      ? 'text-slate-300 cursor-not-allowed line-through'
                      : selected
                      ? 'bg-[#FF5500] text-white font-bold shadow-xs'
                      : today
                      ? 'bg-orange-50 text-[#FF5500] font-bold hover:bg-orange-100'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer with Today Shortcut */}
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                const formatted = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());
                onChange(formatted);
                setIsOpen(false);
              }}
              className="text-[11px] font-bold text-[#FF5500] hover:underline cursor-pointer"
            >
              Today
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
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
