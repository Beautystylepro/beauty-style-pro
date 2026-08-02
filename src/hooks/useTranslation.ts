import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useTranslation() {
  const { profile } = useAuth();
  const [translating, setTranslating] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(true);
  const cacheRef = useRef<Map<string, string>>(new Map());

  // La lingua di destinazione arriva prima di tutto dal profilo (scelta in
  // fase di registrazione in base al paese), non dal browser — un utente
  // che viaggia o usa un dispositivo condiviso avrebbe altrimenti una
  // lingua sbagliata. Il browser resta solo un fallback se il profilo non
  // è ancora caricato.
  const getUserLanguage = (): string => {
    if (profile?.preferred_language) return profile.preferred_language;
    const browserLang = navigator.language?.split("-")[0] || "it";
    return browserLang;
  };

  const translate = useCallback(async (text: string, targetOverride?: string): Promise<string> => {
    if (!text.trim() || text.length < 3) return text;
    const target = targetOverride || getUserLanguage();
    const cacheKey = `${text.slice(0, 80)}__${target}`;
    if (cacheRef.current.has(cacheKey)) return cacheRef.current.get(cacheKey)!;
    
    setTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-translate", {
        body: { 
          text, 
          sourceLang: "auto-detect",
          targetLang: target 
        },
      });
      if (error) throw error;
      const result = data?.translated || text;
      
      // Don't cache if translation is same as original (same language)
      if (result.trim().toLowerCase() === text.trim().toLowerCase()) {
        return text;
      }
      
      cacheRef.current.set(cacheKey, result);
      return result;
    } catch {
      return text;
    } finally {
      setTranslating(false);
    }
  }, []);

  return { translate, translating, autoTranslate, setAutoTranslate, getUserLanguage };
}
