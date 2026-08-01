import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Coins, Volume2, VolumeX, Star, Sparkles, Gift, Trophy, Crown, Share2, ShoppingBag, Timer, Target, ChevronRight, Zap, Users, CreditCard, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import MobileLayout from "@/components/layout/MobileLayout";
import { toast } from "sonner";

const spinPrizes = [
  { label: "10 QRC", type: "QR_COIN", value: 10, color: "hsl(0 70% 50%)", probability: 0.22 },
  { label: "25 QRC", type: "QR_COIN", value: 25, color: "hsl(35 80% 50%)", probability: 0.18 },
  { label: "50 QRC", type: "QR_COIN", value: 50, color: "hsl(155 50% 42%)", probability: 0.14 },
  { label: "10%", type: "DISCOUNT", value: 10, color: "hsl(220 70% 55%)", probability: 0.14 },
  { label: "20%", type: "DISCOUNT", value: 20, color: "hsl(262 80% 55%)", probability: 0.10 },
  { label: "100 QRC", type: "QR_COIN", value: 100, color: "hsl(330 70% 55%)", probability: 0.06 },
  { label: "SPA", type: "SPA_VOUCHER", value: 1, color: "hsl(180 60% 45%)", probability: 0.04 },
  { label: "500 QRC", type: "QR_COIN", value: 500, color: "hsl(40 75% 52%)", probability: 0.02 },
  { label: "5 QRC", type: "QR_COIN", value: 5, color: "hsl(15 80% 50%)", probability: 0.05 },
  { label: "Gratis!", type: "FREE_SERVICE", value: 1, color: "hsl(280 60% 50%)", probability: 0.05 },
];

const missions = [
  { id: "m1", title: "Gira 3 volte", target: 3, reward: "1 giro bonus", icon: Target },
  { id: "m2", title: "Gira 5 volte", target: 5, reward: "Giro garantito 50+ QRC", icon: Star },
  { id: "m3", title: "Condividi risultato", target: 1, reward: "+10 QRC", icon: Share2 },
  { id: "m4", title: "Invita un amico", target: 1, reward: "2 giri gratis", icon: Users },
];

const spinPackages = [
  { spins: 3, price: 50, label: "3 Giri", badge: "" },
  { spins: 5, price: 75, label: "5 Giri", badge: "-25%" },
  { spins: 10, price: 120, label: "10 Giri", badge: "Best!" },
];

const leaderboard = [
  { rank: 1, name: "Martina R.", won: 2450, avatar: "MR" },
  { rank: 2, name: "Luca S.", won: 1890, avatar: "LS" },
  { rank: 3, name: "Sylvie B.", won: 1340, avatar: "SB" },
  { rank: 4, name: "Marco P.", won: 980, avatar: "MP" },
  { rank: 5, name: "Elena N.", won: 750, avatar: "EN" },
];

type ViewState = "wheel" | "shop" | "missions" | "leaderboard";

