// Mappa paese → lingua (codice ISO), usata per impostare automaticamente
// la lingua preferita dell'utente in fase di registrazione. Copre più di
// 10 paesi/lingue tra le più parlate al mondo, coerente con le mappe già
// usate nelle Edge Function di traduzione (ai-translate, voice-transcribe,
// elevenlabs-translate-speak).

export const LANGUAGE_NAMES: Record<string, string> = {
  it: "Italiano",
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  ar: "العربية",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  ru: "Русский",
  hi: "हिन्दी",
  tr: "Türkçe",
  nl: "Nederlands",
  pl: "Polski",
  sv: "Svenska",
};

const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  italia: "it", italy: "it", "san marino": "it",
  "stati uniti": "en", "united states": "en", usa: "en", "regno unito": "en", "united kingdom": "en", uk: "en",
  irlanda: "en", ireland: "en", canada: "en", australia: "en",
  spagna: "es", spain: "es", messico: "es", "mexico": "es", argentina: "es", colombia: "es", cile: "es", chile: "es", peru: "es",
  francia: "fr", france: "fr", belgio: "fr", belgium: "fr", svizzera: "de",
  germania: "de", germany: "de", austria: "de",
  portogallo: "pt", portugal: "pt", brasile: "pt", brazil: "pt",
  "arabia saudita": "ar", "saudi arabia": "ar", egitto: "ar", egypt: "ar", "emirati arabi uniti": "ar", uae: "ar", marocco: "ar", morocco: "ar",
  cina: "zh", china: "zh", taiwan: "zh",
  giappone: "ja", japan: "ja",
  "corea del sud": "ko", "south korea": "ko", corea: "ko",
  russia: "ru",
  india: "hi",
  turchia: "tr", turkey: "tr",
  "paesi bassi": "nl", olanda: "nl", netherlands: "nl",
  polonia: "pl", poland: "pl",
  svezia: "sv", sweden: "sv",
};

export function languageFromCountry(country: string): string {
  const key = (country || "").trim().toLowerCase();
  return COUNTRY_TO_LANGUAGE[key] || "it";
}
