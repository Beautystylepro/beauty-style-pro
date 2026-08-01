import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Trophy, ThumbsUp, MessageCircle, Coins, Calendar, Star, Flame, Crown, Bookmark, MapPin, Sparkles, Plus, ChevronRight, Loader2, Camera, Scissors, Palette, Paintbrush, Gem } from "lucide-react";
import MobileLayout from "@/components/layout/MobileLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQRCoinRewards } from "@/hooks/useQRCoinRewards";
import { toast } from "sonner";
import beauty1 from "@/assets/beauty-1.jpg";
import beauty2 from "@/assets/beauty-2.jpg";
import beauty3 from "@/assets/beauty-3.jpg";
import stylist1 from "@/assets/stylist-1.jpg";
import stylist2 from "@/assets/stylist-2.jpg";

interface TransformationChallenge {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  category: string;
  technique: string | null;
  before_image_url: string | null;
  after_image_url: string | null;
  style_name: string | null;
  estimated_price: number | null;
  estimated_duration: string | null;
  products_used: string[];
  replicable: boolean;
  vote_count: number;
  qr_coin_received: number;
  booking_count: number;
  featured: boolean;
  created_at: string;
  creator?: { display_name: string | null; avatar_url: string | null };
}

const CATEGORIES = [
  { value: "all", label: "Tutti", Icon: Flame, color: "" },
  { value: "hairstyle", label: "Capelli", Icon: Scissors, color: "" },
  { value: "barber", label: "Barba", Icon: Scissors, color: "" },
  { value: "color", label: "Colore", Icon: Palette, color: "" },
  { value: "makeup", label: "Makeup", Icon: Paintbrush, color: "" },
  { value: "nails", label: "Nails", Icon: Gem, color: "" },
  { value: "skincare", label: "Skincare", Icon: Sparkles, color: "" },
];

const LEADERBOARD_TABS = ["Settimana", "Mese", "Sempre"];

const fallbackChallenges: TransformationChallenge[] = [
  {
    id: "f1", creator_id: "", title: "Balayage Caramel Glow", description: "Trasformazione completa con tecnica balayage", category: "color",
    technique: "Balayage", before_image_url: beauty3, after_image_url: beauty2, style_name: "Caramel Glow",
    estimated_price: 120, estimated_duration: "2h", products_used: ["Olaplex", "Wella Color"], replicable: true,
    vote_count: 234, qr_coin_received: 450, booking_count: 12, featured: true, created_at: new Date().toISOString(),
    creator: { display_name: "Martina Rossi", avatar_url: stylist2 },
  },
  {
    id: "f2", creator_id: "", title: "Taglio Pixie Moderno", description: "Da capelli lunghi a pixie cut", category: "hairstyle",
    technique: "Taglio geometrico", before_image_url: beauty1, after_image_url: stylist1, style_name: "Pixie Modern",
    estimated_price: 45, estimated_duration: "45min", products_used: ["Spray fissante", "Siero lucidante"], replicable: true,
    vote_count: 189, qr_coin_received: 280, booking_count: 8, featured: false, created_at: new Date().toISOString(),
    creator: { display_name: "Marco Studio", avatar_url: beauty1 },
  },
  {
    id: "f3", creator_id: "", title: "Nail Art Galaxy", description: "Design galattico con effetto olografico", category: "nails",
    technique: "Nail art avanzata", before_image_url: beauty2, after_image_url: beauty3, style_name: "Galaxy Nails",
    estimated_price: 55, estimated_duration: "1h30", products_used: ["Gel olografico", "Top coat"], replicable: true,
    vote_count: 312, qr_coin_received: 520, booking_count: 15, featured: true, created_at: new Date().toISOString(),
    creator: { display_name: "Beauty Star", avatar_url: stylist1 },
  },
];

