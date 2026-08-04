import { Briefcase, CalendarDays, ShoppingBag, MessageCircle as ChatIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PostCardActionsProps {
  postType: string | null;
  postId: string;
  userId: string;
  userType?: string;
  userName?: string;
}

export default function PostCardActions({ postType, postId, userId, userType, userName }: PostCardActionsProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState(userName || "");

  const isJob = postType === "job";
  const isService = (postType === "service" || userType === "professional" || userType === "business") && userType !== "client";
  const isProduct = postType === "product";
  // Prima "Contatta su WhatsApp" compariva SOLO sotto post etichettati
  // esplicitamente come lavoro/servizio/prodotto — un post normale
  // (foto, prima/dopo, ecc.) di un professionista non lo mostrava mai,
  // anche se ha senso poter contattarlo comunque.
  const canContact = isJob || isService || isProduct || userType === "professional" || userType === "business";

  useEffect(() => {
    if (canContact) {
      supabase.from("profiles").select("phone, display_name").eq("user_id", userId).maybeSingle()
        .then(({ data }) => {
          if (data?.phone) setPhone(data.phone);
          if (data?.display_name && !userName) setDisplayName(data.display_name);
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, canContact]);

  const goAuth = () => { if (!user) { navigate("/auth"); return true; } return false; };

  const openWhatsApp = () => {
    if (!phone) { showToast("Numero WhatsApp non disponibile"); return; }
    const cleanPhone = phone.replace(/\s+/g, "").replace(/^0/, "+39");
    const finalPhone = cleanPhone.startsWith("+") ? cleanPhone : `+39${cleanPhone}`;

    let msg = "Ciao! Ti ho trovato su STYLE e vorrei maggiori informazioni.";
    if (isService) msg = `Ciao ${displayName || ""}! Ti ho trovato su STYLE e vorrei prenotare un appuntamento. Puoi indicarmi le tue disponibilità?`;
    if (isJob) msg = `Ciao ${displayName || ""}! Ho visto il tuo annuncio di lavoro su STYLE e sono interessato/a. Possiamo parlarne?`;
    if (isProduct) msg = `Ciao ${displayName || ""}! Ho visto un tuo prodotto su STYLE e vorrei maggiori informazioni per l'acquisto.`;

    window.open(`https://wa.me/${finalPhone.replace("+", "")}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {isJob && (
        <button type="button" onClick={() => { if (goAuth()) return; navigate(`/hr/job/${postId}`); }}
          aria-label="Candidati" className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
          <Briefcase className="w-3 h-3" /> Candidati
        </button>
      )}
      {isService && (
        <button type="button" onClick={() => { if (goAuth()) return; navigate(`/booking/${userId}`); }}
          aria-label="Prenota" className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
          <CalendarDays className="w-3 h-3" /> Prenota
        </button>
      )}
      {isProduct && (
        <button type="button" onClick={() => navigate(`/shop`)}
          aria-label="Acquista" className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
          <ShoppingBag className="w-3 h-3" /> Acquista
        </button>
      )}
      {canContact && (
        <>
          <button type="button" onClick={() => { if (goAuth()) return; navigate(`/chat`); }}
            aria-label="Apri chat" className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted text-foreground text-xs font-semibold">
            <ChatIcon className="w-3 h-3" /> Chat
          </button>
          <button type="button" onClick={openWhatsApp}
            aria-label="Contatta su WhatsApp" className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-semibold">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492l4.634-1.215A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-2.168 0-4.19-.591-5.934-1.621l-.425-.253-2.748.721.733-2.68-.278-.442A9.78 9.78 0 012.182 12c0-5.415 4.403-9.818 9.818-9.818S21.818 6.585 21.818 12 17.415 21.818 12 21.818z"/></svg>
            WhatsApp
          </button>
        </>
      )}
    </div>
  );
}

const showToast = (msg: string) => { import("sonner").then(m => m.toast.info(msg)); };
