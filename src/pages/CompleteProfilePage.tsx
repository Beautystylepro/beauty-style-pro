import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import safeStorage from "@/lib/safeStorage";

// Chi si registra con Google (o altri provider social) salta l'intero
// modulo di registrazione a più passaggi — non solo il genere, ma
// anche la scelta cliente/professionista/azienda, che restava sempre
// "cliente" per difetto senza che nessuno lo chiedesse mai. Questa
// schermata (ora effettivamente raggiunta grazie a OnboardingGate,
// prima nessuno la richiamava) chiede entrambe le cose prima di
// entrare nell'app.
export default function CompleteProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [accountType, setAccountType] = useState<"client" | "professional" | "business" | null>(null);
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

  const handleFinish = async () => {
    if (!user || !gender || !accountType) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({ gender, color_theme: gender, user_type: accountType })
      .eq("user_id", user.id);
    if (error) {
      setSaving(false);
      toast.error("Errore nel salvataggio, riprova");
      return;
    }

    // Se sceglie professionista/azienda, crea anche la riga
    // corrispondente — altrimenti resterebbe un account "professionista"
    // fantasma senza nessuna scheda professionale reale dietro.
    if (accountType === "professional") {
      const { data: existing } = await supabase.from("professionals").select("id").eq("user_id", user.id).maybeSingle();
      if (!existing) {
        await supabase.from("professionals").insert({
          user_id: user.id,
          business_name: profile?.display_name || user.email || "Professionista",
          category: "Hairstylist",
        });
      }
    } else if (accountType === "business") {
      const { data: existing } = await supabase.from("businesses").select("id").eq("user_id", user.id).maybeSingle();
      if (!existing) {
        const name = profile?.display_name || user.email || "Attività";
        await supabase.from("businesses").insert({
          user_id: user.id,
          business_name: name,
          legal_name: name,
          vat_number: "",
          slug: `biz-${user.id.slice(0, 8)}`,
          business_type: "salone",
        });
      }
    }

    await refreshProfile();
    setSaving(false);
    applyThemeLocally(gender);

    if (accountType !== "client") {
      toast.success("Account creato! Completa i dati professionali quando vuoi da Impostazioni.");
      navigate("/verify-account", { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  };

  if (!user) return null;
  // Already has a gender set (shouldn't normally land here) — skip.
  if (profile?.gender) {
    navigate("/", { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      {step === 1 ? (
        <>
          <h1 className="text-xl font-bold mb-2 text-center">Benvenuto/a! 👋</h1>
          <p className="text-sm text-muted-foreground mb-8 text-center max-w-xs">
            Come vuoi usare STYLE?
          </p>
          <div className="flex flex-col gap-3 w-full max-w-xs mb-8">
            {[
              { key: "client" as const, label: "Sono un cliente", desc: "Cerco e prenoto servizi beauty" },
              { key: "professional" as const, label: "Sono un professionista", desc: "Parrucchiere, estetista, barbiere..." },
              { key: "business" as const, label: "Ho un'attività", desc: "Salone, centro estetico, azienda" },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setAccountType(opt.key)}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                  accountType === opt.key ? "border-primary bg-primary/5" : "border-border/40"
                }`}
              >
                <p className="text-sm font-bold">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
          <button
            onClick={() => accountType && setStep(2)}
            disabled={!accountType}
            className="w-full max-w-xs h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-40"
          >
            Continua
          </button>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold mb-2 text-center">Un ultimo dettaglio ✨</h1>
          <p className="text-sm text-muted-foreground mb-8 text-center max-w-xs">
            Per personalizzare i colori e i consigli di Stella, dicci come preferisci essere identificato/a.
          </p>

          <div className="grid grid-cols-2 gap-4 w-full max-w-xs mb-8">
            <button
              onClick={() => setGender("female")}
              className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                gender === "female" ? "border-[hsl(271_78%_42%)] shadow-lg" : "border-border/40"
              }`}
            >
              <div className="w-full h-12 rounded-xl" style={{ background: "linear-gradient(135deg, hsl(271 82% 36%), hsl(285 75% 52%), hsl(258 78% 44%))" }} />
              <span className="text-sm font-semibold">💜 Donna</span>
            </button>
            <button
              onClick={() => setGender("male")}
              className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                gender === "male" ? "border-[hsl(45_88%_45%)] shadow-lg" : "border-border/40"
              }`}
            >
              <div className="w-full h-12 rounded-xl" style={{ background: "linear-gradient(135deg, hsl(38 80% 38%), hsl(48 96% 58%), hsl(43 90% 46%))" }} />
              <span className="text-sm font-semibold">🏆 Uomo</span>
            </button>
          </div>

          <button
            onClick={handleFinish}
            disabled={!gender || saving}
            className="w-full max-w-xs h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-40"
          >
            {saving ? "Salvataggio..." : "Continua"}
          </button>
        </>
      )}
    </div>
  );
}
