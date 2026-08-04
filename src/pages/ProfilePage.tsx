import { Settings, Edit3, Heart, Calendar, Star, Users, Coins, Share2, Copy, LogOut, LogIn, ChevronRight, Trophy, Gift, BarChart3, Briefcase, Building2, ShoppingBag, Video, MessageCircle, Bell, Cog, Grid3X3, Bookmark, Tag, MapPin, Link, ExternalLink, Plus, Camera, Scissors, RotateCw, Phone, Wallet, Crown, Rocket, Store, Wand2, ShieldCheck } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { useFollow } from "@/hooks/useFollow";
import { useSmartRemindersCount } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import MobileLayout from "@/components/layout/MobileLayout";
import ShareMenu from "@/components/ShareMenu";
import PostCard from "@/components/feed/PostCard";
import ProfileShowcasePanel from "@/components/profile/ProfileShowcasePanel";
import { useTemporaryTheme } from "@/hooks/useColorTheme";
import stylist2 from "@/assets/stylist-2.jpg";
import beauty1 from "@/assets/beauty-1.jpg";
import beauty2 from "@/assets/beauty-2.jpg";
import beauty3 from "@/assets/beauty-3.jpg";
import { toast } from "sonner";
import WhatsAppButton from "@/components/WhatsAppButton";

interface ProfilePost {
  id: string;
  user_id: string;
  caption: string | null;
  image_url: string | null;
  video_url: string | null;
  like_count: number;
  comment_count: number;
  post_type: string | null;
  created_at: string;
  profileData?: { display_name: string | null; avatar_url: string | null; user_type: string };
}

