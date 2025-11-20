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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  brand_profiles: {
    Tables: {
      brand_profiles: {
        Row: {
          brand_name: string
          created_at: string
          created_by: string
          id: string
          updated_at: string
        }
        Insert: {
          brand_name: string
          created_at?: string
          created_by: string
          id?: string
          updated_at?: string
        }
        Update: {
          brand_name?: string
          created_at?: string
          created_by?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      brand_profile_integration_accounts: {
        Row: {
          alias: string | null
          brand_profile_id: string
          created_at: string
          id: string
          integration_account_id: string
          settings: Json | null
          updated_at: string
        }
        Insert: {
          alias?: string | null
          brand_profile_id: string
          created_at?: string
          id?: string
          integration_account_id: string
          settings?: Json | null
          updated_at?: string
        }
        Update: {
          alias?: string | null
          brand_profile_id?: string
          created_at?: string
          id?: string
          integration_account_id?: string
          settings?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_profile_integration_accounts_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_profile_integration_accounts_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_report_drafts: {
        Row: {
          agent_profile_snapshot: Json
          brand_profile_id: string
          created_at: string
          finalized_report_id: string | null
          frontend_profile_snapshot: Json | null
          id: string
          run_context_snapshot: Json
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          agent_profile_snapshot: Json
          brand_profile_id: string
          created_at?: string
          finalized_report_id?: string | null
          frontend_profile_snapshot?: Json | null
          id?: string
          run_context_snapshot: Json
          status?: string
          updated_at?: string
          version?: string
        }
        Update: {
          agent_profile_snapshot?: Json
          brand_profile_id?: string
          created_at?: string
          finalized_report_id?: string | null
          frontend_profile_snapshot?: Json | null
          id?: string
          run_context_snapshot?: Json
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_report_drafts_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_accounts: {
        Row: {
          created_at: string
          external_account_id: string
          id: string
          integration_id: string
          name: string | null
          raw_payload: Json | null
          status: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_account_id: string
          id?: string
          integration_id: string
          name?: string | null
          raw_payload?: Json | null
          status?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_account_id?: string
          id?: string
          integration_id?: string
          name?: string | null
          raw_payload?: Json | null
          status?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_accounts_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "user_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_reports: {
        Row: {
          agent_profile_snapshot: Json
          brand_profile_id: string
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          frontend_profile_snapshot: Json
          frontend_revision: string
          id: string
          run_context_snapshot: Json
          source_phase: string
          synced_at: string
          synced_by: string
        }
        Insert: {
          agent_profile_snapshot: Json
          brand_profile_id: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          frontend_profile_snapshot: Json
          frontend_revision?: string
          id?: string
          run_context_snapshot: Json
          source_phase?: string
          synced_at?: string
          synced_by: string
        }
        Update: {
          agent_profile_snapshot?: Json
          brand_profile_id?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          frontend_profile_snapshot?: Json
          frontend_revision?: string
          id?: string
          run_context_snapshot?: Json
          source_phase?: string
          synced_at?: string
          synced_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_reports_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      strategic_analyses: {
        Row: {
          analysis_embedding: string | null
          analysis_json: Json
          brand_id: string
          created_at: string
          embedding_model: string | null
          embedding_text: string | null
          run_id: string | null
          summary_markdown: string | null
          updated_at: string
        }
        Insert: {
          analysis_embedding?: string | null
          analysis_json: Json
          brand_id: string
          created_at?: string
          embedding_model?: string | null
          embedding_text?: string | null
          run_id?: string | null
          summary_markdown?: string | null
          updated_at?: string
        }
        Update: {
          analysis_embedding?: string | null
          analysis_json?: Json
          brand_id?: string
          created_at?: string
          embedding_model?: string | null
          embedding_text?: string | null
          run_id?: string | null
          summary_markdown?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategic_analyses_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "strategic_analysis_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      strategic_analysis_runs: {
        Row: {
          brand_id: string
          completed_at: string | null
          error: Json | null
          id: string
          phases: Json
          result_ref: string | null
          started_at: string
          status: string
        }
        Insert: {
          brand_id: string
          completed_at?: string | null
          error?: Json | null
          id?: string
          phases?: Json
          result_ref?: string | null
          started_at?: string
          status: string
        }
        Update: {
          brand_id?: string
          completed_at?: string | null
          error?: Json | null
          id?: string
          phases?: Json
          result_ref?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategic_analysis_runs_brand_fk"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_integrations: {
        Row: {
          access_token_encrypted: string | null
          created_at: string
          expires_at: string | null
          id: string
          metadata: Json | null
          platform_email: string | null
          platform_user_id: string | null
          provider: string
          refresh_token_encrypted: string | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          platform_email?: string | null
          platform_user_id?: string | null
          provider: string
          refresh_token_encrypted?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          platform_email?: string | null
          platform_user_id?: string | null
          provider?: string
          refresh_token_encrypted?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_onboarding_states: {
        Row: {
          brand_id: string
          created_at: string
          is_active: boolean
          state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          is_active?: boolean
          state: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          is_active?: boolean
          state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_onboarding_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      brand_report_embeddings_match: {
        Args: {
          p_brand_profile_id: string
          p_limit?: number
          p_max_distance?: number
          p_query: string
        }
        Returns: {
          brand_report_id: string
          distance: number
          embedding_model: string
          embedding_text: string
        }[]
      }
      fetch_latest_brand_embedding: {
        Args: { p_brand_id: string; p_run_id?: string }
        Returns: {
          brand_id: string
          embedding: string
          embedding_model: string
          embedding_text: string
          run_id: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  brand_profiles: {
    Enums: {},
  },
} as const
