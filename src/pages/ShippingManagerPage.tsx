import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, Truck, Store, Package, MapPin, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const CARRIERS = ["BRT", "GLS", "Poste Italiane", "DHL", "SDA", "Altro"];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Da preparare", color: "bg-yellow-500/15 text-yellow-600" },
  preparing: { label: "In preparazione", color: "bg-blue-500/15 text-blue-600" },
  shipped: { label: "Spedito", color: "bg-primary/15 text-primary" },
  delivered: { label: "Consegnato", color: "bg-green-500/15 text-green-600" },
  ready_for_pickup: { label: "Pronto per ritiro", color: "bg-blue-500/15 text-blue-600" },
  picked_up: { label: "Ritirato", color: "bg-green-500/15 text-green-600" },
};

export default function ShippingManagerPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState("");
  const [carrierInput, setCarrierInput] = useState(CARRIERS[0]);

  const canSell = profile?.user_type === "professional" || profile?.user_type === "business";

  const { data: orders, isLoading } = useQuery({
    queryKey: ["seller_orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("product_purchases")
        .select("*, product:products(name, image_url, seller_id)")
        .order("created_at", { ascending: false });
      // RLS already restricts to the seller's own products — this is
      // just a defensive client-side filter in case of joined nulls.
      const realOrders = (data || []).filter((o: any) => o.product);
      if (realOrders.length === 0) return realOrders;

      // No direct foreign key from product_purchases to profiles exists,
      // so buyer info is fetched separately rather than via a nested
      // PostgREST select (which would fail without that relationship).
      const buyerIds = Array.from(new Set(realOrders.map((o: any) => o.buyer_id)));
      const { data: buyers } = await supabase.from("profiles").select("user_id, display_name, phone").in("user_id", buyerIds);
      const buyerMap = new Map((buyers || []).map((b: any) => [b.user_id, b]));
      return realOrders.map((o: any) => ({ ...o, buyer: buyerMap.get(o.buyer_id) }));
    },
  });

  const updateStatus = async (orderId: string, newStatus: string) => {
    const { error } = await supabase.from("product_purchases").update({ shipping_status: newStatus }).eq("id", orderId);
    if (error) {
      toast.error("Errore nell'aggiornamento");
      return;
    }
    toast.success("Stato aggiornato ✓");
    queryClient.invalidateQueries({ queryKey: ["seller_orders", user?.id] });
  };

  const saveTracking = async (orderId: string) => {
    if (!trackingInput.trim()) {
      toast.error("Inserisci un numero di tracking");
      return;
    }
    const { error } = await supabase.from("product_purchases").update({
      tracking_number: trackingInput.trim(),
      carrier: carrierInput,
      shipping_status: "shipped",
    }).eq("id", orderId);
    if (error) {
      toast.error("Errore nel salvataggio");
      return;
    }
    toast.success("Spedizione registrata ✓");
    setEditingId(null);
    setTrackingInput("");
    queryClient.invalidateQueries({ queryKey: ["seller_orders", user?.id] });
  };

  if (!canSell) {
    return (
      <MobileLayout>
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <p className="text-sm text-muted-foreground">Solo professionisti e attività che vendono prodotti hanno una gestione spedizioni.</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-sm font-semibold text-primary">Torna indietro</button>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-primary" aria-label="Indietro">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Spedizioni e ritiri</h1>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {isLoading ? (
            <p className="text-center text-sm text-muted-foreground py-12">Caricamento...</p>
          ) : !orders?.length ? (
            <div className="text-center py-16">
              <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">Nessun ordine ancora sui tuoi prodotti.</p>
            </div>
          ) : (
            orders.map((order: any) => {
              const isPickup = order.delivery_method === "pickup";
              const status = STATUS_LABELS[order.shipping_status] || STATUS_LABELS.pending;
              return (
                <div key={order.id} className="rounded-2xl border border-border/50 bg-card p-3">
                  <div className="flex items-start gap-3">
                    {order.product?.image_url && (
                      <img src={order.product.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{order.product?.name}</p>
                      <p className="text-xs text-muted-foreground">{order.buyer?.display_name || "Cliente"} · €{order.total_price}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        {isPickup ? <Store className="w-3.5 h-3.5 text-muted-foreground" /> : <Truck className="w-3.5 h-3.5 text-muted-foreground" />}
                        <span className="text-[10px] text-muted-foreground">{isPickup ? "Ritiro in negozio" : "Spedizione"}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${status.color}`}>{status.label}</span>
                  </div>

                  {!isPickup && order.shipping_address && (
                    <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1">
                      <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {order.shipping_address}
                    </p>
                  )}

                  {order.tracking_number && (
                    <p className="mt-2 text-xs">
                      <span className="text-muted-foreground">Tracking: </span>
                      <span className="font-semibold">{order.carrier} — {order.tracking_number}</span>
                    </p>
                  )}

                  {/* Actions */}
                  {isPickup ? (
                    order.shipping_status !== "picked_up" && (
                      <button
                        onClick={() => updateStatus(order.id, "picked_up")}
                        className="mt-3 w-full h-9 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Segna come ritirato
                      </button>
                    )
                  ) : (
                    <>
                      {order.shipping_status === "pending" && (
                        <button
                          onClick={() => updateStatus(order.id, "preparing")}
                          className="mt-3 w-full h-9 rounded-lg bg-muted text-xs font-semibold"
                        >
                          Inizia preparazione
                        </button>
                      )}
                      {(order.shipping_status === "pending" || order.shipping_status === "preparing") && editingId !== order.id && (
                        <button
                          onClick={() => { setEditingId(order.id); setTrackingInput(""); }}
                          className="mt-2 w-full h-9 rounded-lg bg-primary/10 text-primary text-xs font-semibold"
                        >
                          Aggiungi tracking e segna come spedito
                        </button>
                      )}
                      {editingId === order.id && (
                        <div className="mt-2 space-y-2">
                          <select
                            value={carrierInput}
                            onChange={(e) => setCarrierInput(e.target.value)}
                            className="w-full h-9 px-2 rounded-lg border border-border/50 bg-background text-xs"
                          >
                            {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input
                            value={trackingInput}
                            onChange={(e) => setTrackingInput(e.target.value)}
                            placeholder="Numero di tracking"
                            className="w-full h-9 px-2 rounded-lg border border-border/50 bg-background text-xs"
                          />
                          <button
                            onClick={() => saveTracking(order.id)}
                            className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
                          >
                            Conferma spedizione
                          </button>
                        </div>
                      )}
                      {order.shipping_status === "shipped" && (
                        <button
                          onClick={() => updateStatus(order.id, "delivered")}
                          className="mt-2 w-full h-9 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
                        >
                          Segna come consegnato
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
