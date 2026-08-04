import MobileLayout from "@/components/layout/MobileLayout";
import { ShoppingBag, Coins, ChevronRight, Gift, Star, Heart, Search, ShoppingCart, MessageCircle, Share2, CalendarDays, Briefcase, MapPin, Wand2, Tag, Gavel, Link2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ShareMenu from "@/components/ShareMenu";
import beauty1 from "@/assets/beauty-1.jpg";
import beauty2 from "@/assets/beauty-2.jpg";
import beauty3 from "@/assets/beauty-3.jpg";
import stylist1 from "@/assets/stylist-1.jpg";
import stylist2 from "@/assets/stylist-2.jpg";

interface Product {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  description: string | null;
  seller_id: string;
}

interface ServiceItem {
  id: string;
  name: string;
  price: number;
  duration: number | null;
  description: string | null;
  professional_id: string;
  professional_name?: string;
  professional_city?: string;
}

const fallbackImages = [beauty1, beauty2, beauty3, stylist1, stylist2];

const sections = [
  { key: "products" as const, label: "Prodotti", icon: ShoppingBag },
  { key: "services" as const, label: "Servizi", icon: CalendarDays },
  { key: "professionals" as const, label: "Saloni", icon: Briefcase },
  { key: "featured" as const, label: "Top Rated", icon: Gift },
];

type SectionKey = "products" | "services" | "professionals" | "featured";

export default function ShopPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [activeSection, setActiveSection] = useState<SectionKey>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [params] = useSearchParams();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [likedProducts, setLikedProducts] = useState<string[]>([]);
  const [cart, setCart] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [shareProduct, setShareProduct] = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [viewSeller, setViewSeller] = useState<{ display_name: string; avatar_url: string | null } | null>(null);
  const [reviewText, setReviewText] = useState("");

  const qrCoins = profile?.qr_coins || 0;

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    const productId = params.get("product");
    if (productId && products.length > 0) {
      const found = products.find((p) => p.id === productId);
      if (found) openProductDetail(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, params]);

  const fetchAll = async () => {
    setLoading(true);
    const [prodRes, svcRes, proRes] = await Promise.all([
      supabase.from("products").select("*").eq("active", true).order("created_at", { ascending: false }),
      supabase.from("services").select("*, professionals(business_name, city)").eq("active", true).order("name"),
      supabase.from("professionals").select("*, profiles:user_id(display_name, avatar_url)").order("rating", { ascending: false }),
    ]);

    if (prodRes.data && prodRes.data.length > 0) {
      setProducts(prodRes.data);
    } else {
      // No fallback with fake IDs — show empty state
      setProducts([]);
    }

    if (svcRes.data) {
      setServices(svcRes.data.map((s: any) => ({
        id: s.id,
        name: s.name,
        price: s.price,
        duration: s.duration,
        description: s.description,
        professional_id: s.professional_id,
        professional_name: s.professionals?.business_name || "Professionista",
        professional_city: s.professionals?.city || "",
      })));
    }

    if (proRes.data) {
      setProfessionals(proRes.data);
    }

    setLoading(false);
  };

  const toggleLike = (id: string) => {
    setLikedProducts(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
    toast.success(likedProducts.includes(id) ? "Rimosso dai preferiti" : "Aggiunto ai preferiti");
  };

  const addToCart = (id: string) => {
    setCart(prev => [...prev, id]);
    toast.success("Aggiunto al carrello! 🛒");
  };

  const buyNow = (product: Product) => {
    if (!user) { navigate("/auth"); return; }
    const discount = appliedPromo ? (product.price * appliedPromo.discount / 100) : 0;
    const finalPrice = product.price - discount;
    navigate(`/checkout?amount=${finalPrice.toFixed(2)}&desc=${encodeURIComponent(product.name)}&type=product&ref=${product.id}`);
  };

  const openProductDetail = async (product: Product) => {
    setViewProduct(product);
    setViewSeller(null);
    const sellerId = (product as any).seller_id;
    if (sellerId) {
      const { data } = await supabase.from("profiles").select("display_name, avatar_url").eq("user_id", sellerId).maybeSingle();
      if (data) setViewSeller(data as any);
    }
  };

  const applyPromoCode = async () => {
    if (!promoCode.trim()) return;
    const { data } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", promoCode.trim().toUpperCase())
      .eq("active", true)
      .maybeSingle();

    if (data) {
      setAppliedPromo({ code: data.code, discount: Number(data.discount_value) });
      toast.success(`Codice ${data.code} applicato! Sconto ${data.discount_value}%`);
    } else {
      toast.error("Codice promozionale non valido");
    }
    setPromoCode("");
  };

  const getImage = (product: Product, index: number) =>
    product.image_url || fallbackImages[index % fallbackImages.length];

  const filteredProducts = searchQuery.trim()
    ? products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.category?.toLowerCase().includes(searchQuery.toLowerCase()))
    : products;

  const filteredServices = searchQuery.trim()
    ? services.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.professional_name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : services;

  const filteredProfessionals = searchQuery.trim()
    ? professionals.filter(p => p.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.specialty?.toLowerCase().includes(searchQuery.toLowerCase()))
    : professionals;

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-display font-bold">Vetrina Beauty</h1>
          <div className="flex items-center gap-2">
            <button className="relative w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-muted-foreground" />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">{cart.length}</span>
              )}
            </button>
            <button onClick={() => navigate("/qr-coins")} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10">
              <Coins className="w-4 h-4 text-accent" />
              <span className="text-sm font-bold">{qrCoins.toLocaleString()}</span>
            </button>
          </div>
        </div>

        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cerca prodotti, servizi, saloni..."
            className="w-full h-10 rounded-xl bg-muted pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
          {sections.map(s => {
            const Icon = s.icon;
            return (
              <button key={s.key} onClick={() => setActiveSection(s.key)}
                 className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                   activeSection === s.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                 }`}>
                <Icon className="w-3.5 h-3.5" />{s.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="p-4">
        {/* Quick links to Offers, Auctions, Affiliate */}
        <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
          <button onClick={() => navigate("/offers")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-500 text-xs font-semibold shrink-0">
            <Tag className="w-3.5 h-3.5" /> Offerte
          </button>
          <button onClick={() => navigate("/auctions")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-500 text-xs font-semibold shrink-0">
            <Gavel className="w-3.5 h-3.5" /> Aste
          </button>
          <button onClick={() => navigate("/affiliate")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-500 text-xs font-semibold shrink-0">
            <Link2 className="w-3.5 h-3.5" /> Affiliazione
          </button>
        </div>
        {/* Promo Code */}
        <div className="flex gap-2 mb-4">
          <input
            value={promoCode}
            onChange={e => setPromoCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && applyPromoCode()}
            placeholder="Codice promozionale..."
            className="flex-1 h-10 rounded-xl bg-muted px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <button onClick={applyPromoCode} className="px-4 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
            Applica
          </button>
        </div>

        {appliedPromo && (
          <div className="mb-4 p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm">
            ✅ Codice <span className="font-bold">{appliedPromo.code}</span> attivo — Sconto {appliedPromo.discount}%
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="aspect-square rounded-xl bg-card animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* ===== PRODUCTS ===== */}
            {activeSection === "products" && (
              <div className="space-y-4 fade-in">
                <div className="rounded-2xl overflow-hidden relative aspect-[2/1]">
                  <img src={beauty2} alt="Prodotto in evidenza" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-r from-background/90 to-transparent flex items-center px-5">
                    <div>
                      <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">Prodotto Top</span>
                      <h3 className="text-lg font-display font-bold mt-2">Cosmohairr Beam</h3>
                      <p className="text-xs text-muted-foreground">Max Mascolini</p>
                      <p className="text-lg font-bold text-primary mt-1">€39.99</p>
                    </div>
                  </div>
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingBag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-semibold">Nessun prodotto disponibile</p>
                    <p className="text-xs text-muted-foreground mt-1">I prodotti appariranno qui quando i professionisti li aggiungeranno</p>
                  </div>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Scopri i Prodotti</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {filteredProducts.map((product, idx) => (
                        <div key={product.id} onClick={() => openProductDetail(product)} className="rounded-xl bg-card overflow-hidden border border-border/50 cursor-pointer hover:border-primary/40 transition-colors">
                          <div className="relative">
                            <img src={getImage(product, idx)} alt={product.name} className="w-full aspect-square object-cover" />
                            <div className="absolute top-2 right-2 flex flex-col gap-1.5">
                              <button onClick={(e) => { e.stopPropagation(); toggleLike(product.id); }}
                                className="w-8 h-8 rounded-full glass flex items-center justify-center">
                                <Heart className={`w-4 h-4 ${likedProducts.includes(product.id) ? "text-primary fill-primary" : "text-foreground"}`} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setShareProduct(product); }}
                                className="w-8 h-8 rounded-full glass flex items-center justify-center">
                                <Share2 className="w-4 h-4 text-foreground" />
                              </button>
                            </div>
                          </div>
                          <div className="p-3">
                            <p className="text-sm font-medium truncate">{product.name}</p>
                            {product.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{product.description}</p>}
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-sm font-bold text-primary">€{product.price}</span>
                              <span className="text-xs text-accent flex items-center gap-0.5">
                                <Star className="w-3 h-3 fill-accent" /> {product.rating || 4.5}
                              </span>
                            </div>
                            <div className="flex gap-1.5 mt-2">
                              <button onClick={(e) => { e.stopPropagation(); addToCart(product.id); }} className="flex-1 py-1.5 rounded-lg bg-muted text-xs font-semibold hover:bg-muted/80 transition-all flex items-center justify-center gap-1">
                                <ShoppingCart className="w-3 h-3" /> Carrello
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); buyNow(product); }} className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                                Acquista
                              </button>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); navigate("/ai-look"); }}
                              className="w-full mt-1.5 py-1.5 rounded-lg bg-primary/10 text-xs font-semibold text-primary flex items-center justify-center gap-1 hover:bg-primary/20 transition-all">
                              <Wand2 className="w-3 h-3" /> Prova Look AI
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setSelectedProduct(product); }}
                              className="w-full mt-1 py-1.5 rounded-lg border border-border/50 text-xs font-medium text-muted-foreground flex items-center justify-center gap-1 hover:bg-muted/50 transition-all">
                              <MessageCircle className="w-3 h-3" /> Recensione
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ===== SERVICES ===== */}
            {activeSection === "services" && (
              <div className="space-y-3 fade-in">
                <p className="text-sm text-muted-foreground">Prenota servizi dai migliori professionisti</p>
                {filteredServices.length === 0 ? (
                  <div className="text-center py-12">
                    <CalendarDays className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-semibold">Nessun servizio disponibile</p>
                    <p className="text-xs text-muted-foreground mt-1">I servizi appariranno qui quando i professionisti li aggiungeranno</p>
                  </div>
                ) : (
                  filteredServices.map((svc, idx) => (
                    <button key={svc.id}
                      onClick={() => navigate(`/booking/${svc.professional_id}`)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-all text-left">
                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0">
                        <img src={fallbackImages[idx % fallbackImages.length]} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{svc.name}</p>
                        <p className="text-[11px] text-muted-foreground">{svc.professional_name}</p>
                        {svc.duration && <p className="text-xs text-muted-foreground">{svc.duration} min</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-primary">€{svc.price}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                  ))
                )}
              </div>
            )}

            {/* ===== PROFESSIONALS / SALONI ===== */}
            {activeSection === "professionals" && (
              <div className="space-y-3 fade-in">
                <p className="text-sm text-muted-foreground">Scopri i saloni e professionisti verificati</p>
                {filteredProfessionals.length === 0 ? (
                  <div className="text-center py-12">
                    <Briefcase className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-semibold">Nessun professionista disponibile</p>
                  </div>
                ) : (
                  filteredProfessionals.map((pro, idx) => (
                    <button key={pro.id}
                      onClick={() => navigate(`/stylist/${pro.id}`)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-all text-left">
                      <img
                        src={pro.profiles?.avatar_url || fallbackImages[idx % fallbackImages.length]}
                        alt=""
                        className="w-14 h-14 rounded-xl object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{pro.business_name}</p>
                        {pro.specialty && <p className="text-[11px] text-muted-foreground">{pro.specialty}</p>}
                        {pro.city && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{pro.city}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1 mt-0.5">
                          <Star className="w-3 h-3 text-accent fill-accent" />
                          <span className="text-xs font-semibold">{pro.rating || 0}</span>
                          <span className="text-xs text-muted-foreground">({pro.review_count || 0})</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <button onClick={e => { e.stopPropagation(); navigate(`/booking/${pro.id}`); }}
                          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                          Prenota
                        </button>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* ===== FEATURED / TOP RATED ===== */}
            {activeSection === "featured" && (
              <div className="space-y-4 fade-in">
                <p className="text-sm text-muted-foreground">I prodotti più amati dalla community</p>
                {filteredProducts.length === 0 ? (
                  <div className="text-center py-12">
                    <Gift className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-semibold">Nessun prodotto in evidenza</p>
                  </div>
                ) : (
                  [...filteredProducts].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6).map((product, idx) => (
                    <div key={product.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50">
                      <div className="relative">
                        <img src={getImage(product, idx)} alt="" className="w-20 h-20 rounded-xl object-cover" />
                        <span className="absolute -top-1 -left-1 w-6 h-6 rounded-full bg-accent text-accent-foreground text-xs font-bold flex items-center justify-center">#{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{product.name}</p>
                        {product.description && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{product.description}</p>}
                        <div className="flex items-center gap-1 mt-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={`w-3 h-3 ${i < Math.round(product.rating || 4.5) ? "text-accent fill-accent" : "text-muted"}`} />
                          ))}
                          <span className="text-xs font-semibold ml-1">{product.rating || 4.5}</span>
                        </div>
                        <p className="text-sm font-bold text-primary mt-1">€{product.price}</p>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <button onClick={() => buyNow(product)} className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">
                          Acquista
                        </button>
                        <button onClick={() => toggleLike(product.id)} className="px-3 py-2 rounded-xl bg-muted text-xs font-semibold flex items-center justify-center gap-1">
                          <Heart className={`w-3 h-3 ${likedProducts.includes(product.id) ? "fill-primary text-primary" : ""}`} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* Review Modal */}
        {selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/60 backdrop-blur-sm" onClick={() => setSelectedProduct(null)}>
            <div className="w-full max-w-lg bg-card rounded-t-3xl p-5 pb-8 border-t border-border/50" onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-4" />
              <h3 className="font-display font-bold text-base mb-1">Recensione</h3>
              <p className="text-xs text-muted-foreground mb-4">{selectedProduct.name}</p>

              <div className="flex gap-1 mb-4">
                {[1,2,3,4,5].map(s => (
                  <button key={s} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-accent/20 transition-colors">
                    <Star className="w-4 h-4 text-accent fill-accent" />
                  </button>
                ))}
              </div>

              <textarea
                value={reviewText}
                onChange={e => setReviewText(e.target.value)}
                placeholder="Scrivi la tua esperienza con questo prodotto..."
                rows={3}
                className="w-full rounded-xl bg-muted px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
              />

              <div className="flex gap-2 mt-4">
                <button onClick={() => setSelectedProduct(null)} className="flex-1 py-3 rounded-xl bg-primary/10 text-primary text-sm font-semibold">
                  Annulla
                </button>
                <button onClick={() => { toast.success("Recensione inviata!"); setSelectedProduct(null); setReviewText(""); }}
                  className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                  Pubblica
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {viewProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/60 backdrop-blur-sm" onClick={() => setViewProduct(null)}>
          <div className="w-full max-w-lg bg-card rounded-t-3xl border-t border-border/50 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-muted mx-auto mt-3 mb-1" />
            <img src={viewProduct.image_url || "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800"} alt={viewProduct.name} className="w-full aspect-video object-cover" />
            <div className="p-5 pb-8 space-y-3">
              <div>
                <h3 className="font-display font-bold text-lg">{viewProduct.name}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-accent text-accent" /> {viewProduct.rating || 4.5} ({(viewProduct as any).review_count || 0} recensioni)</span>
                  {(viewProduct as any).category && <span>· {(viewProduct as any).category}</span>}
                </div>
              </div>

              {viewProduct.description && <p className="text-sm text-muted-foreground">{viewProduct.description}</p>}

              {viewSeller && (
                <button onClick={() => { setViewProduct(null); navigate(`/profile/${(viewProduct as any).seller_id}`); }}
                  className="flex items-center gap-2 p-2 rounded-xl bg-muted/50 w-full text-left">
                  <img src={viewSeller.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${(viewProduct as any).seller_id}`} alt="" className="w-8 h-8 rounded-full object-cover" />
                  <span className="text-xs font-semibold">Venduto da {viewSeller.display_name}</span>
                </button>
              )}

              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-primary">€{viewProduct.price}</span>
                {typeof (viewProduct as any).stock === "number" && (
                  <span className="text-xs text-muted-foreground">{(viewProduct as any).stock > 0 ? `${(viewProduct as any).stock} disponibili` : "Esaurito"}</span>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => { addToCart(viewProduct.id); setViewProduct(null); }} className="flex-1 py-3 rounded-xl bg-muted text-sm font-semibold flex items-center justify-center gap-1.5">
                  <ShoppingCart className="w-4 h-4" /> Carrello
                </button>
                <button onClick={() => { setViewProduct(null); buyNow(viewProduct); }} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold">
                  Acquista ora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {shareProduct && (
        <ShareMenu
          onClose={() => setShareProduct(null)}
          title={shareProduct.name}
          url={`https://style.app/product/${shareProduct.id}`}
        />
      )}
    </MobileLayout>
  );
}
