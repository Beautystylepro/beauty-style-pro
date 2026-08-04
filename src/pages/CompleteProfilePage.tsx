import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import safeStorage from "@/lib/safeStorage";

// Chi si registra con Google (o altri provider social) salta l'intero
// modulo di registrazione a più passaggi, incluso quello che chiede il
// genere — da cui dipende il tema colori dell'app (viola/bronzo).
// Risultato: restava sempre il viola di default, indipendentemente da
// chi fosse davvero l'utente. Questa schermata minima intercetta
// esattamente quel caso e chiede solo l'essenziale prima di entrare.
export default function CompleteProfilePage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [saving, setSaving] = useState(false);

  const applyThemeLocally = (theme: "male" | "female") => {
    safeStorage.setItem("style-color-theme", theme);
    const r = document.documentElement;
    if (theme === "male") {
      r.style.setProperty("--primary", "45 88% 45%");
      r.style.setProperty("--ring", "45 88% 45%");
      r.style.setProperty("--gradient-primary", "linear-gradient(135deg, hsl(38 80% 38%), hsl(48 96% 58%), hsl(43 90% 46%))");
      r.style.setProperty("--shadow-glow", "0 0 40px hsl(45 88% 45% / 0.3)");
    } else {
      r.style.setProperty("--primary", "271 78% 42%");
      r.style.setProperty("--ring", "271 78% 42%");
      r.style.setProperty("--gradient-primary", "linear-gradient(135deg, hsl(271 82% 36%), hsl(285 75% 52%), hsl(258 78% 44%))");
      r.style.setProperty("--shadow-glow", "0 0 40px hsl(271 78% 42% / 0.3)");
    }
  };

  const handleContinue = async () => {
    if (!user || !gender) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ gender, color_theme: gender })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Errore nel salvataggio, riprova");
      return;
    }
    applyThemeLocally(gender);
    navigate("/", { replace: true });
  };

  if (!user) return null;
  // Already has a gender set (shouldn't normally land here) — skip.
  if (profile?.gender) {
    navigate("/", { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <h1 className="text-xl font-bold mb-2 text-center">Un ultimo dettaglio ✨</h1>
      <p className="text-sm text-muted-foreground mb-8 text-center max-w-xs">
        Per personalizzare i colori e i consigli di Stella, dicci come preferisci essere identificato/a.
      </p>

      <div className="grid grid-cols-2 gap-4 w-full max-w-xs mb-8">
        <button
          onClick={() => setGender("female")}
          className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
            gender === "female" ? "border-[hsl(262_80%_62%)] shadow-lg" : "border-border/40"
          }`}
        >
          <div className="w-full h-12 rounded-xl" style={{ background: "linear-gradient(135deg, hsl(271 82% 36%), hsl(285 75% 52%), hsl(258 78% 44%))" }} />
          <span className="text-sm font-semibold">💜 Donna</span>
        </button>
        <button
          onClick={() => setGender("male")}
          className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
            gender === "male" ? "border-[hsl(32_80%_48%)] shadow-lg" : "border-border/40"
          }`}
        >
          <div className="w-full h-12 rounded-xl" style={{ background: "linear-gradient(135deg, hsl(38 80% 38%), hsl(48 96% 58%), hsl(43 90% 46%))" }} />
          <span className="text-sm font-semibold">🏆 Uomo</span>
        </button>
      </div>

      <button
        onClick={handleContinue}
        disabled={!gender || saving}
        className="w-full max-w-xs h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-40"
      >
        {saving ? "Salvataggio..." : "Continua"}
      </button>
    </div>
  );
}
