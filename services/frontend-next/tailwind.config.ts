import type { Config } from "tailwindcss";

// PR 064: SATUSEHAT / TTDK Design System integration
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const BRAND = Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((k) => [k, v(`brand-${k}`)]));

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: BRAND,
        page: 'rgb(var(--page-bg) / <alpha-value>)',
        card: 'rgb(var(--card-bg) / <alpha-value>)',
        line: 'rgb(var(--card-border) / <alpha-value>)',
        rule: 'rgb(var(--rule) / <alpha-value>)',
        blue: BRAND,
        sky: BRAND,
        primary: { DEFAULT: v("brand-700"), dark: v("brand-800"), light: v("brand-500") },
        secondary: { DEFAULT: v("brand-lime"), dark: v("brand-800"), light: v("brand-200") },
        accent: { DEFAULT: "#3899fe", dark: "#1e81e8", light: "#ebf3ff" },
        ebs: v("src-ebs"),
        pe: v("src-pe"),
        asean: { blue: v("brand-700"), red: "#F02D2D", gold: v("brand-lime"), sky: v("brand-accent") },
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "Manrope", "var(--font-roboto)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        manrope: ["var(--font-manrope)", "Manrope", "sans-serif"],
        roboto: ["var(--font-manrope)", "var(--font-roboto)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
