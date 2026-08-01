import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Flame, Trophy, Star, Gift, CheckCircle2, Lock, Zap, Target, Calendar, TrendingUp, Smartphone, Video, Heart, Share2, MessageCircle, Film, FileText, CalendarDays, Sparkles, Users, Coins, Crown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import MobileLayout from "@/components/layout/MobileLayout";
import { toast } from "sonner";

interface Mission {
  id: string;
  title: string;
  description: string;
  icon: string;
  reward: number;
  progress: number;
  target: number;
  type: "daily" | "weekly" | "achievement";
  completed: boolean;
  claimed: boolean;
}

interface BadgeItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: string;
  earned: boolean;
  earnedAt?: string;
}

const defaultDailyMissions: Mission[] = [
  { id: "d1", title: "Apri l'app", description: "Accedi all'app oggi", icon: "smartphone", reward: 5, progress: 1, target: 1, type: "daily", completed: true, claimed: false },
  { id: "d2", title: "Guarda una Live", description: "Partecipa a una diretta", icon: "video", reward: 10, progress: 0, target: 1, type: "daily", completed: false, claimed: false },
  { id: "d3", title: "Metti 3 Like", description: "Metti like a 3 post", icon: "heart", reward: 5, progress: 1, target: 3, type: "daily", completed: false, claimed: false },
  { id: "d4", title: "Condividi un post", description: "Condividi su social", icon: "share", reward: 10, progress: 0, target: 1, type: "daily", completed: false, claimed: false },
  { id: "d5", title: "Chatta con qualcuno", description: "Invia un messaggio", icon: "message", reward: 5, progress: 0, target: 1, type: "daily", completed: false, claimed: false },
];

const defaultWeeklyMissions: Mission[] = [
  { id: "w1", title: "Social Star", description: "Pubblica 3 post questa settimana", icon: "star", reward: 50, progress: 1, target: 3, type: "weekly", completed: false, claimed: false },
  { id: "w2", title: "Spettatore VIP", description: "Guarda 5 live questa settimana", icon: "film", reward: 75, progress: 2, target: 5, type: "weekly", completed: false, claimed: false },
  { id: "w3", title: "Recensore", description: "Lascia 2 recensioni", icon: "filetext", reward: 40, progress: 0, target: 2, type: "weekly", completed: false, claimed: false },
  { id: "w4", title: "Prenota & Risparmia", description: "Prenota un servizio", icon: "calendar", reward: 30, progress: 0, target: 1, type: "weekly", completed: false, claimed: false },
];

const defaultBadges: BadgeItem[] = [
  { id: "b1", name: "Primo Accesso", description: "Hai aperto l'app per la prima volta", icon: "sparkles", rarity: "common", earned: true, earnedAt: "2026-03-01" },
  { id: "b2", name: "Social Butterfly", description: "100 interazioni social", icon: "users", rarity: "rare", earned: true, earnedAt: "2026-03-05" },
  { id: "b3", name: "Live Fan", description: "Guarda 10 dirette", icon: "video", rarity: "rare", earned: false },
  { id: "b4", name: "Top Reviewer", description: "Lascia 10 recensioni", icon: "star", rarity: "epic", earned: false },
  { id: "b5", name: "QRCoin Master", description: "Accumula 1000 QRCoins", icon: "coins", rarity: "epic", earned: false },
  { id: "b6", name: "Influencer", description: "Raggiungi 100 follower", icon: "crown", rarity: "legendary", earned: false },
  { id: "b7", name: "7 Giorni Streak", description: "Accedi 7 giorni consecutivi", icon: "flame", rarity: "rare", earned: false },
  { id: "b8", name: "Ambasciatore", description: "Invita 10 amici", icon: "users", rarity: "legendary", earned: false },
];

const iconMap: Record<string, any> = {
  smartphone: Smartphone, video: Video, heart: Heart, share: Share2, message: MessageCircle,
  star: Star, film: Film, filetext: FileText, calendar: CalendarDays,
  sparkles: Sparkles, users: Users, coins: Coins, crown: Crown, flame: Flame,
};

const rarityColors: Record<string, string> = {
  common: "from-muted to-muted-foreground/20",
  rare: "from-blue-500/20 to-blue-600/20",
  epic: "from-purple-500/20 to-purple-600/20",
  legendary: "from-amber-400/20 to-amber-600/20",
};

