import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface SmartReminder {
  id: string;
  user_id: string;
  service_type: string;
  service_name: string;
  last_service_date: string;
  next_suggested_date: string;
  professional_id: string | null;
  reminder_sent: boolean;
  reminder_sent_at: string | null;
  status: string;
  frequency_days: number;
  priority: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  shipping_enabled: boolean | null;
  shipping_address: string | null;
  shipping_notes: string | null;
  free_shipping: boolean | null;
  promo_code: string | null;
  promo_discount: number | null;
  product_id: string | null;
  quantity: number | null;
  total_price: number | null;
  auto_reorder: boolean | null;
}

export interface ShippingPromoResult {
  valid: boolean;
  discount_type: string | null;
  discount_value: number | null;
  free_shipping: boolean | null;
  message: string | null;
}

/** Validates and applies a shipping promo code via the apply_shipping_promo RPC. */
export function useApplyShippingPromo() {
  return useMutation({
    mutationFn: async ({
      code,
      serviceType,
      orderAmount = 0,
    }: {
      code: string;
      serviceType: string;
      orderAmount?: number;
    }) => {
      const { data, error } = await supabase.rpc("apply_shipping_promo", {
        _code: code,
        _service_type: serviceType,
        _order_amount: orderAmount,
      });

      if (error) throw error;
      const result = data?.[0] as ShippingPromoResult | undefined;
      if (!result || !result.valid) {
        throw new Error(result?.message || "Codice promo non valido");
      }
      return result;
    },
  });
}

export function useSmartReminders() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ["smart_reminders", user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from("smart_reminders")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("priority", { ascending: false })
        .order("next_suggested_date", { ascending: true });
        
      if (error) throw error;
      return data as SmartReminder[];
    },
    enabled: !!user,
  });
}

export function useActiveReminders() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ["active_reminders", user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from("smart_reminders")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .lte("next_suggested_date", today)
        .order("priority", { ascending: false });
        
      if (error) throw error;
      return data as SmartReminder[];
    },
    enabled: !!user,
  });
}

export function useUpdateReminderStatus() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ 
      reminderId, 
      status, 
      notes 
    }: { 
      reminderId: string; 
      status: 'active' | 'completed' | 'dismissed';
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from("smart_reminders")
        .update({ 
          status,
          notes: notes || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", reminderId)
        .eq("user_id", user!.id)
        .select()
        .maybeSingle();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart_reminders"] });
      queryClient.invalidateQueries({ queryKey: ["active_reminders"] });
    },
  });
}

export function useCreateManualReminder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({
      serviceType,
      serviceName,
      lastServiceDate,
      frequencyDays,
      professionalId,
      priority = 'medium',
      notes,
      shippingEnabled,
      shippingAddress,
      shippingNotes,
      freeShipping,
      promoCode,
      promoDiscount,
    }: {
      serviceType: string;
      serviceName: string;
      lastServiceDate: string;
      frequencyDays: number;
      professionalId?: string;
      priority?: 'low' | 'medium' | 'high';
      notes?: string;
      shippingEnabled?: boolean;
      shippingAddress?: string;
      shippingNotes?: string;
      freeShipping?: boolean;
      promoCode?: string;
      promoDiscount?: number;
    }) => {
      const nextDate = new Date(lastServiceDate);
      nextDate.setDate(nextDate.getDate() + frequencyDays);
      
      const { data, error } = await supabase
        .from("smart_reminders")
        .insert({
          user_id: user!.id,
          service_type: serviceType,
          service_name: serviceName,
          last_service_date: lastServiceDate,
          next_suggested_date: nextDate.toISOString().split('T')[0],
          frequency_days: frequencyDays,
          professional_id: professionalId || null,
          priority,
          notes: notes || null,
          shipping_enabled: shippingEnabled ?? false,
          shipping_address: shippingAddress || null,
          shipping_notes: shippingNotes || null,
          free_shipping: freeShipping ?? false,
          promo_code: promoCode || null,
          promo_discount: promoDiscount ?? null,
        })
        .select()
        .single();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart_reminders"] });
    },
  });
}

export function useRescheduleReminder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ 
      reminderId, 
      newDate 
    }: { 
      reminderId: string; 
      newDate: string;
    }) => {
      const { data, error } = await supabase
        .from("smart_reminders")
        .update({ 
          next_suggested_date: newDate,
          reminder_sent: false,
          reminder_sent_at: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", reminderId)
        .eq("user_id", user!.id)
        .select()
        .maybeSingle();
        
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["smart_reminders"] });
      queryClient.invalidateQueries({ queryKey: ["active_reminders"] });
    },
  });
}