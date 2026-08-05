import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

// BUG TROVATO: la pagina /complete-profile esisteva già ma NIENTE
// nell'app la richiamava mai — un utente nuovo via Google non veniva
// mai chiesto né del sesso né del tipo di account (cliente/
// professionista/azienda), diventando "cliente" in silenzio per
// difetto. Questo componente colma quel buco: se il profilo risulta
// incompleto (sesso mai impostato — succede solo per chi non è mai
// passato dal modulo di registrazione completo, tipicamente i nuovi
// utenti Google), lo manda a completarlo prima di usare l'app.
const EXEMPT_PATHS = ["/auth", "/complete-profile", "/welcome", "/.lovable/oauth/consent", "/privacy", "/terms"];

export default function OnboardingGate() {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !user || !profile) return;
    if (EXEMPT_PATHS.some((p) => location.pathname.startsWith(p))) return;
    if (!profile.gender) {
      navigate("/complete-profile", { replace: true });
    }
  }, [loading, user, profile, location.pathname, navigate]);

  return null;
}
