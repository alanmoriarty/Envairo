/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          root: '#0D0B14',
          card: '#161224',
          elevated: '#1E1830',
        },
        accent: {
          DEFAULT: '#9D4EDD',
          light: '#B57BEE',
          dark: '#7B3BB0',
          glow: 'rgba(157,78,221,0.25)',
        },
        text: {
          primary: '#F1ECF9',
          muted: '#9D9AB0',
          subtle: '#6B6880',
        },
        success: '#22D3A5',
        danger: '#F87171',
        warning: '#FBBF24',
        spotify: '#1DB954',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(157,78,221,0.3)',
        'glow-sm': '0 0 10px rgba(157,78,221,0.2)',
        'glow-lg': '0 0 40px rgba(157,78,221,0.4)',
        card: '0 4px 24px rgba(0,0,0,0.4)',
      },
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-up-sm': 'slide-up-sm 0.25s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'eq-bar-1': 'eq-bar 0.8s ease-in-out infinite',
        'eq-bar-2': 'eq-bar 0.8s ease-in-out infinite 0.2s',
        'eq-bar-3': 'eq-bar 0.8s ease-in-out infinite 0.4s',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 10px rgba(157,78,221,0.2)' },
          '50%': { boxShadow: '0 0 30px rgba(157,78,221,0.5)' },
        },
        'slide-up': {
          from: { opacity: 0, transform: 'translateY(10px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        'slide-up-sm': {
          from: { opacity: 0, transform: 'translateY(6px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        'eq-bar': {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%':      { transform: 'scaleY(1)' },
        },
      },
    },
  },
  plugins: [],
};
