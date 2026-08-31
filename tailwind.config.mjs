/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "bg-dark": "#0f172a",
        "bg-darker": "#020617",
        "primary": "#ffffff",
        "primary-hover": "#f1f5f9",
        "secondary": "#e91e63",
        "accent-gold": "#ffd700",
        "accent-green": "#00e676",
        "accent-emerald": "#10b981",
        "accent-blue": "#3b82f6",
        "text-main": "#f8fafc",
        "text-muted": "#cbd5e1",
        "glass-border": "rgba(255, 255, 255, 0.1)",
        "glass-bg": "rgba(255, 255, 255, 0.05)",
      },
      fontFamily: {
        sans: ['"Segoe UI"', "Roboto", '"Helvetica Neue"', "sans-serif"],
        mono: ['"Consolas"', "Monaco", "monospace"],
      },
      maxWidth: {
        container: "1200px",
      },
      height: {
        nav: "80px",
      },
      animation: {
        "pulse-glow": "pulse-glow 2s infinite",
        "rainbow-flow": "rainbow-flow 4s ease infinite",
        "rainbow-flow-slow": "rainbow-flow 5s ease infinite",
        "team-scroll": "team-scroll 30s linear infinite",
        "popup-in": "popup-in 0.24s ease-out",
        "fade-in-up-btn": "fadeInUpBtn 0.8s forwards 0.5s",
      },
      keyframes: {
        "pulse-glow": {
          "0%": { boxShadow: "0 0 0 0 rgba(255, 255, 255, 0.4)" },
          "70%": { boxShadow: "0 0 0 10px rgba(255, 255, 255, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(255, 255, 255, 0)" },
        },
        "rainbow-flow": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        "team-scroll": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "popup-in": {
          from: { opacity: "0", transform: "translateY(14px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        fadeInUpBtn: {
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      backdropBlur: {
        glass: "12px",
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.3)",
        "card-hover": "0 20px 40px rgba(0,0,0,0.2), 0 0 20px rgba(255, 255, 255, 0.1)",
      },
    },
  },
  plugins: [],
};
