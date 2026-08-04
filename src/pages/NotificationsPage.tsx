import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, Bell, Heart, MessageCircle, Calendar, Gift, Coins, Trash2, Users, Loader2, BellRing, Check, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNotifications, AppNotification } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import logo from "@/assets/logo.png";

const typeIcons: Record<string, typeof Heart> = {
  like: Heart,
  comment: MessageCircle,
  booking: Calendar,
  tip: Coins,
  follow: Users,
  challenge: Gift,
  message: MessageCircle,
  system: Bell,
  info: Bell,
};

const typeGradients: Record<string, string> = {
  like: "from-pink-500/20 to-rose-500/20 border-pink-500/20",
  comment: "from-blue-500/20 to-cyan-500/20 border-blue-500/20",
  booking: "from-emerald-500/20 to-green-500/20 border-emerald-500/20",
  tip: "from-yellow-500/20 to-amber-500/20 border-yellow-500/20",
  follow: "from-primary/20 to-purple-500/20 border-primary/20",
  challenge: "from-orange-500/20 to-yellow-500/20 border-orange-500/20",
  message: "from-blue-400/20 to-indigo-500/20 border-blue-400/20",
  system: "from-muted to-muted border-border/50",
  info: "from-muted to-muted border-border/50",
};

const typeIconColors: Record<string, string> = {
  like: "text-pink-500",
  comment: "text-blue-400",
  booking: "text-emerald-500",
  tip: "text-yellow-500",
  follow: "text-primary",
  challenge: "text-orange-500",
  message: "text-blue-400",
  system: "text-muted-foreground",
  info: "text-muted-foreground",
};

