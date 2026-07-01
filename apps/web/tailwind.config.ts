import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#07070c",
        surface: "#0e0e17",
        card: "rgba(255,255,255,0.03)",
        line: "rgba(255,255,255,0.08)",
        plasma: { from: "#8b5cf6", via: "#6366f1", to: "#06b6d4" },
        accent: "#8b5cf6",
        cyan: "#06b6d4",
        domain: {
          logic: "#8b5cf6",
          software: "#06b6d4",
          psychology: "#ec4899",
          trading: "#10b981",
          business: "#f59e0b",
          marketing: "#f43f5e",
          general: "#3b82f6",
          safety: "#ef4444",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px -10px rgba(139,92,246,0.5)",
        "glow-cyan": "0 0 40px -10px rgba(6,182,212,0.5)",
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 40px -12px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        plasma: "linear-gradient(135deg,#8b5cf6 0%,#6366f1 50%,#06b6d4 100%)",
        "plasma-radial": "radial-gradient(60% 60% at 50% 0%,rgba(139,92,246,0.18) 0%,rgba(6,182,212,0.05) 45%,transparent 100%)",
        grid: "linear-gradient(rgba(255,255,255,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.035) 1px,transparent 1px)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(139,92,246,0.5)" },
          "70%": { boxShadow: "0 0 0 12px rgba(139,92,246,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(139,92,246,0)" },
        },
        "gradient-x": {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        shimmer: "shimmer 2s infinite",
        float: "float 4s ease-in-out infinite",
        "pulse-ring": "pulse-ring 2s infinite",
        "gradient-x": "gradient-x 6s ease infinite",
      },
    },
  },
  plugins: [],
};
export default config;
