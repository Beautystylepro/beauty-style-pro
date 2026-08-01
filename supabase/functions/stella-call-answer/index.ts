import { createClient } from 'npm:@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// deno-lint-ignore no-explicit-any
type Any = any;

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ReqBody {
  callId: string;
  targetUserId: string;
  userSaid?: string;   // trascrizione ultima frase del chiamante
  transcript?: Array<{ role: 'ai' | 'caller'; text: string }>;
  language?: string;   // codice lingua rilevata (it/en/es...)
  action?: 'greet' | 'reply' | 'end';
}

async function loadContext(admin: Any, targetUserId: string) {
  const [{ data: profile }, { data: pro }, { data: biz }, { data: services }, { data: settings }] =
    await Promise.all([
      admin.from('profiles').select('display_name, user_type, city, bio').eq('user_id', targetUserId).maybeSingle(),
      admin.from('professionals').select('id, category, description, price_min, price_max, city, phone').eq('user_id', targetUserId).maybeSingle(),
      admin.from('businesses').select('id, business_name, business_type, city, phone, description').eq('user_id', targetUserId).maybeSingle(),
      admin.from('services').select('id, name, description, price, duration_minutes').eq('professional_id',
        (await admin.from('professionals').select('id').eq('user_id', targetUserId).maybeSingle()).data?.id || '00000000-0000-0000-0000-000000000000').eq('active', true).limit(20),
      admin.from('call_auto_answer_settings').select('*').eq('user_id', targetUserId).maybeSingle(),
    ]);
  return { profile, pro, biz, services, settings };
}

