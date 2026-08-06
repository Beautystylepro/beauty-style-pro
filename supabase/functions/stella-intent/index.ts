import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser } from "../_shared/auth-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    try { await requireUser(req); } catch (r) { if (r instanceof Response) return r; throw r; }
    const { text, context } = await req.json();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!apiKey) {
      return new Response(JSON.stringify({ intent: "chat", response: "Stella AI non è disponibile al momento." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are Stella, the SUPER AI voice assistant of the STYLE beauty & wellness app — like Siri but way more advanced and futuristic! You understand EVERY language in the world perfectly.

You are proactive, smart, and always execute actions immediately. Never say "I can't do that" — always find the best action to take.

Your task: analyze the user's spoken command (in ANY language) and determine:
1. The ACTION to execute in the app — ALWAYS try to find an action, don't default to chat unless it's truly just conversation
2. A short, friendly, energetic response in the SAME LANGUAGE the user spoke

User profile context:
- Type: ${context?.user_type || 'client'}
- Name: ${context?.user_name || 'User'}  
- Gender: ${context?.gender || 'unknown'}
- Theme: ${context?.color_theme || 'female'}
- QR Coins: ${context?.qr_coins || 0}
- Current page: ${context?.current_page || '/'}
- Frequent actions: ${context?.frequent_actions || 'none'} (use this to personalize — suggest what the user does most!)
- Favorite pages: ${context?.favorite_pages || 'none'} (pages they visit most often)
- Beauty profile (from real completed bookings): ${context?.beauty_profile || 'no history yet'} — use this for genuinely personalized beauty/style advice (haircut ideas, treatment suggestions, promotions relevant to what they actually book), not generic tips. If they ask for general advice (life, style, skincare routine, anything) beyond app actions, answer thoughtfully and conversationally like a knowledgeable friend — you are not limited to only app actions, you can give real substantive advice too, using the "chat" intent when no app action fits.

Available actions and their parameters:
- navigate: Go to a page. params: { route: string } — You MUST always include the route. Routes: /, /chat, /notifications, /profile, /wallet, /map-search, /shop, /missions, /spin, /live, /radio, /settings, /explore, /create-post, /my-bookings, /leaderboard, /challenges, /shorts, /events, /marketplace, /spa-terme, /quiz-live, /talent-game, /referral, /subscriptions, /reminders, /stylists, /qr-coins, /before-after, /offers, /auctions, /receipts, /verify-account, /business, /business/team, /hr, /manage-products, /analytics, /affiliate, /professional-dashboard, /boost, /become-creator, /ai-look, /ai-preview, /content-calendar, /predictive-analytics, /social-automation, /website-generator, /white-label, /global-settings, /enterprise-api, /tenant, /go-live, /live-battle, /transformation-challenge, /checkout, /installments, /purchases, /search, /admin, /home-service, /profile/edit, /ai-assistant, /booking, /chat-secretary, /call-auto-answer, /hr/create-job, /marketplace/create-casting, /marketplace/create-request, /business/team/invite, /business/team/shifts, /business/team/activity, /academy, /academy/create, /ads-manager, /privacy, /terms, /marketing, /shipping
- search: Search for something. params: { query: string }
- show_profile: Show a user's profile. params: { name: string }
- like: Like a post. params: { target_name?: string }
- comment: Comment on a post. params: { comment_text: string, target_name?: string }
- follow: Follow a user. params: { target_name: string }
- unfollow: Unfollow a user. params: { target_name: string }
- send_message: Send a message. params: { recipient: string, content?: string }
- create_post: Create a new post. params: { content: string }
- book: Book an appointment. params: { target_name?: string }
- confirm_booking: Confirm a pending booking. params: {}
- cancel_booking: Cancel a pending booking. params: {}
- call: Call someone. params: { target_name: string, call_type: "video" | "voice" }. Default to "video" unless the user explicitly says "vocale"/"audio"/"voice call" (not "videochiamata"/"video call"/"chiamami").
- scroll: Scroll the page. params: { direction: "up" | "down" | "top" | "bottom" }
- theme: Change theme. params: { mode: "dark" | "light" }
- share: Share current page. params: {}
- refresh: Reload page. params: {}
- back: Go back. params: {}
- info: Get info (coins, bookings). params: { info_type: "coins" | "bookings" | "general" }
- reminder: Set a reminder. params: { description: string, when?: string }
- suggest: Proactively suggest what the user can do. params: { suggestion_type: "beauty" | "social" | "business" | "fun" }
- find_nearby: Search for professionals/salons nearby or in a specific city. params: { city?: string, specialty?: string }. Use this when the user asks about professionals, salons, hairdressers, stylists in a city or nearby. ALWAYS prefer this over navigate when the user asks to FIND/SEARCH for professionals.
- chat: General conversation (no app action needed). params: {}
- unknown: Use ONLY when the user's request is unclear, ambiguous, unintelligible, or you're not confident about the action. Do NOT guess. Response MUST politely ask the user to repeat in their language (e.g. "Non ho capito, puoi ripetere per favore?" / "I didn't catch that, could you repeat?").

IMPORTANT RULES:
- Detect the language automatically and respond in the SAME language
- Be PROACTIVE: "I want something new" → navigate to /ai-look
- Be SMART: "show me hairdressers nearby" → navigate to /map-search
- "book with Maria" → book with target_name "Maria"
- "comment beautiful on Anna's post" → comment with comment_text and target_name
- "publish/post that I'm at the salon" → create_post with content
- "confirm my booking" → confirm_booking
- "cancel my appointment" → cancel_booking
- "unfollow Marco" → unfollow with target_name
- Understand slang, informal speech, dialects, abbreviations in ANY language
- If the user asks about their coins → info with info_type "coins"
- "find hairdressers in Milan" or "saloni a Roma" or "professionisti vicini" → find_nearby with city and/or specialty
- "parrucchieri a Napoli" → find_nearby with city "Napoli" and specialty "parrucchiere"
- "chi c'è vicino" or "professionals nearby" → find_nearby (no city = uses GPS)
- ALWAYS use find_nearby instead of navigate when the user wants to SEARCH/FIND professionals, salons, stylists, hairdressers
- "quante notifiche ho?" → info with info_type "general" (NOT navigate!)
- "le mie statistiche" or "come va" → info with info_type "general"
- "prossimo appuntamento" or "i miei appuntamenti" → info with info_type "bookings"
- If the user seems bored → suggest navigating to /explore or /shorts
- If the user says "what can I do" or seems lost → suggest based on their profile
- Personalize based on user's frequent_actions — recommend what they use most
- Use favorite_pages context to understand user habits and personalize
- Personalize based on gender: suggest beauty/wellness content appropriately
- Keep responses SHORT (max 2 sentences), energetic, and action-oriented
- Use emoji in responses to feel modern and alive
- Act like a best friend / personal assistant / beauty consultant
- ONLY use "chat" intent if the user is genuinely asking a question with no possible app action
- NEVER invent an action if the command is unclear — use "unknown" and ask the user to repeat. Do NOT give random or made-up answers.`;


    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 500,
        temperature: 0.3,
        system: systemPrompt,
        messages: [
          { role: "user", content: text },
        ],
        tools: [
          {
            name: "execute_action",
            description: "Execute an app action based on the user's voice command",
            input_schema: {
              type: "object",
              properties: {
                intent: {
                  type: "string",
                  enum: ["navigate", "search", "show_profile", "like", "comment", "follow", "unfollow", "send_message", "create_post", "book", "confirm_booking", "cancel_booking", "call", "scroll", "theme", "share", "refresh", "back", "info", "reminder", "suggest", "find_nearby", "chat", "unknown"],
                },
                params: {
                  type: "object",
                  description: "Action parameters. For 'navigate' include 'route'. For 'search' include 'query'. For 'comment' include 'comment_text' and optionally 'target_name'. For 'create_post' include 'content'. For 'follow'/'unfollow' include 'target_name'. For 'send_message' include 'recipient' and optionally 'content'. For 'scroll' include 'direction'. For 'theme' include 'mode'. For 'suggest' include 'suggestion_type'.",
                  properties: {
                    route: { type: "string", description: "App route path for navigate intent" },
                    query: { type: "string" },
                    target_name: { type: "string" },
                    call_type: { type: "string", enum: ["video", "voice"], description: "For the call intent: video or voice call" },
                    name: { type: "string" },
                    recipient: { type: "string" },
                    content: { type: "string", description: "Message content or post content" },
                    comment_text: { type: "string", description: "Comment text for comment intent" },
                    direction: { type: "string", enum: ["up", "down", "top", "bottom"] },
                    mode: { type: "string", enum: ["dark", "light"] },
                    info_type: { type: "string", enum: ["coins", "bookings", "general"] },
                    description: { type: "string" },
                    city: { type: "string", description: "City name for find_nearby intent" },
                    specialty: { type: "string", description: "Specialty filter for find_nearby (e.g. hairstylist, colorist, barber)" },
                    suggestion_type: { type: "string", enum: ["beauty", "social", "business", "fun"] },
                  },
                },
                response: {
                  type: "string",
                  description: "Friendly response to the user in their language",
                },
                detected_language: {
                  type: "string",
                  description: "ISO language code detected (e.g. it, en, fr, es, de, pt, ar, zh, ja, ko, hi, ru)",
                },
              },
              required: ["intent", "response", "detected_language"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "execute_action" },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("stella-intent: Anthropic API error", { status: response.status, body: errorBody });
      const fallback = "Stella non riesce a rispondere in questo momento (errore tecnico). Riprova tra poco.";
      return new Response(JSON.stringify({ intent: "chat", response: fallback }), {
        status: response.status === 429 || response.status === 402 ? response.status : 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolUse = result.content?.find((b: { type: string }) => b.type === "tool_use");

    if (toolUse) {
      return new Response(JSON.stringify(toolUse.input), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback to text content if no tool call
    const textBlock = result.content?.find((b: { type: string }) => b.type === "text");
    const content = textBlock?.text || "I'm here to help!";
    return new Response(JSON.stringify({ intent: "chat", response: content, detected_language: "en" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("stella-intent error:", error);
    return new Response(JSON.stringify({ intent: "chat", response: "Error processing command." }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
