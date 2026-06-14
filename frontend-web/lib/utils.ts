import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// GST rate applied on (subtotal - discount); must match backend order.service.ts.
export const GST_RATE = 0.05;

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 0,
  }).format(price);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-PK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatPhoneNumber(phone: string): string {
  // Format +923001234567 to +92 300 1234567
  if (phone.startsWith('+92')) {
    return `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`;
  }
  return phone;
}

export function maskPhoneNumber(phone: string): string {
  // Mask +923001234567 to +9230012***67
  if (phone.length > 7) {
    return `${phone.slice(0, 7)}***${phone.slice(-2)}`;
  }
  return phone;
}

