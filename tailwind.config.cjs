// Same theme that used to live inline in index.html (Tailwind CDN config).
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './offline.html', './main.js', './ui.js', './customizer.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        zinc: {
          50: '#fafafa', 100: '#FFFFFF', 200: '#E6E2DE', 300: '#DCD7D1', 400: '#A8A39D',
          500: '#6B6661', 600: '#6B6661', 700: '#2C2C2C', 800: '#2C2C2C', 900: '#18181b', 950: '#09090b',
        },
        teal: {
          50: '#FDFBF4', 100: '#F7F0D4', 200: '#F0E3B0', 300: '#E8D487', 400: '#E0C55E',
          500: '#D4AF37', 600: '#B8962D', 700: '#9C7E24', 800: '#7F661C', 900: '#614F16', 950: '#42360E',
        },
      },
    },
  },
  plugins: [],
};
