import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, Gift, Send, Coins, Trophy, Flame, Crown, Swords, ShoppingBag, UserPlus, Share2, ThumbsUp, Timer, Heart, Sparkles, Zap, Video, Circle, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQRCoinRewards } from "@/hooks/useQRCoinRewards";
import MobileLayout from "@/components/layout/MobileLayout";
import LiveShopPanel from "@/components/live/LiveShopPanel";
import ReportDialog from "@/components/ReportDialog";
import { toast } from "sonner";

interface Battle {
  id: string;
  host_a_id: string;
  host_b_id: string;
  host_a_name: string;
  host_b_name: string;
  host_a_thumbnail: string | null;
  host_b_thumbnail: string | null;
  score_a: number;
  score_b: number;
  status: string;
  category: string | null;
  prize_pool: number;
  created_at: string;
}

interface ChatMessage {
  id: string;
  user: string;
  message: string;
  type: "chat" | "vote" | "tip" | "system";
  side?: "a" | "b";
}

const reactionIcons = [
  { Icon: Flame, label: "fire", color: "text-destructive" },
  { Icon: Heart, label: "heart", color: "text-primary" },
  { Icon: Sparkles, label: "sparkle", color: "text-accent" },
  { Icon: Crown, label: "crown", color: "text-yellow-400" },
  { Icon: Trophy, label: "star", color: "text-accent" },
];

