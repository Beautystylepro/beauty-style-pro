import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// BUG TROVATO: i link di affiliazione (?ref=CODICE) venivano generati
// e condivisi correttamente, ma NIENTE catturava il codice quando
// qualcuno arrivava sull'app tramite quel link — se non si registrava
// nello stesso istante, il codice andava perso per sempre. Ora viene
// salvato appena arriva, da qualsiasi pagina, e resta pronto finché
// non si registra davvero (anche dopo giorni).
export default function ReferralCapture() {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get("ref");
    if (ref) {
      try { window.localStorage.setItem("style_ref_code", ref); } catch { /* best-effort, ignore */ }
    }
  }, [location.search]);

  return null;
}