export default function TransformationChallengePage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { awardCoins } = useQRCoinRewards();
  const [challenges, setChallenges] = useState<TransformationChallenge[]>(fallbackChallenges);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [leaderboardTab, setLeaderboardTab] = useState("Settimana");
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [showDonate, setShowDonate] = useState<string | null>(null);
  const [donateAmount, setDonateAmount] = useState(10);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"feed" | "leaderboard">("feed");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchChallenges(); }, []);

  const fetchChallenges = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("transformation_challenges")
      .select("*")
      .eq("status", "active")
      .order("vote_count", { ascending: false });

    if (data && data.length > 0) {
      // Fetch creator profiles
      const creatorIds = [...new Set(data.map(c => c.creator_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", creatorIds);
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      setChallenges(data.map(c => ({
        ...c,
        creator: profileMap.get(c.creator_id) || undefined,
      })));

      // Load user votes
      if (user) {
        const { data: votes } = await supabase
          .from("challenge_votes")
          .select("challenge_id")
          .eq("user_id", user.id);
        if (votes) setVotedIds(new Set(votes.map(v => v.challenge_id)));
      }
    }
    setLoading(false);
  };

  const filteredChallenges = selectedCategory === "all"
    ? challenges
    : challenges.filter(c => c.category === selectedCategory);

  const toggleVote = async (challengeId: string) => {
    if (!user) { navigate("/auth"); return; }
    const hasVoted = votedIds.has(challengeId);
    if (hasVoted) {
      await supabase.from("challenge_votes").delete().eq("challenge_id", challengeId).eq("user_id", user.id);
      setVotedIds(prev => { const n = new Set(prev); n.delete(challengeId); return n; });
      setChallenges(prev => prev.map(c => c.id === challengeId ? { ...c, vote_count: Math.max(0, c.vote_count - 1) } : c));
    } else {
      await supabase.from("challenge_votes").insert({ challenge_id: challengeId, user_id: user.id });
      setVotedIds(prev => new Set(prev).add(challengeId));
      setChallenges(prev => prev.map(c => c.id === challengeId ? { ...c, vote_count: c.vote_count + 1 } : c));
      awardCoins("react_live", true);
    }
  };

  const donateQRC = async (challengeId: string) => {
    if (!user) { navigate("/auth"); return; }
    const balance = profile?.qr_coins || 0;
    if (balance < donateAmount) { toast.error("QRCoin insufficienti"); return; }

    const { data, error } = await supabase.functions.invoke("qr-coins-transaction", {
      body: {
        kind: "spend", amount: donateAmount, reason: "challenge_donation",
        sideEffect: { table: "challenge_donations", row: { challenge_id: challengeId, donor_id: user.id, amount: donateAmount } },
      },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Donazione fallita, riprova");
      return;
    }
    refreshProfile();
    setChallenges(prev => prev.map(c => c.id === challengeId ? { ...c, qr_coin_received: c.qr_coin_received + donateAmount } : c));
    setShowDonate(null);
    toast.success(`+${donateAmount} QRC donati! 🎉`);
  };

  const topChallenges = [...challenges].sort((a, b) => b.vote_count - a.vote_count).slice(0, 10);

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-display font-bold">Challenge Trasformazione</h1>
            <p className="text-xs text-muted-foreground">Vota, dona QRC e prenota il tuo look</p>
          </div>
          <button onClick={() => navigate("/create-post")} className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center shadow-glow">
            <Plus className="w-5 h-5 text-primary-foreground" />
          </button>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2 mb-3">
           <button onClick={() => setView("feed")} className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${view === "feed" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
             Feed
           </button>
           <button onClick={() => setView("leaderboard")} className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${view === "leaderboard" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
             Classifica
          </button>
        </div>

        {/* Category Filters */}
        {view === "feed" && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            {CATEGORIES.map(cat => (
              <button key={cat.value} onClick={() => setSelectedCategory(cat.value)}
                 className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                   selectedCategory === cat.value ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground"
                 }`}>
                {cat.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="p-4">
        {/* ===== FEED VIEW ===== */}
        {view === "feed" && (
          <div className="space-y-5">
            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : filteredChallenges.length === 0 ? (
              <div className="text-center py-16">
                <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold mb-1">Nessuna challenge</h3>
                <p className="text-sm text-muted-foreground">Sii il primo a pubblicare!</p>
              </div>
            ) : (
              filteredChallenges.map(ch => (
                <div key={ch.id} className="rounded-2xl bg-card border border-border/50 overflow-hidden shadow-card fade-in">
                  {/* Before/After Images */}
                  <div className="flex relative">
                    <div className="w-1/2 aspect-[3/4] relative">
                      <img src={ch.before_image_url || beauty3} alt="Prima" className="w-full h-full object-cover" />
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full glass text-xs font-bold">Prima</div>
                    </div>
                    <div className="w-1/2 aspect-[3/4] relative">
                      <img src={ch.after_image_url || beauty2} alt="Dopo" className="w-full h-full object-cover" />
                      <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full glass text-xs font-bold">Dopo</div>
                    </div>
                    {ch.featured && (
                      <div className="absolute top-2 left-2 px-2 py-1 rounded-full gradient-primary text-primary-foreground text-xs font-bold flex items-center gap-1">
                        <Flame className="w-3 h-3" /> Trending
                      </div>
                    )}
                    {ch.replicable && (
                      <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Replicabile
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    {/* Creator */}
                    <div className="flex items-center gap-2.5 mb-3">
                      <img src={ch.creator?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${ch.creator_id}`} alt="" className="w-9 h-9 rounded-full object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{ch.creator?.display_name || "Professionista"}</p>
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold capitalize">{ch.category}</span>
                      </div>
                    </div>

                    <h3 className="font-display font-bold text-base mb-1">{ch.title}</h3>
                    {ch.description && <p className="text-xs text-muted-foreground mb-2">{ch.description}</p>}

                    {/* Style Details */}
                    {ch.style_name && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {ch.style_name && <span className="px-2 py-1 rounded-full bg-muted text-xs font-medium">{ch.style_name}</span>}
                        {ch.technique && <span className="px-2 py-1 rounded-full bg-muted text-xs font-medium">{ch.technique}</span>}
                        {ch.estimated_duration && <span className="px-2 py-1 rounded-full bg-muted text-xs font-medium">{ch.estimated_duration}</span>}
                        {ch.estimated_price && <span className="px-2 py-1 rounded-full bg-muted text-xs font-medium">€{ch.estimated_price}</span>}
                      </div>
                    )}

                    {/* Products */}
                    {ch.products_used && ch.products_used.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {ch.products_used.map((p, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs font-medium">{p}</span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleVote(ch.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all ${
                        votedIds.has(ch.id) ? "gradient-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-primary/10"
                      }`}>
                        <ThumbsUp className="w-4 h-4" />
                        <span className="text-xs font-bold">{ch.vote_count}</span>
                      </button>
                      <button onClick={() => setShowDonate(ch.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent/10 text-accent">
                        <Coins className="w-4 h-4" />
                        <span className="text-xs font-bold">{ch.qr_coin_received}</span>
                      </button>
                      <button onClick={() => setSavedIds(prev => { const n = new Set(prev); if (n.has(ch.id)) { n.delete(ch.id); } else { n.add(ch.id); } return n; })}
                        className={`p-2 rounded-xl ${savedIds.has(ch.id) ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        <Bookmark className={`w-4 h-4 ${savedIds.has(ch.id) ? "fill-primary" : ""}`} />
                      </button>
                      <div className="flex-1" />
                      {ch.replicable && (
                        <button onClick={() => navigate("/stylists")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-bold shadow-glow">
                          <MapPin className="w-3.5 h-3.5" /> Prenota
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Donate Modal */}
                  {showDonate === ch.id && (
                    <div className="p-4 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-2">Dona QRCoin a questo professionista</p>
                      <div className="flex gap-2 mb-3">
                        {[5, 10, 25, 50, 100].map(amt => (
                          <button key={amt} onClick={() => setDonateAmount(amt)}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                              donateAmount === amt ? "gradient-gold text-gold-foreground" : "bg-muted text-muted-foreground"
                            }`}>{amt}</button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setShowDonate(null)} className="flex-1 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold">Annulla</button>
                        <button onClick={() => donateQRC(ch.id)} className="flex-1 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold">
                          Dona {donateAmount} QRC
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ===== LEADERBOARD VIEW ===== */}
        {view === "leaderboard" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {LEADERBOARD_TABS.map(tab => (
                 <button key={tab} onClick={() => setLeaderboardTab(tab)}
                   className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                     leaderboardTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>{tab}</button>
              ))}
            </div>

            {/* Category Leaderboards */}
            {["hairstyle", "barber", "color", "makeup", "nails"].map(cat => {
              const catChallenges = challenges.filter(c => c.category === cat).sort((a, b) => b.vote_count - a.vote_count).slice(0, 3);
              if (catChallenges.length === 0) return null;
              const catLabel = CATEGORIES.find(c => c.value === cat)?.label || cat;
              return (
                <div key={cat} className="rounded-2xl bg-card border border-border/50 p-4">
                  <h3 className="font-display font-bold text-sm mb-3">{catLabel} Top</h3>
                  <div className="space-y-2">
                    {catChallenges.map((ch, i) => (
                      <div key={ch.id} className="flex items-center gap-3">
                        <span className="text-sm font-bold text-muted-foreground">{i + 1}</span>
                        <img src={ch.after_image_url || beauty2} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{ch.title}</p>
                          <p className="text-xs text-muted-foreground">{ch.creator?.display_name || "Pro"}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <ThumbsUp className="w-3 h-3 text-primary" />
                          <span className="text-xs font-bold">{ch.vote_count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Overall Top */}
            <div className="rounded-2xl bg-card border border-border/50 p-4">
              <h3 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
                <Crown className="w-4 h-4 text-accent" /> Top Trasformazione Globale
              </h3>
              <div className="space-y-2">
                {topChallenges.map((ch, i) => (
                  <div key={ch.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/50 transition-colors">
                    <span className="text-sm font-bold text-muted-foreground w-6 text-center">#{i + 1}</span>
                    <img src={ch.after_image_url || beauty2} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{ch.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{ch.creator?.display_name}</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[8px] font-bold capitalize">{ch.category}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <ThumbsUp className="w-3 h-3 text-primary" />
                        <span className="text-xs font-bold">{ch.vote_count}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Coins className="w-3 h-3 text-accent" />
                        <span className="text-xs text-accent font-medium">{ch.qr_coin_received}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </MobileLayout>
  );
}