export default function LiveBattlePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile, refreshProfile } = useAuth();
  const { awardCoins } = useQRCoinRewards();

  const [battles, setBattles] = useState<Battle[]>([]);
  const [selectedBattle, setSelectedBattle] = useState<Battle | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatMessage, setChatMessage] = useState("");
  const [hasVoted, setHasVoted] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipSide, setTipSide] = useState<"a" | "b">("a");
  const [tipAmount, setTipAmount] = useState(5);
  const [loading, setLoading] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchBattles(); }, []);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages]);

  const fetchBattles = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("live_battles")
      .select("*")
      .in("status", ["waiting", "live"])
      .order("created_at", { ascending: false });
    if (data) setBattles(data as Battle[]);
    setLoading(false);
  };

  const vote = async (side: "a" | "b", withQRC = false) => {
    if (!selectedBattle || !user) { toast.error("Devi effettuare l'accesso"); return; }
    if (hasVoted && !withQRC) { toast.error("Hai già votato!"); return; }

    const votedFor = side === "a" ? selectedBattle.host_a_id : selectedBattle.host_b_id;
    const name = side === "a" ? selectedBattle.host_a_name : selectedBattle.host_b_name;
    const qrcAmount = withQRC ? tipAmount : 0;

    if (withQRC) {
      const balance = profile?.qr_coins || 0;
      if (balance < qrcAmount) { toast.error("QRCoin insufficienti"); return; }
      const { data, error } = await supabase.functions.invoke("qr-coins-transaction", {
        body: { kind: "spend", amount: qrcAmount, reason: "battle_vote" },
      });
      if (error || data?.error) {
        toast.error(data?.error || "Voto con QRC fallito, riprova");
        return;
      }
      refreshProfile();
    }

    const { error } = await supabase.from("battle_votes").insert({
      battle_id: selectedBattle.id,
      user_id: user.id,
      voted_for: votedFor,
      qr_coin_amount: qrcAmount,
    });

    if (error && error.code === "23505") {
      toast.error("Hai già votato! Usa QRCoin per aumentare il punteggio");
      return;
    }

    setHasVoted(true);
    setChatMessages(prev => [...prev, {
      id: `vote-${Date.now()}`, user: profile?.display_name || "Utente",
      message: withQRC ? `ha inviato ${qrcAmount} QRC a ${name}!` : `ha votato per ${name}!`,
      type: withQRC ? "tip" : "vote", side
    }]);

    // Update local scores
    setSelectedBattle(prev => prev ? {
      ...prev,
      score_a: side === "a" ? prev.score_a + 1 + qrcAmount : prev.score_a,
      score_b: side === "b" ? prev.score_b + 1 + qrcAmount : prev.score_b,
    } : prev);

    awardCoins("react_live", true);
    toast.success(withQRC ? `+${qrcAmount} QRC a ${name}!` : `Voto per ${name}!`);
    if (withQRC) setShowTipModal(false);
  };

  const sendChat = () => {
    if (!chatMessage.trim() || !user) return;
    setChatMessages(prev => [...prev, {
      id: `chat-${Date.now()}`, user: profile?.display_name || "Utente",
      message: chatMessage, type: "chat"
    }]);
    setChatMessage("");
    awardCoins("comment_live", true);
  };

  const shareBattle = () => {
    if (!selectedBattle) return;
    const url = `${window.location.origin}/live-battle?id=${selectedBattle.id}&ref=${user?.id}`;
    if (navigator.share) {
      navigator.share({ title: `Live Battle: ${selectedBattle.host_a_name} vs ${selectedBattle.host_b_name}`, url });
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Link copiato!");
    }
    awardCoins("share");
  };

  // ===== BATTLE VIEW =====
  if (selectedBattle) {
    const totalScore = selectedBattle.score_a + selectedBattle.score_b || 1;
    const pctA = Math.round((selectedBattle.score_a / totalScore) * 100);
    const pctB = 100 - pctA;

    return (
      <MobileLayout>
        <div className="min-h-screen bg-background">
          {/* Header */}
          <header className="sticky top-0 z-40 glass px-4 py-3">
            <div className="flex items-center justify-between">
              <button onClick={() => setSelectedBattle(null)} className="w-10 h-10 rounded-full glass flex items-center justify-center">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-destructive-foreground animate-pulse" /> BATTLE LIVE
                </span>
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-full glass text-xs">
                  <Coins className="w-3 h-3 text-gold" /> {selectedBattle.prize_pool} QRC
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowReport(true)} className="w-10 h-10 rounded-full glass flex items-center justify-center">
                  <Flag className="w-5 h-5 text-muted-foreground" />
                </button>
                <button onClick={shareBattle} className="w-10 h-10 rounded-full glass flex items-center justify-center">
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </header>

          {/* Split Screen */}
          <div className="grid grid-cols-2 gap-1 p-2">
            {/* Host A */}
            <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-card">
              <img
                src={selectedBattle.host_a_thumbnail || `https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400`}
                alt="" className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-background/40" />
              <div className="absolute top-3 left-3">
                <div className="w-12 h-12 rounded-full border-2 border-primary overflow-hidden">
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedBattle.host_a_id}`} alt="" className="w-full h-full" />
                </div>
              </div>
              <div className="absolute bottom-0 inset-x-0 p-3">
                <p className="font-bold text-sm truncate">{selectedBattle.host_a_name}</p>
                <p className="text-2xl font-display font-black text-primary">{selectedBattle.score_a}</p>
                <button
                  onClick={() => vote("a")}
                  disabled={hasVoted}
                  className="w-full mt-2 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
                >
                   {hasVoted ? "Votato ✓" : "Vota"}
                </button>
              </div>
            </div>

            {/* Host B */}
            <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-card">
              <img
                src={selectedBattle.host_b_thumbnail || `https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400`}
                alt="" className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-background/40" />
              <div className="absolute top-3 right-3">
                <div className="w-12 h-12 rounded-full border-2 border-accent overflow-hidden">
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedBattle.host_b_id}`} alt="" className="w-full h-full" />
                </div>
              </div>
              <div className="absolute bottom-0 inset-x-0 p-3 text-right">
                <p className="font-bold text-sm truncate">{selectedBattle.host_b_name}</p>
                <p className="text-2xl font-display font-black text-accent">{selectedBattle.score_b}</p>
                <button
                  onClick={() => vote("b")}
                  disabled={hasVoted}
                  className="w-full mt-2 py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-bold disabled:opacity-50"
                >
                  {hasVoted ? "Votato ✓" : "Vota"}
                </button>
              </div>
            </div>
          </div>

          {/* Score Bar */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-primary">{pctA}%</span>
              <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden flex">
                <div className="h-full gradient-primary transition-all duration-500" style={{ width: `${pctA}%` }} />
                <div className="h-full bg-accent transition-all duration-500" style={{ width: `${pctB}%` }} />
              </div>
              <span className="text-xs font-bold text-accent">{pctB}%</span>
            </div>
            <div className="flex items-center justify-center gap-3">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" /> {selectedBattle.score_a + selectedBattle.score_b} voti totali</span>
              <span className="text-xs text-gold font-bold flex items-center gap-1"><Trophy className="w-3 h-3" /> {selectedBattle.prize_pool} QRC in palio</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="px-4 flex gap-2 mb-3">
            <button
              onClick={() => { setTipSide("a"); setShowTipModal(true); }}
              className="flex-1 py-2.5 rounded-xl glass flex items-center justify-center gap-2 text-sm font-semibold"
            >
              <Coins className="w-4 h-4 text-gold" /> QRC → {selectedBattle.host_a_name.split(" ")[0]}
            </button>
            <button
              onClick={() => { setTipSide("b"); setShowTipModal(true); }}
              className="flex-1 py-2.5 rounded-xl glass flex items-center justify-center gap-2 text-sm font-semibold"
            >
              <Coins className="w-4 h-4 text-gold" /> QRC → {selectedBattle.host_b_name.split(" ")[0]}
            </button>
            <button onClick={() => setShowShop(true)} className="w-12 h-12 rounded-xl glass flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-accent" />
            </button>
          </div>

          {/* Chat */}
          <div className="px-4 pb-28">
            <div ref={chatRef} className="space-y-2 max-h-40 overflow-y-auto no-scrollbar mb-3">
              {chatMessages.slice(-10).map(msg => (
                <div key={msg.id} className={`glass rounded-xl px-3 py-2 max-w-[90%] ${
                  msg.type === "tip" ? "border border-gold/30" : msg.type === "vote" ? "border border-primary/20" : ""
                }`}>
                  <p className="text-sm">
                    <span className={`font-semibold ${
                      msg.type === "tip" ? "text-gold" : msg.side === "a" ? "text-primary" : msg.side === "b" ? "text-accent" : ""
                    }`}>{msg.user}</span>{" "}{msg.message}
                  </p>
                </div>
              ))}
            </div>

            {/* Reactions + Input */}
            <div className="flex items-center gap-2 mb-3">
              {reactionIcons.map(r => (
                <button key={r.label} onClick={() => {
                  setChatMessages(prev => [...prev, { id: `r-${Date.now()}`, user: profile?.display_name || "Utente", message: r.label, type: "chat" }]);
                  awardCoins("react_live", true);
                }} className="w-9 h-9 rounded-full glass flex items-center justify-center hover:scale-110 transition-transform shrink-0">
                  <r.Icon className={`w-4 h-4 ${r.color}`} />
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                value={chatMessage}
                onChange={e => setChatMessage(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendChat()}
                placeholder="Scrivi nella battle..."
                className="flex-1 h-11 rounded-full glass px-5 text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground"
              />
              <button onClick={sendChat} className="w-11 h-11 rounded-full gradient-primary flex items-center justify-center shadow-glow">
                <Send className="w-5 h-5 text-primary-foreground" />
              </button>
            </div>
          </div>

          {/* Report */}
          {showReport && (
            <ReportDialog
              open={showReport}
              onClose={() => setShowReport(false)}
              targetContentId={selectedBattle.id}
              contentType="post"
            />
          )}

          {/* Shop Panel */}
          {showShop && <LiveShopPanel onClose={() => setShowShop(false)} />}

          {/* QRC Tip Modal */}
          {showTipModal && (
            <div className="fixed inset-0 z-50 flex items-end">
              <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setShowTipModal(false)} />
              <div className="relative w-full glass rounded-t-3xl p-6 slide-up">
                <h3 className="font-display font-bold text-lg mb-1">
                  Invia QRC a {tipSide === "a" ? selectedBattle.host_a_name : selectedBattle.host_b_name}
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Saldo: <span className="text-gold font-bold">{profile?.qr_coins || 0} QRC</span>
                </p>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[2, 5, 10, 25, 50, 100].map(amt => (
                    <button key={amt} onClick={() => setTipAmount(amt)}
                      className={`py-3 rounded-xl text-center transition-all ${
                        tipAmount === amt ? "gradient-gold text-gold-foreground scale-105" : "bg-card border border-border"
                      }`}>
                      <p className="text-lg font-bold">{amt}</p>
                      <p className="text-xs opacity-70">QRC</p>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => vote(tipSide, true)}
                  className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-bold text-lg flex items-center justify-center gap-2"
                >
                  <Flame className="w-5 h-5" /> Invia {tipAmount} QRC
                </button>
              </div>
            </div>
          )}
        </div>
      </MobileLayout>
    );
  }

  // ===== BATTLES LIST =====
  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <Swords className="w-6 h-6 text-destructive" /> Live Battle
            </h1>
            <p className="text-sm text-muted-foreground">Sfide in tempo reale tra professionisti</p>
          </div>
          <button onClick={() => navigate("/live")} className="px-4 py-2 rounded-full glass text-sm font-semibold flex items-center gap-1.5">
            <Video className="w-4 h-4" /> Live
          </button>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Weekly Ranking CTA */}
        <div className="glass rounded-2xl p-4 border border-gold/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full gradient-gold flex items-center justify-center">
              <Trophy className="w-6 h-6 text-gold-foreground" />
            </div>
            <div>
              <h3 className="font-display font-bold">Top Creator Settimana</h3>
              <p className="text-xs text-muted-foreground">+500 QRC + badge + visibilità home</p>
            </div>
          </div>
          <button onClick={() => navigate("/leaderboard")} className="w-full py-2.5 rounded-xl bg-card border border-border text-sm font-semibold">
            Vedi Classifica Completa →
          </button>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map(i => <div key={i} className="h-48 rounded-2xl bg-card animate-pulse" />)}
          </div>
        ) : battles.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Swords className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nessuna Battle attiva</h3>
            <p className="text-muted-foreground text-sm mb-4">Sfida un professionista dalla tua live!</p>
            <button onClick={() => navigate("/go-live")} className="px-6 py-3 rounded-xl gradient-primary text-primary-foreground font-bold flex items-center gap-2">
              <Circle className="w-4 h-4 text-destructive fill-destructive" /> Avvia una Live
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {battles.map(b => {
              const total = b.score_a + b.score_b || 1;
              const pA = Math.round((b.score_a / total) * 100);
              return (
                <button key={b.id} onClick={() => setSelectedBattle(b)}
                  className="w-full glass rounded-2xl p-4 text-left border border-border/50 hover:border-primary/30 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-bold">
                      <Flame className="w-3 h-3" /> {b.status === "live" ? "LIVE" : "IN ATTESA"}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gold font-bold">
                      <Coins className="w-3 h-3" /> {b.prize_pool} QRC
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 text-center">
                      <div className="w-14 h-14 rounded-full border-2 border-primary mx-auto overflow-hidden mb-1">
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${b.host_a_id}`} alt="" className="w-full h-full" />
                      </div>
                      <p className="text-xs font-bold truncate">{b.host_a_name}</p>
                      <p className="text-lg font-display font-black text-primary">{b.score_a}</p>
                    </div>
                    <div className="shrink-0">
                      <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-destructive" />
                      </div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="w-14 h-14 rounded-full border-2 border-accent mx-auto overflow-hidden mb-1">
                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${b.host_b_id}`} alt="" className="w-full h-full" />
                      </div>
                      <p className="text-xs font-bold truncate">{b.host_b_name}</p>
                      <p className="text-lg font-display font-black text-accent">{b.score_b}</p>
                    </div>
                  </div>
                  <div className="flex h-2 rounded-full bg-muted overflow-hidden mt-3">
                    <div className="h-full gradient-primary" style={{ width: `${pA}%` }} />
                    <div className="h-full bg-accent" style={{ width: `${100 - pA}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
