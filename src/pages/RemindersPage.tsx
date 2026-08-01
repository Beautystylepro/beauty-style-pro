import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, Bell, Sparkles, Plus, Calendar, Clock, Truck, Tag, Loader2, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useSmartReminders, useActiveReminders, useCreateManualReminder, useApplyShippingPromo } from "@/hooks/useSmartReminders";
import SmartReminderCard from "@/components/reminders/SmartReminderCard";
import { toast } from "sonner";

const serviceTypes = [
  { id: 'colore', name: 'Colore/Tinta', frequency: 45, emoji: '🎨' },
  { id: 'taglio', name: 'Taglio', frequency: 30, emoji: '✂️' },
  { id: 'piega', name: 'Piega', frequency: 7, emoji: '💇‍♀️' },
  { id: 'trattamento', name: 'Trattamento', frequency: 21, emoji: '✨' },
  { id: 'balayage', name: 'Balayage/Meches', frequency: 60, emoji: '🌟' },
  { id: 'manicure', name: 'Manicure', frequency: 14, emoji: '💅' },
  { id: 'pedicure', name: 'Pedicure', frequency: 21, emoji: '🦶' },
  { id: 'sopracciglia', name: 'Sopracciglia', frequency: 14, emoji: '👁️' }
];

export default function RemindersPage() {
  const navigate = useNavigate();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedService, setSelectedService] = useState('');
  const [lastServiceDate, setLastServiceDate] = useState('');
  const [notes, setNotes] = useState('');
  const [shippingEnabled, setShippingEnabled] = useState(false);
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingNotes, setShippingNotes] = useState('');
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountType: string | null; discountValue: number | null; freeShipping: boolean } | null>(null);

  const { data: allReminders, isLoading } = useSmartReminders();
  const { data: activeReminders } = useActiveReminders();
  const createReminder = useCreateManualReminder();
  const applyShippingPromo = useApplyShippingPromo();

  const resetShippingState = () => {
    setShippingEnabled(false);
    setShippingAddress('');
    setShippingNotes('');
    setPromoCodeInput('');
    setAppliedPromo(null);
  };

  const handleApplyPromo = async () => {
    if (!promoCodeInput.trim()) return;
    if (!selectedService) {
      toast.error("Seleziona prima il tipo di servizio");
      return;
    }
    try {
      const result = await applyShippingPromo.mutateAsync({
        code: promoCodeInput.trim(),
        serviceType: selectedService,
      });
      setAppliedPromo({
        code: promoCodeInput.trim(),
        discountType: result.discount_type,
        discountValue: result.discount_value,
        freeShipping: !!result.free_shipping,
      });
      toast.success(result.message || "Codice promo applicato!");
    } catch (error) {
      setAppliedPromo(null);
      toast.error(error instanceof Error ? error.message : "Codice promo non valido");
    }
  };

  const handleCreateReminder = async () => {
    if (!selectedService || !lastServiceDate) {
      toast.error("Seleziona servizio e data");
      return;
    }

    const service = serviceTypes.find(s => s.id === selectedService);
    if (!service) return;

    if (shippingEnabled && !shippingAddress.trim()) {
      toast.error("Inserisci un indirizzo di spedizione");
      return;
    }

    try {
      await createReminder.mutateAsync({
        serviceType: service.id,
        serviceName: service.name,
        lastServiceDate,
        frequencyDays: service.frequency,
        priority: service.frequency <= 14 ? 'high' : service.frequency <= 30 ? 'medium' : 'low',
        notes,
        shippingEnabled,
        shippingAddress: shippingEnabled ? shippingAddress.trim() : undefined,
        shippingNotes: shippingEnabled ? shippingNotes.trim() : undefined,
        freeShipping: appliedPromo?.freeShipping ?? false,
        promoCode: appliedPromo?.code,
        promoDiscount: appliedPromo?.discountValue ?? undefined,
      });
      
      toast.success("Promemoria creato!");
      setShowCreateForm(false);
      setSelectedService('');
      setLastServiceDate('');
      setNotes('');
      resetShippingState();
    } catch (error) {
      toast.error("Errore nella creazione");
    }
  };

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="p-4">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <header className="sticky top-0 z-40 glass px-4 py-3 flex items-center gap-3">
        <button 
          onClick={() => navigate(-1)} 
          className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-display font-bold flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" /> Promemoria Intelligenti
        </h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="w-9 h-9 rounded-full gradient-primary ml-auto flex items-center justify-center"
        >
          <Plus className="w-5 h-5 text-primary-foreground" />
        </button>
      </header>

      <div className="p-4">
        {/* Stats Header */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="text-center p-3 rounded-xl bg-card border border-border">
            <p className="text-lg font-bold text-primary">{activeReminders?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Attivi</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-card border border-border">
            <p className="text-lg font-bold text-orange-500">{allReminders?.filter(r => r.priority === 'high').length || 0}</p>
            <p className="text-xs text-muted-foreground">Urgenti</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-card border border-border">
            <p className="text-lg font-bold text-green-500">{allReminders?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Totali</p>
          </div>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="mb-6 p-4 rounded-xl bg-card border border-border space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" /> Nuovo Promemoria
            </h3>
            
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Tipo di servizio</label>
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full mt-1 h-10 rounded-xl bg-muted border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Seleziona servizio...</option>
                {serviceTypes.map(service => (
                  <option key={service.id} value={service.id}>
                    {service.emoji} {service.name} (ogni {service.frequency} giorni)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Data ultimo servizio</label>
              <input
                type="date"
                value={lastServiceDate}
                onChange={(e) => setLastServiceDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full mt-1 h-10 rounded-xl bg-muted border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Note (opzionale)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Aggiungi note o dettagli..."
                className="w-full mt-1 h-16 rounded-xl bg-muted border border-border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>

            {/* Shipping Section */}
            <div className="pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShippingEnabled(!shippingEnabled)}
                className="w-full flex items-center justify-between"
              >
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                  <Truck className="w-4 h-4 text-primary" /> Richiedi spedizione prodotto
                </span>
                <span className={`w-9 h-5 rounded-full relative transition-colors ${shippingEnabled ? 'bg-primary' : 'bg-muted'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${shippingEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </span>
              </button>

              {shippingEnabled && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Indirizzo di spedizione</label>
                    <input
                      type="text"
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="Via, città, CAP..."
                      className="w-full mt-1 h-10 rounded-xl bg-muted border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Note di consegna (opzionale)</label>
                    <input
                      type="text"
                      value={shippingNotes}
                      onChange={(e) => setShippingNotes(e.target.value)}
                      placeholder="Es. citofono, orari..."
                      className="w-full mt-1 h-10 rounded-xl bg-muted border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <Tag className="w-3 h-3" /> Codice promo spedizione
                    </label>
                    <div className="flex gap-2 mt-1">
                      <input
                        type="text"
                        value={promoCodeInput}
                        onChange={(e) => { setPromoCodeInput(e.target.value.toUpperCase()); setAppliedPromo(null); }}
                        placeholder="Es. FREESHIP10"
                        className="flex-1 h-10 rounded-xl bg-muted border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <button
                        type="button"
                        onClick={handleApplyPromo}
                        disabled={applyShippingPromo.isPending || !promoCodeInput.trim()}
                        className="px-3 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
                      >
                        {applyShippingPromo.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Applica"}
                      </button>
                    </div>
                    {appliedPromo && (
                      <p className="text-xs text-green-500 flex items-center gap-1 mt-1">
                        <CheckCircle2 className="w-3 h-3" />
                        {appliedPromo.freeShipping
                          ? "Spedizione gratuita applicata!"
                          : `Sconto applicato: ${appliedPromo.discountValue}${appliedPromo.discountType === 'percent' ? '%' : '€'}`}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCreateReminder}
                disabled={createReminder.isPending}
                className="flex-1 py-2 rounded-xl gradient-primary text-primary-foreground font-semibold text-sm"
              >
                {createReminder.isPending ? 'Creazione...' : 'Crea Promemoria'}
              </button>
              <button
                onClick={() => { setShowCreateForm(false); resetShippingState(); }}
                className="px-4 py-2 rounded-xl bg-muted text-muted-foreground font-semibold text-sm"
              >
                Annulla
              </button>
            </div>
          </div>
        )}

        {/* Active Reminders */}
        {activeReminders && activeReminders.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" /> Promemoria Attivi
            </h2>
            <div className="space-y-3">
              {activeReminders.map(reminder => (
                <SmartReminderCard key={reminder.id} reminder={reminder} />
              ))}
            </div>
          </div>
        )}

        {/* All Reminders */}
        <div>
          <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" /> Tutti i Promemoria
          </h2>
          
          {allReminders && allReminders.length > 0 ? (
            <div className="space-y-3">
              {allReminders.map(reminder => (
                <SmartReminderCard key={reminder.id} reminder={reminder} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nessun promemoria attivo</p>
              <p className="text-xs">Crea il tuo primo promemoria intelligente!</p>
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}