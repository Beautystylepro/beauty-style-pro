import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Shared building blocks ──────────────────────────────────────────

const BASE_IDENTITY = `Sei "Stella AI", l'assistente virtuale intelligente di Style – Beauty Style Pro, la super app italiana per il settore beauty & wellness.

IDENTITÀ:
- Stella è un'assistente omnicanale completa: esperta beauty (tagli, colori, skincare, trattamenti, tendenze, look, prodotti) e assistente operativa & strategica (prenotazioni, pagamenti, navigazione app, supporto tecnico, marketing automatico, analytics, crescita business)
- Si adatta dinamicamente al ruolo e al comportamento dell'utente
- Wake word vocale: "Stella" — supporto hands-free completo`;

const APP_MODULES = `
MODULI APP COMPLETI:
1. FEED & SOCIAL: Post foto/video, Stories 24h, Reels, Prima&Dopo, commenti, like, follow, condivisioni
2. LIVE STREAMING: Live beauty, Battle 1v1, Tips QR Coin, sondaggi, ospiti, replay, classifica settimanale
3. PRENOTAZIONI: Mappa professionisti, calendario, ricevute PDF, promemoria smart AI, storico
4. SHOP & MARKETPLACE: Prodotti beauty, servizi, casting, offerte lavoro, recensioni, wishlist
5. WALLET & PAGAMENTI: QR Coins, carte, PayPal, Google Pay, Klarna 3 rate, P2P via QR, IBAN prelievi
6. PROFILO: Portfolio, badge, KYC, statistiche, link social, bio
7. CHAT: Messaggi diretti, WhatsApp Business, allegati
8. MAPPA INTELLIGENTE: Geolocalizzazione, filtri avanzati, offerte push
9. HR & LAVORO: Offerte beauty, candidature CV/portfolio, matching AI, notifiche
10. GAMIFICATION: Sfide, missioni, ruota fortuna, classifiche, QR Coins reward, badge, streak
11. RADIO BEAUTY: Stazioni tematiche, player mini persistente
12. ABBONAMENTI: Free, Pro, Business, Premium
13. EVENTI: Workshop, masterclass, networking, calendario
14. ANALYTICS: Dashboard, metriche, report, suggerimenti AI`;

const QUICK_ACTIONS = `
PERCORSI APP — indica SEMPRE il percorso quando suggerisci un'azione:
/booking /stylists /create-post /go-live /live-battle /shop /marketplace /wallet /qr-coins
/hr /create-job-post /create-casting /challenges /missions /leaderboard /spin-wheel
/events /subscriptions /edit-profile /boost-profile /settings /notifications /radio /chat
/analytics /before-after /verify-account /referral /purchase-history /my-bookings /receipts
/map-search /explore /search /shorts /home-service`;

const BASE_RULES = `
REGOLE:
1. Italiano, tono amichevole e professionale
2. Emoji moderate (1-3 per messaggio)
3. Risposte concise (max 150 parole)
4. Indica SEMPRE percorsi app (es: "Vai su /wallet")
5. Mai parlare di competitor
6. Se non sai: suggerisci professionista o supporto
7. Incentiva funzioni non ancora usate
8. Per domande beauty: consigli + suggerisci prenotazione
9. Per problemi tecnici: guida passo passo
10. Promuovi upgrade solo quando appropriato
11. Rispetta privacy — mai chiedere dati sensibili
12. Usa il nome utente quando disponibile
13. Per ogni suggerimento, spiega il PERCHÉ`;

const PROACTIVE_INTELLIGENCE = `
INTELLIGENZA PROATTIVA:
- 0 post → suggerisci primo post
- 0 prenotazioni → guida verso /stylists
- Mai fatto live → spiega vantaggi e guida a /go-live
- QR Coins bassi → suggerisci missioni/sfide
- No abbonamento → mostra vantaggi Pro/Premium
- Prenotazioni passate → suggerisci recensione
- Profilo incompleto → guida a /edit-profile
- Professionista senza portfolio → spingi upload lavori
- Engagement in calo → proponi boost/contenuti/live`;

