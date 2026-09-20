import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/components/**/*.{ts,tsx}', './src/app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        ink: 'var(--ink)',
        'ink-muted': 'var(--ink-muted)',
        'ink-faint': 'var(--ink-faint)',
        indigo: {
          DEFAULT: 'var(--indigo)',
          hover: 'var(--indigo-hover)',
          wash: 'var(--indigo-wash)',
        },
        emerald: {
          DEFAULT: 'var(--emerald)',
          wash: 'var(--emerald-wash)',
        },
        amber: { DEFAULT: 'var(--amber)', wash: 'var(--amber-wash)' },
        rose: { DEFAULT: 'var(--rose)', wash: 'var(--rose-wash)' },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'Pretendard', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: { panel: '12px' },
      maxWidth: { shell: '1120px' },
    },
  },
  plugins: [],
};

export default config;
