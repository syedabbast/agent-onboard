/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html","./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        serif: ['"DM Serif Display"', 'serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}

