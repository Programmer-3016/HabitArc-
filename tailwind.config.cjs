const forms = require('@tailwindcss/forms');
const containerQueries = require('@tailwindcss/container-queries');

const RAW_COLORS = {
  'on-secondary-fixed': '#002113',
  'on-surface': '#191c1d',
  'on-background': '#191c1d',
  'surface-dim': '#d9dadb',
  'tertiary-fixed': '#ffdad8',
  'on-primary': '#ffffff',
  'on-secondary-fixed-variant': '#005236',
  'error': '#ba1a1a',
  'inverse-surface': '#2e3132',
  'on-primary-fixed-variant': '#274e3d',
  'surface-container-lowest': '#ffffff',
  'on-error': '#ffffff',
  'inverse-on-surface': '#f0f1f2',
  'on-primary-fixed': '#002114',
  'surface-container-low': '#f3f4f5',
  'primary': '#012d1d',
  'on-secondary': '#ffffff',
  'error-container': '#ffdad6',
  'secondary-fixed-dim': '#85d7ad',
  'secondary-container': '#a0f4c8',
  'tertiary-fixed-dim': '#f5b7b4',
  'on-tertiary-container': '#d29895',
  'on-tertiary-fixed': '#331111',
  'on-surface-variant': '#414844',
  'primary-fixed': '#c1ecd4',
  'secondary': '#0e6c4a',
  'outline-variant': '#c1c8c2',
  'outline': '#717973',
  'surface-variant': '#e1e3e4',
  'on-error-container': '#93000a',
  'primary-fixed-dim': '#a5d0b9',
  'surface-container': '#edeeef',
  'surface': '#f8f9fa',
  'surface-tint': '#3f6653',
  'inverse-primary': '#a5d0b9',
  'on-secondary-container': '#19724f',
  'on-tertiary-fixed-variant': '#673a39',
  'on-primary-container': '#86af99',
  'background': '#f8f9fa',
  'tertiary-container': '#5a302f',
  'primary-container': '#1b4332',
  'surface-container-highest': '#e1e3e4',
  'surface-container-high': '#e7e8e9',
  'surface-bright': '#f8f9fa',
  'tertiary': '#401b1b',
  'secondary-fixed': '#a0f4c8',
  'on-tertiary': '#ffffff',
};

const themeColors = Object.fromEntries(
  Object.entries(RAW_COLORS).map(([name, hex]) => {
    const value = parseInt(hex.slice(1), 16);
    const rgb = `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
    return [name, `rgb(var(--ha-${name}, ${rgb}) / <alpha-value>)`];
  }),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./*.html', './*.js'],
  theme: {
    extend: {
      colors: themeColors,
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
      spacing: {
        'container-padding': '20px',
        'element-gap': '12px',
        'stack-gap': '16px',
        'card-padding': '20px',
        'section-margin': '32px',
      },
      fontFamily: {
        'headline-md': ['Hanken Grotesk', 'sans-serif'],
        'label-sm': ['Geist', 'sans-serif'],
        'body-md': ['Hanken Grotesk', 'sans-serif'],
        'body-lg': ['Hanken Grotesk', 'sans-serif'],
        'headline-lg': ['Hanken Grotesk', 'sans-serif'],
        'label-md': ['Geist', 'sans-serif'],
      },
      fontSize: {
        'headline-md': ['20px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'label-sm': ['10px', { lineHeight: '12px', letterSpacing: '0.05em', fontWeight: '600' }],
        'body-md': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'body-lg': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'headline-lg': ['28px', { lineHeight: '34px', letterSpacing: '-0.02em', fontWeight: '600' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '500' }],
      },
    },
  },
  plugins: [forms, containerQueries],
};