const rarityBorder: Record<string, string> = {
  common: "border-muted-foreground/30",
  rare: "border-blue-500/40",
  epic: "border-purple-500/40",
  legendary: "border-amber-500/40",
};

const rarityLabel: Record<string, string> = {
  common: "Comune",
  rare: "Raro",
  epic: "Epico",
  legendary: "Leggendario",
};

export default function MissionsPage() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<"daily" | "weekly" | "badges">("daily");
  const [dailyMissions, setDailyMissions] = useState(defaultDailyMissions);
  const [weeklyMissions, setWeeklyMissions] = useState(defaultWeeklyMissions);
  const [badges, setBadges] = useState(defaultBadges);
  const [streak, setStreak] = useState(3);
  const [level, setLevel] = useState(5);
  const [xp, setXp] = useState(320);
  const [xpToNext, setXpToNext] = useState(500);

  useEffect(() => {
    if (user) loadBadges();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadBadges = async () => {
    const { data: dbBadges } = await supabase.from("badges").select("*");
    if (dbBadges && dbBadges.length > 0) {
      let earnedSet = new Set<string>();
      if (user) {
        const { data: userBadges } = await supabase
          .from("user_badges")
          .select("badge_id, earned_at")
          .eq("user_id", user.id);
        if (userBadges) {
          earnedSet = new Set(userBadges.map(ub => ub.badge_id));
        }
      }
      setBadges(dbBadges.map(b => ({
        id: b.id,
        name: b.name,
        description: b.description,
        icon: b.icon,
        rarity: b.rarity,
        earned: earnedSet.has(b.id),
      })));
    }
  };

  const claimReward = async (missionId: string, reward: number, type: "daily" | "weekly") => {
    if (!user) { toast.error("Devi effettuare l'accesso"); return; }

    const { data, error } = await supabase.functions.invoke("qr-coins-transaction", {
      body: { kind: "mission_claim", missionId },
    });

    if (error || data?.error) {
      toast.error(data?.error || "Riscatto fallito, riprova");
      return;
    }

    const setter = type === "daily" ? setDailyMissions : setWeeklyMissions;
    setter(prev => prev.map(m => m.id === missionId ? { ...m, claimed: true } : m));
    toast.success(`+${reward} QRCoins guadagnati!`);
    refreshProfile();
  };

  const completedDaily = dailyMissions.filter(m => m.completed).length;
  const completedWeekly = weeklyMissions.filter(m => m.completed).length;
  const earnedBadges = badges.filter(b => b.earned).length;

  const tabs = [
    { key: "daily" as const, label: "Giornaliere", icon: <Calendar className="w-4 h-4" /> },
    { key: "weekly" as const, label: "Settimanali", icon: <Target className="w-4 h-4" /> },
    { key: "badges" as const, label: "Badge", icon: <Trophy className="w-4 h-4" /> },
  ];

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-display font-bold">Missioni & Badge</h1>
            <p className="text-xs text-muted-foreground">Guadagna QRCoins ogni giorno</p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/30">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-bold text-orange-500">{streak}</span>
          </div>
        </div>
      </header>

      {/* Level Bar */}
      <div className="px-4 pt-3 pb-1">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center">
                <span className="text-sm font-bold text-primary-foreground">Lv{level}</span>
              </div>
              <div>
                <p className="text-sm font-semibold">Livello {level}</p>
                <p className="text-xs text-muted-foreground">{xp}/{xpToNext} XP</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Streak</p>
                <p className="text-sm font-bold flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-orange-500" />
                  {streak} giorni
                </p>
              </div>
            </div>
          </div>
          <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full gradient-primary transition-all duration-500" style={{ width: `${(xp / xpToNext) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 py-3 flex gap-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === tab.key
                ? "gradient-primary text-primary-foreground shadow-glow"
                : "bg-card border border-border text-muted-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-4 pb-24 space-y-3">
        {/* Daily Missions */}
        {activeTab === "daily" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{completedDaily}/{dailyMissions.length} completate</p>
              <p className="text-xs text-muted-foreground">Si resettano a mezzanotte</p>
            </div>
            {dailyMissions.map(mission => (
              <div key={mission.id} className={`rounded-xl bg-card border p-4 transition-all ${mission.completed ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                <div className="flex items-start gap-3">
                  {(() => { const IconComp = iconMap[mission.icon]; return IconComp ? <IconComp className="w-6 h-6 text-primary" /> : <Zap className="w-6 h-6 text-primary" />; })()}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{mission.title}</p>
                      {mission.completed && <CheckCircle2 className="w-4 h-4 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{mission.description}</p>
                    <div className="mt-2 w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full gradient-primary transition-all" style={{ width: `${Math.min(100, (mission.progress / mission.target) * 100)}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">{mission.progress}/{mission.target}</span>
                      <span className="text-xs text-primary font-semibold flex items-center gap-0.5">
                        <Zap className="w-3 h-3" />+{mission.reward} QRC
                      </span>
                    </div>
                  </div>
                  {mission.completed && !mission.claimed && (
                    <button
                      onClick={() => claimReward(mission.id, mission.reward, "daily")}
                      className="px-3 py-1.5 rounded-full gradient-gold text-gold-foreground text-xs font-bold animate-pulse"
                    >
                      Riscatta
                    </button>
                  )}
                  {mission.claimed && (
                    <span className="px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs">✓</span>
                  )}
                </div>
              </div>
            ))}

            {/* Daily Bonus */}
            {completedDaily >= dailyMissions.length && (
              <div className="rounded-2xl gradient-gold p-4 text-center">
                <Gift className="w-8 h-8 mx-auto mb-2 text-gold-foreground" />
                <p className="font-bold text-gold-foreground">Bonus Giornaliero!</p>
                <p className="text-xs text-gold-foreground/80 mb-3">Tutte le missioni completate</p>
                <button className="px-6 py-2 rounded-full bg-background text-foreground text-sm font-bold">
                  Riscatta +50 QRC
                </button>
              </div>
            )}
          </>
        )}

        {/* Weekly Missions */}
        {activeTab === "weekly" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{completedWeekly}/{weeklyMissions.length} completate</p>
              <p className="text-xs text-muted-foreground">Si resettano lunedì</p>
            </div>
            {weeklyMissions.map(mission => (
              <div key={mission.id} className={`rounded-xl bg-card border p-4 transition-all ${mission.completed ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                <div className="flex items-start gap-3">
                  {(() => { const IconComp = iconMap[mission.icon]; return IconComp ? <IconComp className="w-6 h-6 text-primary" /> : <Zap className="w-6 h-6 text-primary" />; })()}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{mission.title}</p>
                      {mission.completed && <CheckCircle2 className="w-4 h-4 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{mission.description}</p>
                    <div className="mt-2 w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full gradient-primary transition-all" style={{ width: `${Math.min(100, (mission.progress / mission.target) * 100)}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted-foreground">{mission.progress}/{mission.target}</span>
                      <span className="text-xs text-primary font-semibold flex items-center gap-0.5">
                        <Zap className="w-3 h-3" />+{mission.reward} QRC
                      </span>
                    </div>
                  </div>
                  {mission.completed && !mission.claimed && (
                    <button
                      onClick={() => claimReward(mission.id, mission.reward, "weekly")}
                      className="px-3 py-1.5 rounded-full gradient-gold text-gold-foreground text-xs font-bold animate-pulse"
                    >
                      Riscatta
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Badges */}
        {activeTab === "badges" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{earnedBadges}/{badges.length} guadagnati</p>
              <p className="text-xs text-muted-foreground">Colleziona tutti i badge</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {badges.map(badge => (
                <div
                  key={badge.id}
                  className={`rounded-2xl p-4 text-center border transition-all ${
                    badge.earned
                      ? `bg-gradient-to-br ${rarityColors[badge.rarity]} ${rarityBorder[badge.rarity]}`
                      : "bg-card border-border opacity-50"
                  }`}
                >
                  <div className="relative inline-block">
                    {(() => { const IconComp = iconMap[badge.icon]; return IconComp ? <IconComp className={`w-8 h-8 ${!badge.earned ? "text-muted-foreground" : "text-primary"}`} /> : <Star className={`w-8 h-8 ${!badge.earned ? "text-muted-foreground" : "text-primary"}`} />; })()}
                    {!badge.earned && (
                      <Lock className="w-4 h-4 text-muted-foreground absolute -bottom-1 -right-1" />
                    )}
                  </div>
                  <p className="text-xs font-bold mt-2">{badge.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{badge.description}</p>
                  <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-bold ${
                    badge.rarity === "legendary" ? "bg-amber-500/20 text-amber-600" :
                    badge.rarity === "epic" ? "bg-purple-500/20 text-purple-600" :
                    badge.rarity === "rare" ? "bg-blue-500/20 text-blue-600" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {rarityLabel[badge.rarity]}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </MobileLayout>
  );
}
