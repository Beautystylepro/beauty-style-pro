import MobileLayout from "@/components/layout/MobileLayout";
import { ArrowLeft, Star, Users, CheckCircle2, Circle, Award, Lock } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function CourseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [enrolling, setEnrolling] = useState(false);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  const { data: course } = useQuery({
    queryKey: ["course", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("courses")
        .select("*, profiles:instructor_id(display_name, avatar_url)")
        .eq("id", id)
        .maybeSingle();
      return data;
    },
  });

  const { data: enrollment } = useQuery({
    queryKey: ["enrollment", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("course_enrollments")
        .select("*")
        .eq("course_id", id)
        .eq("student_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const isEnrolled = !!enrollment;

  // Lessons are only actually returned by the database if the viewer is
  // enrolled or is the instructor (enforced by RLS) — so a non-paying
  // visitor genuinely cannot see paid content, not just a UI hiding trick.
  const { data: lessons } = useQuery({
    queryKey: ["course_lessons", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("course_lessons")
        .select("*")
        .eq("course_id", id)
        .order("sort_order", { ascending: true });
      return data || [];
    },
  });

  const { data: progress } = useQuery({
    queryKey: ["lesson_progress", enrollment?.id],
    enabled: !!enrollment,
    queryFn: async () => {
      const { data } = await supabase
        .from("lesson_progress")
        .select("lesson_id")
        .eq("enrollment_id", enrollment!.id);
      return new Set((data || []).map((p) => p.lesson_id));
    },
  });

  const handleEnroll = async () => {
    if (!user) { navigate("/auth"); return; }
    if (!course) return;
    setEnrolling(true);
    const { error } = await supabase.rpc("enroll_in_course", { _course_id: course.id });
    setEnrolling(false);
    if (error) {
      if (error.message?.includes("PAYMENT_REQUIRED")) {
        toast.info("Questo corso è a pagamento — funzione di acquisto in arrivo a breve");
      } else {
        toast.error("Errore nell'iscrizione, riprova");
      }
      return;
    }
    toast.success("Iscrizione completata! 🎓");
    queryClient.invalidateQueries({ queryKey: ["enrollment", id, user.id] });
  };

  const handleCompleteLesson = async (lessonId: string) => {
    const { data, error } = await supabase.rpc("complete_lesson", { _lesson_id: lessonId });
    if (error) {
      toast.error("Errore, riprova");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["lesson_progress", enrollment?.id] });
    if (data === true) {
      toast.success("🏆 Corso completato! Certificato sbloccato");
      queryClient.invalidateQueries({ queryKey: ["enrollment", id, user?.id] });
    } else {
      toast.success("Lezione completata ✓");
    }
  };

  if (!course) return null;

  const activeLesson = lessons?.find((l) => l.id === activeLessonId) || (isEnrolled ? lessons?.[0] : null);

  return (
    <MobileLayout>
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-primary" aria-label="Indietro">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-bold line-clamp-1">{course.title}</h1>
        </div>

        <div className="aspect-video bg-muted flex items-center justify-center">
          {course.cover_image_url ? (
            <img src={course.cover_image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Award className="w-10 h-10 text-muted-foreground" />
          )}
        </div>

        <div className="p-4 space-y-3">
          <div>
            <h2 className="text-lg font-bold">{course.title}</h2>
            <p className="text-xs text-muted-foreground mt-1">di {course.profiles?.display_name || "Istruttore"}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {course.rating && <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" /> {course.rating} ({course.review_count})</span>}
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {course.student_count} iscritti</span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">{course.description}</p>

          {enrollment?.certificate_issued && (
            <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              <p className="text-xs font-semibold text-primary">Corso completato — certificato sbloccato 🏆</p>
            </div>
          )}

          {!isEnrolled ? (
            <button
              onClick={handleEnroll}
              disabled={enrolling}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50"
            >
              {enrolling ? "Iscrizione..." : course.price > 0 ? `Iscriviti — €${course.price}` : "Iscriviti gratis"}
            </button>
          ) : (
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs font-semibold mb-2">Il tuo percorso</p>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${lessons?.length ? ((progress?.size || 0) / lessons.length) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{progress?.size || 0} / {lessons?.length || 0} lezioni completate</p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-bold mb-2">Lezioni</h3>
            <div className="space-y-2">
              {!isEnrolled ? (
                <div className="rounded-xl border border-dashed border-border/60 p-4 text-center">
                  <Lock className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Iscriviti per sbloccare il contenuto delle lezioni</p>
                </div>
              ) : (
                lessons?.map((lesson, i) => (
                  <button
                    key={lesson.id}
                    onClick={() => setActiveLessonId(lesson.id)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      activeLesson?.id === lesson.id ? "border-primary bg-primary/5" : "border-border/50 bg-card"
                    }`}
                  >
                    {progress?.has(lesson.id) ? (
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{i + 1}. {lesson.title}</p>
                      {lesson.duration_minutes && <p className="text-[10px] text-muted-foreground">{lesson.duration_minutes} min</p>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {isEnrolled && activeLesson && (
            <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
              <h4 className="text-sm font-bold">{activeLesson.title}</h4>
              {activeLesson.content_type === "video" && activeLesson.video_url ? (
                <video src={activeLesson.video_url} controls className="w-full rounded-lg" />
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-line">{activeLesson.content_text}</p>
              )}
              {!progress?.has(activeLesson.id) && (
                <button
                  onClick={() => handleCompleteLesson(activeLesson.id)}
                  className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-bold"
                >
                  Segna come completata
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
