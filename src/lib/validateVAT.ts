// Verifica automatica e istantanea della Partita IVA italiana (11
// cifre), tramite l'algoritmo di controllo ufficiale — nessuna attesa,
// nessun controllo umano necessario per questo dato specifico, la
// matematica stessa garantisce se il numero è formalmente valido.
export function isValidItalianVAT(raw: string): boolean {
  const vat = raw.replace(/\D/g, "");
  if (vat.length !== 11) return false;

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    let digit = parseInt(vat[i], 10);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}
