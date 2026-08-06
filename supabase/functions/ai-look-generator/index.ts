import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY)
    return jsonResponse({ error: "GEMINI_API_KEY not configured" }, 200);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader)
      throw new Error("Non autenticato");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Autenticazione fallita");
    const userId = userData.user.id;

    const body = await req.json();
    const { action } = body;

    // ── Generate Look ──────────────────────────────────────────────
    if (action === "generate") {
      const { imageUrl, styles, autoMode, userProfile } = body;
      if (!imageUrl) throw new Error("Foto richiesta");

      // Build prompt based on selected styles
      let prompt = "Edit this photo of a person realistically. Keep the face, skin tone, expression and background exactly the same. ";

      if (autoMode && userProfile) {
        prompt += `Based on the person's appearance, suggest and apply the most flattering look: a modern hairstyle, natural makeup if appropriate, and stylish accessories. Make it look professional and trendy. `;
      } else if (styles && styles.length > 0) {
        const styleDescriptions: Record<string, Record<string, string>> = {
          haircut: {
            "Fade Moderno": "Apply a modern fade haircut with short sides and textured top",
            "Pompadour": "Apply a classic pompadour hairstyle with volume on top",
            "Buzz Cut": "Apply a clean buzz cut hairstyle",
            "Long Layers": "Apply long layered hair with movement",
            "Bob Corto": "Apply a short bob haircut",
            "Pixie Cut": "Apply a pixie cut hairstyle",
            "Undercut": "Apply an undercut hairstyle with longer top",
            "Capelli Ricci": "Apply curly natural-looking hair",
          },
          color: {
            "Biondo Platino": "Change hair color to platinum blonde",
            "Rosso Fuoco": "Change hair color to vibrant red",
            "Castano Cioccolato": "Change hair color to rich chocolate brown",
            "Nero Corvino": "Change hair color to jet black",
            "Rosa Pastello": "Change hair color to pastel pink",
            "Blu Elettrico": "Change hair color to electric blue",
            "Balayage Miele": "Apply honey balayage highlights to the hair",
            "Silver Grey": "Change hair color to silver grey",
          },
          beard: {
            "Barba Curata": "Add a neatly trimmed full beard",
            "Barba Lunga": "Add a long well-groomed beard",
            "Pizzetto": "Add a goatee beard style",
            "Stubble": "Add a 3-day stubble beard",
            "Baffi": "Add a stylish mustache",
            "Clean Shave": "Make the face clean shaven",
          },
          makeup: {
            "Naturale": "Apply natural subtle makeup with light foundation and mascara",
            "Smokey Eyes": "Apply smokey eye makeup look",
            "Glam": "Apply glamorous full makeup with contour and bold lips",
            "Labbra Rosse": "Apply classic red lipstick with minimal eye makeup",
            "Soft Glam": "Apply soft glam makeup with warm tones",
            "No Makeup Look": "Apply a 'no makeup' makeup look that enhances natural features",
          },
          glasses: {
            "Aviator": "Add classic aviator sunglasses",
            "Wayfarer": "Add wayfarer style glasses",
            "Round": "Add round vintage style glasses",
            "Cat Eye": "Add cat eye glasses",
            "Occhiali da Vista": "Add modern prescription glasses frames",
            "Sport": "Add sporty wraparound sunglasses",
          },
          clothing: {
            "Casual Chic": "Dress in casual chic style with a well-fitted shirt and jeans",
            "Business": "Dress in business attire with a suit jacket",
            "Streetwear": "Dress in trendy streetwear with hoodie and sneakers",
            "Elegante": "Dress in elegant evening attire",
            "Sportivo": "Dress in athletic sportswear",
            "Bohemian": "Dress in bohemian style with flowing fabrics",
          },
          tattoo: {
            "Braccio Sleeve": "Add a full sleeve tattoo on the arm with artistic designs",
            "Collo Piccolo": "Add a small minimalist tattoo on the neck",
            "Mano": "Add tattoos on the hand and fingers",
            "Geometrico": "Add geometric tattoo designs on visible skin",
          },
          complete: {
            "Look VIP": "Transform into a VIP celebrity look with premium hairstyle, subtle makeup, designer accessories and elegant clothing",
            "Look Influencer": "Transform into an influencer look with trendy hairstyle, natural makeup, fashionable casual wear and modern accessories",
            "Look Elegante": "Transform into an elegant look with refined hairstyle, classic makeup, formal attire and pearl accessories",
            "Look Sportivo": "Transform into a sporty look with athletic hairstyle, minimal makeup, sportswear and sporty accessories",
            "Look Casual": "Transform into a casual relaxed look with messy-chic hair, no-makeup makeup, comfortable stylish clothes",
            "Look Moda": "Transform into a high-fashion look with avant-garde hairstyle, editorial makeup, runway-inspired clothing",
          },
        };

        const descriptions: string[] = [];
        for (const style of styles) {
          const cat = styleDescriptions[style.category];
          if (cat && cat[style.name]) {
            descriptions.push(cat[style.name]);
          } else {
            descriptions.push(`Apply ${style.name} style for ${style.category}`);
          }
        }
        prompt += descriptions.join(". ") + ". ";
      }

      prompt += "The result must look like a real photograph, not AI-generated. Maintain exact same pose, lighting direction, and background.";

      console.log("[AI-LOOK] Generating with prompt:", prompt.substring(0, 200));

      // Call Gemini directly (OpenAI-compatible endpoint) for image editing
      const aiResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GEMINI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gemini-3.1-flash-image-preview",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              },
            ],
            modalities: ["image", "text"],
          }),
        }
      );

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429) {
          return jsonResponse({
            error: "Troppe richieste. Riprova tra qualche secondo.",
            code: "RATE_LIMITED",
          }, 200);
        }
        if (status === 402) {
          return jsonResponse({
            error: "Servizio AI temporaneamente non disponibile. Riprova più tardi.",
            code: "PAYMENT_REQUIRED",
          }, 200);
        }
        const errorText = await aiResponse.text();
        console.error("[AI-LOOK] AI error:", status, errorText);
        return jsonResponse({
          error: `Errore Gemini (${status}): ${errorText.substring(0, 300)}`,
          code: "AI_ERROR",
        }, 200);
      }

      const aiData = await aiResponse.json();
      const generatedImageUrl =
        aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (!generatedImageUrl) {
        console.error("[AI-LOOK] No image in response:", JSON.stringify(aiData).substring(0, 500));
        throw new Error("Nessuna immagine generata. Riprova.");
      }

      // Upload generated image to storage
      const base64Data = generatedImageUrl.replace(/^data:image\/\w+;base64,/, "");
      const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      const fileName = `${userId}/${crypto.randomUUID()}.png`;

      const { error: uploadError } = await supabase.storage
        .from("look-photos")
        .upload(fileName, imageBytes, { contentType: "image/png", upsert: false });

      if (uploadError) {
        console.error("[AI-LOOK] Upload error:", uploadError);
        throw new Error("Errore salvataggio immagine");
      }

      const { data: publicUrlData } = supabase.storage
        .from("look-photos")
        .getPublicUrl(fileName);

      // Save to database
      const { data: generation, error: dbError } = await supabase
        .from("look_generations")
        .insert({
          user_id: userId,
          original_photo_url: imageUrl,
          generated_photo_url: publicUrlData.publicUrl,
          styles_applied: styles || [],
          categories: styles ? styles.map((s: any) => s.category) : ["auto"],
          prompt_used: prompt,
          status: "completed",
          is_premium: autoMode || false,
        })
        .select()
        .single();

      if (dbError) console.error("[AI-LOOK] DB error:", dbError);

      return new Response(
        JSON.stringify({
          success: true,
          generated_url: publicUrlData.publicUrl,
          generation_id: generation?.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Auto Look AI ───────────────────────────────────────────────
    if (action === "auto_suggest") {
      const { imageUrl } = body;
      if (!imageUrl) throw new Error("Foto richiesta");

      const aiResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GEMINI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gemini-2.5-flash",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Analyze this person's photo. Determine:
1. Face shape (oval, round, square, heart, oblong)
2. Estimated gender
3. Estimated age range
4. Current hair style/color
5. Skin tone

Then suggest 3 complete looks that would be most flattering. Each look should include specific recommendations for: hairstyle, hair color, beard (if male), makeup (if female), glasses style, and clothing style.

Return ONLY valid JSON in this format:
{
  "analysis": {"face_shape": "", "gender": "", "age_range": "", "skin_tone": ""},
  "suggestions": [
    {
      "name": "Look Name",
      "description": "Brief description",
      "styles": [
        {"category": "haircut", "name": "Style Name"},
        {"category": "color", "name": "Color Name"},
        {"category": "clothing", "name": "Style Name"}
      ]
    }
  ]
}`,
                  },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              },
            ],
          }),
        }
      );

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429 || status === 402) {
          return new Response(
            JSON.stringify({
              suggestions: [
                {
                  name: "Look Moderno",
                  description: "Stile contemporaneo e versatile",
                  styles: [
                    { category: "haircut", name: "Fade Moderno" },
                    { category: "color", name: "Castano Cioccolato" },
                    { category: "clothing", name: "Casual Chic" },
                  ],
                },
                {
                  name: "Look Elegante",
                  description: "Raffinato e professionale",
                  styles: [
                    { category: "haircut", name: "Pompadour" },
                    { category: "clothing", name: "Business" },
                    { category: "glasses", name: "Occhiali da Vista" },
                  ],
                },
                {
                  name: "Look Trendy",
                  description: "Alla moda e audace",
                  styles: [
                    { category: "haircut", name: "Undercut" },
                    { category: "color", name: "Silver Grey" },
                    { category: "clothing", name: "Streetwear" },
                  ],
                },
              ],
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error("Errore analisi AI");
      }

      const aiData = await aiResponse.json();
      let content = aiData.choices?.[0]?.message?.content || "";
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) content = jsonMatch[1];
      
      try {
        const parsed = JSON.parse(content.trim());
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        console.error("[AI-LOOK] Failed to parse suggestions:", content.substring(0, 500));
        // Fallback suggestions
        return new Response(
          JSON.stringify({
            suggestions: [
              {
                name: "Look Moderno",
                description: "Stile contemporaneo e versatile",
                styles: [
                  { category: "haircut", name: "Fade Moderno" },
                  { category: "clothing", name: "Casual Chic" },
                ],
              },
            ],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(JSON.stringify({ error: "Azione non valida" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[AI-LOOK] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Errore sconosciuto" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
