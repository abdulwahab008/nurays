import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#10b981', // Green
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#f3f4f6',
          foreground: '#111827',
        },
        accent: {
          DEFAULT: '#f9fafb',
          foreground: '#111827',
        },
        destructive: {
          DEFAULT: '#ef4444',
          foreground: '#ffffff',
        },
        border: '#e5e7eb',
        input: '#e5e7eb',
        ring: '#10b981',
        background: '#ffffff',
        foreground: '#111827',
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
      },
    },
  },
  plugins: [],
};
export default config;

