import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, Gift, Send, Coins, X, Share2, Users, Crown, Sparkles, ShoppingBag, UserPlus, Trophy, Filter, Flame, Shield, Mic, Music, Wand2, Swords, Scissors, Palette, Heart, Droplets, BookOpen, Paintbrush, Gem, Video, Flag, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRadio } from "@/contexts/RadioContext";
import { useQRCoinRewards } from "@/hooks/useQRCoinRewards";
import MobileLayout from "@/components/layout/MobileLayout";
import LiveShopPanel from "@/components/live/LiveShopPanel";
import LivePollWidget from "@/components/live/LivePollWidget";
import LiveBadges from "@/components/live/LiveBadges";
import PostLiveStats from "@/components/live/PostLiveStats";
import WeeklyLiveTracker from "@/components/live/WeeklyLiveTracker";
import StyleReplicatorPanel from "@/components/live/StyleReplicatorPanel";
import LiveMusicSelector from "@/components/live/LiveMusicSelector";
import BattleChallengeButton from "@/components/live/BattleChallengeButton";
import LiveGuestPanel from "@/components/live/LiveGuestPanel";
import ApplauseAnimation, { useApplause } from "@/components/live/ApplauseAnimation";
import VoiceNoteButton from "@/components/live/VoiceNoteButton";
import ReportDialog from "@/components/ReportDialog";
import { toast } from "sonner";
import { useLiveBroadcaster, useLiveViewer } from "@/hooks/useLiveBroadcast";

interface LiveStream {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  viewer_count: number;
  total_tips: number;
  total_earnings: number;
  status: string;
  category?: string;
  qr_coin_pool?: number;
  interaction_goal?: number;
  is_public?: boolean;
  professional?: { id: string; user_id?: string; business_name: string; rating: number | null };
}

interface ChatMessage {
  id: string;
  user: string;
  message: string;
  type: 'chat' | 'tip' | 'join' | 'badge' | 'system';
  amount?: number;
  isMod?: boolean;
}

interface FloatingReaction { id: number; emoji: string; x: number }

const reactionIcons = [
  { Icon: Heart, label: "Amore", color: "text-primary" },
  { Icon: Flame, label: "Fuoco", color: "text-destructive" },
  { Icon: Sparkles, label: "Applauso", color: "text-accent" },
  { Icon: Crown, label: "Wow", color: "text-yellow-400" },
  { Icon: Trophy, label: "Stella", color: "text-accent" },
];

const tipAmounts = [5, 10, 25, 50, 100, 500];

const CATEGORIES = [
  { value: "all", label: "Tutti", Icon: Flame },
  { value: "taglio", label: "Taglio", Icon: Scissors },
  { value: "tinta", label: "Tinta", Icon: Palette },
  { value: "trattamento", label: "Trattamento", Icon: Droplets },
  { value: "tutorial", label: "Tutorial", Icon: BookOpen },
  { value: "makeup", label: "Make-up", Icon: Paintbrush },
  { value: "nails", label: "Nails", Icon: Gem },
];

