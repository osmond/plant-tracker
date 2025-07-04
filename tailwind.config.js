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
        primary: '#4caf50',
        accent: '#8bc34a',
        text: 'var(--color-text)'
      }
    }
  },
  plugins: [require('@tailwindcss/forms')]
};
