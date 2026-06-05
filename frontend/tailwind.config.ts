import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0d0d14',
          1: '#13131e',
          2: '#1a1a2e',
          3: '#22223b',
        },
        accent: {
          DEFAULT: '#a855f7',
          dim: '#7c3aed',
          bright: '#d946ef',
        },
        peak: '#f472b6',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'timeline-glow':
          'linear-gradient(180deg, rgba(168,85,247,0.15) 0%, rgba(168,85,247,0) 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
