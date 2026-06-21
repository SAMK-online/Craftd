import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#fffaf0",
        "surface-soft": "#faf5e8",
        "surface-card": "#f5f0e0",
        "surface-strong": "#ebe6d6",
        hairline: "#e5e5e5",
        ink: "#0a0a0a",
        "body-strong": "#1a1a1a",
        body: "#3a3a3a",
        muted: "#6a6a6a",
        "muted-soft": "#9a9a9a",
        "on-primary": "#ffffff",
        brand: {
          pink: "#ff4d8b",
          teal: "#1a3a3a",
          lavender: "#b8a4ed",
          peach: "#ffb084",
          ochre: "#e0a82e",
          mint: "#a4d4c5",
          coral: "#ff6b5a",
        },
      },
      borderRadius: {
        xs: "6px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      maxWidth: {
        content: "1280px",
      },
    },
  },
  plugins: [],
};
export default config;
