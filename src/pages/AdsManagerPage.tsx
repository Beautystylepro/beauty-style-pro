import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, Megaphone, Plus, Eye, MousePointerClick, Pause, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AdsManagerPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [budget, setBudget] = useState("10");
  const [saving, setSaving] = useState(false);

  const canAdvertise = profile?.user_type === "professional" || profile?.user_type === "business";

  const { data: campaigns } = useQuery({
    queryKey: ["my_ad_campaigns", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("ad_campaigns")
        .select("*")
        .eq("advertiser_id", user!.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const handleCreate = async () => {
    if (!user) return;
    if (!title.trim()) {
      toast.error("Inserisci un titolo");
      return;
    }
    const budgetNum = parseFloat(budget);
    if (!budgetNum || budgetNum <= 0) {
      toast.error("Il budget deve essere maggiore di zero");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("ad_campaigns").insert({
      advertiser_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
      image_url: imageUrl.trim() || null,
      target_url: targetUrl.trim() || null,
      campaign_type: "feed_banner",
      budget: budgetNum,
      active: true,
    });
    setSaving(false);
    if (error) {
      toast.error("Errore nella creazione della campagna");
      return;
    }
    toast.success("Campagna creata! Inizierà a comparire nel feed 📢");
    setTitle(""); setDescription(""); setImageUrl(""); setTargetUrl(""); setBudget("10");
    setShowForm(false);
    queryClient.invalidateQueries({ queryKey: ["my_ad_campaigns", user.id] });
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    await supabase.from("ad_campaigns").update({ active: !currentActive }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["my_ad_campaigns", user?.id] });
  };

  if (!canAdvertise) {
    return (
      <MobileLayout>
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <p className="text-sm text-muted-foreground">Solo professionisti e attività possono creare campagne pubblicitarie.</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-sm font-semibold text-primary">Torna indietro</button>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-primary" aria-label="Indietro">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Le tue campagne</h1>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="ml-auto flex items-center gap-1 text-xs font-semibold text-primary"
          >
            <Plus className="w-4 h-4" /> Nuova
          </button>
        </div>

        {showForm && (
          <div className="p-4 space-y-3 border-b border-border/50 bg-muted/20">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titolo campagna"
              className="w-full h-11 px-3 rounded-xl border border-border/50 bg-card text-sm"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrizione breve (opzionale)"
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-border/50 bg-card text-sm"
            />
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="URL immagine (opzionale)"
              className="w-full h-11 px-3 rounded-xl border border-border/50 bg-card text-sm"
            />
            <input
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="Dove porta il click (es: /stylists/tuo-id)"
              className="w-full h-11 px-3 rounded-xl border border-border/50 bg-card text-sm"
            />
            <div>
              <label className="text-xs font-semibold mb-1 block">Budget totale (€)</label>
              <input
                type="number"
                min="1"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-border/50 bg-card text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Ogni visualizzazione costa €0.05 — il budget si esaurisce da solo e la campagna si ferma automaticamente.
              </p>
            </div>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50"
            >
              {saving ? "Creazione..." : "Avvia campagna"}
            </button>
          </div>
        )}

        <div className="p-4 space-y-3">
          {!campaigns?.length ? (
            <div className="text-center py-16">
              <Megaphone className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">Nessuna campagna ancora. Creane una per farti vedere di più.</p>
            </div>
          ) : (
            campaigns.map((c: any) => (
              <div key={c.id} className="rounded-2xl border border-border/50 bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{c.title}</p>
                    {c.description && <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>}
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    c.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {c.active ? "Attiva" : c.spent >= c.budget ? "Budget esaurito" : "In pausa"}
                  </span>
                </div>

                <div className="mt-2">
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, (c.spent / c.budget) * 100)}%` }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">€{c.spent.toFixed(2)} / €{c.budget.toFixed(2)} speso</p>
                </div>

                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {c.impressions} visualizzazioni</span>
                  <span className="flex items-center gap-1"><MousePointerClick className="w-3.5 h-3.5" /> {c.clicks} click</span>
                </div>

                {c.spent < c.budget && (
                  <button
                    onClick={() => toggleActive(c.id, c.active)}
                    className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary"
                  >
                    {c.active ? <><Pause className="w-3.5 h-3.5" /> Metti in pausa</> : <><Play className="w-3.5 h-3.5" /> Riattiva</>}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
