import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, GraduationCap, Star, Users, Plus, PlayCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const CATEGORIES = ["Tutti", "Taglio", "Colore", "Skincare", "Makeup", "Nail Art", "Business"];

export default function AcademyPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [category, setCategory] = useState("Tutti");

  const canTeach = profile?.user_type === "professional" || profile?.user_type === "business";

  const { data: courses, isLoading } = useQuery({
    queryKey: ["academy_courses", category],
    queryFn: async () => {
      let query = supabase
        .from("courses")
        .select("*, profiles:instructor_id(display_name, avatar_url)")
        .eq("is_published", true)
        .order("student_count", { ascending: false });
      if (category !== "Tutti") query = query.eq("category", category);
      const { data } = await query.limit(30);
      return data || [];
    },
  });

  const { data: myEnrollments } = useQuery({
    queryKey: ["my_enrollments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("course_enrollments")
        .select("course_id")
        .eq("student_id", user!.id);
      return new Set((data || []).map((e) => e.course_id));
    },
  });

  return (
    <MobileLayout>
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-primary" aria-label="Indietro">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Academy</h1>
          </div>
          {canTeach && (
            <button
              onClick={() => navigate("/academy/create")}
              className="ml-auto flex items-center gap-1 text-xs font-semibold text-primary"
            >
              <Plus className="w-4 h-4" /> Crea corso
            </button>
          )}
        </div>

        <div className="px-4 py-3 flex gap-2 overflow-x-auto">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                category === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="px-4 py-2 grid grid-cols-2 gap-3">
          {isLoading ? (
            <p className="col-span-2 text-center text-sm text-muted-foreground py-12">Caricamento...</p>
          ) : !courses?.length ? (
            <div className="col-span-2 text-center py-16">
              <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">Nessun corso disponibile ancora in questa categoria.</p>
              {canTeach && (
                <button onClick={() => navigate("/academy/create")} className="mt-3 text-sm font-semibold text-primary">
                  Crea il primo corso →
                </button>
              )}
            </div>
          ) : (
            courses.map((c: any) => (
              <button
                key={c.id}
                onClick={() => navigate(`/academy/${c.id}`)}
                className="text-left rounded-2xl border border-border/50 bg-card overflow-hidden hover:border-primary/50 transition-colors"
              >
                <div className="aspect-video bg-muted flex items-center justify-center relative">
                  {c.cover_image_url ? (
                    <img src={c.cover_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <PlayCircle className="w-8 h-8 text-muted-foreground" />
                  )}
                  {myEnrollments?.has(c.id) && (
                    <span className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                      Iscritto
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-bold line-clamp-2 leading-snug">{c.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{c.profiles?.display_name || "Istruttore"}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs font-bold text-primary">
                      {c.price > 0 ? `€${c.price}` : "Gratis"}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {c.rating && (
                        <span className="flex items-center gap-0.5"><Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> {c.rating}</span>
                      )}
                      <span className="flex items-center gap-0.5"><Users className="w-3 h-3" /> {c.student_count}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
