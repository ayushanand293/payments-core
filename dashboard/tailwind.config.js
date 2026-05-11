/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        background: "var(--bg)",
        panel: "rgb(var(--panel-rgb) / <alpha-value>)",
        border: "var(--panel-border)",
        foreground: "var(--text)",
        muted: "var(--muted)",
        accent: "var(--accent)",
      },
      boxShadow: {
        premium: "var(--shadow-premium)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
    },
  },
  plugins: [],
};
