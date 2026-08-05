import { Users, Calendar, CreditCard, ShieldCheck, BarChart3, Clock, Crown, Rocket, DollarSign, Flag, FileCheck, ArrowLeft, Ban, CheckCircle, XCircle, TrendingUp, Wallet, AlertTriangle, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import MobileLayout from "@/components/layout/MobileLayout";
import { toast } from "sonner";

export default function AdminPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"overview" | "users" | "payments" | "reports" | "verify" | "team">("overview");
  const [stats, setStats] = useState({ users: 0, bookings: 0, professionals: 0, businesses: 0, posts: 0, products: 0, subscriptions: 0, boosts: 0, transactions: 0, totalQRC: 0 });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<any[]>([]);
  const [commission, setCommission] = useState(5);
  const [subBreakdown, setSubBreakdown] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [expandedVerify, setExpandedVerify] = useState<string | null>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<"admin" | "moderator">("moderator");
  const [addingStaff, setAddingStaff] = useState(false);

  const loadStaff = async () => {
    const { data, error } = await supabase.rpc("admin_list_staff");
    if (!error) setStaff(data || []);
  };

  const handleAddStaff = async () => {
    if (!newStaffEmail.trim()) { toast.error("Inserisci un'email"); return; }
    setAddingStaff(true);
    const { data, error } = await supabase.rpc("admin_set_user_role", {
      target_email: newStaffEmail.trim(),
      new_role: newStaffRole,
    });
    setAddingStaff(false);
    if (error || data?.error) {
      toast.error(data?.error || "Errore nell'assegnazione");
      return;
    }
    toast.success("Ruolo assegnato ✓");
    setNewStaffEmail("");
    loadStaff();
  };

  const handleRemoveStaff = async (email: string) => {
    const { data, error } = await supabase.rpc("admin_set_user_role", { target_email: email, new_role: "user" });
    if (error || data?.error) {
      toast.error(data?.error || "Errore nella rimozione");
      return;
    }
    toast.success("Rimosso dallo staff");
    loadStaff();
  };

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").then(({ data }) => {
      setIsAdmin(data && data.length > 0);
    });
  }, [user]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isAdmin) loadStats(); }, [tab, isAdmin]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isAdmin && tab === "team") loadStaff(); }, [tab, isAdmin]);

  if (isAdmin === null) {
    return (
      <MobileLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </MobileLayout>
    );
  }

  if (!isAdmin) {
    return (
      <MobileLayout>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
          <ShieldCheck className="w-16 h-16 text-destructive" />
          <h1 className="text-xl font-bold">Accesso Negato</h1>
          <p className="text-sm text-muted-foreground">Non hai i permessi per accedere al pannello amministrativo.</p>
          <button onClick={() => navigate("/")} className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
            Torna alla Home
          </button>
        </div>
      </MobileLayout>
    );
  }

  const loadStats = async () => {
    setLoading(true);
    const [users, bookings, pros, biz, posts, products, subs, boosts, commissionRes, subDetail, txRes] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("bookings").select("id", { count: "exact", head: true }),
      supabase.from("professionals").select("id", { count: "exact", head: true }),
      supabase.from("businesses").select("id", { count: "exact", head: true }),
      supabase.from("posts").select("id", { count: "exact", head: true }),
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("user_subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("profile_boosts").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("platform_settings").select("value").eq("key", "booking_commission_percent").maybeSingle(),
      supabase.from("user_subscriptions").select("*, subscription_plans(name, slug)").eq("status", "active"),
      supabase.from("transactions").select("id, amount", { count: "exact" }),
    ]);

    const totalQRC = (txRes.data || []).reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

    setStats({
      users: users.count || 0, bookings: bookings.count || 0,
      professionals: pros.count || 0, businesses: biz.count || 0,
      posts: posts.count || 0, products: products.count || 0,
      subscriptions: subs.count || 0, boosts: boosts.count || 0,
      transactions: txRes.count || 0, totalQRC,
    });

    const cv = commissionRes.data?.value as any;
    if (cv?.value) setCommission(cv.value);
    if (subDetail.data) setSubBreakdown(subDetail.data);

    if (tab === "overview" || tab === "users") {
      const { data: usersData } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(tab === "users" ? 100 : 10);
      if (tab === "users") setAllUsers(usersData || []);
      else setRecentUsers(usersData || []);
    }

    if (tab === "reports") {
      const { data: reps } = await supabase.from("user_reports").select("*").order("created_at", { ascending: false }).limit(50);
      if (reps) setReports(reps);
    }

    if (tab === "verify") {
      const { data: veri } = await supabase.from("verification_requests").select("*").order("created_at", { ascending: false }).limit(50);
      if (veri) setVerifications(veri);
    }

    if (tab === "payments") {
      const { data: rec } = await supabase.from("receipts").select("*").order("created_at", { ascending: false }).limit(50);
      if (rec) setReceipts(rec);
      const { data: wr } = await supabase.from("withdrawal_requests").select("*, profiles:user_id(display_name)").order("created_at", { ascending: false }).limit(50);
      if (wr) setWithdrawalRequests(wr);
    }

    setLoading(false);
  };

  const updateReportStatus = async (id: string, status: string) => {
    await supabase.from("user_reports").update({ status }).eq("id", id);
    toast.success(`Segnalazione ${status}`);
    loadStats();
  };

  const updateWithdrawalStatus = async (id: string, status: "completed" | "rejected") => {
    const request = withdrawalRequests.find(w => w.id === id);
    if (!request) return;

    if (status === "rejected") {
      // Real refund: give the reserved balance back since the transfer
      // will not happen after all.
      const { error: creditError } = await supabase.rpc("credit_qr_coins", {
        _user_id: request.user_id,
        _amount: request.amount,
      });
      if (creditError) {
        toast.error("Errore nel riaccredito, riprova");
        return;
      }
      await supabase.from("notifications").insert({
        user_id: request.user_id,
        title: "Richiesta di prelievo rifiutata",
        message: `La tua richiesta di prelievo di €${request.amount} è stata rifiutata e il saldo è stato riaccreditato.`,
        type: "payment",
      });
    } else {
      await supabase.from("notifications").insert({
        user_id: request.user_id,
        title: "Prelievo inviato ✅",
        message: `Il tuo prelievo di €${request.amount} è stato inviato al tuo IBAN.`,
        type: "payment",
      });
    }

    await supabase.from("withdrawal_requests").update({
      status,
      processed_at: new Date().toISOString(),
    }).eq("id", id);

    toast.success(status === "completed" ? "Prelievo segnato come inviato" : "Prelievo rifiutato e riaccreditato");
    loadStats();
  };

  const updateVerification = async (id: string, status: string, userId?: string) => {
    const notes = adminNotes[id] || null;
    await supabase.from("verification_requests").update({
      status,
      reviewed_at: new Date().toISOString(),
      admin_notes: notes,
      reviewer_id: user?.id,
      rejection_reason: status === "rejected" ? (notes || "Non conforme") : null,
    }).eq("id", id);

    if (userId) {
      if (status === "approved") {
        await supabase.from("profiles").update({
          verification_status: "verified",
          verification_level: "verified",
        }).eq("user_id", userId);
      } else if (status === "suspended") {
        await supabase.from("profiles").update({
          verification_status: "suspended",
          verification_level: "none",
        }).eq("user_id", userId);
      } else if (status === "rejected") {
        await supabase.from("profiles").update({
          verification_status: "rejected",
          verification_level: "none",
        }).eq("user_id", userId);
      }
    }

    const label = status === "approved" ? "approvata" : status === "rejected" ? "rifiutata" : "sospesa";
    toast.success(`Verifica ${label}`);
    loadStats();
  };

  const suspendUser = async (userId: string) => {
    await supabase.from("profiles").update({
      verification_status: "suspended",
      verification_level: "none",
    }).eq("user_id", userId);
    toast.success("Utente sospeso");
    loadStats();
  };

  const planCounts = subBreakdown.reduce((acc: Record<string, number>, s: any) => {
    const name = s.subscription_plans?.name || "Unknown";
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  const statCards = [
    { label: "Utenti", value: stats.users, Icon: Users, color: "text-primary" },
    { label: "Prenotazioni", value: stats.bookings, Icon: Calendar, color: "text-primary" },
    { label: "Professionisti", value: stats.professionals, Icon: ShieldCheck, color: "text-primary" },
    { label: "Business", value: stats.businesses, Icon: CreditCard, color: "text-primary" },
    { label: "Abbonamenti", value: stats.subscriptions, Icon: Crown, color: "text-primary" },
    { label: "Transazioni", value: stats.transactions, Icon: TrendingUp, color: "text-primary" },
  ];

  const pendingVerifications = verifications.filter(v => v.status === "pending").length;

  const tabs = [
    { key: "overview" as const, label: "Stats", Icon: BarChart3 },
    { key: "users" as const, label: "Utenti", Icon: Users },
    { key: "payments" as const, label: "Pagamenti", Icon: Wallet },
    { key: "reports" as const, label: "Report", Icon: Flag },
    { key: "verify" as const, label: `Verifiche${pendingVerifications > 0 ? ` (${pendingVerifications})` : ''}`, Icon: FileCheck },
    { key: "team" as const, label: "Team", Icon: ShieldCheck },
  ];

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-5 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-bold flex-1">Admin Panel</h1>
        <ShieldCheck className="w-5 h-5 text-primary" />
      </header>

      <div className="flex gap-1 px-4 pt-3 pb-1 overflow-x-auto scrollbar-none">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all ${
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
            }`}>
            <t.Icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* OVERVIEW */}
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {statCards.map(s => (
                <div key={s.label} className="rounded-2xl bg-card border border-border/50 p-3 text-center">
                  <s.Icon className={`w-4 h-4 mx-auto mb-1.5 ${s.color}`} />
                  <p className="text-lg font-display font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl gradient-primary p-4 text-primary-foreground">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-5 h-5" />
                <h3 className="font-display font-bold text-sm">Revenue Overview</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="opacity-70 text-xs">Commissione</p><p className="font-bold">{commission}%</p></div>
                <div><p className="opacity-70 text-xs">Post Totali</p><p className="font-bold">{stats.posts}</p></div>
                <div><p className="opacity-70 text-xs">Prodotti</p><p className="font-bold">{stats.products}</p></div>
                <div><p className="opacity-70 text-xs">Boost Attivi</p><p className="font-bold">{stats.boosts}</p></div>
              </div>
            </div>

            {Object.keys(planCounts).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Crown className="w-4 h-4 text-primary" /> Abbonamenti Attivi</h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(planCounts).map(([name, count]) => (
                    <div key={name} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50">
                      <span className="text-xs font-medium">{name}</span>
                      <span className="text-sm font-bold text-primary">{count as number}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold mb-2">Ultimi Utenti</h3>
              <div className="space-y-2">
                {recentUsers.slice(0, 5).map(u => (
                  <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50">
                    <img src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`} alt="" className="w-8 h-8 rounded-full object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{u.display_name || "Utente"}</p>
                      <p className="text-xs text-muted-foreground">{u.user_type} · {u.qr_coins || 0} QRC</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      u.verification_status === "verified" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    }`}>{u.verification_status === "verified" ? "Verificato" : u.user_type}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* USERS */}
        {tab === "users" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{allUsers.length} utenti</p>
            {allUsers.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50">
                <img src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`} alt="" className="w-9 h-9 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{u.display_name || "Utente"}</p>
                  <p className="text-xs text-muted-foreground">{u.user_type} · {u.city || "—"} · {u.qr_coins || 0} QRC</p>
                  <p className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString("it-IT")}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    u.verification_status === "verified" ? "bg-primary/15 text-primary" 
                    : u.verification_status === "suspended" ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground"
                  }`}>{u.verification_status || "pending"}</span>
                  {u.iban && <span className="text-[8px] text-primary">IBAN</span>}
                  {u.verification_status !== "suspended" && (u.user_type === "professional" || u.user_type === "business") && (
                    <button onClick={() => suspendUser(u.user_id)} className="text-[8px] text-destructive font-semibold">
                      Sospendi
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PAYMENTS */}
        {tab === "payments" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-card border border-border/50 p-3 text-center">
                <p className="text-lg font-bold text-primary">{receipts.length}</p>
                <p className="text-xs text-muted-foreground">Ricevute</p>
              </div>
              <div className="rounded-xl bg-card border border-border/50 p-3 text-center">
                <p className="text-lg font-bold text-primary">€{receipts.reduce((s, r) => s + (r.amount || 0), 0).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Volume</p>
              </div>
            </div>

            {withdrawalRequests.filter(w => w.status === "pending_review").length > 0 && (
              <div>
                <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                  🏦 Prelievi da revisionare manualmente
                  <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/15 text-yellow-600">
                    {withdrawalRequests.filter(w => w.status === "pending_review").length}
                  </span>
                </h3>
                <div className="space-y-2 mb-4">
                  {withdrawalRequests.filter(w => w.status === "pending_review").map(w => (
                    <div key={w.id} className="p-3 rounded-xl bg-card border border-yellow-500/30">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold">{w.profiles?.display_name || "Utente"}</span>
                        <span className="text-sm font-bold text-primary">€{w.amount}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">IBAN: {w.iban} {w.holder_name ? `· ${w.holder_name}` : ""}</p>
                      <p className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => updateWithdrawalStatus(w.id, "completed")}
                          className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
                        >
                          Segna come inviato
                        </button>
                        <button
                          onClick={() => updateWithdrawalStatus(w.id, "rejected")}
                          className="flex-1 py-1.5 rounded-lg bg-destructive/15 text-destructive text-xs font-semibold"
                        >
                          Rifiuta e riaccredita
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nessun pagamento registrato</p>
            ) : receipts.map(r => (
              <div key={r.id} className="p-3 rounded-xl bg-card border border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold">{r.service_name}</span>
                  <span className="text-sm font-bold text-primary">€{r.amount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{r.payment_method} · {r.receipt_type}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    r.status === "paid" ? "bg-primary/15 text-primary" : "bg-yellow-500/15 text-yellow-600"
                  }`}>{r.status}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{new Date(r.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            ))}
          </div>
        )}

        {/* REPORTS */}
        {tab === "reports" && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Flag className="w-4 h-4 text-destructive" /> Segnalazioni ({reports.length})</h3>
            {reports.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nessuna segnalazione</p>
            ) : reports.map(r => (
              <div key={r.id} className="p-4 rounded-2xl bg-card border border-border/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    r.status === "pending" ? "bg-yellow-500/15 text-yellow-600" : r.status === "resolved" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  }`}>{r.status}</span>
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("it-IT")}</span>
                </div>
                <p className="text-sm font-semibold">{r.reason}</p>
                {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                <p className="text-xs text-muted-foreground">Tipo: {r.content_type}</p>
                {r.status === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => updateReportStatus(r.id, "resolved")}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-semibold">
                      <CheckCircle className="w-3.5 h-3.5" /> Risolvi
                    </button>
                    <button onClick={() => updateReportStatus(r.id, "dismissed")}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-muted text-muted-foreground text-[11px] font-semibold">
                      <XCircle className="w-3.5 h-3.5" /> Ignora
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* VERIFY — Enhanced */}
        {tab === "verify" && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-primary" /> Richieste Verifica ({verifications.length})
            </h3>
            {verifications.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nessuna richiesta</p>
            ) : verifications.map(v => (
              <div key={v.id} className="p-4 rounded-2xl bg-card border border-border/50 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      v.status === "pending" ? "bg-yellow-500/15 text-yellow-600" 
                      : v.status === "approved" ? "bg-primary/15 text-primary" 
                      : v.status === "suspended" ? "bg-orange-500/15 text-orange-600"
                      : "bg-destructive/15 text-destructive"
                    }`}>{v.status}</span>
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {v.account_type || v.verification_type}
                    </span>
                  </div>
                  <button onClick={() => setExpandedVerify(expandedVerify === v.id ? null : v.id)} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-muted">
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>

                <p className="text-sm font-semibold">{v.full_name || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  Tipo: {v.verification_type} · Doc: {v.document_type} · {(v.document_urls || []).length} doc
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(v.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>

                {/* Expanded details */}
                {expandedVerify === v.id && (
                  <div className="space-y-2 pt-2 border-t border-border/30 fade-in">
                    {v.business_name && (
                      <p className="text-xs"><span className="font-semibold">Attività:</span> {v.business_name}</p>
                    )}
                    {v.vat_number && (
                      <p className="text-xs"><span className="font-semibold">P.IVA:</span> {v.vat_number}</p>
                    )}
                    {v.tax_code && (
                      <p className="text-xs"><span className="font-semibold">C.F.:</span> {v.tax_code}</p>
                    )}
                    {v.city && (
                      <p className="text-xs"><span className="font-semibold">Città:</span> {v.city}</p>
                    )}
                    {v.address && (
                      <p className="text-xs"><span className="font-semibold">Indirizzo:</span> {v.address}</p>
                    )}
                    {v.phone && (
                      <p className="text-xs"><span className="font-semibold">Tel:</span> {v.phone}</p>
                    )}
                    {v.email && (
                      <p className="text-xs"><span className="font-semibold">Email:</span> {v.email}</p>
                    )}
                    {v.license_urls && v.license_urls.length > 0 && (
                      <p className="text-xs text-primary font-semibold">{v.license_urls.length} licenze/certificati</p>
                    )}
                    {v.admin_notes && (
                      <p className="text-xs text-muted-foreground italic">Note: {v.admin_notes}</p>
                    )}
                  </div>
                )}

                {v.status === "pending" && (
                  <div className="space-y-2 pt-1">
                    <input
                      type="text"
                      placeholder="Note admin (opzionale)"
                      value={adminNotes[v.id] || ""}
                      onChange={e => setAdminNotes(prev => ({ ...prev, [v.id]: e.target.value }))}
                      className="w-full h-9 rounded-lg bg-muted/50 border border-border/50 px-3 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => updateVerification(v.id, "approved", v.user_id)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-semibold">
                        <CheckCircle className="w-3.5 h-3.5" /> Approva
                      </button>
                      <button onClick={() => updateVerification(v.id, "rejected", v.user_id)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-destructive/10 text-destructive text-[11px] font-semibold">
                        <XCircle className="w-3.5 h-3.5" /> Rifiuta
                      </button>
                      <button onClick={() => updateVerification(v.id, "suspended", v.user_id)}
                        className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-600 text-[11px] font-semibold">
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "team" && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-card border border-border/50 p-4">
              <h3 className="text-sm font-bold mb-3">Aggiungi collaboratore</h3>
              <p className="text-xs text-muted-foreground mb-3">
                La persona deve essersi già registrata sull'app con questa email — assegni solo il ruolo, non crei l'account.
              </p>
              <input
                type="email"
                value={newStaffEmail}
                onChange={(e) => setNewStaffEmail(e.target.value)}
                placeholder="email@esempio.com"
                className="w-full h-11 px-3 rounded-xl border border-border/50 bg-background text-sm mb-2"
              />
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setNewStaffRole("moderator")}
                  className={`flex-1 h-10 rounded-lg text-xs font-semibold ${newStaffRole === "moderator" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  Assistenza (moderator)
                </button>
                <button
                  onClick={() => setNewStaffRole("admin")}
                  className={`flex-1 h-10 rounded-lg text-xs font-semibold ${newStaffRole === "admin" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  Admin completo
                </button>
              </div>
              <button
                onClick={handleAddStaff}
                disabled={addingStaff}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50"
              >
                {addingStaff ? "..." : "Assegna ruolo"}
              </button>
            </div>

            <div>
              <h3 className="text-sm font-bold mb-2 px-1">Staff attuale</h3>
              <div className="space-y-2">
                {staff.length === 0 && <p className="text-xs text-muted-foreground px-1">Solo tu al momento.</p>}
                {staff.map((s) => (
                  <div key={s.user_id} className="rounded-xl border border-border/50 bg-card p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{s.display_name || s.email}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${s.role === "admin" ? "bg-yellow-500/15 text-yellow-600" : "bg-primary/15 text-primary"}`}>
                        {s.role === "admin" ? "Admin" : "Assistenza"}
                      </span>
                      {s.user_id !== user?.id && (
                        <button onClick={() => handleRemoveStaff(s.email)} className="text-destructive text-xs font-semibold">
                          Rimuovi
                        </button>
                      )}
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
