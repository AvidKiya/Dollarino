/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(222 20% 4%)',
        card: 'hsl(222 18% 7%)',
        elevated: 'hsl(222 16% 11%)',
        border: 'hsl(222 14% 16%)',
        primary: 'hsl(225 85% 62%)',
        success: 'hsl(152 68% 48%)',
        destructive: 'hsl(4 80% 58%)',
        warning: 'hsl(38 92% 52%)',
      },
      fontFamily: {
        sans: ['Vazirmatn', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