const SLASH_COMMANDS = `
COMANDI SLASH — rispondi con l'azione appropriata:
/prenota → Guida prenotazione (/booking)
/live → Avvia diretta (/go-live)
/saldo → Saldo QR Coins + come guadagnarne
/boost → Info boost profilo (/boost-profile)
/abbonamento → Info piano (/subscriptions)
/aiuto → Tour guidato funzionalità
/missioni → Missioni attive (/missions)
/classifica → Posizione classifica (/leaderboard)
/sfida → Sfide beauty (/challenges)
/lavoro → Offerte lavoro (/hr)
/shop → Prodotti (/shop)
/mappa → Professionisti vicini (/map-search)
/referral → Programma inviti (/referral)
/ricevute → Storico pagamenti (/receipts)
/impostazioni → Impostazioni (/settings)
/analytics → Dashboard (/analytics)
/casting → Casting beauty (/create-casting)
/eventi → Eventi e workshop (/events)
/radio → Radio beauty (/radio)
/profilo → Modifica profilo (/edit-profile)`;

// ── Role-specific prompt builders ───────────────────────────────────

function getBusinessPrompt(): string {
  return `${BASE_IDENTITY}

RUOLO UTENTE: BUSINESS / PROFESSIONISTA
OBIETTIVO: Massimizzare visibilità, engagement e monetizzazione.

${APP_MODULES}

FUNZIONI SPECIFICHE BUSINESS:
- Gestione profilo con P.IVA, portfolio, certificazioni, KYC
- Marketing & sponsorizzazioni con target geo/demografico
- Ricezione prenotazioni & gestione agenda
- Pagamenti in entrata: QR Coins, carte, PayPal, Klarna + ricevute
- HR: pubblica offerte lavoro, candidature, matching AI
- Mappa: visualizza clienti, offerte geolocalizzate
- Analytics: dashboard interazioni, prenotazioni, crescita
- Suggerisci upgrade con ROI stimato

${QUICK_ACTIONS}
${BASE_RULES}
${PROACTIVE_INTELLIGENCE}
${SLASH_COMMANDS}

ISTRUZIONE: Agisci come consulente strategico. Massimizza engagement, visibilità e monetizzazione.`;
}

function getClientPrompt(): string {
  return `${BASE_IDENTITY}

RUOLO UTENTE: CLIENTE
OBIETTIVO: Guidare nella scoperta servizi, prenotazioni, shop, live. Massimizzare soddisfazione.

${APP_MODULES}

FUNZIONI SPECIFICHE CLIENTI:
- Scoperta servizi & professionisti vicini
- Promozioni personalizzate per posizione/preferenze
- Offerte lavoro beauty con matching AI
- Prenotazioni: scopri → scegli → paga → ricevuta
- Pagamenti: QR Coins, carte, PayPal, Klarna
- Live & contenuti: tutorial, battle, Q&A
- Gamification: badge, missioni, ruota, classifiche
- Analytics: engagement, suggerimenti proattivi

${QUICK_ACTIONS}
${BASE_RULES}
${PROACTIVE_INTELLIGENCE}
${SLASH_COMMANDS}

ISTRUZIONE: Agisci come assistente amichevole. Suggerisci servizi, shop, live e promozioni. Rendi l'esperienza divertente.`;
}

function getAdminPrompt(): string {
  return `${BASE_IDENTITY}

RUOLO UTENTE: ADMIN / MODERATORE
OBIETTIVO: Gestione completa della piattaforma, monitoraggio, moderazione.

${APP_MODULES}

FUNZIONI SPECIFICHE ADMIN:
- Dashboard utenti: totali, nuovi, attivi, sospesi
- Dashboard pagamenti: volume, ricevute, prelievi, rimborsi
- Moderazione: segnalazioni, ban, contenuti, verifica KYC
- Live: monitoraggio stream attivi, intervento moderazione
- Analytics avanzati: metriche globali, crescita, retention
- Gestione abbonamenti e promozioni piattaforma
- Report automatici settimanali/mensili

Percorsi admin: /admin /analytics /settings

${BASE_RULES}
${SLASH_COMMANDS}

ISTRUZIONE: Fornisci report, statistiche e suggerimenti operativi. Aiuta nella gestione e moderazione della piattaforma.`;
}

function getSystemPrompt(userType: string): string {
  if (userType === 'admin') return getAdminPrompt();
  if (userType === 'professional' || userType === 'business') return getBusinessPrompt();
  return getClientPrompt();
}