function buildSystemPrompt(ctx: Any, language = 'it') {
  const owner = ctx.profile?.display_name || 'il proprietario';
  const role = ctx.profile?.user_type || 'utente';
  const svcLines = (ctx.services || []).map((s: Any) =>
    `- ${s.name}${s.price ? ` (€${s.price})` : ''}${s.duration_minutes ? ` [${s.duration_minutes}min]` : ''}`
  ).join('\n');
  const bizInfo = ctx.biz ? `Attività: ${ctx.biz.business_name} (${ctx.biz.business_type}) a ${ctx.biz.city || ''}` : '';
  const proInfo = ctx.pro ? `Professionista: ${ctx.pro.category} a ${ctx.pro.city || ''} — €${ctx.pro.price_min || '-'}/${ctx.pro.price_max || '-'}` : '';

  return `Sei Stella, assistente AI vocale che risponde alle chiamate al posto di ${owner} (${role}). Parli in ${language}.
${bizInfo}
${proInfo}

SERVIZI DISPONIBILI:
${svcLines || '(nessun servizio pubblicato)'}

REGOLE:
- Rispondi in massimo 2 frasi brevi, tono naturale e caloroso.
- Se il chiamante chiede informazioni, dai la risposta usando i dati sopra.
- Se vuole un appuntamento e "auto_book" è attivo, chiedi data/ora preferita e servizio, poi conferma restituendo action="booking" con i campi.
- Se vuole lasciare un messaggio, restituisci action="message" con "message_text".
- Se chiede di parlare con la persona reale, restituisci action="transfer".
- Se la conversazione è conclusa, restituisci action="end".
- Altrimenti action="continue".

Rispondi SEMPRE in JSON valido:
{"reply":"<testo vocale>","action":"continue|booking|message|transfer|end","booking":{"service":"","date":"","time":""}|null,"message_text":""|null}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY missing');

    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = (await req.json()) as ReqBody;
    if (!body?.callId || !body?.targetUserId) {
      return new Response(JSON.stringify({ error: 'missing_params' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const ctx = await loadContext(admin, body.targetUserId);
    const settings = ctx.settings || { greeting_text: 'Ciao, sono Stella. Come posso aiutarti?', auto_book_enabled: true, take_message_enabled: true, transfer_enabled: true };

    // Greeting fisso, no LLM
    if (body.action === 'greet') {
      await admin.from('stella_call_sessions').upsert({
        call_id: body.callId,
        target_user_id: body.targetUserId,
        caller_user_id: user.id,
        caller_name: (await admin.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle()).data?.display_name || null,
        transcript: [{ role: 'ai', text: settings.greeting_text }],
        outcome: 'ongoing',
        language: body.language || 'it',
      }, { onConflict: 'call_id' });
      return new Response(JSON.stringify({ reply: settings.greeting_text, action: 'continue' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Reply via Lovable AI
    const messages: Any[] = [
      { role: 'system', content: buildSystemPrompt(ctx, body.language || 'it') },
    ];
    for (const t of (body.transcript || [])) {
      messages.push({ role: t.role === 'ai' ? 'assistant' : 'user', content: t.text });
    }
    if (body.userSaid) messages.push({ role: 'user', content: body.userSaid });

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        response_format: { type: 'json_object' },
      }),
    });
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return new Response(JSON.stringify({ reply: 'Mi scuso, ho un problema tecnico. Riprova più tardi.', action: 'end', error: errText }), {
        status: aiRes.status === 402 || aiRes.status === 429 ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const aiJson = await aiRes.json();
    let parsed: Any = { reply: 'Ok', action: 'continue' };
    try { parsed = JSON.parse(aiJson.choices?.[0]?.message?.content || '{}'); } catch { /* keep default */ }

    // Persist transcript
    const newTranscript = [...(body.transcript || []), ...(body.userSaid ? [{ role: 'caller', text: body.userSaid }] : []), { role: 'ai', text: parsed.reply }];
    const updates: Any = { transcript: newTranscript, updated_at: new Date().toISOString() };

    // Handle actions
    if (parsed.action === 'booking' && parsed.booking && settings.auto_book_enabled) {
      try {
        const professionalId = ctx.pro?.id;
        if (!professionalId) throw new Error('no professional_id on context, cannot book');

        // Resolve the spoken service name to a real service row (fuzzy match, fallback to cheapest active service).
        const spokenService = (parsed.booking.service || '').toLowerCase().trim();
        const services = (ctx.services || []) as Array<{ id: string; name: string; duration_minutes: number | null }>;
        const matchedService =
          services.find(s => s.name?.toLowerCase() === spokenService) ||
          services.find(s => spokenService && s.name?.toLowerCase().includes(spokenService)) ||
          services[0];
        const durationMinutes = matchedService?.duration_minutes || 30;

        const requestedDate = parsed.booking.date || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const requestedTime = (parsed.booking.time || '10:00').slice(0, 5);

        // Real availability check: don't blindly trust the requested slot,
        // scan for existing bookings that day and pick the first free slot
        // at/after the requested time (same source-of-truth logic as the
        // web booking flow — see src/lib/availability.ts).
        const GRID = ['09:00','09:30','10:00','10:30','11:00','11:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00'];
        const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const { data: existing } = await admin
          .from('bookings')
          .select('start_time, end_time')
          .eq('professional_id', professionalId)
          .eq('booking_date', requestedDate)
          .neq('status', 'cancelled');
        const occupied = (existing || []).map(b => ({
          start: toMin(String(b.start_time).slice(0, 5)),
          end: b.end_time ? toMin(String(b.end_time).slice(0, 5)) : toMin(String(b.start_time).slice(0, 5)) + durationMinutes,
        }));
        const freeSlots = GRID.filter(t => {
          const s = toMin(t), e = s + durationMinutes;
          return !occupied.some(o => s < o.end && e > o.start);
        });
        const chosenTime = freeSlots.includes(requestedTime) ? requestedTime : freeSlots.find(t => toMin(t) >= toMin(requestedTime)) || freeSlots[0];

        if (!chosenTime) {
          updates.outcome = 'booking_full';
          parsed.reply = `Mi dispiace, il ${requestedDate} è già tutto occupato. Vuoi provare un altro giorno?`;
        } else {
          const [sh, sm] = chosenTime.split(':').map(Number);
          const endTotal = sh * 60 + sm + durationMinutes;
          const endTime = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;

          const { data: booking, error: bookingError } = await admin.from('bookings').insert({
            client_id: user.id,
            professional_id: professionalId,
            service_id: matchedService?.id,
            booking_date: requestedDate,
            start_time: chosenTime,
            end_time: endTime,
            status: 'pending',
            notes: `Prenotato via Stella AI durante chiamata`,
          }).select('id').single();

          if (bookingError) throw bookingError;
          updates.booking_id = booking?.id;
          updates.outcome = 'booking';
          if (chosenTime !== requestedTime) {
            parsed.reply = `Le ${requestedTime} non erano libere, ho prenotato per le ${chosenTime} del ${requestedDate}. Va bene?`;
          }
        }
      } catch (e) { console.error('booking insert failed', e); }
    } else if (parsed.action === 'message' && parsed.message_text && settings.take_message_enabled) {
      try {
        // upsert conversation
        const { data: existing } = await admin.from('conversations')
          .select('id')
          .or(`and(participant_1.eq.${user.id},participant_2.eq.${body.targetUserId}),and(participant_1.eq.${body.targetUserId},participant_2.eq.${user.id})`)
          .maybeSingle();
        let convId = existing?.id;
        if (!convId) {
          const { data: newConv } = await admin.from('conversations').insert({
            participant_1: user.id, participant_2: body.targetUserId,
            last_message: parsed.message_text, last_message_at: new Date().toISOString(),
          }).select('id').single();
          convId = newConv?.id;
        }
        if (convId) {
          await admin.from('messages').insert({
            conversation_id: convId, sender_id: user.id,
            content: `📞 [Messaggio via Stella AI] ${parsed.message_text}`,
          });
          updates.message_conversation_id = convId;
          updates.outcome = 'message';
        }
      } catch (e) { console.error('message insert failed', e); }
    } else if (parsed.action === 'transfer') {
      updates.outcome = 'transferred';
    } else if (parsed.action === 'end') {
      updates.outcome = 'ended';
      updates.ended_at = new Date().toISOString();
    }

    await admin.from('stella_call_sessions').update(updates).eq('call_id', body.callId);

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, reply: 'Errore. Riprova.', action: 'end' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});