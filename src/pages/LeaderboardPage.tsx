import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, Zap, Crown, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import stylist1 from "@/assets/stylist-1.jpg";
import stylist2 from "@/assets/stylist-2.jpg";
import beauty1 from "@/assets/beauty-1.jpg";
import beauty2 from "@/assets/beauty-2.jpg";
import beauty3 from "@/assets/beauty-3.jpg";

const tabs = ["Guadagni", "Prenotazioni", "Recensioni", "Follower"];
const fallbackAvatars = [stylist1, beauty2, beauty1, stylist2, beauty3, stylist1, beauty2];

const fallbackData = [
  { rank: 1, name: "Beauty Master", subtitle: "Hairstylist · Milano", score: 3100, badge: "" },
  { rank: 2, name: "Glow Studio", subtitle: "Colorist · Roma", score: 2800, badge: "" },
  { rank: 3, name: "Style Pro", subtitle: "Estetista · Napoli", score: 2300, badge: "" },
  { rank: 4, name: "Hair Queen", subtitle: "Hairstylist · Torino", score: 2100, badge: "" },
  { rank: 5, name: "Beauty Star", subtitle: "Stilista · Milano", score: 1900, badge: "" },
  { rank: 6, name: "Nail Art Pro", subtitle: "Nail Artist · Roma", score: 1750, badge: "" },
  { rank: 7, name: "Glow Pro", subtitle: "Makeup · Firenze", score: 1600, badge: "" },
];

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("Guadagni");
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myScore, setMyScore] = useState(0);

  useEffect(() => {
    loadLeaderboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadLeaderboard = async () => {
    const typeMap: Record<string, string> = {
      "Guadagni": "earnings", "Prenotazioni": "bookings",
      "Recensioni": "reviews", "Follower": "followers",
    };
    const { data } = await supabase
      .from("leaderboard")
      .select("*, profiles:user_id(display_name, avatar_url)")
      .eq("leaderboard_type", typeMap[activeTab] || "earnings")
      .order("score", { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      setLeaderboardData(data.map((d: any, i: number) => ({
        rank: i + 1,
        name: (Array.isArray(d.profiles) ? d.profiles[0]?.display_name : d.profiles?.display_name) || `Utente ${i + 1}`,
        subtitle: "",
        score: d.score,
        badge: "",
        avatar_url: (Array.isArray(d.profiles) ? d.profiles[0]?.avatar_url : d.profiles?.avatar_url),
        user_id: d.user_id,
      })));
      if (user) {
        const idx = data.findIndex((d: any) => d.user_id === user.id);
        if (idx >= 0) { setMyRank(idx + 1); setMyScore(data[idx].score); }
        else { setMyRank(null); setMyScore(0); }
      }
    } else {
      setLeaderboardData([]);
      setMyRank(null);
      setMyScore(0);
    }
  };

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-display font-bold">Classifica</h1>
          <div className="ml-auto w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {tabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === tab ? "gradient-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
              {tab}
            </button>
          ))}
        </div>
      </header>

      <div className="p-4">
        {leaderboardData.length === 0 && (
          <div className="text-center py-12">
            <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm font-semibold">Nessun dato ancora per questa classifica</p>
            <p className="text-xs text-muted-foreground mt-1">Si aggiorna ogni notte in base all'attività reale della piattaforma</p>
          </div>
        )}

        {/* Top 3 Podium */}
        {leaderboardData.length >= 3 && (
          <div className="flex items-end justify-center gap-3 mb-6 h-44">
            {[1, 0, 2].map(idx => {
              const entry = leaderboardData[idx];
              if (!entry) return null;
              const isFirst = idx === 0;
              const avatarSrc = (entry as any).avatar_url || fallbackAvatars[idx];
              return (
                <div key={idx} className="flex flex-col items-center w-24">
                  {isFirst && <Crown className="w-6 h-6 text-gold mb-1" />}
                  <div className="relative">
                    <img src={avatarSrc} alt="" className={`${isFirst ? 'w-20 h-20 border-3 border-gold' : 'w-16 h-16 border-2 border-muted'} rounded-full object-cover`} />
                    <span className="absolute -bottom-1 -right-1 text-lg">{entry.badge}</span>
                  </div>
                  <p className="text-xs font-semibold mt-2 truncate w-full text-center">{entry.name}</p>
                  <div className="flex items-center gap-0.5 mt-1">
                    <Zap className="w-3 h-3 text-gold" />
                    <span className={`text-xs font-bold ${isFirst ? 'text-gold' : ''}`}>{entry.score.toLocaleString()}</span>
                  </div>
                  <div className={`w-full rounded-t-xl mt-2 ${isFirst ? 'h-24 gradient-gold' : idx === 1 ? 'h-16 bg-muted' : 'h-12 bg-muted'}`} />
                </div>
              );
            })}
          </div>
        )}

        {/* Rest */}
        <div className="space-y-2">
          {leaderboardData.slice(3).map((entry, i) => (
            <div key={entry.rank} className="flex items-center gap-3 p-3 rounded-xl bg-card shadow-card">
              <span className="text-sm font-bold text-muted-foreground w-6 text-center">#{entry.rank}</span>
              <img src={(entry as any).avatar_url || fallbackAvatars[(i + 3) % fallbackAvatars.length]} alt="" className="w-10 h-10 rounded-full object-cover" />
              <div className="flex-1">
                <p className="text-sm font-semibold">{entry.name}</p>
                <p className="text-xs text-muted-foreground">{entry.subtitle}</p>
              </div>
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3 text-gold" />
                <span className="text-sm font-bold">{entry.score.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Your position */}
        <div className="mt-4 rounded-xl gradient-card border border-primary/20 p-4 shadow-card">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-primary">#{myRank || '—'}</span>
            <div className="flex-1">
              <p className="text-sm font-semibold">La tua posizione</p>
              <p className="text-xs text-muted-foreground">Continua a salire! 🚀</p>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-gold" />
              <span className="text-sm font-bold">{myScore.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </MobileLayout>
  );
}
