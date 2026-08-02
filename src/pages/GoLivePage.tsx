import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Video, Coins, Target, Clock, Users, Globe, Lock, Sparkles, Scissors, Palette, Droplets, BookOpen, Paintbrush, Gem, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import MobileLayout from "@/components/layout/MobileLayout";
import { useRadio } from "@/contexts/RadioContext";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "taglio", label: "Taglio", Icon: Scissors, color: "from-blue-500 to-cyan-500" },
  { value: "tinta", label: "Tinta / Colore", Icon: Palette, color: "from-purple-500 to-pink-500" },
  { value: "trattamento", label: "Trattamento", Icon: Droplets, color: "from-green-500 to-emerald-500" },
  { value: "tutorial", label: "Tutorial / Lezione", Icon: BookOpen, color: "from-orange-500 to-amber-500" },
  { value: "makeup", label: "Make-up", Icon: Paintbrush, color: "from-rose-500 to-pink-500" },
  { value: "nails", label: "Nail Art", Icon: Gem, color: "from-fuchsia-500 to-violet-500" },
];

const DURATIONS = [15, 30, 45, 60, 90, 120];

export default function GoLivePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { pause: pauseRadio } = useRadio();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("tutorial");
  const [duration, setDuration] = useState(30);
  const [qrCoinPool, setQrCoinPool] = useState(100);
  const [interactionGoal, setInteractionGoal] = useState(50);
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);

  const startLive = async () => {
    pauseRadio();
    if (!title.trim()) {
      toast.error("Inserisci un titolo per la live");
      return;
    }
    if (!user) {
      toast.error("Devi effettuare l'accesso");
      return;
    }

    setLoading(true);

    // Find professional profile
    const { data: pro } = await supabase
      .from("professionals")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!pro) {
      toast.error("Devi avere un profilo professionale per trasmettere");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.from("live_streams").insert({
      title,
      description,
      category,
      professional_id: pro.id,
      status: "live",
      started_at: new Date().toISOString(),
      qr_coin_pool: qrCoinPool,
      interaction_goal: interactionGoal,
      is_public: isPublic,
      max_duration_minutes: duration,
    }).select().single();

    if (error) {
      if (error.message?.includes("PREMIUM_LIVE_LIMIT")) {
        toast.error("Hai già usato la tua diretta gratuita di oggi", {
          action: { label: "Passa a Premium", onClick: () => navigate("/subscriptions") },
        });
      } else {
        toast.error("Errore nell'avvio della live");
      }
      setLoading(false);
      return;
    }

    toast.success("Live avviata! 🔴");
    // Navigate to live page with the stream ID so it auto-selects
    navigate(`/live?stream=${data.id}`);
  };

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full glass flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-display font-bold">Avvia una Live</h1>
            <p className="text-xs text-muted-foreground">Configura la tua sessione live</p>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-6 pb-32">
        {/* Title */}
        <div className="space-y-2">
          <label className="text-sm font-semibold flex items-center gap-2">
            <Video className="w-4 h-4 text-primary" /> Titolo Live
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Es: Tutorial taglio bob moderno"
            className="w-full h-12 rounded-xl bg-card border border-border px-4 text-sm"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-sm font-semibold">Descrizione (opzionale)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Descrivi cosa farai in questa live..."
            className="w-full h-24 rounded-xl bg-card border border-border px-4 py-3 text-sm resize-none"
          />
        </div>

        {/* Category */}
        <div className="space-y-3">
          <label className="text-sm font-semibold">Categoria</label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                className={`py-3 px-4 rounded-xl text-sm font-medium transition-all text-left ${
                  category === cat.value
                    ? `bg-gradient-to-r ${cat.color} text-white scale-[1.02] shadow-lg`
                    : "bg-card border border-border hover:border-primary/50"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div className="space-y-3">
          <label className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Durata prevista
          </label>
          <div className="flex gap-2 flex-wrap">
            {DURATIONS.map(d => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  duration === d
                    ? "gradient-primary text-primary-foreground shadow-glow"
                    : "bg-card border border-border"
                }`}
              >
                {d} min
              </button>
            ))}
          </div>
        </div>

        {/* QR Coin Pool */}
        <div className="space-y-3">
          <label className="text-sm font-semibold flex items-center gap-2">
            <Coins className="w-4 h-4 text-gold" /> QRCoin da distribuire
          </label>
          <div className="glass rounded-xl p-4">
            <input
              type="range"
              min={10}
              max={1000}
              step={10}
              value={qrCoinPool}
              onChange={e => setQrCoinPool(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between mt-2">
              <span className="text-xs text-muted-foreground">10 QRC</span>
              <span className="text-lg font-bold text-gold">{qrCoinPool} QRC</span>
              <span className="text-xs text-muted-foreground">1000 QRC</span>
            </div>
          </div>
        </div>

        {/* Interaction Goal */}
        <div className="space-y-3">
          <label className="text-sm font-semibold flex items-center gap-2">
            <Target className="w-4 h-4 text-accent" /> Obiettivo interazioni
          </label>
          <div className="flex gap-2 flex-wrap">
            {[20, 50, 100, 200, 500].map(g => (
              <button
                key={g}
                onClick={() => setInteractionGoal(g)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  interactionGoal === g
                    ? "bg-accent text-accent-foreground"
                    : "bg-card border border-border"
                }`}
              >
                {g} interazioni
              </button>
            ))}
          </div>
        </div>

        {/* Visibility */}
        <div className="space-y-3">
          <label className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" /> Visibilità
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setIsPublic(true)}
              className={`flex items-center gap-3 p-4 rounded-xl transition-all ${
                isPublic ? "gradient-primary text-primary-foreground" : "bg-card border border-border"
              }`}
            >
              <Globe className="w-5 h-5" />
              <div className="text-left">
                <p className="text-sm font-bold">Pubblica</p>
                <p className="text-xs opacity-70">Visibile a tutti</p>
              </div>
            </button>
            <button
              onClick={() => setIsPublic(false)}
              className={`flex items-center gap-3 p-4 rounded-xl transition-all ${
                !isPublic ? "gradient-primary text-primary-foreground" : "bg-card border border-border"
              }`}
            >
              <Lock className="w-5 h-5" />
              <div className="text-left">
                <p className="text-sm font-bold">Solo Follower</p>
                <p className="text-xs opacity-70">Invito esclusivo</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Start Button */}
      <div className="fixed bottom-20 inset-x-0 p-4 z-30">
        <button
          onClick={startLive}
          disabled={loading || !title.trim()}
          className="w-full py-4 rounded-2xl gradient-live text-primary-foreground font-bold text-lg shadow-glow flex items-center justify-center gap-3 disabled:opacity-50"
        >
          {loading ? (
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Circle className="w-5 h-5 text-destructive fill-destructive" />
              Vai in Diretta
            </>
          )}
        </button>
      </div>
    </MobileLayout>
  );
}
