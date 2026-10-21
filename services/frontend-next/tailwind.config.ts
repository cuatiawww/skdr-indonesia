import type { Config } from "tailwindcss";

// PR 016: Kemenkes logo palette via CSS variables (lib/theme.ts, app/globals.css, DB app_settings.theme_palette).
// `blue` and `sky` are remapped to the brand scale so existing utility classes follow the theme.
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
        blue: BRAND,
        sky: BRAND,
        primary: { DEFAULT: v("brand-700"), dark: v("brand-800"), light: v("brand-500") },
        secondary: { DEFAULT: v("brand-lime"), dark: v("brand-800"), light: v("brand-200") },
        accent: { DEFAULT: "#ED2939", dark: "#c61f2d", light: "#f15462" },
        ebs: v("src-ebs"),
        pe: v("src-pe"),
        asean: { blue: v("brand-700"), red: "#ED2939", gold: v("brand-lime"), sky: v("brand-600") },
      },
      fontFamily: {
        manrope: ["var(--font-roboto)", "sans-serif"],
        roboto: ["var(--font-roboto)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
