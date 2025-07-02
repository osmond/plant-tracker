module.exports = {
  content: [
    './index.html',
    './analytics.html'
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        card: 'var(--color-card)',
        primary: '#8d67d6',
        accent: '#ffa5d8',
        text: 'var(--color-text)'
      }
    }
  },
  plugins: [require('@tailwindcss/forms')]
};