export default function ProfilePage() {
  const { id: viewUserId } = useParams();
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const { data: activeRemindersCount = 0 } = useSmartRemindersCount();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"grid" | "feed" | "products" | "saved" | "vetrina">("grid");
  const [myPosts, setMyPosts] = useState<ProfilePost[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [myProducts, setMyProducts] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [viewProfile, setViewProfile] = useState<any>(null);
  const [showShare, setShowShare] = useState(false);
  const [sharePost, setSharePost] = useState<ProfilePost | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  // Determine if viewing own profile or someone else's
  const isOwnProfile = !viewUserId || viewUserId === user?.id;
  const targetUserId = isOwnProfile ? user?.id : viewUserId;

  const { isFollowing, followerCount, toggleFollow, loading: followLoading } = useFollow(
    !isOwnProfile ? targetUserId : undefined
  );

  useEffect(() => {
    if (targetUserId) {
      loadPosts();
      loadProducts();
      if (!isOwnProfile) loadViewProfile();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUserId]);

  const loadViewProfile = async () => {
    const { data } = await supabase.from("profiles").select("*").eq("user_id", targetUserId!).maybeSingle();
    if (data) setViewProfile(data);
  };

  const loadPosts = async () => {
    const { data } = await supabase.from("posts").select("*").eq("user_id", targetUserId!).order("created_at", { ascending: false }).limit(30);
    if (data) {
      const p = isOwnProfile ? profile : viewProfile;
      setMyPosts(data.map(post => ({
        ...post,
        profileData: p ? { display_name: p.display_name, avatar_url: p.avatar_url, user_type: p.user_type } : undefined,
      })));
    }
  };

  const loadProducts = async () => {
    const { data } = await supabase.from("products").select("*").eq("seller_id", targetUserId!).eq("active", true).order("created_at", { ascending: false });
    if (data) setMyProducts(data);
  };

  // Re-load posts once viewProfile is fetched
  useEffect(() => {
    if (viewProfile && !isOwnProfile) loadPosts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewProfile]);

  const displayProfile = isOwnProfile ? profile : viewProfile;

  // Apply the visited profile's color theme temporarily
  useTemporaryTheme(!isOwnProfile ? displayProfile?.color_theme : null);

  if (authLoading && isOwnProfile) {
    return (
      <MobileLayout>
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </MobileLayout>
    );
  }

  if (!user && isOwnProfile) {
    return (
      <MobileLayout>
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
          <LogIn className="w-10 h-10 text-primary mb-4" />
          <h2 className="text-xl font-display font-bold mb-2">Accedi a STYLE</h2>
          <p className="text-sm text-muted-foreground mb-8">Registrati o accedi per gestire il tuo profilo</p>
          <button onClick={() => navigate("/auth")} className="px-8 py-3 rounded-full bg-primary text-primary-foreground font-semibold">
            Accedi / Registrati
          </button>
        </div>
      </MobileLayout>
    );
  }

  const isProfessional = displayProfile?.user_type === 'professional';
  const isBusiness = displayProfile?.user_type === 'business';

  const postCount = myPosts.length;
  const followerDisplay = isOwnProfile ? (displayProfile?.follower_count || 0) : followerCount;
  const followingDisplay = displayProfile?.following_count || 0;

  const fallbackImages = [beauty1, beauty2, beauty3, stylist2];

  return (
    <MobileLayout>
      {/* Header */}
      <header className="sticky top-0 z-40 glass px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isOwnProfile && (
            <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
              <ChevronRight className="w-5 h-5 rotate-180" />
            </button>
          )}
          <h1 className="text-base font-display font-bold truncate max-w-[180px]">
            {displayProfile?.display_name || 'Profilo'}
          </h1>
          <VerifiedBadge status={displayProfile?.verification_status} userType={displayProfile?.user_type} size="sm" />
        </div>
        <div className="flex gap-1">
          {isOwnProfile && (
            <>
              <button onClick={() => navigate("/create-post")} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
                <Plus className="w-5 h-5 text-muted-foreground" />
              </button>
              <button onClick={() => setShowMenu(!showMenu)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
                <Settings className="w-5 h-5 text-muted-foreground" />
              </button>
            </>
          )}
          {!isOwnProfile && (
            <button onClick={() => setShowShare(true)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
              <Share2 className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </header>

      {/* Settings Menu Dropdown */}
      {showMenu && isOwnProfile && (
        <div className="absolute top-14 right-4 z-50 w-56 rounded-2xl bg-card border border-border shadow-lg py-2 fade-in">
          {[
            { icon: Edit3, label: "Modifica Profilo", action: () => navigate("/profile/edit") },
            { icon: Bookmark, label: "Salvati", action: () => setActiveTab("saved") },
            { icon: Bell, label: `Notifiche${unreadCount > 0 ? ` (${unreadCount})` : ''}`, action: () => navigate("/notifications") },
            ...(isProfessional ? [
              { icon: BarChart3, label: "Pannello Pro", action: () => navigate("/professional-dashboard") },
              { icon: ShoppingBag, label: "Gestisci Prodotti", action: () => navigate("/manage-products") },
              { icon: Briefcase, label: "Annunci Lavoro", action: () => navigate("/hr") },
              { icon: Video, label: "Vai Live", action: () => navigate("/go-live") },
            ] : []),
            ...(isBusiness ? [
              { icon: BarChart3, label: "Analytics", action: () => navigate("/analytics") },
              { icon: ShoppingBag, label: "Gestisci Prodotti", action: () => navigate("/manage-products") },
              { icon: Briefcase, label: "Annunci Lavoro", action: () => navigate("/hr") },
              { icon: Video, label: "Vai Live", action: () => navigate("/go-live") },
              { icon: Building2, label: "Dashboard Business", action: () => navigate("/business") },
            ] : []),
            { icon: ShoppingBag, label: "Marketplace", action: () => navigate("/marketplace") },
            { icon: Gift, label: "Invita Amici", action: () => navigate("/referral") },
            { icon: Crown, label: "Abbonamenti", action: () => navigate("/subscriptions") },
            { icon: Rocket, label: "Boost Profilo", action: () => navigate("/boost") },
            { icon: Wallet, label: "Wallet", action: () => navigate("/wallet") },
            { icon: Coins, label: "QR Coins", action: () => navigate("/qr-coins") },
            { icon: Cog, label: "Impostazioni", action: () => navigate("/settings") },
            { icon: LogOut, label: "Esci", action: async () => { await signOut(); toast.success("Disconnesso"); navigate("/auth"); } },
          ].map(item => {
            const Icon = item.icon;
            return (
              <button key={item.label} onClick={() => { setShowMenu(false); item.action(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="px-4 pb-6">
        {/* Profile Info — STYLE unique layout: centered avatar */}
        <div className="flex flex-col items-center pt-6 pb-4">
          {/* Centered Avatar */}
          <div className="relative mb-4">
            <div className={`w-24 h-24 rounded-full p-[2.5px] ${isProfessional || isBusiness ? "bg-gradient-to-br from-primary via-accent to-primary" : "bg-border"}`}>
              <img
                src={displayProfile?.avatar_url || stylist2}
                alt=""
                className="w-full h-full rounded-full object-cover border-[3px] border-background"
              />
            </div>
            {isOwnProfile && (
              <button onClick={() => navigate("/profile/edit")}
                className="absolute -bottom-1 right-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center border-2 border-background shadow-lg">
                <Camera className="w-3.5 h-3.5 text-primary-foreground" />
              </button>
            )}
          </div>

          {/* Name & Badge — centered */}
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-bold tracking-tight">
              {displayProfile?.display_name || 'Utente STYLE'}
              {(displayProfile as any)?.surname ? ` ${(displayProfile as any).surname}` : ''}
            </h2>
            <VerifiedBadge status={displayProfile?.verification_status} userType={displayProfile?.user_type} size="sm" showLabel />
            {displayProfile?.verification_status !== "verified" && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                isBusiness ? 'bg-primary/20 text-primary' : isProfessional ? 'bg-primary/15 text-primary' : 'bg-primary/10 text-primary'
              }`}>
                {isBusiness ? 'Business' : isProfessional ? 'Pro' : 'Cliente'}
              </span>
            )}
          </div>

          {/* Bio — centered */}
          {displayProfile?.bio && (
            <p className="text-xs text-muted-foreground text-center max-w-[280px] leading-relaxed mb-2">{displayProfile.bio}</p>
          )}

          {/* Location, sector & skills — centered */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-3">
            {displayProfile?.city && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {displayProfile.city}
              </span>
            )}
            {displayProfile?.sector && (
              <span className="text-[11px] text-primary font-medium flex items-center gap-1">
                <Briefcase className="w-3 h-3" /> {displayProfile.sector}
              </span>
            )}
            {displayProfile?.skills && displayProfile.skills.length > 0 && (
              <span className="text-[11px] text-primary flex items-center gap-1">
                <Tag className="w-3 h-3" /> {displayProfile.skills.slice(0, 2).join(', ')}
              </span>
            )}
          </div>

          {/* Stats — horizontal pill style, centered */}
          <div className="flex items-center gap-1 rounded-2xl bg-primary/5 border border-primary/10 px-2 py-1.5 mb-4">
            <button onClick={() => setActiveTab("grid")} className="flex items-center gap-1.5 px-3 py-1 rounded-xl hover:bg-background/50 transition-colors">
              <span className="text-sm font-bold">{postCount}</span>
              <span className="text-xs text-muted-foreground">post</span>
            </button>
            <div className="w-px h-4 bg-border/50" />
            <div className="flex items-center gap-1.5 px-3 py-1">
              <span className="text-sm font-bold">{followerDisplay > 9999 ? `${(followerDisplay / 1000).toFixed(1)}K` : followerDisplay}</span>
              <span className="text-xs text-muted-foreground">follower</span>
            </div>
            <div className="w-px h-4 bg-border/50" />
            <div className="flex items-center gap-1.5 px-3 py-1">
              <span className="text-sm font-bold">{followingDisplay}</span>
              <span className="text-xs text-muted-foreground">seguiti</span>
            </div>
          </div>

          {/* QR Coins badge — centered */}
          {isOwnProfile && (
            <button onClick={() => navigate("/qr-coins")} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold mb-1">
              <Coins className="w-3 h-3 text-primary" />
              {displayProfile?.qr_coins?.toLocaleString() || '0'} QR Coins
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mb-5">
          {isOwnProfile ? (
            <>
              <button onClick={() => navigate("/profile/edit")}
                className="flex-1 py-2 rounded-lg bg-primary/10 text-primary text-sm font-semibold">
                Modifica profilo
              </button>
              <button onClick={() => navigate("/referral")}
                className="flex-1 py-2 rounded-lg bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center gap-1.5">
                <Share2 className="w-3.5 h-3.5" /> Condividi
              </button>
              {(isProfessional || isBusiness) ? (
                <button onClick={() => navigate("/go-live")}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
                  Live
                </button>
              ) : (
                <button onClick={() => navigate("/become-creator")}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
                  Diventa Pro
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => { if (!user) { navigate("/auth"); return; } toggleFollow(); }}
                disabled={followLoading}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  isFollowing ? "bg-primary/10 text-primary" : "bg-primary text-primary-foreground"
                }`}>
                {isFollowing ? "Segui già" : "Segui"}
              </button>
              <button onClick={() => navigate("/chat")}
                className="flex-1 py-2 rounded-lg bg-primary/10 text-primary text-sm font-semibold">
                Messaggio
              </button>
              <WhatsAppButton
                userId={viewUserId || ""}
                name={viewProfile?.display_name || "professionista"}
                context="stylist"
                compact
                className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center shrink-0 [&_svg]:text-white"
              />
              <button onClick={() => navigate(`/booking/${viewUserId}`)}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
                Prenota
              </button>
            </>
          )}
        </div>

        {/* Quick Actions — only for own profile */}
        {isOwnProfile && (
          <div className="flex gap-3 mb-5 overflow-x-auto no-scrollbar pb-1">
            {[
              { Icon: Calendar, label: "Prenotazioni", path: "/my-bookings" },
              { Icon: Bell, label: "Promemoria", path: "/reminders", badge: activeRemindersCount },
              { Icon: ShoppingBag, label: "Shop", path: "/shop" },
              { Icon: MessageCircle, label: "Chat", path: "/chat", badge: unreadCount },
              { Icon: Trophy, label: "Sfide", path: "/challenges" },
              { Icon: RotateCw, label: "Gira&Vinci", path: "/spin" },
              ...(isProfessional || isBusiness ? [
                { Icon: BarChart3, label: "Analytics", path: "/analytics" },
                { Icon: Users, label: "HR", path: "/hr" },
              ] : []),
            ].map(item => {
              const ItemIcon = item.Icon;
              return (
                <button key={item.label} onClick={() => navigate(item.path)}
                  className="flex flex-col items-center gap-1 min-w-[56px] relative">
                  <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <ItemIcon className="w-5 h-5 text-primary" />
                    {item.badge && item.badge > 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive flex items-center justify-center">
                        <span className="text-xs text-destructive-foreground font-bold">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-primary font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Horizontal Product Catalog — visible on other profiles */}
        {(isProfessional || isBusiness) && (isOwnProfile || myProducts.length > 0) && (
          <div className="mb-4">
            <div className="flex items-center justify-between px-1 mb-2">
              <h3 className="text-xs font-bold">Vetrina Prodotti</h3>
              {myProducts.length > 0 && (
                <button onClick={() => setActiveTab("products")} className="text-xs text-primary font-semibold">Vedi tutti</button>
              )}
            </div>
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
              {isOwnProfile && (
                <>
                  <button
                    onClick={() => navigate("/manage-products")}
                    className="min-w-[110px] max-w-[110px] rounded-xl border-2 border-dashed border-primary/40 flex-shrink-0 flex flex-col items-center justify-center gap-1.5 aspect-square text-primary"
                  >
                    <Plus className="w-6 h-6" />
                    <span className="text-[11px] font-semibold text-center px-2">Aggiungi prodotto</span>
                  </button>
                  <button
                    onClick={() => navigate("/offers")}
                    className="min-w-[110px] max-w-[110px] rounded-xl border-2 border-dashed border-primary/40 flex-shrink-0 flex flex-col items-center justify-center gap-1.5 aspect-square text-primary"
                  >
                    <Tag className="w-6 h-6" />
                    <span className="text-[11px] font-semibold text-center px-2">Crea offerta</span>
                  </button>
                </>
              )}
              {myProducts.slice(0, 8).map(product => (
                <button
                  key={product.id}
                  onClick={() => navigate(`/shop?product=${product.id}`)}
                  className="min-w-[120px] max-w-[120px] rounded-xl bg-card border border-border/50 overflow-hidden flex-shrink-0 text-left hover:border-primary/40 transition-colors"
                >
                  {product.image_url && (
                    <img src={product.image_url} alt="" className="w-full aspect-square object-cover" />
                  )}
                  <div className="p-2">
                    <p className="text-[11px] font-semibold truncate">{product.name}</p>
                    <p className="text-xs text-primary font-bold">€{product.price}</p>
                    {product.ai_preview_enabled && (
                      <button onClick={(e) => { e.stopPropagation(); navigate("/ai-look"); }} className="mt-1 w-full flex items-center justify-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-semibold">
                        <Wand2 className="w-2.5 h-2.5" /> Prova AI
                      </button>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs — Instagram style icons */}
        <div className="flex border-t border-border">
          {[
            { key: "grid" as const, icon: Grid3X3 },
            { key: "feed" as const, icon: Heart },
            ...((isProfessional || isBusiness) ? [{ key: "vetrina" as const, icon: Store }] : []),
            ...((isProfessional || isBusiness) && (myProducts.length > 0 || isOwnProfile) ? [{ key: "products" as const, icon: Tag }] : []),
            ...(isOwnProfile ? [{ key: "saved" as const, icon: Bookmark }] : []),
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-3 flex justify-center transition-colors ${
                  activeTab === tab.key ? "border-t-2 border-foreground text-foreground" : "text-muted-foreground"
                }`}>
                <Icon className="w-5 h-5" />
              </button>
            );
          })}
        </div>

        {/* Grid View */}
        {activeTab === "grid" && (
          <div className="fade-in">
            {myPosts.length > 0 ? (
              <div className="grid grid-cols-3 gap-0.5">
                {myPosts.map((post, i) => (
                  <div key={post.id} className="aspect-square relative group cursor-pointer" onClick={() => setActiveTab("feed")}>
                    <img src={post.image_url || fallbackImages[i % fallbackImages.length]} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-background/0 group-hover:bg-background/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 gap-3">
                      <span className="flex items-center gap-1 text-xs font-bold text-foreground">
                        <Heart className="w-3.5 h-3.5 fill-foreground" /> {post.like_count}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-bold text-foreground">
                        <MessageCircle className="w-3.5 h-3.5 fill-foreground" /> {post.comment_count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <Camera className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-semibold mb-1">Nessun post ancora</p>
                <p className="text-xs text-muted-foreground mb-4">Condividi il tuo primo contenuto</p>
                {isOwnProfile && (
                  <button onClick={() => navigate("/create-post")} className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                    Crea Post
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Feed View — Full post cards with scroll */}
        {activeTab === "feed" && (
          <div className="space-y-4 pt-4 fade-in">
            {myPosts.length > 0 ? myPosts.map(post => (
              <PostCard key={post.id} post={post} onShare={() => setSharePost(post)} fallbackImage={beauty1} />
            )) : (
              <p className="text-center text-sm text-muted-foreground py-12">Nessun post</p>
            )}
          </div>
        )}

        {/* Products Tab */}
        {activeTab === "products" && (
          <div className="pt-4 fade-in">
            {myProducts.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {myProducts.map(product => (
                  <div key={product.id} className="rounded-xl bg-card border border-border/50 overflow-hidden">
                    {product.image_url && (
                      <img src={product.image_url} alt="" className="w-full aspect-square object-cover" />
                    )}
                    <div className="p-3">
                      <p className="text-xs font-semibold truncate">{product.name}</p>
                      <p className="text-sm font-bold text-primary mt-0.5">€{Number(product.price).toFixed(2)}</p>
                      {product.category && <span className="text-xs text-muted-foreground">{product.category}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <ShoppingBag className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nessun prodotto</p>
                {isOwnProfile && (isProfessional || isBusiness) && (
                  <button onClick={() => navigate("/manage-products")} className="mt-3 px-5 py-2 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                    Aggiungi Prodotto
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Vetrina Tab */}
        {activeTab === "vetrina" && targetUserId && (
          <ProfileShowcasePanel isOwnProfile={isOwnProfile} userId={targetUserId} />
        )}

        {/* Saved Tab */}
        {activeTab === "saved" && isOwnProfile && (
          <div className="text-center py-16 fade-in">
            <Bookmark className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm font-semibold mb-1">Contenuti Salvati</p>
            <p className="text-xs text-muted-foreground">I post che salvi appariranno qui</p>
          </div>
        )}
      </div>

      {/* Overlay to close menu */}
      {showMenu && <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />}

      {showShare && (
        <ShareMenu
          url={window.location.href}
          title={`${displayProfile?.display_name || 'Utente'} su STYLE`}
          description={displayProfile?.bio || "Scopri il profilo su STYLE"}
          onClose={() => setShowShare(false)}
        />
      )}
      {sharePost && (
        <ShareMenu
          title={sharePost.caption || "Post su STYLE"}
          description={`di ${sharePost.profileData?.display_name || "Style User"}`}
          onClose={() => setSharePost(null)}
          onChatShare={() => { navigate("/chat"); setSharePost(null); }}
        />
      )}
    </MobileLayout>
  );
}
