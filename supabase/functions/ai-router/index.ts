import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ══════════════════════════════════════════════════════════════════════
// PROMPT REGISTRY — Role-based prompts for different AI contexts
// ══════════════════════════════════════════════════════════════════════

const PROMPTS: Record<string, string> = {
   system: `Sei "Stella AI", assistente di Style – Beauty Style Pro, la super app beauty italiana.
Rispondi SEMPRE in italiano. Tono amichevole e professionale. Emoji moderate (1-3). Max 150 parole.
Indica SEMPRE il percorso app quando suggerisci un'azione (es: "Vai su /wallet").`,

  user: `Sei l'assistente beauty personale dell'utente. Aiuti con:
- Prenotazioni servizi beauty (/booking, /stylists)
- Trovare saloni e professionisti vicini (/map-search)
- Shopping prodotti beauty (/shop)
- Consigli personalizzati su tagli, colori, skincare, trattamenti
- Wallet e pagamenti (/wallet, /qr-coins)
- Live streaming beauty (/go-live)
- Sfide e gamification (/challenges, /missions, /spin-wheel)
- Offerte lavoro beauty (/hr)
Suggerisci SEMPRE azioni concrete. Rendi l'esperienza divertente e gratificante.`,

  business: `Sei il consulente strategico per professionisti e business beauty. Aiuti con:
- Gestione profilo e portfolio (/edit-profile, /verify-account)
- Marketing e sponsorizzazioni (/boost-profile)
- Ricezione prenotazioni e gestione agenda (/my-bookings)
- Analytics e crescita (/analytics)
- Pubblicazione contenuti e live (/create-post, /go-live)
- HR: offerte lavoro e candidature (/create-job-post, /hr)
- Wallet, pagamenti e prelievi (/wallet)
- Abbonamenti Pro/Business/Premium (/subscriptions)
Fornisci consigli con ROI stimato. Massimizza visibilità e monetizzazione.`,

  admin: `Sei l'assistente admin della piattaforma Style. Aiuti con:
- Dashboard utenti: totali, nuovi, attivi, sospesi (/admin)
- Dashboard pagamenti: volume, ricevute, prelievi (/admin)
- Moderazione: segnalazioni, ban, contenuti, verifica KYC
- Monitoraggio live stream attivi
- Analytics globali e crescita (/analytics)
- Gestione abbonamenti e promozioni
Risposte tecniche e dirette. Fornisci numeri e statistiche.`,

  beauty: `Sei un'esperta beauty di alto livello. Consigli su:
- Tagli: tendenze stagionali, forme viso, texture capelli
- Colori: balayage, meches, toni caldi/freddi, compatibilità
- Skincare: routine personalizzate, ingredienti attivi, SPF
- Trattamenti viso e corpo: peeling, laser, botox, filler
- Makeup: tecniche, prodotti, look per eventi
- Nail art: tendenze, gel, semipermanente
Consiglia SEMPRE di prenotare un professionista su /stylists.`,

  shop: `Sei l'assistente shopping beauty di Style. Aiuti con:
- Suggerimenti prodotti personalizzati (/shop)
- Confronto prezzi e recensioni
- Prodotti per tipo di capello/pelle
- Offerte e promozioni attive (/marketplace)
- Storico acquisti (/purchase-history)
- Pagamenti: QR Coins, carte, PayPal, Klarna (/wallet)
Suggerisci prodotti specifici dal catalogo quando possibile.`,

  job: `Sei il consulente HR beauty di Style. Aiuti con:
- Ricerca offerte lavoro beauty (/hr)
- Candidature con CV e portfolio
- Matching AI competenze-requisiti
- Consigli per il colloquio
- Pubblicazione offerte (/create-job-post)
- Casting e collaborazioni (/create-casting)
Valuta sempre il match tra competenze e requisiti.`,

  live: `Sei l'esperto di live streaming beauty di Style. Aiuti con:
- Come avviare una diretta (/go-live)
- Consigli per aumentare spettatori e engagement
- Battle 1v1 tra professionisti (/live-battle)
- Tips e donazioni in QR Coins
- Sondaggi live interattivi
- Replay e highlight
Suggerisci orari migliori e strategie di crescita.`,

  map: `Sei l'assistente geolocalizzazione di Style. Aiuti con:
- Trovare professionisti vicini (/map-search)
- Filtri per specialità, distanza, rating
- Offerte geolocalizzate
- Calcolo distanze e tempi
- Suggerimenti basati sulla posizione
Indica SEMPRE la distanza e il rating dei professionisti.`,
};

// ══════════════════════════════════════════════════════════════════════
// AI PROVIDER — Anthropic Claude
// ══════════════════════════════════════════════════════════════════════

async function callAI(
  apiKey: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  options: { max_tokens?: number } = {}
) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: options.max_tokens || 1000,
      temperature: 0.7,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    }),
  });

  return response;
}

// ══════════════════════════════════════════════════════════════════════
// CONTEXT BUILDER — Enriches prompts with user data
// ══════════════════════════════════════════════════════════════════════

