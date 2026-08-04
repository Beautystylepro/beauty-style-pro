import { useState, useEffect } from "react";
import safeStorage from "@/lib/safeStorage";

type Theme = "dark" | "light";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = safeStorage.getItem("style-theme");
    return (saved === "light" ? "light" : "dark") as Theme;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      // Beige caldo reale (non bianco/grigio puro) — tonalità 38-40°,
      // leggera saturazione, per un effetto "giorno" morbido e di
      // pregio invece del bianco piatto standard.
      root.style.setProperty("--background", "38 30% 93%");
      root.style.setProperty("--foreground", "30 15% 12%");
      root.style.setProperty("--card", "38 35% 97%");
      root.style.setProperty("--card-foreground", "30 15% 12%");
      root.style.setProperty("--popover", "38 35% 97%");
      root.style.setProperty("--popover-foreground", "30 15% 12%");
      root.style.setProperty("--secondary", "38 22% 88%");
      root.style.setProperty("--secondary-foreground", "30 15% 20%");
      root.style.setProperty("--muted", "38 20% 90%");
      root.style.setProperty("--muted-foreground", "30 10% 42%");
      root.style.setProperty("--border", "38 18% 84%");
      root.style.setProperty("--input", "38 18% 84%");
      root.style.setProperty("--sidebar-background", "38 30% 93%");
      root.style.setProperty("--sidebar-foreground", "30 15% 12%");
      root.style.setProperty("--sidebar-accent", "38 22% 88%");
      root.style.setProperty("--sidebar-accent-foreground", "30 15% 12%");
      root.style.setProperty("--sidebar-border", "38 18% 84%");
      root.style.setProperty("--gradient-card", "linear-gradient(160deg, hsl(38 35% 97%), hsl(38 30% 93%))");
      root.style.setProperty("--shadow-card", "0 4px 24px hsl(30 20% 20% / 0.10)");
      root.style.setProperty("--gold-foreground", "30 15% 12%");
    } else {
      // Nero vero (non grigio molto scuro) per la modalità notte.
      root.style.setProperty("--background", "0 0% 2%");
      root.style.setProperty("--foreground", "0 0% 95%");
      root.style.setProperty("--card", "0 0% 6%");
      root.style.setProperty("--card-foreground", "0 0% 95%");
      root.style.setProperty("--popover", "0 0% 6%");
      root.style.setProperty("--popover-foreground", "0 0% 95%");
      root.style.setProperty("--secondary", "0 0% 13%");
      root.style.setProperty("--secondary-foreground", "0 0% 90%");
      root.style.setProperty("--muted", "0 0% 9%");
      root.style.setProperty("--muted-foreground", "0 0% 50%");
      root.style.setProperty("--border", "0 0% 11%");
      root.style.setProperty("--input", "0 0% 11%");
      root.style.setProperty("--sidebar-background", "0 0% 3%");
      root.style.setProperty("--sidebar-foreground", "0 0% 95%");
      root.style.setProperty("--sidebar-accent", "0 0% 11%");
      root.style.setProperty("--sidebar-accent-foreground", "0 0% 95%");
      root.style.setProperty("--sidebar-border", "0 0% 11%");
      root.style.setProperty("--gradient-card", "linear-gradient(160deg, hsl(0 0% 7%), hsl(0 0% 4%))");
      root.style.setProperty("--shadow-card", "0 4px 24px hsl(0 0% 0% / 0.35)");
      root.style.setProperty("--gold-foreground", "0 0% 8%");
    }
    safeStorage.setItem("style-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === "dark" ? "light" : "dark");

  return { theme, setTheme, toggleTheme };
}
