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
      orders: {
        Row: {
          billing_address: Json | null
          created_at: string
          currency: string | null
          customer_email: string | null
          customer_name: string | null
          id: string
          invoice_no: string | null
          items: Json
          paid: boolean | null
          raw: Json | null
          shipping_address: Json | null
          shipping_amount: number | null
          shipping_name: string | null
          status: Database["public"]["Enums"]["order_status"]
          sub_total: number | null
          tenant_id: string
          total: number | null
          updated_at: string
          webbskap_created_at: string | null
          webbskap_order_id: string
          weight: number | null
          weight_unit: string | null
        }
        Insert: {
          billing_address?: Json | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          invoice_no?: string | null
          items?: Json
          paid?: boolean | null
          raw?: Json | null
          shipping_address?: Json | null
          shipping_amount?: number | null
          shipping_name?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          sub_total?: number | null
          tenant_id: string
          total?: number | null
          updated_at?: string
          webbskap_created_at?: string | null
          webbskap_order_id: string
          weight?: number | null
          weight_unit?: string | null
        }
        Update: {
          billing_address?: Json | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          invoice_no?: string | null
          items?: Json
          paid?: boolean | null
          raw?: Json | null
          shipping_address?: Json | null
          shipping_amount?: number | null
          shipping_name?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          sub_total?: number | null
          tenant_id?: string
          total?: number | null
          updated_at?: string
          webbskap_created_at?: string | null
          webbskap_order_id?: string
          weight?: number | null
          weight_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_drafts: {
        Row: {
          additional_services: Json | null
          created_at: string
          height_cm: number | null
          id: string
          length_cm: number | null
          notes: string | null
          order_id: string
          parcels: number
          receiver_override: Json | null
          sender_override: Json | null
          service_code: string | null
          status: Database["public"]["Enums"]["draft_status"]
          tenant_id: string
          updated_at: string
          weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          additional_services?: Json | null
          created_at?: string
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          notes?: string | null
          order_id: string
          parcels?: number
          receiver_override?: Json | null
          sender_override?: Json | null
          service_code?: string | null
          status?: Database["public"]["Enums"]["draft_status"]
          tenant_id: string
          updated_at?: string
          weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          additional_services?: Json | null
          created_at?: string
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          notes?: string | null
          order_id?: string
          parcels?: number
          receiver_override?: Json | null
          sender_override?: Json | null
          service_code?: string | null
          status?: Database["public"]["Enums"]["draft_status"]
          tenant_id?: string
          updated_at?: string
          weight_kg?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_drafts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          booked_at: string
          created_at: string
          draft_id: string | null
          id: string
          last_status_check: string | null
          order_id: string
          pdf_storage_path: string | null
          postnord_response: Json | null
          status: Database["public"]["Enums"]["shipment_status"]
          status_history: Json | null
          tenant_id: string
          tracking_no: string | null
          updated_at: string
        }
        Insert: {
          booked_at?: string
          created_at?: string
          draft_id?: string | null
          id?: string
          last_status_check?: string | null
          order_id: string
          pdf_storage_path?: string | null
          postnord_response?: Json | null
          status?: Database["public"]["Enums"]["shipment_status"]
          status_history?: Json | null
          tenant_id: string
          tracking_no?: string | null
          updated_at?: string
        }
        Update: {
          booked_at?: string
          created_at?: string
          draft_id?: string | null
          id?: string
          last_status_check?: string | null
          order_id?: string
          pdf_storage_path?: string | null
          postnord_response?: Json | null
          status?: Database["public"]["Enums"]["shipment_status"]
          status_history?: Json | null
          tenant_id?: string
          tracking_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "shipment_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tenant_postnord_config: {
        Row: {
          api_key: string | null
          customer_number: string | null
          default_service_code: string | null
          environment: string
          sender_address: string | null
          sender_city: string | null
          sender_company: string | null
          sender_country: string | null
          sender_email: string | null
          sender_name: string | null
          sender_phone: string | null
          sender_zip: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          customer_number?: string | null
          default_service_code?: string | null
          environment?: string
          sender_address?: string | null
          sender_city?: string | null
          sender_company?: string | null
          sender_country?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          sender_zip?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          customer_number?: string | null
          default_service_code?: string | null
          environment?: string
          sender_address?: string | null
          sender_city?: string | null
          sender_company?: string | null
          sender_country?: string | null
          sender_email?: string | null
          sender_name?: string | null
          sender_phone?: string | null
          sender_zip?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_postnord_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_webbskap_config: {
        Row: {
          tenant_id: string
          updated_at: string
          webhook_secret: string | null
          webhook_url_set: boolean
          website_api_key: string | null
        }
        Insert: {
          tenant_id: string
          updated_at?: string
          webhook_secret?: string | null
          webhook_url_set?: boolean
          website_api_key?: string | null
        }
        Update: {
          tenant_id?: string
          updated_at?: string
          webhook_secret?: string | null
          webhook_url_set?: boolean
          website_api_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_webbskap_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          active: boolean
          created_at: string
          display_name: string | null
          external_customer_id: string
          id: string
          owner_email: string | null
          owner_name: string | null
          project_id: string | null
          subdomain: string | null
          updated_at: string
          website_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          external_customer_id: string
          id?: string
          owner_email?: string | null
          owner_name?: string | null
          project_id?: string | null
          subdomain?: string | null
          updated_at?: string
          website_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          external_customer_id?: string
          id?: string
          owner_email?: string | null
          owner_name?: string | null
          project_id?: string | null
          subdomain?: string | null
          updated_at?: string
          website_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error: string | null
          id: string
          payload: Json | null
          processed: boolean
          received_at: string
          signature: string | null
          source: string
          tenant_id: string | null
          topic: string
          verified: boolean
        }
        Insert: {
          error?: string | null
          id?: string
          payload?: Json | null
          processed?: boolean
          received_at?: string
          signature?: string | null
          source: string
          tenant_id?: string | null
          topic: string
          verified?: boolean
        }
        Update: {
          error?: string | null
          id?: string
          payload?: Json | null
          processed?: boolean
          received_at?: string
          signature?: string | null
          source?: string
          tenant_id?: string | null
          topic?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tenant_ids: { Args: never; Returns: string[] }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_tenant_access: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "staff"
      draft_status: "draft" | "ready" | "booked" | "cancelled" | "error"
      order_status:
        | "pending"
        | "shipped"
        | "completed"
        | "canceled"
        | "archived"
      shipment_status:
        | "booked"
        | "in_transit"
        | "delivered"
        | "returned"
        | "cancelled"
        | "unknown"
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
      app_role: ["owner", "admin", "staff"],
      draft_status: ["draft", "ready", "booked", "cancelled", "error"],
      order_status: ["pending", "shipped", "completed", "canceled", "archived"],
      shipment_status: [
        "booked",
        "in_transit",
        "delivered",
        "returned",
        "cancelled",
        "unknown",
      ],
    },
  },
} as const