function formatTimeAgo(date: string) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "Adesso";
  if (s < 3600) return `${Math.floor(s / 60)} min fa`;
  if (s < 86400) return `${Math.floor(s / 3600)}h fa`;
  if (s < 172800) return "Ieri";
  if (s < 604800) return `${Math.floor(s / 86400)}g fa`;
  return new Date(date).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function groupNotifications(notifications: AppNotification[]) {
  const today: AppNotification[] = [];
  const yesterday: AppNotification[] = [];
  const thisWeek: AppNotification[] = [];
  const older: AppNotification[] = [];
  const now = Date.now();

  for (const n of notifications) {
    const diff = now - new Date(n.created_at).getTime();
    if (diff < 86400000) today.push(n);
    else if (diff < 172800000) yesterday.push(n);
    else if (diff < 604800000) thisWeek.push(n);
    else older.push(n);
  }

  return [
    { label: "Oggi", items: today },
    { label: "Ieri", items: yesterday },
    { label: "Questa settimana", items: thisWeek },
    { label: "Precedenti", items: older },
  ].filter(g => g.items.length > 0);
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notifications, unreadCount, loading, markAllRead, markRead, deleteNotification } = useNotifications();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const filtered = filter === "unread" ? notifications.filter(n => !n.read) : notifications;
  const groups = groupNotifications(filtered);

  const handleNotificationClick = (notification: AppNotification) => {
    if (!notification.read) markRead(notification.id);
    const type = notification.type || "info";
    const data = notification.data || {};

    // BUG FIX: solo 7 tipi venivano gestiti, senza nessun ripiego per
    // tutti gli altri tipi reali usati nell'app (pagamenti, prelievi,
    // riattivazione clienti, promemoria, abbonamenti, ecc.) — cliccare
    // quelle notifiche non faceva letteralmente nulla, senza errore
    // visibile. Ora ogni tipo reale ha una destinazione sensata, e chi
    // non è esplicitamente mappato ricade comunque su un posto utile
    // invece di restare inerte.
    if ((type === "like" || type === "comment") && data.post_id) { navigate(`/?post=${data.post_id}`); return; }
    if (type === "message" && data.conversation_id) { navigate(`/chat/${data.conversation_id}`); return; }
    if (type === "follow" && data.follower_id) { navigate(`/profile/${data.follower_id}`); return; }
    if (type === "booking" || type === "booking_reminder" || type === "reactivation" || type === "empty_slots_alert") { navigate("/my-bookings"); return; }
    if (type === "tip" || type === "transfer" || type === "qrcoin_transfer" || type === "coins" || type === "spin_win" || type === "earn" || type === "spend") { navigate("/wallet"); return; }
    if (type === "payment" || type === "withdraw" || type === "withdrawal" || type === "bank_transfer") { navigate("/receipts"); return; }
    if (type === "challenge") { navigate("/challenges"); return; }
    if (type === "subscription" || type === "upsell") { navigate("/subscriptions"); return; }
    if (type === "referral") { navigate("/referral"); return; }
    if (type === "reminder" || type === "business_reminder" || type === "daily_digest" || type === "ai_digest") { navigate("/reminders"); return; }
    if (type === "boost" || type === "growth" || type === "ai_growth" || type === "matching" || type === "ai_suggestion") { navigate("/analytics"); return; }
    if (type === "product") { navigate("/manage-products"); return; }
    if (type === "welcome" || type === "onboarding") { navigate("/"); return; }
    if (type === "job" || type === "ai_job") { navigate("/hr"); return; }
    if (type === "auto_discount" || type === "engagement") { navigate("/marketing"); return; }

    // Ripiego finale: se la notifica porta un route esplicito nei dati
    // (alcune Edge Function lo includono già), usalo; altrimenti vai
    // almeno alla home invece di restare fermi senza fare nulla.
    if (typeof data.route === "string" && data.route.startsWith("/")) { navigate(data.route); return; }
    navigate("/");
  };

  const getActionLabel = (type: string) => {
    const labels: Record<string, string> = {
      like: "Vedi post",
      comment: "Rispondi",
      booking: "Dettagli",
      tip: "Wallet",
      follow: "Profilo",
      challenge: "Partecipa",
      message: "Apri chat",
    };
    return labels[type] || "Apri";
  };

  if (!user) {
    return (
      <MobileLayout>
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-5">
            <BellRing className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-xl font-display font-bold mb-2">Accedi per le notifiche</h2>
          <p className="text-sm text-muted-foreground mb-6">Ricevi aggiornamenti su like, commenti, prenotazioni e altro</p>
          <button type="button" onClick={() => navigate("/auth")} className="px-8 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-sm">
            Accedi
          </button>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      {/* Header con logo Style */}
      <header className="sticky top-0 z-40 glass px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)} aria-label="Indietro" className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-display font-bold">Notifiche</h1>
              {unreadCount > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
               <button type="button" onClick={markAllRead} aria-label="Segna tutto come letto" className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1">
                 <CheckCheck className="w-3 h-3" /> Letto
               </button>
            )}
            <img src={logo} alt="Style" className="h-6 object-contain opacity-60" />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mt-3">
           <button
            type="button"
            onClick={() => setFilter("all")}
             className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
               filter === "all" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary/60"
             }`}
          >
            Tutte
          </button>
           <button
            type="button"
            onClick={() => setFilter("unread")}
             className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
               filter === "unread" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary/60"
             }`}
          >
            Non lette {unreadCount > 0 && `(${unreadCount})`}
          </button>
        </div>
      </header>

      <div className="p-4 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="font-semibold">Nessuna notifica</p>
            <p className="text-xs text-muted-foreground mt-1">
              {filter === "unread" ? "Tutte le notifiche sono state lette" : "Le notifiche appariranno qui"}
            </p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label}>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">
                {group.label}
              </p>
              <div className="space-y-2">
                {group.items.map(notification => {
                  const type = notification.type || "info";
                  const Icon = typeIcons[type] || Bell;
                  const gradient = typeGradients[type] || typeGradients.info;
                  const iconColor = typeIconColors[type] || "text-muted-foreground";

                  return (
                    <div
                      key={notification.id}
                      className={`relative rounded-2xl border transition-all overflow-hidden ${
                        notification.read
                          ? "bg-card border-border/30"
                          : `bg-gradient-to-r ${gradient}`
                      }`}
                    >
                      {/* Unread indicator bar */}
                      {!notification.read && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-2xl" />
                      )}

                      <button
                        onClick={() => handleNotificationClick(notification)}
                        className="w-full flex items-start gap-3 p-3.5 text-left"
                      >
                        {/* Icon */}
                        <div className={`w-11 h-11 rounded-full bg-background/50 flex items-center justify-center shrink-0 ${iconColor}`}>
                          <Icon className="w-5 h-5" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm font-semibold leading-tight ${!notification.read ? "text-foreground" : "text-foreground/70"}`}>
                              {notification.title}
                            </p>
                            <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">
                              {formatTimeAgo(notification.created_at)}
                            </span>
                          </div>

                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                            {notification.message}
                          </p>

                          {/* Action buttons - white style */}
                          <div className="flex items-center gap-2 mt-2.5">
                             <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleNotificationClick(notification); }}
                              className="px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold"
                            >
                              {getActionLabel(type)}
                            </button>
                            {!notification.read && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); markRead(notification.id); }}
                                className="px-3 py-1.5 rounded-full bg-primary/10 text-primary/70 text-xs font-semibold flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" /> Letto
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id); }}
                              aria-label="Elimina notifica"
                              className="ml-auto p-1.5 rounded-full hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </MobileLayout>
  );
}
