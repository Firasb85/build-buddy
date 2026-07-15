export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bom_items: {
        Row: {
          id: string
          material_id: string
          product_id: string
          quantity_per_unit: number
        }
        Insert: {
          id?: string
          material_id: string
          product_id: string
          quantity_per_unit: number
        }
        Update: {
          id?: string
          material_id?: string
          product_id?: string
          quantity_per_unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "bom_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          annual_value: number
          churn_risk: number
          created_at: string
          id: string
          importance: number
          name_ar: string
          name_en: string
        }
        Insert: {
          annual_value?: number
          churn_risk?: number
          created_at?: string
          id?: string
          importance?: number
          name_ar: string
          name_en: string
        }
        Update: {
          annual_value?: number
          churn_risk?: number
          created_at?: string
          id?: string
          importance?: number
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      daily_entries: {
        Row: {
          created_at: string
          entered_by: string | null
          entry_date: string
          id: string
          line_id: string | null
          notes: string | null
          produced: number
          product_id: string
          received_material_qty: number
          shipped: number
        }
        Insert: {
          created_at?: string
          entered_by?: string | null
          entry_date?: string
          id?: string
          line_id?: string | null
          notes?: string | null
          produced?: number
          product_id: string
          received_material_qty?: number
          shipped?: number
        }
        Update: {
          created_at?: string
          entered_by?: string | null
          entry_date?: string
          id?: string
          line_id?: string | null
          notes?: string | null
          produced?: number
          product_id?: string
          received_material_qty?: number
          shipped?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_entries_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "production_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_log: {
        Row: {
          action: string
          created_at: string
          id: string
          notes: string | null
          recommendation_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          notes?: string | null
          recommendation_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          notes?: string | null
          recommendation_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decision_log_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          created_at: string
          id: string
          lead_time_days: number
          name_ar: string
          name_en: string
          reorder_point: number
          stock_qty: number
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_time_days?: number
          name_ar: string
          name_en: string
          reorder_point?: number
          stock_qty?: number
          unit: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_time_days?: number
          name_ar?: string
          name_en?: string
          reorder_point?: number
          stock_qty?: number
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      objective_settings: {
        Row: {
          custom_weights: Json | null
          id: number
          objective: Database["public"]["Enums"]["business_objective"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          custom_weights?: Json | null
          id?: number
          objective?: Database["public"]["Enums"]["business_objective"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          custom_weights?: Json | null
          id?: number
          objective?: Database["public"]["Enums"]["business_objective"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          customer_id: string
          due_date: string
          id: string
          product_id: string
          quantity: number
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          due_date: string
          id?: string
          product_id: string
          quantity: number
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          due_date?: string
          id?: string
          product_id?: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      pps_snapshots: {
        Row: {
          components: Json
          constraint_notes: Json | null
          constraint_status: string
          id: string
          objective: Database["public"]["Enums"]["business_objective"]
          pps: number
          product_id: string
          run_at: string
        }
        Insert: {
          components: Json
          constraint_notes?: Json | null
          constraint_status?: string
          id?: string
          objective: Database["public"]["Enums"]["business_objective"]
          pps: number
          product_id: string
          run_at?: string
        }
        Update: {
          components?: Json
          constraint_notes?: Json | null
          constraint_status?: string
          id?: string
          objective?: Database["public"]["Enums"]["business_objective"]
          pps?: number
          product_id?: string
          run_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pps_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_lines: {
        Row: {
          capacity_per_hour: number
          created_at: string
          id: string
          name_ar: string
          name_en: string
          quality_factor: number
          status: Database["public"]["Enums"]["line_status"]
          updated_at: string
        }
        Insert: {
          capacity_per_hour?: number
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
          quality_factor?: number
          status?: Database["public"]["Enums"]["line_status"]
          updated_at?: string
        }
        Update: {
          capacity_per_hour?: number
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
          quality_factor?: number
          status?: Database["public"]["Enums"]["line_status"]
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          daily_demand: number
          id: string
          margin_pct: number
          moq: number
          name_ar: string
          name_en: string
          preferred_line_id: string | null
          shelf_life_days: number | null
          sku: string
          stability: number
          stock_qty: number
          strategic_weight: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_demand?: number
          id?: string
          margin_pct?: number
          moq?: number
          name_ar: string
          name_en: string
          preferred_line_id?: string | null
          shelf_life_days?: number | null
          sku: string
          stability?: number
          stock_qty?: number
          strategic_weight?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_demand?: number
          id?: string
          margin_pct?: number
          moq?: number
          name_ar?: string
          name_en?: string
          preferred_line_id?: string | null
          shelf_life_days?: number | null
          sku?: string
          stability?: number
          stock_qty?: number
          strategic_weight?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_preferred_line_id_fkey"
            columns: ["preferred_line_id"]
            isOneToOne: false
            referencedRelation: "production_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          language: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          language?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          language?: string
          updated_at?: string
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          action_ar: string
          action_en: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          impact: Json | null
          priority: number | null
          product_id: string | null
          reason_ar: string | null
          reason_en: string | null
          status: Database["public"]["Enums"]["recommendation_status"]
        }
        Insert: {
          action_ar: string
          action_en: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          impact?: Json | null
          priority?: number | null
          product_id?: string | null
          reason_ar?: string | null
          reason_en?: string | null
          status?: Database["public"]["Enums"]["recommendation_status"]
        }
        Update: {
          action_ar?: string
          action_en?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          impact?: Json | null
          priority?: number | null
          product_id?: string | null
          reason_ar?: string | null
          reason_en?: string | null
          status?: Database["public"]["Enums"]["recommendation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "operator"
      business_objective:
        | "maximize_profit"
        | "maximize_service"
        | "reduce_inventory"
        | "protect_cash"
        | "default"
      line_status: "running" | "setup" | "idle" | "broken" | "maintenance"
      order_status:
        | "received"
        | "reviewing"
        | "approved"
        | "in_progress"
        | "completed"
        | "cancelled"
      recommendation_status: "pending" | "accepted" | "rejected" | "superseded"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "operator"],
      business_objective: [
        "maximize_profit",
        "maximize_service",
        "reduce_inventory",
        "protect_cash",
        "default",
      ],
      line_status: ["running", "setup", "idle", "broken", "maintenance"],
      order_status: [
        "received",
        "reviewing",
        "approved",
        "in_progress",
        "completed",
        "cancelled",
      ],
      recommendation_status: ["pending", "accepted", "rejected", "superseded"],
    },
  },
} as const
