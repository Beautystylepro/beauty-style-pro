import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, Sparkles, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ChatSecretarySettingsPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("chat_secretary_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setEnabled(data.enabled);
        setCustomInstructions(data.custom_instructions || "");
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("chat_secretary_settings").upsert({
      user_id: user.id,
      enabled,
      custom_instructions: customInstructions || null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) toast.error("Errore nel salvataggio");
    else toast.success("Modalità Segretaria aggiornata ✨");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Caricamento...</div>;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" aria-label="Indietro" onClick={() => nav(-1)} className="text-primary">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" /> Modalità Segretaria Chat
          </h1>
          <p className="text-xs text-muted-foreground">Stella risponde ai tuoi messaggi quando non ci sei</p>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6 max-w-lg mx-auto">
        <div className="rounded-2xl border p-4 bg-card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <div>
                <div className="text-sm font-medium">Attiva Modalità Segretaria</div>
                <div className="text-[11px] text-muted-foreground">
                  Chi ti scrive riceverà subito una risposta di Stella a tuo nome, finché non prendi tu la conversazione
                </div>
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Attiva modalità segretaria chat" />
          </div>
        </div>

        {enabled && (
          <div className="rounded-2xl border p-4 bg-card space-y-3">
            <Label className="text-xs font-semibold">Istruzioni personalizzate (opzionale)</Label>
            <Textarea
              rows={4}
              placeholder="Es: se chiedono di taglio uomo, di' che costa 20€ e che il sabato è sempre pieno..."
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              Stella terrà conto di queste indicazioni quando risponde per te. Non inventerà mai prezzi o orari che non le hai detto.
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-dashed p-4 bg-muted/30 space-y-1">
          <p className="text-xs text-muted-foreground">
            💡 Le risposte automatiche di Stella non fanno mai scattare un'altra risposta automatica: se anche chi ti scrive ha la modalità Segretaria attiva, riceverai comunque una sola risposta della sua Stella, non un dialogo infinito tra assistenti.
          </p>
        </div>

        <Button type="button" aria-label="Salva impostazioni" className="w-full" onClick={save} disabled={saving}>
          <Save className="w-4 h-4 mr-2" /> {saving ? "Salvataggio..." : "Salva"}
        </Button>
      </div>
    </div>
  );
}