export default function SpinWheelPage() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<typeof spinPrizes[0] | null>(null);
  const [rotation, setRotation] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [spinsRemaining, setSpinsRemaining] = useState(3);
  const [totalSpins, setTotalSpins] = useState(0);
  const [totalWon, setTotalWon] = useState(0);
  const [viewState, setViewState] = useState<ViewState>("wheel");
  const [dailyBonusClaimed, setDailyBonusClaimed] = useState(false);
  const [nextBonusTime, setNextBonusTime] = useState("");
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [missionsProgress, setMissionsProgress] = useState<Record<string, number>>({ m1: 0, m2: 0, m3: 0, m4: 0 });
  const wheelRef = useRef<HTMLDivElement>(null);

  const qrCoins = profile?.qr_coins || 0;

  // Daily bonus timer
  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0);
      const diff = tomorrow.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setNextBonusTime(`${h}h ${m}m`);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, []);

  const selectPrize = (): typeof spinPrizes[0] => {
    const random = Math.random();
    let cumulative = 0;
    for (const prize of spinPrizes) {
      cumulative += prize.probability;
      if (random <= cumulative) return prize;
    }
    return spinPrizes[0];
  };

  const handleSpin = async () => {
    if (isSpinning) return;
    if (!user) { toast.error("Accedi per girare la ruota"); navigate("/auth"); return; }
    if (spinsRemaining <= 0) { setShowBuyModal(true); return; }

    setIsSpinning(true);
    setSpinResult(null);
    setSpinsRemaining(prev => prev - 1);
    setTotalSpins(prev => prev + 1);

    const prize = selectPrize();
    const prizeIndex = spinPrizes.indexOf(prize);
    const segmentAngle = 360 / spinPrizes.length;
    const targetAngle = 360 - (prizeIndex * segmentAngle + segmentAngle / 2);
    const totalRotation = rotation + 2520 + targetAngle;
    setRotation(totalRotation);

    // Update missions
    setMissionsProgress(prev => ({
      ...prev,
      m1: Math.min(prev.m1 + 1, 3),
      m2: Math.min(prev.m2 + 1, 5),
    }));

    setTimeout(async () => {
      setIsSpinning(false);
      setSpinResult(prize);

      if (prize.type === "QR_COIN") setTotalWon(prev => prev + prize.value);

      try {
        await supabase.from('spin_results').insert({
          user_id: user.id, prize_type: prize.type,
          prize_value: prize.value, prize_description: prize.label,
        });
        if (prize.type === 'QR_COIN') {
          const { data, error } = await supabase.functions.invoke("qr-coins-transaction", {
            body: { kind: "spin_win", amount: prize.value },
          });
          if (error || data?.error) {
            console.error('Spin credit failed:', error || data?.error);
            toast.error("Errore nell'accredito della vincita, contatta il supporto");
          } else {
            refreshProfile();
          }
        }
      } catch (error) { console.error('Error:', error); }

      // Check mission completion
      const newSpins = totalSpins + 1;
      if (newSpins === 3) { toast.success("🎯 Missione completata: Gira 3 volte! +1 giro bonus"); setSpinsRemaining(prev => prev + 1); }
      if (newSpins === 5) { toast.success("⭐ Missione completata: Gira 5 volte! Giro garantito 50+ QRC"); }
    }, 4500);
  };

  const claimDailyBonus = () => {
    if (dailyBonusClaimed) return;
    setDailyBonusClaimed(true);
    setSpinsRemaining(prev => prev + 1);
    toast.success("🎁 Bonus giornaliero: +1 giro gratis!");
  };

  const buySpins = async (pkg: typeof spinPackages[0]) => {
    if (!user) { navigate("/auth"); return; }
    if (qrCoins < pkg.price) { toast.error("QRCoin insufficienti"); return; }
    const { data, error } = await supabase.functions.invoke("qr-coins-transaction", {
      body: { kind: "spend", amount: pkg.price, reason: "buy_spins" },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Acquisto fallito, riprova");
      return;
    }
    refreshProfile();
    setSpinsRemaining(prev => prev + pkg.spins);
    setShowBuyModal(false);
    toast.success(`🎡 +${pkg.spins} giri acquistati!`);
  };

  const shareResult = () => {
    const text = spinResult ? `🎡 Ho vinto ${spinResult.label} su Style! Gira anche tu!` : "🎡 Prova la Ruota della Fortuna su Style!";
    if (navigator.share) {
      navigator.share({ title: "Style - Ruota della Fortuna", text, url: window.location.href });
    } else {
      navigator.clipboard.writeText(text);
      toast.success("Copiato negli appunti!");
    }
    setMissionsProgress(prev => ({ ...prev, m3: 1 }));
  };

  // ===== MISSIONS VIEW =====
  if (viewState === "missions") {
    return (
      <MobileLayout>
        <header className="sticky top-0 z-40 glass px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewState("wheel")} className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-display font-bold">Missioni Ruota</h1>
          </div>
        </header>
        <div className="px-4 py-4 space-y-3">
          {missions.map(m => {
            const progress = missionsProgress[m.id] || 0;
            const completed = progress >= m.target;
            return (
              <div key={m.id} className={`rounded-2xl p-4 border ${completed ? "gradient-card border-primary/30" : "bg-card border-border/50"}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${completed ? "gradient-primary" : "bg-muted"}`}>
                    <m.icon className={`w-5 h-5 ${completed ? "text-primary-foreground" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{m.title}</p>
                    <p className="text-[11px] text-muted-foreground">Premio: {m.reward}</p>
                  </div>
                  {completed && <span className="text-xs font-bold text-primary">✓ Fatto</span>}
                </div>
                <div className="mt-3 w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full gradient-primary transition-all" style={{ width: `${(progress / m.target) * 100}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{progress}/{m.target}</p>
              </div>
            );
          })}
        </div>
      </MobileLayout>
    );
  }

  // ===== LEADERBOARD VIEW =====
  if (viewState === "leaderboard") {
    return (
      <MobileLayout>
        <header className="sticky top-0 z-40 glass px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setViewState("wheel")} className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-display font-bold">Classifica Ruota</h1>
          </div>
        </header>
        <div className="px-4 py-4 space-y-3">
          {/* Top 3 Podium */}
          <div className="flex items-end justify-center gap-3 py-6">
            {[leaderboard[1], leaderboard[0], leaderboard[2]].map((p, i) => {
              const heights = ["h-20", "h-28", "h-16"];
              const colors = ["bg-muted", "gradient-gold", "bg-accent/20"];
              return (
                <div key={p.rank} className="flex flex-col items-center gap-2">
                  <div className={`w-12 h-12 rounded-full ${i === 1 ? "gradient-gold border-2 border-accent" : "bg-muted"} flex items-center justify-center text-sm font-bold`}>
                    {p.avatar}
                  </div>
                  <p className="text-[11px] font-semibold">{p.name}</p>
                  <div className={`w-16 ${heights[i]} rounded-t-xl ${colors[i]} flex flex-col items-center justify-center`}>
                    <p className="text-lg font-bold">{p.rank}</p>
                    <p className="text-xs text-muted-foreground">{p.won} QRC</p>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Rest */}
          {leaderboard.slice(3).map(p => (
            <div key={p.rank} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50">
              <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold">{p.rank}</span>
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold">{p.avatar}</div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{p.name}</p>
              </div>
              <span className="text-sm font-bold text-primary">{p.won} QRC</span>
            </div>
          ))}
          {/* Your position */}
          <div className="rounded-xl glass border border-primary/20 p-3 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-sm font-bold text-primary-foreground">Tu</span>
            <div className="flex-1">
              <p className="text-sm font-semibold">{profile?.display_name || "Tu"}</p>
              <p className="text-[11px] text-muted-foreground">{totalSpins} giri totali</p>
            </div>
            <span className="text-sm font-bold text-primary">{totalWon} QRC</span>
          </div>
        </div>
      </MobileLayout>
    );
  }

  // ===== MAIN WHEEL VIEW =====
  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-display font-bold">Gira & Vinci</h1>
              <p className="text-xs text-muted-foreground">{spinsRemaining} giri rimasti</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSoundEnabled(!soundEnabled)} className="w-9 h-9 rounded-full bg-muted/50 flex items-center justify-center">
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full gradient-gold">
              <Coins className="w-3.5 h-3.5 text-gold-foreground" />
              <span className="text-sm font-bold text-gold-foreground">{qrCoins.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Sub-nav */}
        <div className="flex gap-2 mt-3">
          {[
            { key: "wheel" as ViewState, label: "Ruota", icon: Sparkles },
            { key: "missions" as ViewState, label: "Missioni", icon: Target },
            { key: "leaderboard" as ViewState, label: "Classifica", icon: Trophy },
          ].map(tab => (
            <button key={tab.key} onClick={() => setViewState(tab.key)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                viewState === tab.key ? "gradient-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
              <tab.icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col items-center px-4 py-4">
        {/* Daily Bonus */}
        {!dailyBonusClaimed && (
          <button onClick={claimDailyBonus}
            className="w-full mb-4 rounded-2xl glass border border-accent/30 p-3 flex items-center gap-3 hover:bg-accent/5 transition-all animate-fade-in">
            <div className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5 text-gold-foreground" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold">Bonus Giornaliero</p>
              <p className="text-[11px] text-muted-foreground">Riscatta il tuo giro gratuito!</p>
            </div>
            <span className="px-3 py-1.5 rounded-full gradient-primary text-primary-foreground text-xs font-bold">Riscatta</span>
          </button>
        )}
        {dailyBonusClaimed && (
          <div className="w-full mb-4 rounded-2xl bg-card border border-border/50 p-3 flex items-center gap-3">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Prossimo bonus tra <span className="font-semibold text-foreground">{nextBonusTime}</span></p>
          </div>
        )}

        {/* Wheel */}
        <div className="relative w-72 h-72 mb-5">
          <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl" />
          {/* Pointer */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-30">
            <div className="w-0 h-0 border-l-[14px] border-r-[14px] border-t-[24px] border-l-transparent border-r-transparent border-t-accent drop-shadow-lg" />
          </div>

          <div ref={wheelRef}
            className="w-full h-full rounded-full border-[5px] border-accent overflow-hidden relative shadow-2xl"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: isSpinning ? "transform 4.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
            }}>
            <div className="absolute inset-0 rounded-full" style={{
              background: `conic-gradient(${spinPrizes.map((p, i) => {
                const start = (i / spinPrizes.length) * 360;
                const end = ((i + 1) / spinPrizes.length) * 360;
                return `${p.color} ${start}deg ${end}deg`;
              }).join(", ")})`
            }} />

            {spinPrizes.map((_, i) => {
              const angle = (360 / spinPrizes.length) * i;
              return (
                <div key={i} className="absolute w-full h-0.5 bg-background/20 origin-left top-1/2"
                  style={{ transform: `rotate(${angle}deg)`, width: '50%', left: '50%' }} />
              );
            })}

            {spinPrizes.map((prize, i) => {
              const angle = (360 / spinPrizes.length) * i + (360 / spinPrizes.length / 2);
              const rad = (angle * Math.PI) / 180;
              const x = 50 + 34 * Math.sin(rad);
              const y = 50 - 34 * Math.cos(rad);
              return (
                <div key={i} className="absolute" style={{
                  left: `${x}%`, top: `${y}%`,
                  transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                }}>
                  <span className="text-xs font-bold text-white drop-shadow-lg whitespace-nowrap">{prize.label}</span>
                </div>
              );
            })}

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-card to-muted border-4 border-accent flex flex-col items-center justify-center z-10 shadow-xl">
                <Sparkles className="w-4 h-4 text-accent mb-0.5" />
                <span className="text-xs font-bold">GIRA</span>
                <span className="text-xs text-muted-foreground">{spinsRemaining}</span>
              </div>
            </div>
          </div>

          {/* LED lights */}
          {Array.from({ length: 20 }).map((_, i) => {
            const angle = (360 / 20) * i;
            const rad = (angle * Math.PI) / 180;
            const x = 50 + 48 * Math.sin(rad);
            const y = 50 - 48 * Math.cos(rad);
            return (
              <div key={i} className={`absolute w-2.5 h-2.5 rounded-full transition-all ${
                isSpinning ? i % 2 === 0 ? 'bg-accent animate-pulse' : 'bg-primary animate-pulse' : 'bg-muted-foreground/20'
              }`} style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', animationDelay: `${i * 50}ms` }} />
            );
          })}
        </div>

        {/* Spin Button */}
        <button onClick={handleSpin} disabled={isSpinning}
          className={`px-10 py-3.5 rounded-full text-base font-bold transition-all mb-4 ${
            isSpinning ? "bg-muted text-muted-foreground cursor-not-allowed"
              : spinsRemaining <= 0 ? "gradient-gold text-gold-foreground shadow-card hover:scale-105"
              : "gradient-primary text-primary-foreground shadow-glow hover:scale-105 active:scale-95"
          }`}>
          {isSpinning ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Girando...
            </span>
          ) : spinsRemaining <= 0 ? "🛒 Acquista Giri" : "🎡 Gira Ora!"}
        </button>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2 w-full mb-4">
          <div className="rounded-xl bg-card border border-border/50 p-2.5 text-center">
            <p className="text-lg font-bold text-primary">{totalSpins}</p>
            <p className="text-xs text-muted-foreground">Giri totali</p>
          </div>
          <div className="rounded-xl bg-card border border-border/50 p-2.5 text-center">
            <p className="text-lg font-bold text-accent">{totalWon}</p>
            <p className="text-xs text-muted-foreground">QRC vinti</p>
          </div>
          <div className="rounded-xl bg-card border border-border/50 p-2.5 text-center">
            <p className="text-lg font-bold">{spinsRemaining}</p>
            <p className="text-xs text-muted-foreground">Giri rimasti</p>
          </div>
        </div>

        {/* Buy More Spins CTA */}
        <button onClick={() => setShowBuyModal(true)}
          className="w-full rounded-2xl glass border border-primary/20 p-3 flex items-center gap-3 mb-4 hover:bg-primary/5 transition-all">
          <ShoppingBag className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold">Acquista giri extra</p>
            <p className="text-xs text-muted-foreground">Con QRCoin, carta, PayPal o Klarna</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Mission Progress */}
        <div className="w-full rounded-2xl bg-card border border-border/50 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Missioni Attive</h3>
            <button onClick={() => setViewState("missions")} className="text-[11px] text-primary font-semibold">Vedi tutte</button>
          </div>
          {missions.slice(0, 2).map(m => {
            const progress = missionsProgress[m.id] || 0;
            const completed = progress >= m.target;
            return (
              <div key={m.id} className="flex items-center gap-2 mb-2 last:mb-0">
                <m.icon className={`w-4 h-4 shrink-0 ${completed ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-medium">{m.title}</span>
                    <span className="text-xs text-muted-foreground">{progress}/{m.target}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full gradient-primary transition-all" style={{ width: `${(progress / m.target) * 100}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Links */}
        <div className="flex gap-2 w-full">
          <button onClick={() => navigate("/quiz-live")} className="flex-1 py-3 rounded-xl glass text-xs font-semibold flex items-center justify-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-primary" /> Quiz Live
          </button>
          <button onClick={() => navigate("/talent-game")} className="flex-1 py-3 rounded-xl glass text-xs font-semibold flex items-center justify-center gap-1.5">
            <Crown className="w-3.5 h-3.5 text-accent" /> Talent Game
          </button>
        </div>
      </div>

      {/* ===== RESULT MODAL ===== */}
      {spinResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setSpinResult(null)} />
          <div className="relative w-full max-w-sm rounded-3xl gradient-card border border-accent/30 p-8 text-center slide-up shadow-2xl">
            <div className="absolute -top-6 left-1/2 -translate-x-1/2">
              <div className="w-12 h-12 rounded-full gradient-gold flex items-center justify-center shadow-lg">
                <Star className="w-6 h-6 text-gold-foreground fill-gold-foreground" />
              </div>
            </div>
            <p className="text-lg font-semibold mt-4 mb-2">🎉 Congratulazioni!</p>
            <p className="text-muted-foreground text-sm mb-4">Hai vinto</p>
            <div className="py-4 px-6 rounded-2xl gradient-gold mb-4">
              <p className="text-4xl font-display font-bold text-gold-foreground">{spinResult.label}</p>
              <p className="text-sm text-gold-foreground/70 mt-1">
                {spinResult.type === 'QR_COIN' && 'Aggiunto al tuo portafoglio'}
                {spinResult.type === 'DISCOUNT' && 'Usa alla prossima prenotazione'}
                {spinResult.type === 'FREE_SERVICE' && 'Riscatta un servizio gratuito'}
                {spinResult.type === 'SPA_VOUCHER' && '🧖 Voucher SPA per 2 persone!'}
              </p>
            </div>

            <div className="flex gap-2 mb-4">
              <button onClick={shareResult}
                className="flex-1 py-2.5 rounded-xl glass text-sm font-semibold flex items-center justify-center gap-1.5">
                <Share2 className="w-4 h-4" /> Condividi
              </button>
              <button onClick={() => { setSpinResult(null); navigate("/wallet"); }}
                className="flex-1 py-2.5 rounded-xl glass text-sm font-semibold flex items-center justify-center gap-1.5">
                <Coins className="w-4 h-4 text-accent" /> Wallet
              </button>
            </div>

            <button onClick={() => setSpinResult(null)}
              className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-semibold">
              {spinsRemaining > 0 ? '🎡 Gira Ancora' : 'Chiudi'}
            </button>
          </div>
        </div>
      )}

      {/* ===== BUY SPINS MODAL ===== */}
      {showBuyModal && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setShowBuyModal(false)} />
          <div className="relative w-full glass rounded-t-3xl p-6 slide-up">
            <h3 className="font-display font-bold text-lg mb-1">Acquista Giri Extra</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Saldo: <span className="text-accent font-bold">{qrCoins} QRC</span>
            </p>

            <div className="space-y-3 mb-5">
              {spinPackages.map(pkg => (
                <button key={pkg.spins} onClick={() => buySpins(pkg)}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/50 hover:border-primary/20 transition-all text-left relative">
                  {pkg.badge && (
                    <span className="absolute -top-2 right-3 px-2 py-0.5 rounded-full gradient-primary text-primary-foreground text-xs font-bold">{pkg.badge}</span>
                  )}
                  <div className="w-12 h-12 rounded-xl gradient-gold flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-gold-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold">{pkg.label}</p>
                    <p className="text-[11px] text-muted-foreground">{pkg.price} QRCoin</p>
                  </div>
                  <span className="text-sm font-bold text-primary">{pkg.price} QRC</span>
                </button>
              ))}
            </div>

            <div className="border-t border-border/50 pt-4 space-y-2">
              <p className="text-xs text-muted-foreground text-center mb-3">Oppure paga con</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Carta", icon: CreditCard },
                  { label: "PayPal", icon: Coins },
                  { label: "Klarna 3x", icon: ShoppingBag },
                ].map(method => (
                  <button key={method.label} onClick={() => { toast.info("Pagamento con " + method.label + " in arrivo"); setShowBuyModal(false); }}
                    className="py-3 rounded-xl glass text-center text-xs font-semibold flex flex-col items-center gap-1.5">
                    <method.icon className="w-4 h-4 text-primary" />
                    {method.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </MobileLayout>
  );
}
