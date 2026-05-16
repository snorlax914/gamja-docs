import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kp: {
          DEFAULT: '#7132f5',
          dark: '#5741d8',
          deep: '#5b1ecf',
          subtle: 'rgba(133, 91, 251, 0.16)',
          tint: 'rgba(113, 50, 245, 0.06)',
        },
        ink: '#101114',
        cool: '#686b82',
        silver: '#9497a9',
        'border-main': '#dedee5',
        'border-soft': '#eeeef2',
        'bg-sunken': '#f5f6f8',
        'bg-hover': '#fafafc',
        'secondary-bg': 'rgba(148, 151, 169, 0.08)',
        'green-sem': '#149e61',
        'green-dark': '#026b3f',
        'green-bg': 'rgba(20, 158, 97, 0.16)',
        'red-sem': '#d24033',
        'red-dark': '#9a2419',
        'red-bg': 'rgba(210, 64, 51, 0.10)',
        'amber-sem': '#d68f1c',
      },
      fontFamily: {
        display: ['IBM Plex Sans', 'IBM Plex Sans KR', 'Pretendard', 'sans-serif'],
        ui: ['IBM Plex Sans', 'IBM Plex Sans KR', 'Pretendard', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '12px',
      },
      boxShadow: {
        whisper: 'rgba(16, 24, 40, 0.04) 0 1px 4px',
        subtle: 'rgba(0, 0, 0, 0.03) 0 4px 24px',
        card: 'rgba(16, 24, 40, 0.06) 0 2px 8px',
      },
      keyframes: {
        pulse_dot: {
          '0%': { boxShadow: '0 0 0 0 rgba(113, 50, 245, 0.4)' },
          '70%': { boxShadow: '0 0 0 6px rgba(113, 50, 245, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(113, 50, 245, 0)' },
        },
        indeterminate: {
          '0%': { transform: 'translateX(-100%)', width: '40%' },
          '50%': { width: '60%' },
          '100%': { transform: 'translateX(280%)', width: '40%' },
        },
        dots: {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '40%': { transform: 'translateY(-4px)', opacity: '1' },
        },
        blink: {
          '50%': { opacity: '0' },
        },
      },
      animation: {
        'pulse-dot': 'pulse_dot 1.6s ease-out infinite',
        indeterminate: 'indeterminate 1.4s ease-in-out infinite',
        dots: 'dots 1.2s ease-in-out infinite',
        blink: 'blink 1s steps(2) infinite',
      },
    },
  },
  plugins: [],
};
export default config;
