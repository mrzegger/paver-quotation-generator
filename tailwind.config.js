/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        kuma: {
          dark: '#1e2329',
          primary: '#24292e',
          accent: '#e65100',
          amber: '#d97706',
          sand: '#f8f6f0',
          border: '#d1d5db',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
