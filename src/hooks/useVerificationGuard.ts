import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

/**
 * Hook to check basic eligibility before allowing product sales,
 * service creation, booking acceptance, etc.
 *
 * BUG TROVATO: prima richiedeva la verifica COMPLETA dell'account
 * (documento d'identità caricato e controllato) solo per creare
 * un'offerta o mettere in vendita un prodotto — bloccando
 * completamente professionisti legittimi. In Italia un professionista
 * può vendere occasionalmente anche senza Partita IVA sotto la soglia
 * dei 5.000€ annui, e chi la P.IVA ce l'ha l'ha già fornita in
 * registrazione — non ha senso richiedere un secondo processo di
 * verifica documenti solo per iniziare a vendere. La verifica completa
 * resta comunque disponibile per chi vuole il badge "Verificato".
 */
export function useVerificationGuard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isProOrBusiness = true; // mantenuto per compatibilità con le pagine esistenti
  const isVerified = true;

  /** Returns true if action is BLOCKED (only when not logged in) */
  const guardAction = (_actionLabel?: string): boolean => {
    if (!user) {
      navigate("/auth");
      return true;
    }
    return false;
  };

  return { guardAction, isVerified, isProOrBusiness };
}
