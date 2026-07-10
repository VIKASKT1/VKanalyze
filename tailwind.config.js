/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0B0E14',
          surface: '#13161F',
          raised: '#191D29',
          border: '#2A2E3A',
          borderStrong: '#3A3F4F',
        },
        paper: {
          DEFAULT: '#E8E6DF',
          dim: '#9B9D9F',
          dimmer: '#84868A',
        },
        accent: {
          DEFAULT: '#5B8DEF',
          dim: '#3D6BC4',
          bright: '#7FA6F5',
        },
        data: {
          DEFAULT: '#F0A868',
          dim: '#C98A52',
        },
        signal: {
          DEFAULT: '#4ADE80',
          dim: '#2FAE63',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(91,141,239,0.15), 0 8px 30px -8px rgba(91,141,239,0.25)',
      },
    },
  },
  plugins: [],
};
