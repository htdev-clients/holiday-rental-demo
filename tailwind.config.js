/** @type {import('tailwindcss').Config} */
module.exports = {
  future: {
    hoverOnlyWhenSupported: true,
  },
  content: [
    './_includes/**/*.html',
    './_layouts/**/*.html',
    './*.html',
  ],
  theme: {
    extend: {
      colors: {
        earth: '#2C2520',
        clay:  '#D6A87C',
        leaf:  '#4A5D44',
        paper: '#F2F0E9',
        stone: '#E5E2D9',
        cream: '#FAF8F3',
      },
      fontFamily: {
        serif: ['Cormorant Garamond', 'serif'],
        sans:  ['Montserrat', 'sans-serif'],
      },
      screens: {
        pointer: { raw: '(hover: hover)' },
      },
    },
  },
  plugins: [],
}