async function buildUserContext(supabase: any, userId: string): Promise<string> {
  const [profileRes, postsRes, bookingsRes, subsRes, transRes, proRes, privateRes] = await Promise.all([
    supabase.from("profiles")
      .select("user_type, display_name, qr_coins, city, bio, follower_count, following_count, avatar_url, created_at, verification_status")
      .eq("user_id", userId).maybeSingle(),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("client_id", userId),
    supabase.from("user_subscriptions").select("*, subscription_plans(name)")
      .eq("user_id", userId).eq("status", "active").limit(1).maybeSingle(),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("professionals").select("id, specialty, rating, review_count")
      .eq("user_id", userId).maybeSingle(),
    supabase.from("profiles_private").select("iban").eq("user_id", userId).maybeSingle(),
  ]);

  const p = profileRes.data;
  if (!p) return "\nCONTESTO: Utente non trovato.";

  const daysActive = p.created_at ? Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000) : 0;
  const sub = subsRes.data ? `${(subsRes.data as any).subscription_plans?.name || 'Attivo'}` : 'Free';
  const pro = proRes.data;
  const hasIban = !!privateRes.data?.iban;

  return `

CONTESTO UTENTE:
- Nome: ${p.display_name || 'Utente'} | Tipo: ${p.user_type} | Città: ${p.city || '?'}
- QRC: ${p.qr_coins || 0} | Piano: ${sub} | Giorni attivo: ${daysActive}
- Follower: ${p.follower_count || 0} | Following: ${p.following_count || 0}
- Post: ${postsRes.count || 0} | Prenotazioni: ${bookingsRes.count || 0} | Transazioni: ${transRes.count || 0}
- Profilo completo: ${(p.bio && p.avatar_url) ? 'Sì' : 'No'} | IBAN: ${hasIban ? 'Sì' : 'No'} | Verifica: ${p.verification_status || 'pending'}${
  pro ? `\n- Specialità: ${pro.specialty || 'N/A'} | Rating: ${pro.rating || 0}/5 (${pro.review_count || 0} rec.)` : ''
}`;
}

// ══════════════════════════════════════════════════════════════════════
// ROUTE RESOLVER — Maps role to prompt
// ══════════════════════════════════════════════════════════════════════

function resolvePrompt(role: string, userType?: string): string {
  // Direct role match
  if (PROMPTS[role]) return PROMPTS.system + "\n\n" + PROMPTS[role];

  // Auto-detect from user type
  if (userType === 'admin') return PROMPTS.system + "\n\n" + PROMPTS.admin;
  if (userType === 'professional' || userType === 'business') return PROMPTS.system + "\n\n" + PROMPTS.business;
  return PROMPTS.system + "\n\n" + PROMPTS.user;
}

// ══════════════════════════════════════════════════════════════════════
// EDGE FUNCTION HANDLER
// ══════════════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return jsonResponse({ error: "AI non configurata" }, 500);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate user via JWT
    const authHeader = req.headers.get('Authorization');
    let authenticatedUserId: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data } = await supabase.auth.getUser(token);
      authenticatedUserId = data?.user?.id ?? null;
    }

    const { role, message, messages, context } = await req.json();

    // Require valid JWT; never trust client-supplied user_id
    if (!authenticatedUserId) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }
    const effectiveUserId = authenticatedUserId;
    const user_id = authenticatedUserId;

    // Build prompt from role
    let userType: string | undefined;
    let preferredLanguage = "it";
    if (user_id) {
      const { data: profile } = await supabase.from("profiles").select("user_type, preferred_language").eq("user_id", user_id).maybeSingle();
      userType = profile?.user_type;
      preferredLanguage = profile?.preferred_language || "it";
    }

    const systemPrompt = resolvePrompt(role || "auto", userType);
    
    // Build enriched context
    let enrichedPrompt = systemPrompt;
    if (preferredLanguage !== "it") {
      const langNames: Record<string, string> = {
        en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese",
        ar: "Arabic", zh: "Chinese", ja: "Japanese", ko: "Korean", ru: "Russian",
        hi: "Hindi", tr: "Turkish", nl: "Dutch", pl: "Polish", sv: "Swedish",
      };
      enrichedPrompt += `\n\nIMPORTANTE: questo utente ha scelto ${langNames[preferredLanguage] || preferredLanguage} come lingua preferita. Rispondi SEMPRE in ${langNames[preferredLanguage] || preferredLanguage}, non in italiano, mantenendo comunque i percorsi app (es. /wallet) invariati.`;
    }
    if (user_id) {
      const userContext = await buildUserContext(supabase, user_id);
      enrichedPrompt += userContext;
    }
    if (context) {
      enrichedPrompt += `\n\nCONTESTO AGGIUNTIVO: ${JSON.stringify(context)}`;
    }

    // Build message array
    const chatMessages = messages || (message ? [{ role: "user", content: message }] : []);

    if (chatMessages.length === 0) {
      return jsonResponse({ error: "Nessun messaggio fornito" }, 400);
    }

    // Fallback message when AI is unavailable
    const FALLBACK_REPLY = "Ciao! 👋 Al momento Stella AI è temporaneamente offline per manutenzione. Puoi comunque usare tutte le funzionalità dell'app: prenota su /stylists, esplora lo shop su /shop, gestisci il wallet su /wallet. Tornerò presto! ✨";

    const response = await callAI(ANTHROPIC_API_KEY, enrichedPrompt, chatMessages);

    if (!response.ok) {
      if (response.status === 429) return jsonResponse({ reply: "⏳ Troppe richieste, riprova tra qualche secondo.", role: role || "auto" });
      if (response.status === 402 || response.status === 401) return jsonResponse({ reply: FALLBACK_REPLY, role: role || "auto" });
      console.error("Anthropic API error:", response.status, await response.text());
      return jsonResponse({ reply: FALLBACK_REPLY, role: role || "auto" });
    }

    const result = await response.json();
    const reply = result.content?.[0]?.text || "Mi dispiace, riprova.";

    // Log conversation
    if (user_id) {
      const userMsg = chatMessages.slice(-1)[0]?.content || '';
      try {
        await supabase.from("chatbot_messages").insert({
          user_id,
          message_type: role || "chat",
          content: `User: ${userMsg}\nBot: ${reply}`,
          status: "completed"
        });
      } catch { /* chat log persistence is non-critical */ }
    }

    return jsonResponse({ reply, role: role || "auto" });
  } catch (e: unknown) {
    console.error("ai-router error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
