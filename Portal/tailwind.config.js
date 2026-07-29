
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'dark-bg': '#0B1121',
        'dark-paper': '#151B25',
        'brand-dark': '#0a0a0f',
        'brand-accent': '#00f2ff',
        'brand-warning': '#ffab00',
        'brand-error': '#ff3d00',
      }
    }
  },
  plugins: [],
}
