import { useState, useEffect } from "react";
import safeStorage from "@/lib/safeStorage";

export type ColorTheme = "female" | "male";

// Viola di lusso: profondo, forte, "verniciato" — non il viola pastello
// di prima, un vero viola gioiello con riflesso lucido, in linea con
// un'app che deve sembrare professionale e di pregio, non solo social.
const FEMALE = {
  primary: "271 78% 42%",
  ring: "271 78% 42%",
  sidebarPrimary: "271 78% 42%",
  sidebarRing: "271 78% 42%",
  gradientPrimary: "linear-gradient(135deg, hsl(271 82% 36%), hsl(285 75% 52%), hsl(258 78% 44%))",
  gradientLuxury: "linear-gradient(135deg, hsl(271 85% 32%), hsl(288 78% 50%), hsl(255 80% 40%))",
  gradientChrome: "linear-gradient(135deg, hsl(240 6% 88%), hsl(271 35% 68%), hsl(240 6% 60%))",
  gradientChromeDark: "linear-gradient(135deg, hsl(240 5% 18%), hsl(271 30% 20%), hsl(240 5% 12%))",
  gradientChromeText: "linear-gradient(135deg, hsl(0 0% 95%), hsl(271 35% 78%), hsl(0 0% 70%))",
  gradientChromeBorder: "linear-gradient(135deg, hsl(0 0% 30%), hsl(271 30% 38%), hsl(0 0% 20%))",
  shadowGlow: "0 0 40px hsl(271 78% 42% / 0.35)",
  shadowLuxury: "0 8px 32px hsl(271 78% 42% / 0.22), 0 2px 8px hsl(0 0% 0% / 0.5)",
};

// Oro lingotto: oro puro e ricco (tonalità 45-48°, alta saturazione),
// non più il bronzo/arancione di prima (tonalità 32° leggeva come
// "ruggine" più che oro) — pensato per un effetto metallo prezioso
// lucido, il più "carati" possibile senza perdere leggibilità.
const MALE = {
  primary: "45 88% 45%",
  ring: "45 88% 45%",
  sidebarPrimary: "45 88% 45%",
  sidebarRing: "45 88% 45%",
  gradientPrimary: "linear-gradient(135deg, hsl(38 80% 38%), hsl(48 96% 58%), hsl(43 90% 46%))",
  gradientLuxury: "linear-gradient(135deg, hsl(36 82% 32%), hsl(50 98% 62%), hsl(42 88% 40%))",
  gradientChrome: "linear-gradient(135deg, hsl(240 6% 88%), hsl(45 55% 70%), hsl(240 6% 60%))",
  gradientChromeDark: "linear-gradient(135deg, hsl(240 5% 18%), hsl(42 35% 24%), hsl(240 5% 12%))",
  gradientChromeText: "linear-gradient(135deg, hsl(0 0% 95%), hsl(45 55% 80%), hsl(0 0% 70%))",
  gradientChromeBorder: "linear-gradient(135deg, hsl(0 0% 30%), hsl(42 35% 42%), hsl(0 0% 20%))",
  shadowGlow: "0 0 40px hsl(45 88% 45% / 0.35)",
  shadowLuxury: "0 8px 32px hsl(45 88% 45% / 0.22), 0 2px 8px hsl(0 0% 0% / 0.5)",
};

const THEMES: Record<ColorTheme, typeof FEMALE> = { female: FEMALE, male: MALE };

function applyColorTheme(t: ColorTheme) {
  const vars = THEMES[t];
  const r = document.documentElement;
  r.style.setProperty("--primary", vars.primary);
  r.style.setProperty("--ring", vars.ring);
  r.style.setProperty("--sidebar-primary", vars.sidebarPrimary);
  r.style.setProperty("--sidebar-ring", vars.sidebarRing);
  r.style.setProperty("--gradient-primary", vars.gradientPrimary);
  r.style.setProperty("--gradient-luxury", vars.gradientLuxury);
  r.style.setProperty("--gradient-chrome", vars.gradientChrome);
  r.style.setProperty("--gradient-chrome-dark", vars.gradientChromeDark);
  r.style.setProperty("--gradient-chrome-text", vars.gradientChromeText);
  r.style.setProperty("--gradient-chrome-border", vars.gradientChromeBorder);
  r.style.setProperty("--shadow-glow", vars.shadowGlow);
  r.style.setProperty("--shadow-luxury", vars.shadowLuxury);
}

export function useColorTheme() {
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(() => {
    const saved = safeStorage.getItem("style-color-theme");
    return saved === "male" ? "male" : "female";
  });

  useEffect(() => {
    applyColorTheme(colorTheme);
    safeStorage.setItem("style-color-theme", colorTheme);
  }, [colorTheme]);

  const setColorTheme = async (t: ColorTheme) => {
    setColorThemeState(t);
    // Persist to DB
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({ color_theme: t }).eq("user_id", user.id);
      }
    } catch { /* ignore if not logged in */ }
  };

  return { colorTheme, setColorTheme };
}

/**
 * Temporarily override the color theme (e.g. when viewing another user's profile).
 * Returns a cleanup function that restores the original theme.
 */
export function useTemporaryTheme(profileTheme: ColorTheme | string | null | undefined) {
  const ownTheme = safeStorage.getItem("style-color-theme") === "male" ? "male" : "female";

  useEffect(() => {
    const resolved: ColorTheme = profileTheme === "male" ? "male" : "female";
    // Only override if different from current user's theme
    if (resolved !== ownTheme) {
      applyColorTheme(resolved);
      return () => {
        applyColorTheme(ownTheme as ColorTheme);
      };
    }
  }, [profileTheme, ownTheme]);
}
