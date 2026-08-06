import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, Plus, Package, Edit3, Trash2, Eye, EyeOff, Sparkles, Camera, Video, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useVerificationGuard } from "@/hooks/useVerificationGuard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import beauty1 from "@/assets/beauty-1.jpg";
import beauty2 from "@/assets/beauty-2.jpg";
import beauty3 from "@/assets/beauty-3.jpg";

const fallbackImages = [beauty1, beauty2, beauty3];

interface Product {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  video_url: string | null;
  category: string | null;
  description: string | null;
  active: boolean | null;
  stock: number | null;
}

export default function ManageProductsPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { guardAction } = useVerificationGuard();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", price: "", description: "", category: "Hair Care" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [suggestingText, setSuggestingText] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const isSeller = profile?.user_type === 'professional' || profile?.user_type === 'business';

  useEffect(() => {
    if (!user || !isSeller) { navigate("/profile"); return; }
    fetchProducts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isSeller]);

  const fetchProducts = async () => {
    if (!user) return;
    const { data } = await supabase.from("products").select("*").eq("seller_id", user.id).order("created_at", { ascending: false });
    setProducts(data || []);
    setLoading(false);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Immagine troppo grande (max 5MB)"); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) { toast.error("Video troppo grande (max 30MB)"); return; }
    setVideoFile(file);
  };

  // Richiesto: pulsante suggerimenti AI per la creazione — Claude
  // scrive o migliora la descrizione del prodotto, riusando la stessa
  // funzione già collaudata per i testi di marketing.
  const suggestDescription = async () => {
    if (!newProduct.name.trim()) { toast.error("Scrivi prima il nome del prodotto"); return; }
    setSuggestingText(true);
    const { data, error } = await supabase.functions.invoke("generate-marketing-copy", {
      body: {
        goal: `Descrizione prodotto in vendita: "${newProduct.name}", categoria ${newProduct.category}. Breve, invogliante, 2-3 frasi, per una vetrina beauty.`,
        existingText: newProduct.description.trim() || undefined,
        channel: "email",
      },
    });
    setSuggestingText(false);
    if (error || data?.error) { toast.error(data?.error || "Suggerimento non riuscito"); return; }
    const suggested = data?.body;
    if (suggested) setNewProduct(p => ({ ...p, description: suggested.slice(0, 500) }));
  };

  const handleAdd = async () => {
    if (guardAction("pubblicare prodotti")) return;
    if (!user || !newProduct.name.trim() || !newProduct.price) { toast.error("Compila nome e prezzo"); return; }
    const price = parseFloat(newProduct.price);
    if (isNaN(price) || price <= 0) { toast.error("Prezzo non valido"); return; }

    setUploading(true);
    let image_url: string | null = null;
    let video_url: string | null = null;

    if (imageFile) {
      const path = `${user.id}/${Date.now()}_${imageFile.name}`;
      const { error: upErr } = await supabase.storage.from("products").upload(path, imageFile);
      if (!upErr) image_url = supabase.storage.from("products").getPublicUrl(path).data.publicUrl;
    }
    if (videoFile) {
      const path = `${user.id}/${Date.now()}_${videoFile.name}`;
      const { error: upErr } = await supabase.storage.from("products").upload(path, videoFile);
      if (!upErr) video_url = supabase.storage.from("products").getPublicUrl(path).data.publicUrl;
    }

    const { error } = await supabase.from("products").insert({
      seller_id: user.id,
      name: newProduct.name.trim().slice(0, 100),
      price,
      description: newProduct.description.trim().slice(0, 500) || null,
      category: newProduct.category,
      image_url,
      video_url,
    });
    setUploading(false);
    if (error) { toast.error("Errore nell'aggiunta"); return; }
    toast.success("Prodotto pubblicato! 🎉");
    setNewProduct({ name: "", price: "", description: "", category: "Hair Care" });
    setImageFile(null); setImagePreview(null); setVideoFile(null);
    setShowAdd(false);
    fetchProducts();
  };

  const toggleActive = async (product: Product) => {
    const { error } = await supabase.from("products").update({ active: !product.active }).eq("id", product.id);
    if (!error) {
      toast.success(product.active ? "Prodotto nascosto" : "Prodotto visibile");
      fetchProducts();
    }
  };

  const getImage = (product: Product, i: number) => product.image_url || fallbackImages[i % fallbackImages.length];

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-bold flex-1">Gestione Prodotti</h1>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">
          <Plus className="w-3.5 h-3.5" /> Nuovo
        </button>
      </header>

      <div className="p-4">
        {/* Add form */}
        {showAdd && (
          <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 mb-4 fade-in">
            <h3 className="font-semibold text-sm">Nuovo Prodotto</h3>

            <div className="flex gap-2">
              <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
              <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoSelect} className="hidden" />
              <button onClick={() => imageInputRef.current?.click()}
                className="flex-1 h-24 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 overflow-hidden relative">
                {imagePreview ? (
                  <>
                    <img src={imagePreview} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    <button onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(null); }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-background/80 flex items-center justify-center z-10">
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <><Camera className="w-5 h-5 text-muted-foreground" /><span className="text-[10px] text-muted-foreground">Foto</span></>
                )}
              </button>
              <button onClick={() => videoInputRef.current?.click()}
                className="flex-1 h-24 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1">
                <Video className="w-5 h-5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{videoFile ? videoFile.name.slice(0, 15) : "Video (facoltativo)"}</span>
              </button>
            </div>

            <input value={newProduct.name} onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))}
              placeholder="Nome prodotto *" maxLength={100}
              className="w-full h-10 rounded-xl bg-background border border-border px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <input value={newProduct.price} onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))}
              placeholder="Prezzo (€) *" type="number" step="0.01" min="0"
              className="w-full h-10 rounded-xl bg-background border border-border px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />

            <div className="relative">
              <textarea value={newProduct.description} onChange={e => setNewProduct(p => ({ ...p, description: e.target.value }))}
                placeholder="Descrizione..." rows={2} maxLength={500}
                className="w-full rounded-xl bg-background border border-border px-4 py-2 pr-10 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/30" />
              <button onClick={suggestDescription} disabled={suggestingText} title="Suggerisci con AI"
                className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center disabled:opacity-50">
                <Sparkles className={`w-3.5 h-3.5 text-primary ${suggestingText ? "animate-pulse" : ""}`} />
              </button>
            </div>

            <select value={newProduct.category} onChange={e => setNewProduct(p => ({ ...p, category: e.target.value }))}
              className="w-full h-10 rounded-xl bg-background border border-border px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30">
              {["Hair Care", "Skincare", "Makeup", "Nails", "Tools", "Altro"].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-xl bg-primary/10 text-primary text-sm font-semibold">Annulla</button>
              <button onClick={handleAdd} disabled={uploading} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                {uploading ? "Pubblicazione..." : "Pubblica"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-24 rounded-xl bg-card animate-pulse" />)}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">Nessun prodotto nella tua vetrina</p>
            <button onClick={() => setShowAdd(true)}
              className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
              Aggiungi il primo prodotto
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{products.length} prodotti nel tuo catalogo</p>
            {products.map((product, idx) => (
              <div key={product.id} className={`flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 ${!product.active ? "opacity-60" : ""}`}>
                <img src={getImage(product, idx)} alt={product.name} className="w-16 h-16 rounded-xl object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.category}</p>
                  <p className="text-sm font-bold text-primary mt-0.5">€{product.price}</p>
                  {product.stock !== null && <p className="text-xs text-muted-foreground">Stock: {product.stock}</p>}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button onClick={() => toggleActive(product)}
                    className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80">
                    {product.active ? <Eye className="w-4 h-4 text-primary" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