export default function LiveStreamPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile, refreshProfile } = useAuth();
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [filteredStreams, setFilteredStreams] = useState<LiveStream[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStream, setSelectedStream] = useState<LiveStream | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [showTipModal, setShowTipModal] = useState(false);
  const [selectedTip, setSelectedTip] = useState<number>(10);
  const [loading, setLoading] = useState(true);
  const [showShop, setShowShop] = useState(false);
  const [showStyleReplicator, setShowStyleReplicator] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [interactionScore, setInteractionScore] = useState(0);
  const [earnedBadges, setEarnedBadges] = useState<string[]>([]);
  const [isFollowingStreamer, setIsFollowingStreamer] = useState(false);

  // Il pulsante "Segui" era decorativo: nessuna funzione reale, e
  // compariva anche per chi guarda la PROPRIA diretta (segui te
  // stesso). Corretto: nascosto per il proprietario, funzione vera.
  useEffect(() => {
    if (!user || !selectedStream?.professional?.user_id || isBroadcaster) { setIsFollowingStreamer(false); return; }
    supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", selectedStream.professional.user_id).maybeSingle()
      .then(({ data }) => setIsFollowingStreamer(!!data));
  }, [user, selectedStream?.professional?.user_id, isBroadcaster]);

  const toggleFollowStreamer = async () => {
    if (!user) { navigate("/auth"); return; }
    const targetId = selectedStream?.professional?.user_id;
    if (!targetId) return;
    if (isFollowingStreamer) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetId);
      setIsFollowingStreamer(false);
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: targetId });
      setIsFollowingStreamer(true);
      toast.success("Ora segui questo professionista");
    }
  };
  const [showPostStats, setShowPostStats] = useState(false);

  // Video reale della diretta (WebRTC) — prima al posto della fotocamera
  // c'era solo un'immagine statica. Chi è il proprietario della diretta
  // trasmette la propria fotocamera; chiunque altro la riceve in tempo
  // reale come spettatore.
  const isBroadcaster = !!selectedStream && !!user && selectedStream.professional?.user_id === user.id;
  const { localStream: broadcastLocalStream, viewerCount: liveViewerCount, error: broadcastError } =
    useLiveBroadcaster(selectedStream?.id || null, isBroadcaster);
  const { remoteStream: viewerRemoteStream, connecting: viewerConnecting } =
    useLiveViewer(selectedStream?.id || null, selectedStream?.professional?.user_id || null, !!selectedStream && !isBroadcaster);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (localVideoRef.current && broadcastLocalStream) localVideoRef.current.srcObject = broadcastLocalStream;
  }, [broadcastLocalStream]);
  useEffect(() => {
    if (remoteVideoRef.current && viewerRemoteStream) remoteVideoRef.current.srcObject = viewerRemoteStream;
  }, [viewerRemoteStream]);
  useEffect(() => {
    if (broadcastError) toast.error(broadcastError);
  }, [broadcastError]);
  const [isModerator, setIsModerator] = useState(false);
  const [showGuestPanel, setShowGuestPanel] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const watchTimerRef = useRef<number | null>(null);
  const { awardCoins } = useQRCoinRewards();
  const { pause: pauseRadio } = useRadio();
  const { claps, triggerApplause } = useApplause();
  const [showReport, setShowReport] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { pauseRadio(); fetchStreams(); }, []);

  // Auto-select stream from URL param
  useEffect(() => {
    const streamId = searchParams.get("stream");
    if (streamId && streams.length > 0 && !selectedStream) {
      const found = streams.find(s => s.id === streamId);
      if (found) setSelectedStream(found);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streams, searchParams]);

  useEffect(() => {
    if (selectedCategory === "all") {
      setFilteredStreams(streams);
    } else {
      setFilteredStreams(streams.filter(s => s.category === selectedCategory));
    }
  }, [selectedCategory, streams]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages]);

  // Realtime chat subscription
  useEffect(() => {
    if (!selectedStream) return;
    const channel = supabase
      .channel(`live-chat-${selectedStream.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "stream_comments",
        filter: `stream_id=eq.${selectedStream.id}`,
      }, async (payload) => {
        const comment = payload.new as any;
        // Don't add own messages (already added locally)
        if (comment.user_id === user?.id) return;
        const { data: prof } = await supabase.from("profiles").select("display_name").eq("user_id", comment.user_id).maybeSingle();
        setChatMessages(prev => [...prev, {
          id: comment.id,
          user: prof?.display_name || "Utente",
          message: comment.message,
          type: "chat",
        }]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStream?.id]);

  // BUG FIX: i cuori/reazioni venivano salvati davvero nel database
  // (stream_reactions) ma nessuno li trasmetteva in tempo reale agli
  // altri — comparivano solo sullo schermo di chi li mandava, mai a
  // chi guardava la stessa diretta dall'altra parte. Stesso identico
  // meccanismo già funzionante per la chat, applicato qui.
  useEffect(() => {
    if (!selectedStream) return;
    const channel = supabase
      .channel(`live-reactions-${selectedStream.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "stream_reactions",
        filter: `stream_id=eq.${selectedStream.id}`,
      }, (payload) => {
        const reaction = payload.new as any;
        if (reaction.user_id === user?.id) return; // già mostrata localmente
        const id = Date.now() + Math.random();
        setFloatingReactions(prev => [...prev, { id, emoji: reaction.reaction_type, x: 20 + Math.random() * 60 }]);
        setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2500);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStream?.id]);

  // Auto-earn + badge checks
  useEffect(() => {
    if (selectedStream) {
      watchTimerRef.current = window.setInterval(() => {
        awardCoins("watch_live", true);
        checkBadges();
      }, 60_000);
      awardCoins("watch_live");

      if (user && profile) {
        setChatMessages([{
          id: `join-${Date.now()}`,
          user: profile.display_name || "Utente",
          message: "è entrato nella live! 👋",
          type: "join"
        }]);
      }

      // Check referral param
      const ref = searchParams.get("ref");
      if (ref && ref !== user?.id) {
        supabase.from("live_invites").insert({
          stream_id: selectedStream.id,
          inviter_id: ref,
          invited_id: user?.id || "",
        }).then(() => {
          setChatMessages(prev => [...prev, {
            id: `invite-${Date.now()}`, user: "Sistema", message: "Sei stato invitato! Bonus QRCoin attivato 🎁", type: "system"
          }]);
        });
      }
    }
    return () => { if (watchTimerRef.current) clearInterval(watchTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStream]);

  // Moderator promotion at high interaction
  useEffect(() => {
    if (interactionScore >= 25 && !isModerator) {
      setIsModerator(true);
      if (!earnedBadges.includes("moderator")) {
        setEarnedBadges(prev => [...prev, "moderator"]);
      }
      setChatMessages(prev => [...prev, {
        id: `mod-${Date.now()}`, user: "Sistema",
        message: `${profile?.display_name || "Utente"} è diventato Moderatore della live! +5 QRC extra`,
        type: "system"
      }]);
      awardCoins("complete_mission");
      toast.success("Sei stato promosso Moderatore!", { duration: 4000 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactionScore]);

  const checkBadges = () => {
    const newBadges = [...earnedBadges];
    if (interactionScore >= 10 && !newBadges.includes("active_viewer")) {
      newBadges.push("active_viewer");
      toast.success("Badge: Active Viewer!", { duration: 3000 });
    }
    if (interactionScore >= 30 && !newBadges.includes("top_contributor")) {
      newBadges.push("top_contributor");
      toast.success("Badge: Top Contributor! +10% QRC extra", { duration: 3000 });
    }
    if (chatMessages.filter(m => m.type === "chat").length >= 5 && !newBadges.includes("chatter")) {
      newBadges.push("chatter");
      toast.success("Badge: Chatter!", { duration: 3000 });
    }
    setEarnedBadges(newBadges);
  };

  const fetchStreams = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('live_streams')
      .select(`*, professional:professionals(id, user_id, business_name, rating)`)
      .in('status', ['live', 'scheduled'])
      .order('viewer_count', { ascending: false });

    if (data) {
      setStreams(data.map(s => ({
        ...s,
        professional: Array.isArray(s.professional) ? s.professional[0] : s.professional
      })));
    }
    setLoading(false);
  };

  const sendReaction = (emoji: string) => {
    if (!selectedStream) return;
    const id = Date.now() + Math.random();
    setFloatingReactions(prev => [...prev, { id, emoji, x: 20 + Math.random() * 60 }]);
    setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)), 2500);
    setInteractionScore(prev => prev + 1);
    awardCoins("react_live", true);
    if (user) {
      supabase.from('stream_reactions').insert({ stream_id: selectedStream.id, user_id: user.id, reaction_type: emoji });
    }
  };

  const sendChat = async () => {
    if (!chatMessage.trim() || !selectedStream || !user) return;
    setChatMessages(prev => [...prev, {
      id: Date.now().toString(), user: profile?.display_name || 'You',
      message: chatMessage, type: 'chat', isMod: isModerator
    }]);
    const msg = chatMessage;
    setChatMessage("");
    setInteractionScore(prev => prev + 2);
    awardCoins("comment_live", true);
    await supabase.from('stream_comments').insert({ stream_id: selectedStream.id, user_id: user.id, message: msg });
  };

  const sendTip = async () => {
    if (!selectedStream || !user) { toast.error("Devi effettuare l'accesso"); return; }
    const qrCoins = profile?.qr_coins || 0;
    if (qrCoins < selectedTip) { toast.error("QR Coins insufficienti"); navigate("/qr-coins"); return; }
    try {
      const { data, error } = await supabase.functions.invoke("qr-coins-transaction", {
        body: {
          kind: "spend",
          amount: selectedTip,
          reason: "live_tip",
          sideEffect: { table: "stream_tips", row: { stream_id: selectedStream.id, user_id: user.id, amount: selectedTip } },
        },
      });
      if (error || data?.error) throw new Error(data?.error || "Errore nell'invio del regalo");
      refreshProfile();
      setChatMessages(prev => [...prev, {
        id: Date.now().toString(), user: profile?.display_name || 'You',
        message: `Ha inviato ${selectedTip} QRCoins! 🎉`, type: 'tip', amount: selectedTip
      }]);
      setShowTipModal(false);
      setInteractionScore(prev => prev + 5);
      toast.success(`Inviati ${selectedTip} QRCoins!`);
    } catch { toast.error("Errore nell'invio del regalo"); }
  };

  const shareInvite = () => {
    if (!selectedStream) return;
    const url = `${window.location.origin}/live?stream=${selectedStream.id}&ref=${user?.id}`;
    if (navigator.share) {
      navigator.share({ title: `Live: ${selectedStream.title}`, text: "Guarda questa live su Style e guadagna QRCoin! 🎁", url });
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Link copiato! Condividilo per guadagnare QRCoin bonus 🎁");
    }
    awardCoins("share");
    setInteractionScore(prev => prev + 3);
    if (!earnedBadges.includes("inviter")) {
      setEarnedBadges(prev => [...prev, "inviter"]);
      toast.success("🔗 Badge: Inviter!", { duration: 3000 });
    }
  };

  // ===== WATCH STREAM VIEW =====
  if (selectedStream) {
    return (
      <MobileLayout>
        <div className="relative min-h-screen bg-background">
          <div className="absolute inset-0">
            {isBroadcaster ? (
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            ) : viewerRemoteStream ? (
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            ) : (
              <>
                <img src={selectedStream.thumbnail_url || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800'} alt="" className="w-full h-full object-cover" />
                {viewerConnecting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <p className="text-white text-sm font-semibold">Connessione al video in corso...</p>
                  </div>
                )}
              </>
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-transparent to-background/95" />
          </div>

          {/* Applause Animation */}
          <ApplauseAnimation claps={claps} />

          {/* Floating Reactions */}
          <div className="absolute right-4 bottom-56 flex flex-col-reverse gap-1 pointer-events-none z-20">
            {floatingReactions.map(r => (
              <span key={r.id} className="text-3xl animate-float-up" style={{ marginLeft: `${r.x - 50}px` }}>{r.emoji}</span>
            ))}
          </div>

          {/* Header */}
          <div className="relative z-10 flex items-center justify-between p-4">
            <button onClick={() => { setShowPostStats(true); }} className="w-10 h-10 rounded-full glass flex items-center justify-center">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-live text-primary-foreground text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-primary-foreground live-pulse" /> LIVE
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-sm">
                <Eye className="w-4 h-4" /> {selectedStream.viewer_count.toLocaleString()}
              </span>
              {isModerator && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/20 text-accent text-xs font-bold">
                  <Shield className="w-3 h-3" /> MOD
                </span>
              )}
              <button onClick={() => setShowReport(true)} className="w-9 h-9 rounded-full glass flex items-center justify-center">
                <Flag className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Streamer Info */}
          <div className="relative z-10 px-4 mt-2">
            <div className="flex items-center gap-4 glass rounded-2xl p-4">
              <div className="relative">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedStream.professional?.id}`} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-primary" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-live border-2 border-background flex items-center justify-center">
                  <Crown className="w-3 h-3 text-primary-foreground" />
                </div>
              </div>
              <div className="flex-1">
                <p className="font-bold text-lg">{selectedStream.professional?.business_name || 'Beauty Streamer'}</p>
                <p className="text-sm text-muted-foreground">{selectedStream.title}</p>
                {selectedStream.category && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold capitalize">{selectedStream.category}</span>
                )}
              </div>
              {!isBroadcaster && (
                <button
                  onClick={toggleFollowStreamer}
                  className={`px-4 py-2 rounded-full text-sm font-bold ${isFollowingStreamer ? "bg-muted text-muted-foreground" : "gradient-primary text-primary-foreground"}`}
                >
                  {isFollowingStreamer ? "Segui già" : "Segui"}
                </button>
              )}
            </div>

            {earnedBadges.length > 0 && <div className="mt-2"><LiveBadges badges={earnedBadges} /></div>}

            {/* QRC + Score */}
            <div className="flex gap-2 mt-3">
              <div className="flex-1 glass rounded-xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full gradient-gold flex items-center justify-center"><Coins className="w-4 h-4 text-gold-foreground" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">QRC Pool</p>
                  <p className="text-sm font-bold text-gold">{(selectedStream.qr_coin_pool || 0).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex-1 glass rounded-xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center"><Trophy className="w-4 h-4 text-accent" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Il tuo Score</p>
                  <p className="text-sm font-bold text-accent">{interactionScore}</p>
                </div>
              </div>
            </div>

            {/* Interaction Goal */}
            {(selectedStream.interaction_goal || 0) > 0 && (
              <div className="mt-2 glass rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Obiettivo community</span>
                  <span className="text-xs font-bold text-primary">
                    {Math.min(100, Math.round((interactionScore / (selectedStream.interaction_goal || 1)) * 100))}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full gradient-primary transition-all" style={{
                    width: `${Math.min(100, (interactionScore / (selectedStream.interaction_goal || 1)) * 100)}%`
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* Bottom Controls */}
          <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-24">
            <LivePollWidget streamId={selectedStream.id} />

            {/* Chat */}
            <div ref={chatRef} className="mb-4 space-y-2 max-h-32 overflow-y-auto no-scrollbar">
              {chatMessages.slice(-8).map(msg => (
                <div key={msg.id} className={`glass rounded-xl px-3 py-2 max-w-[85%] fade-in ${
                  msg.type === 'tip' ? 'border border-gold/30' : msg.type === 'system' ? 'border border-accent/30' : msg.type === 'join' ? 'opacity-60' : ''
                }`}>
                  <p className="text-sm">
                    {msg.isMod && <Shield className="w-3 h-3 inline text-accent mr-1" />}
                    <span className={`font-semibold ${
                      msg.type === 'tip' ? 'text-gold' : msg.type === 'system' ? 'text-accent' : msg.type === 'join' ? 'text-muted-foreground' : 'text-primary'
                    }`}>{msg.user}</span>{' '}
                    {msg.message}
                  </p>
                </div>
              ))}
            </div>

            {/* Reactions */}
            <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
              {reactionIcons.map(r => (
                <button key={r.label} onClick={() => sendReaction(r.label)} className="w-10 h-10 rounded-full glass flex items-center justify-center hover:scale-125 transition-transform active:scale-90 shrink-0">
                  <r.Icon className={`w-5 h-5 ${r.color}`} />
                </button>
              ))}
              <button onClick={() => setShowTipModal(true)} className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center shadow-lg">
                <Gift className="w-4 h-4 text-gold-foreground" />
              </button>
              <button onClick={() => setShowShop(true)} className="w-10 h-10 rounded-full glass flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 text-accent" />
              </button>
              <button onClick={shareInvite} className="w-10 h-10 rounded-full glass flex items-center justify-center">
                <UserPlus className="w-4 h-4 text-primary" />
              </button>
              <button onClick={() => setShowStyleReplicator(true)} className="w-10 h-10 rounded-full glass flex items-center justify-center">
                <Wand2 className="w-4 h-4 text-primary" />
              </button>
              <button onClick={() => setShowMusic(true)} className="flex items-center gap-1.5 px-3 h-10 rounded-full glass">
                <Music className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-primary">Sottofondo</span>
              </button>
              <BattleChallengeButton
                streamId={selectedStream.id}
                currentProfessionalId={selectedStream.professional?.id}
                currentName={selectedStream.professional?.business_name}
              />
              <button onClick={() => setShowGuestPanel(true)} className="w-10 h-10 rounded-full glass flex items-center justify-center">
                <Mic className="w-4 h-4 text-primary" />
              </button>
              {/* Applause Button */}
              <button onClick={() => {
                triggerApplause(12);
                sendReaction("👏");
                setChatMessages(prev => [...prev, {
                  id: `clap-${Date.now()}`, user: profile?.display_name || "Utente",
                  message: "ha inviato un applauso! 👏👏👏", type: "badge"
                }]);
              }} className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center hover:scale-125 transition-transform active:scale-90 shrink-0">
                <span className="text-lg">👏</span>
              </button>
              {/* Voice Note */}
              <VoiceNoteButton onSend={async (blob, dur) => {
                if (!user || !selectedStream) return;
                const path = `${user.id}/voice_${Date.now()}.webm`;
                await supabase.storage.from("posts").upload(path, blob);
                const url = supabase.storage.from("posts").getPublicUrl(path).data.publicUrl;
                setChatMessages(prev => [...prev, {
                  id: `voice-${Date.now()}`, user: profile?.display_name || "Utente",
                  message: `🎤 Nota vocale (${dur}s)`, type: "chat"
                }]);
                await supabase.from("stream_comments").insert({
                  stream_id: selectedStream.id, user_id: user.id,
                  message: `🎤 Nota vocale (${dur}s) — ${url}`
                });
                toast.success("Nota vocale inviata!");
              }} />
            </div>

            {/* Chat Input */}
            <div className="flex gap-2">
              <input value={chatMessage} onChange={e => setChatMessage(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChat()}
                placeholder={isModerator ? "Scrivi come moderatore..." : "Scrivi qualcosa..."}
                className="flex-1 h-11 rounded-full glass px-5 text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground" />
              <button onClick={sendChat} className="w-11 h-11 rounded-full gradient-primary flex items-center justify-center shadow-glow">
                <Send className="w-5 h-5 text-primary-foreground" />
              </button>
            </div>
          </div>

          {showShop && <LiveShopPanel professionalId={selectedStream.professional?.id} onClose={() => setShowShop(false)} />}
          {showStyleReplicator && (
            <StyleReplicatorPanel
              streamTitle={selectedStream.title}
              streamCategory={selectedStream.category}
              professionalName={selectedStream.professional?.business_name}
              onClose={() => setShowStyleReplicator(false)}
            />
          )}
          {showMusic && <LiveMusicSelector isStreamer={false} onClose={() => setShowMusic(false)} />}
          {showGuestPanel && (
            <LiveGuestPanel streamId={selectedStream.id} isHost={false} onClose={() => setShowGuestPanel(false)} />
          )}

          {/* Tip Modal */}
          {showTipModal && (
            <div className="absolute inset-0 z-40 flex items-end">
              <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setShowTipModal(false)} />
              <div className="relative w-full glass rounded-t-3xl p-6 slide-up">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center"><Gift className="w-5 h-5 text-gold-foreground" /></div>
                    <div>
                      <h3 className="font-display font-bold text-lg">Invia un Regalo</h3>
                      <p className="text-xs text-muted-foreground">Supporta il tuo creator preferito</p>
                    </div>
                  </div>
                  <button onClick={() => setShowTipModal(false)}><X className="w-6 h-6 text-muted-foreground" /></button>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Il tuo saldo: <span className="text-gold font-bold">{profile?.qr_coins?.toLocaleString() || 0} QRC</span>
                </p>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {tipAmounts.map(amt => (
                    <button key={amt} onClick={() => setSelectedTip(amt)}
                      className={`py-4 rounded-xl text-center transition-all ${
                        selectedTip === amt ? "gradient-gold text-gold-foreground scale-105 shadow-lg" : "bg-card border border-border hover:border-gold/50"
                      }`}>
                      <p className="text-lg font-bold">{amt}</p>
                      <p className="text-xs opacity-70">QRC</p>
                    </button>
                  ))}
                </div>
                <button onClick={sendTip} className="w-full py-4 rounded-xl gradient-primary text-primary-foreground font-bold text-lg shadow-glow flex items-center justify-center gap-2">
                  <Sparkles className="w-5 h-5" /> Invia {selectedTip} QRCoins
                </button>
              </div>
            </div>
          )}

          {showReport && (
            <ReportDialog
              open={showReport}
              onClose={() => setShowReport(false)}
              targetUserId={selectedStream.professional?.id}
              targetContentId={selectedStream.id}
              contentType="post"
            />
          )}

          {showPostStats && (
            <PostLiveStats
              stats={{
                totalViewers: selectedStream.viewer_count, peakViewers: selectedStream.viewer_count,
                totalComments: chatMessages.filter(m => m.type === 'chat').length,
                totalReactions: interactionScore, totalTips: selectedStream.total_tips,
                qrCoinsDistributed: selectedStream.qr_coin_pool || 0, durationMinutes: 30,
                interactionGoal: selectedStream.interaction_goal || 50, interactionsAchieved: interactionScore,
              }}
              onClose={() => { setShowPostStats(false); setSelectedStream(null); }}
            />
          )}
        </div>
      </MobileLayout>
    );
  }

  // ===== STREAMS LIST VIEW =====
  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Live Beauty</h1>
            <p className="text-sm text-muted-foreground">Guarda tutorial e guadagna QRCoins</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/live-battle")} className="px-4 py-2.5 rounded-full glass text-sm font-bold flex items-center gap-2">
              <Swords className="w-4 h-4 text-destructive" /> Battle
            </button>
            <button onClick={() => navigate("/go-live")} className="px-4 py-2.5 rounded-full gradient-live text-primary-foreground text-sm font-bold flex items-center gap-2 shadow-glow">
              <Video className="w-4 h-4" /> Go Live
            </button>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
          {CATEGORIES.map(cat => (
            <button key={cat.value} onClick={() => setSelectedCategory(cat.value)}
               className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                 selectedCategory === cat.value
                   ? "bg-primary text-primary-foreground"
                   : "bg-card border border-border text-muted-foreground"
               }`}>
              <cat.Icon className="w-3.5 h-3.5" />
              {cat.label}
            </button>
          ))}
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Weekly Tracker */}
        <WeeklyLiveTracker />

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="aspect-[3/4] rounded-2xl bg-card animate-pulse" />)}
          </div>
        ) : filteredStreams.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Users className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {selectedCategory !== "all" ? `Nessuna live "${selectedCategory}"` : "Nessuna Diretta"}
            </h3>
            <p className="text-muted-foreground text-sm">Sii il primo a trasmettere in diretta!</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredStreams.map(stream => (
              <button key={stream.id} onClick={() => setSelectedStream(stream)}
                className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-card shadow-card group">
                <img src={stream.thumbnail_url || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800'} alt=""
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-transparent to-background/90" />
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-live text-primary-foreground text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-primary-foreground live-pulse" /> LIVE
                  </span>
                  {stream.category && (
                    <span className="px-3 py-1.5 rounded-full glass text-xs font-medium capitalize">{stream.category}</span>
                  )}
                </div>
                <div className="absolute top-4 right-4 flex flex-col gap-2">
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-sm font-medium">
                    <Eye className="w-4 h-4" /> {stream.viewer_count.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full gradient-gold text-gold-foreground text-xs font-bold">
                    <Coins className="w-3.5 h-3.5" /> {stream.qr_coin_pool || 0} QRC
                  </span>
                </div>
                <div className="absolute bottom-0 inset-x-0 p-4">
                  <div className="flex items-center gap-3">
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${stream.professional?.id}`} alt=""
                      className="w-12 h-12 rounded-full object-cover border-2 border-primary" />
                    <div className="flex-1 text-left">
                      <p className="font-bold">{stream.professional?.business_name || 'Beauty Streamer'}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">{stream.title}</p>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
