/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic tokens — resolved from CSS variables so light/dark is a var swap.
        canvas:   'rgb(var(--canvas) / <alpha-value>)',
        surface:  'rgb(var(--surface) / <alpha-value>)',
        surface2: 'rgb(var(--surface-2) / <alpha-value>)',
        surface3: 'rgb(var(--surface-3) / <alpha-value>)',
        edge:     'rgb(var(--edge) / <alpha-value>)',
        content:  'rgb(var(--content) / <alpha-value>)',
        muted:    'rgb(var(--muted) / <alpha-value>)',
        faint:    'rgb(var(--faint) / <alpha-value>)',
        success:  'rgb(var(--success) / <alpha-value>)',
        danger:   'rgb(var(--danger) / <alpha-value>)',
        warn:     'rgb(var(--warn) / <alpha-value>)',
        accent:   'rgb(var(--accent) / <alpha-value>)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        cardhover: 'var(--shadow-card-hover)',
      },
    },
  },
  plugins: [],
}