// ── Edge function handler ───────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
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

    const { action, data: reqData } = await req.json();
    if (!authenticatedUserId) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }
    const user_id = authenticatedUserId;

    // ===== ACTION: Track user action =====
    if (action === "track_action") {
      const { action_type, action_data, page_context } = reqData;
      await supabase.rpc("track_user_action", {
        _user_id: user_id,
        _action_type: action_type,
        _action_data: action_data || {},
        _page_context: page_context
      });
      return jsonResponse({ success: true });
    }

    // ===== ACTION: Get personalized suggestions =====
    if (action === "get_suggestions") {
      const { data: suggestions } = await supabase.rpc("get_chatbot_suggestions", {
        _user_id: user_id
      });

      if (!suggestions || suggestions.length === 0) {
        if (!ANTHROPIC_API_KEY) {
          return jsonResponse({ 
            suggestions: [{
              suggestion_id: crypto.randomUUID(),
              message_type: "welcome",
              content: "Benvenuto su STYLE! 🌟 Esplora tutte le funzionalità beauty.",
              action_buttons: [{ text: "Esplora", action: "dismiss" }],
              priority: 1
            }]
          });
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("user_type, created_at, qr_coins, city, bio, avatar_url")
          .eq("user_id", user_id)
          .maybeSingle();

        const [postsRes, bookingsRes, subsRes] = await Promise.all([
          supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", user_id),
          supabase.from("bookings").select("id", { count: "exact", head: true }).eq("client_id", user_id),
          supabase.from("user_subscriptions").select("id").eq("user_id", user_id).eq("status", "active").limit(1).maybeSingle(),
        ]);

        const userType = profile?.user_type || 'client';
        const isBusiness = userType === 'professional' || userType === 'business';
        const profileComplete = !!(profile?.bio && profile?.avatar_url);

        const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-5",
            max_tokens: 500,
            system: `Sei Stella AI di Style Beauty. Genera 2 suggerimenti personalizzati per ${isBusiness ? 'professionisti/business' : 'clienti/utenti'}.
Profilo: Tipo=${userType}, Posts=${postsRes.count || 0}, Booking=${bookingsRes.count || 0}, QRC=${profile?.qr_coins || 0}, Città=${profile?.city || '?'}, ProfiloCompleto=${profileComplete}, Abbonamento=${subsRes.data ? 'Attivo' : 'Free'}
Regole: max 50 char per suggerimento, emoji, tono motivante, incentiva azioni specifiche.
${isBusiness ? 'Focus: visibilità, prenotazioni, marketing, analytics, candidature' : 'Focus: scoperta servizi, prenotazioni, shop, live, gamification, referral'}`,
            messages: [
              { role: "user", content: "Genera 2 suggerimenti personalizzati" },
            ],
            tools: [{
              name: "create_suggestions",
              description: "Create personalized suggestions",
              input_schema: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        content: { type: "string" },
                        action: { type: "string", enum: [
                          "create-post", "go-live", "stylists", "wallet", "subscriptions",
                          "shop", "map-search", "hr", "challenges", "missions", "spin-wheel",
                          "analytics", "boost-profile", "events", "leaderboard", "referral",
                          "edit-profile", "create-job-post", "my-bookings", "before-after",
                          "explore", "shorts", "radio", "chat", "verify-account"
                        ]},
                        action_text: { type: "string" }
                      },
                      required: ["content", "action", "action_text"]
                    }
                  }
                },
                required: ["suggestions"]
              }
            }],
            tool_choice: { type: "tool", name: "create_suggestions" }
          }),
        });

        if (aiResponse.ok) {
          const result = await aiResponse.json();
          const toolUse = result.content?.find((b: { type: string }) => b.type === "tool_use");
          if (toolUse) {
            const args = toolUse.input as { suggestions: Array<{ content: string; action: string; action_text: string }> };
            const mappedSuggestions = (args.suggestions || []).map((s) => ({
              suggestion_id: crypto.randomUUID(),
              message_type: "ai_suggestion",
              content: s.content,
              action_buttons: [{ text: s.action_text, action: "navigate", target: `/${s.action}` }],
              priority: 5
            }));
            return jsonResponse({ suggestions: mappedSuggestions });
          }
        }
      }

      return jsonResponse({ suggestions: suggestions || [] });
    }

    // ===== ACTION: Log suggestion interaction =====
    if (action === "log_interaction") {
      const { suggestion_id, interaction_type, suggestion_content } = reqData;
      
      const insertData: any = {
        user_id,
        message_type: "suggestion",
        content: suggestion_content,
        status: interaction_type,
      };
      if (interaction_type === "clicked") insertData.clicked_at = new Date().toISOString();
      if (interaction_type === "dismissed") insertData.dismissed_at = new Date().toISOString();

      const { data: message } = await supabase
        .from("chatbot_messages")
        .insert(insertData)
        .select()
        .single();

      await supabase
        .from("user_suggestion_history")
        .upsert({
          user_id,
          suggestion_type: suggestion_content,
          last_shown_at: new Date().toISOString(),
        }, { onConflict: "user_id,suggestion_type" });

      return jsonResponse({ success: true, message_id: message?.id });
    }

    // ===== ACTION: AI-powered job matching =====
    if (action === "job_match") {
      const { job_id, applicant_id } = reqData || {};
      
      if (!ANTHROPIC_API_KEY) return jsonResponse({ match_score: 50, analysis: "AI non disponibile" });

      const [jobRes, profileRes] = await Promise.all([
        job_id ? supabase.from("job_posts").select("*").eq("id", job_id).maybeSingle() : Promise.resolve({ data: null }),
        applicant_id ? supabase.from("profiles").select("*").eq("user_id", applicant_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 800,
          system: "Analizza la compatibilità tra candidato e offerta lavoro beauty. Rispondi con tool call.",
          messages: [
            { role: "user", content: `Offerta: ${JSON.stringify(jobRes.data)}\nCandidato: ${JSON.stringify(profileRes.data)}` },
          ],
          tools: [{
            name: "job_analysis",
            description: "Return job match analysis",
            input_schema: {
              type: "object",
              properties: {
                match_score: { type: "number", description: "0-100 score" },
                strengths: { type: "array", items: { type: "string" } },
                gaps: { type: "array", items: { type: "string" } },
                recommendation: { type: "string" }
              },
              required: ["match_score", "strengths", "gaps", "recommendation"]
            }
          }],
          tool_choice: { type: "tool", name: "job_analysis" }
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const toolUse = result.content?.find((b: { type: string }) => b.type === "tool_use");
        if (toolUse) {
          return jsonResponse(toolUse.input);
        }
      }
      return jsonResponse({ match_score: 50, strengths: [], gaps: [], recommendation: "Analisi non disponibile" });
    }

    // ===== ACTION: AI service recommendations =====
    if (action === "recommend_services") {
      if (!ANTHROPIC_API_KEY) return jsonResponse({ recommendations: [] });

      const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user_id).maybeSingle();
      const { data: pastBookings } = await supabase
        .from("bookings")
        .select("*, services(name, category)")
        .eq("client_id", user_id)
        .order("booking_date", { ascending: false })
        .limit(5);
      const { data: services } = await supabase
        .from("services")
        .select("id, name, category, price, description")
        .eq("active", true)
        .limit(20);

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 800,
          system: "Suggerisci servizi beauty personalizzati basandoti sullo storico prenotazioni.",
          messages: [
            { role: "user", content: `Profilo: ${profile?.city || '?'}, Tipo: ${profile?.user_type}\nStorico: ${JSON.stringify(pastBookings)}\nServizi disponibili: ${JSON.stringify(services)}` },
          ],
          tools: [{
            name: "recommend",
            description: "Return service recommendations",
            input_schema: {
              type: "object",
              properties: {
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      service_id: { type: "string" },
                      reason: { type: "string" },
                      priority: { type: "number" }
                    },
                    required: ["service_id", "reason", "priority"]
                  }
                }
              },
              required: ["recommendations"]
            }
          }],
          tool_choice: { type: "tool", name: "recommend" }
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const toolUse = result.content?.find((b: { type: string }) => b.type === "tool_use");
        if (toolUse) {
          return jsonResponse(toolUse.input);
        }
      }
      return jsonResponse({ recommendations: [] });
    }

    // ===== ACTION: AI Chat conversation with STREAMING =====
    if (action === "chat") {
      const { messages: chatHistory, stream: enableStreaming, message } = reqData;
      
      if (!ANTHROPIC_API_KEY) {
        return jsonResponse({ 
          response: "Mi dispiace, il servizio AI non è disponibile al momento. Riprova più tardi!" 
        });
      }

      // Get enriched user context
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_type, display_name, qr_coins, city, bio, follower_count, following_count, avatar_url, created_at, verification_status")
        .eq("user_id", user_id)
        .maybeSingle();

      const userType = profile?.user_type || 'client';

      // Fetch activity stats in parallel
      const [postsRes, bookingsRes, streamsRes, subsRes, transRes, proRes, privateRes] = await Promise.all([
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", user_id),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("client_id", user_id),
        supabase.from("live_streams").select("id", { count: "exact", head: true }).eq("status", "live"),
        supabase.from("user_subscriptions").select("*, subscription_plans(name, slug)").eq("user_id", user_id).eq("status", "active").limit(1).maybeSingle(),
        supabase.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", user_id),
        supabase.from("professionals").select("id, specialty, rating, review_count").eq("user_id", user_id).maybeSingle(),
        supabase.from("profiles_private").select("iban").eq("user_id", user_id).maybeSingle(),
      ]);

      const dynamicPrompt = getSystemPrompt(userType);

      const daysActive = profile?.created_at 
        ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000)
        : 0;

      const subInfo = subsRes.data 
        ? `Piano: ${(subsRes.data as any).subscription_plans?.name || 'Attivo'}` 
        : 'Piano: Free';

      const proInfo = proRes.data 
        ? `\n- Specialità: ${proRes.data.specialty || 'N/A'}\n- Rating: ${proRes.data.rating || 0}/5 (${proRes.data.review_count || 0} recensioni)`
        : '';

      const contextAddition = `

CONTESTO UTENTE ATTUALE:
- Nome: ${profile?.display_name || 'Utente'}
- Tipo: ${userType}
- Città: ${profile?.city || 'non specificata'}
- QR Coins: ${profile?.qr_coins || 0}
- ${subInfo}
- Follower: ${profile?.follower_count || 0} | Following: ${profile?.following_count || 0}
- Post: ${postsRes.count || 0}
- Prenotazioni: ${bookingsRes.count || 0}
- Transazioni: ${transRes.count || 0}
- Giorni attivo: ${daysActive}
- Profilo completo: ${(profile?.bio && profile?.avatar_url) ? 'Sì' : 'No — suggerisci /edit-profile'}
- IBAN collegato: ${privateRes.data?.iban ? 'Sì' : 'No'}
- Verifica: ${profile?.verification_status || 'pending'}
- Live attive ora: ${streamsRes.count || 0}${proInfo}`;

      // Handle simple message format from widget
      let finalHistory = chatHistory;
      if (!chatHistory && message) {
        finalHistory = [{ role: "user", content: message }];
      }

      const claudeMessages = (finalHistory || []).map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

      // ── STREAMING MODE ──
      // Claude's native SSE event shape differs from the OpenAI-compatible
      // shape the frontend (src/lib/streamChat.ts) already parses
      // (`data: {"choices":[{"delta":{"content":"..."}}]}`). Rather than
      // touching every consumer, we transform Claude's stream into that
      // exact shape here, so streaming stays real-time and the UI keeps
      // its live token-by-token typing effect.
      if (enableStreaming) {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-5",
            max_tokens: 1000,
            temperature: 0.7,
            system: dynamicPrompt + contextAddition,
            messages: claudeMessages,
            stream: true,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            return jsonResponse({ error: "Troppe richieste, riprova tra poco" }, 429);
          }
          if (response.status === 402 || response.status === 401) {
            return jsonResponse({ error: "Crediti AI esauriti" }, 402);
          }
          const errText = await response.text();
          console.error("Anthropic streaming error:", response.status, errText);
          return jsonResponse({ error: "Errore AI gateway" }, 500);
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        let fullReply = "";

        const transformed = new ReadableStream({
          async start(controller) {
            const reader = response.body!.getReader();
            let buffer = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                let idx: number;
                while ((idx = buffer.indexOf("\n\n")) !== -1) {
                  const rawEvent = buffer.slice(0, idx);
                  buffer = buffer.slice(idx + 2);

                  const dataLine = rawEvent.split("\n").find(l => l.startsWith("data:"));
                  if (!dataLine) continue;
                  const jsonStr = dataLine.slice(5).trim();
                  if (!jsonStr) continue;

                  try {
                    const evt = JSON.parse(jsonStr);
                    if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                      const text = evt.delta.text as string;
                      fullReply += text;
                      const chunk = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
                      controller.enqueue(encoder.encode(chunk));
                    }
                    if (evt.type === "message_stop") {
                      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    }
                  } catch { /* ignore malformed SSE fragment, wait for more data */ }
                }
              }
            } finally {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              if (fullReply) {
                const userLastMsg = claudeMessages.slice(-1)[0]?.content || '';
                supabase.from("chatbot_messages").insert({
                  user_id,
                  message_type: "chat",
                  content: `User: ${userLastMsg}\nBot: ${fullReply}`,
                  status: "completed"
                }).then(() => {});
              }
            }
          },
        });

        return new Response(transformed, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      // ── NON-STREAMING MODE ──
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 1000,
          temperature: 0.7,
          system: dynamicPrompt + contextAddition,
          messages: claudeMessages,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) return jsonResponse({ error: "Troppe richieste" }, 429);
        if (response.status === 402 || response.status === 401) return jsonResponse({ error: "Crediti AI esauriti" }, 402);
        console.error("Anthropic API error:", response.status, await response.text());
        return jsonResponse({ response: "Mi dispiace, c'è stato un problema. Riprova! 🙏" });
      }

      const result = await response.json();
      const aiResponseText = result.content?.[0]?.text || 
        "Mi dispiace, non riesco a rispondere in questo momento.";

      // Log conversation
      const userLastMsg = claudeMessages.slice(-1)[0]?.content || '';
      await supabase.from("chatbot_messages").insert({
        user_id,
        message_type: "chat",
        content: `User: ${userLastMsg}\nBot: ${aiResponseText}`,
        status: "completed"
      });

      return jsonResponse({ response: aiResponseText });
    }

    // ===== ACTION: Module-based AI suggestions =====
    if (action === "module_suggestions") {
      const { module_key, trigger, context: triggerContext } = reqData || {};

      // Fetch module config
      const moduleQuery = supabase.from("ai_module_configs").select("*").eq("active", true);
      if (module_key) moduleQuery.eq("module_key", module_key);
      const { data: modules } = await moduleQuery.order("priority", { ascending: false });

      if (!modules || modules.length === 0) {
        return jsonResponse({ suggestions: [] });
      }

      // Get user profile for role filtering and personalization
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_type, display_name, qr_coins, city")
        .eq("user_id", user_id)
        .maybeSingle();

      const userType = profile?.user_type || "client";
      const userName = profile?.display_name || "Utente";

      // Filter modules by user role
      const relevantModules = modules.filter((m: any) => m.roles.includes(userType));

      if (!ANTHROPIC_API_KEY) {
        // Fallback: return static triggers with variable replacement
        const staticSuggestions = relevantModules.flatMap((mod: any) => {
          const triggers = mod.triggers as any[];
          return triggers
            .filter((t: any) => !trigger || t.trigger === trigger)
            .slice(0, 1)
            .map((t: any) => {
              const msgKey = `message_${userType}`;
              const rawMsg = t[msgKey] || t.message || t.message_client || "";
              const msg = rawMsg
                .replace("{name}", userName)
                .replace("{balance}", String(profile?.qr_coins || 0));
              return {
                module: mod.module_key,
                trigger: t.trigger,
                message: msg,
                cta: t.cta || [],
                priority: mod.priority,
              };
            });
        });
        return jsonResponse({ suggestions: staticSuggestions });
      }

      // AI-enhanced: generate personalized message from module config
      const moduleSummary = relevantModules.map((m: any) => ({
        key: m.module_key,
        name: m.module_name,
        triggers: m.triggers,
        settings: m.ai_settings,
      }));

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 800,
          system: `Sei Stella AI di Style. Genera suggerimenti personalizzati basati sui moduli AI configurati.
Utente: ${userName}, Tipo: ${userType}, Città: ${profile?.city || "?"}, QRC: ${profile?.qr_coins || 0}
${triggerContext ? `Contesto: ${JSON.stringify(triggerContext)}` : ""}
Regole: max 60 char per messaggio, emoji, tono motivante, CTA chiare. Italiano.`,
          messages: [
            {
              role: "user",
              content: `Moduli disponibili: ${JSON.stringify(moduleSummary)}${trigger ? `\nTrigger specifico: ${trigger}` : "\nGenera 1 suggerimento per i top 3 moduli più rilevanti"}`,
            },
          ],
          tools: [
            {
              name: "generate_module_suggestions",
              description: "Generate personalized module suggestions",
              input_schema: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        module: { type: "string" },
                        message: { type: "string" },
                        cta_text: { type: "string" },
                        cta_route: { type: "string" },
                        priority: { type: "number" },
                      },
                      required: ["module", "message", "cta_text", "cta_route", "priority"],
                    },
                  },
                },
                required: ["suggestions"],
              },
            },
          ],
          tool_choice: { type: "tool", name: "generate_module_suggestions" },
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const toolUse = result.content?.find((b: { type: string }) => b.type === "tool_use");
        if (toolUse) {
          const args = toolUse.input as any;
          return jsonResponse({ suggestions: args.suggestions || [] });
        }
      }

      return jsonResponse({ suggestions: [] });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e: unknown) {
    console.error("chatbot-assistant error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
