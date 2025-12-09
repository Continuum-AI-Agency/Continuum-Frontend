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
      brand_document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string
          id: number
          tokens: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding: string
          id?: number
          tokens?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string
          id?: number
          tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "brand_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_documents: {
        Row: {
          brand_id: string
          created_at: string
          error_message: string | null
          external_url: string | null
          id: string
          mime_type: string | null
          name: string
          size: number | null
          source: string
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          error_message?: string | null
          external_url?: string | null
          id: string
          mime_type?: string | null
          name: string
          size?: number | null
          source: string
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          error_message?: string | null
          external_url?: string | null
          id?: string
          mime_type?: string | null
          name?: string
          size?: number | null
          source?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_documents_brand_profile_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profile_integration_accounts: {
        Row: {
          alias: string | null
          brand_profile_id: string
          created_at: string
          id: string
          integration_account_id: string
          settings: Json
          updated_at: string
        }
        Insert: {
          alias?: string | null
          brand_profile_id: string
          created_at?: string
          id?: string
          integration_account_id: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          alias?: string | null
          brand_profile_id?: string
          created_at?: string
          id?: string
          integration_account_id?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_profile_integration_accounts_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profiles: {
        Row: {
          brand_name: string
          context: Json
          created_at: string
          created_by: string
          id: string
          updated_at: string
        }
        Insert: {
          brand_name: string
          context?: Json
          created_at?: string
          created_by: string
          id?: string
          updated_at?: string
        }
        Update: {
          brand_name?: string
          context?: Json
          created_at?: string
          created_by?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
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
      integration_accounts_assets: {
        Row: {
          created_at: string
          external_account_id: string
          id: string
          integration_id: string
          name: string | null
          raw_payload: Json
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
          raw_payload?: Json
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
          raw_payload?: Json
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
      invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          brand_profile_id: string
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          role: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          brand_profile_id: string
          created_at?: string
          created_by: string
          email: string
          expires_at: string
          id?: string
          role?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          brand_profile_id?: string
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          role?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          brand_profile_id: string
          created_at: string
          id: string
          role: string
          tier: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_profile_id: string
          created_at?: string
          id?: string
          role: string
          tier?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_profile_id?: string
          created_at?: string
          id?: string
          role?: string
          tier?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strategic_analyses: {
        Row: {
          analysis_embedding: string | null
          analysis_json: Json
          audience_embedding: string | null
          audience_embedding_model: string | null
          audience_embedding_text: string | null
          brand_id: string
          competition_embedding: string | null
          competition_embedding_model: string | null
          competition_embedding_text: string | null
          created_at: string
          embedding_model: string | null
          embedding_text: string | null
          pmf_embedding: string | null
          pmf_embedding_model: string | null
          pmf_embedding_text: string | null
          product_summary_embedding: string | null
          product_summary_embedding_model: string | null
          product_summary_embedding_text: string | null
          run_id: string | null
          summary_markdown: string | null
          updated_at: string
          voice_embedding: string | null
          voice_embedding_model: string | null
          voice_embedding_text: string | null
        }
        Insert: {
          analysis_embedding?: string | null
          analysis_json: Json
          audience_embedding?: string | null
          audience_embedding_model?: string | null
          audience_embedding_text?: string | null
          brand_id: string
          competition_embedding?: string | null
          competition_embedding_model?: string | null
          competition_embedding_text?: string | null
          created_at?: string
          embedding_model?: string | null
          embedding_text?: string | null
          pmf_embedding?: string | null
          pmf_embedding_model?: string | null
          pmf_embedding_text?: string | null
          product_summary_embedding?: string | null
          product_summary_embedding_model?: string | null
          product_summary_embedding_text?: string | null
          run_id?: string | null
          summary_markdown?: string | null
          updated_at?: string
          voice_embedding?: string | null
          voice_embedding_model?: string | null
          voice_embedding_text?: string | null
        }
        Update: {
          analysis_embedding?: string | null
          analysis_json?: Json
          audience_embedding?: string | null
          audience_embedding_model?: string | null
          audience_embedding_text?: string | null
          brand_id?: string
          competition_embedding?: string | null
          competition_embedding_model?: string | null
          competition_embedding_text?: string | null
          created_at?: string
          embedding_model?: string | null
          embedding_text?: string | null
          pmf_embedding?: string | null
          pmf_embedding_model?: string | null
          pmf_embedding_text?: string | null
          product_summary_embedding?: string | null
          product_summary_embedding_model?: string | null
          product_summary_embedding_text?: string | null
          run_id?: string | null
          summary_markdown?: string | null
          updated_at?: string
          voice_embedding?: string | null
          voice_embedding_model?: string | null
          voice_embedding_text?: string | null
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
      strategic_analysis_embeddings: {
        Row: {
          brand_id: string
          created_at: string
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          id: string
          label: string | null
          run_id: string | null
          section: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          id?: string
          label?: string | null
          run_id?: string | null
          section: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          id?: string
          label?: string | null
          run_id?: string | null
          section?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategic_analysis_embeddings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategic_analysis_embeddings_run_id_fkey"
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
          metadata: Json
          platform_email: string | null
          platform_user_id: string | null
          platform_user_id_normalized: string | null
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
          metadata?: Json
          platform_email?: string | null
          platform_user_id?: string | null
          platform_user_id_normalized?: string | null
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
          metadata?: Json
          platform_email?: string | null
          platform_user_id?: string | null
          platform_user_id_normalized?: string | null
          provider?: string
          refresh_token_encrypted?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
        Relationships: []
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
      decrypt_token: { Args: { ct: string }; Returns: string }
      encrypt_token: { Args: { token: string }; Returns: string }
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
  public: {
    Tables: {
      AntonidasContent: {
        Row: {
          created_at: string
          detailed_templates: Json | null
          id: number
          instagram_business_account_id: string | null
          platform_account_id: string | null
          share_id: string | null
          title: string
          user_id: string | null
          weekly_grid: Json | null
        }
        Insert: {
          created_at?: string
          detailed_templates?: Json | null
          id?: number
          instagram_business_account_id?: string | null
          platform_account_id?: string | null
          share_id?: string | null
          title?: string
          user_id?: string | null
          weekly_grid?: Json | null
        }
        Update: {
          created_at?: string
          detailed_templates?: Json | null
          id?: number
          instagram_business_account_id?: string | null
          platform_account_id?: string | null
          share_id?: string | null
          title?: string
          user_id?: string | null
          weekly_grid?: Json | null
        }
        Relationships: []
      }
      AntonidasDeepResearch: {
        Row: {
          ad_account_id: string | null
          content: string | null
          created_at: string
          deep_research_batch_id: string | null
          embedding: string | null
          id: number
          platform: string | null
          platform_account_id: string | null
        }
        Insert: {
          ad_account_id?: string | null
          content?: string | null
          created_at?: string
          deep_research_batch_id?: string | null
          embedding?: string | null
          id?: number
          platform?: string | null
          platform_account_id?: string | null
        }
        Update: {
          ad_account_id?: string | null
          content?: string | null
          created_at?: string
          deep_research_batch_id?: string | null
          embedding?: string | null
          id?: number
          platform?: string | null
          platform_account_id?: string | null
        }
        Relationships: []
      }
      AntonidasDeepResearch_Error: {
        Row: {
          ad_account_id: string | null
          content: string | null
          created_at: string
          id: number
          platform: string | null
          platform_account_id: string | null
        }
        Insert: {
          ad_account_id?: string | null
          content?: string | null
          created_at?: string
          id?: number
          platform?: string | null
          platform_account_id?: string | null
        }
        Update: {
          ad_account_id?: string | null
          content?: string | null
          created_at?: string
          id?: number
          platform?: string | null
          platform_account_id?: string | null
        }
        Relationships: []
      }
      AntonidasDocuments: {
        Row: {
          ad_account_id: string | null
          content: string | null
          created_at: string
          embedding: string | null
          embedding_large: string | null
          file_name: string | null
          file_type: string | null
          id: number
          platform: string | null
          platform_account_id: string | null
          user_id: string | null
        }
        Insert: {
          ad_account_id?: string | null
          content?: string | null
          created_at?: string
          embedding?: string | null
          embedding_large?: string | null
          file_name?: string | null
          file_type?: string | null
          id?: number
          platform?: string | null
          platform_account_id?: string | null
          user_id?: string | null
        }
        Update: {
          ad_account_id?: string | null
          content?: string | null
          created_at?: string
          embedding?: string | null
          embedding_large?: string | null
          file_name?: string | null
          file_type?: string | null
          id?: number
          platform?: string | null
          platform_account_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      AntonidasImagePrompts: {
        Row: {
          ad_account_id: string
          base_prompt: string
          created_at: string
          description: string | null
          goal: string
          id: number
          input_guide: string | null
          key: string
          label: string
          params_model: string
          params_quality: string
          params_size: string
        }
        Insert: {
          ad_account_id: string
          base_prompt: string
          created_at?: string
          description?: string | null
          goal: string
          id?: number
          input_guide?: string | null
          key: string
          label: string
          params_model?: string
          params_quality?: string
          params_size?: string
        }
        Update: {
          ad_account_id?: string
          base_prompt?: string
          created_at?: string
          description?: string | null
          goal?: string
          id?: number
          input_guide?: string | null
          key?: string
          label?: string
          params_model?: string
          params_quality?: string
          params_size?: string
        }
        Relationships: []
      }
      AntonidasMockAccounts: {
        Row: {
          account_id: string
          created_at: string | null
          id: number
          name: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          id?: number
          name: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          id?: number
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      AntonidasOnboarding: {
        Row: {
          ad_account_id: string | null
          approved_at: string | null
          content: string | null
          created_at: string
          deep_research_batch_id: string | null
          embedding: string | null
          id: number
          initial_edited_fields: Json | null
          initial_user_edited: boolean | null
          platform: string | null
          platform_account_id: string | null
          report_markdown: string | null
          status: string | null
          version: number | null
        }
        Insert: {
          ad_account_id?: string | null
          approved_at?: string | null
          content?: string | null
          created_at?: string
          deep_research_batch_id?: string | null
          embedding?: string | null
          id?: number
          initial_edited_fields?: Json | null
          initial_user_edited?: boolean | null
          platform?: string | null
          platform_account_id?: string | null
          report_markdown?: string | null
          status?: string | null
          version?: number | null
        }
        Update: {
          ad_account_id?: string | null
          approved_at?: string | null
          content?: string | null
          created_at?: string
          deep_research_batch_id?: string | null
          embedding?: string | null
          id?: number
          initial_edited_fields?: Json | null
          initial_user_edited?: boolean | null
          platform?: string | null
          platform_account_id?: string | null
          report_markdown?: string | null
          status?: string | null
          version?: number | null
        }
        Relationships: []
      }
      AntonidasStrategicAnalysis: {
        Row: {
          approved_at: string | null
          audience_profile: Json | null
          brand_foundation: Json | null
          brand_summary: string | null
          brand_voice: Json | null
          competitive_landscape: Json | null
          content: string | null
          created_at: string
          deep_research_batch_id: string | null
          embedding: string | null
          id: string
          platform: string | null
          platform_account_id: string
          primary_content_goals: Json | null
          product_market_fit: Json | null
          recommended_primary_cta: string | null
          status: string | null
          strategic_edited_fields: Json | null
          strategic_user_edited: boolean | null
          swot_analysis: Json | null
          version: number | null
        }
        Insert: {
          approved_at?: string | null
          audience_profile?: Json | null
          brand_foundation?: Json | null
          brand_summary?: string | null
          brand_voice?: Json | null
          competitive_landscape?: Json | null
          content?: string | null
          created_at?: string
          deep_research_batch_id?: string | null
          embedding?: string | null
          id?: string
          platform?: string | null
          platform_account_id: string
          primary_content_goals?: Json | null
          product_market_fit?: Json | null
          recommended_primary_cta?: string | null
          status?: string | null
          strategic_edited_fields?: Json | null
          strategic_user_edited?: boolean | null
          swot_analysis?: Json | null
          version?: number | null
        }
        Update: {
          approved_at?: string | null
          audience_profile?: Json | null
          brand_foundation?: Json | null
          brand_summary?: string | null
          brand_voice?: Json | null
          competitive_landscape?: Json | null
          content?: string | null
          created_at?: string
          deep_research_batch_id?: string | null
          embedding?: string | null
          id?: string
          platform?: string | null
          platform_account_id?: string
          primary_content_goals?: Json | null
          product_market_fit?: Json | null
          recommended_primary_cta?: string | null
          status?: string | null
          strategic_edited_fields?: Json | null
          strategic_user_edited?: boolean | null
          swot_analysis?: Json | null
          version?: number | null
        }
        Relationships: []
      }
      AntonidasVideoPrompts: {
        Row: {
          ad_account_id: string
          created_at: string
          id: number
          key: string
          label: string
          text: string
        }
        Insert: {
          ad_account_id: string
          created_at?: string
          id?: number
          key: string
          label: string
          text: string
        }
        Update: {
          ad_account_id?: string
          created_at?: string
          id?: number
          key?: string
          label?: string
          text?: string
        }
        Relationships: []
      }
      assistants: {
        Row: {
          assistant_type: string
          chat_enabled: boolean | null
          connected_account_id: string | null
          created_at: string
          id: string
          is_approved: boolean
          openai_assistant_id: string | null
          openai_assistant_name: string | null
          openai_thread_id: string | null
          openai_vector_store_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assistant_type?: string
          chat_enabled?: boolean | null
          connected_account_id?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          openai_assistant_id?: string | null
          openai_assistant_name?: string | null
          openai_thread_id?: string | null
          openai_vector_store_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assistant_type?: string
          chat_enabled?: boolean | null
          connected_account_id?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          openai_assistant_id?: string | null
          openai_assistant_name?: string | null
          openai_thread_id?: string | null
          openai_vector_store_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_assistants_connected_account"
            columns: ["connected_account_id"]
            isOneToOne: true
            referencedRelation: "connected_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_insights: {
        Row: {
          country: string | null
          country_code: string | null
          created_at: string | null
          embedding: string | null
          id: string
          is_latest: boolean
          platform_account_id: string
          questions_by_niche: Json | null
          selected_social_platforms: string[] | null
          trends_and_events: Json | null
          updated_at: string | null
          version: number
          week_start_date: string | null
        }
        Insert: {
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_latest?: boolean
          platform_account_id: string
          questions_by_niche?: Json | null
          selected_social_platforms?: string[] | null
          trends_and_events?: Json | null
          updated_at?: string | null
          version?: number
          week_start_date?: string | null
        }
        Update: {
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_latest?: boolean
          platform_account_id?: string
          questions_by_niche?: Json | null
          selected_social_platforms?: string[] | null
          trends_and_events?: Json | null
          updated_at?: string | null
          version?: number
          week_start_date?: string | null
        }
        Relationships: []
      }
      brand_insights_events: {
        Row: {
          brand_id: string | null
          created_at: string | null
          description: string | null
          embedding: string | null
          event_date: string | null
          generation_id: string
          id: string
          is_selected: boolean | null
          last_used_at: string | null
          opportunity: string | null
          platform_account_id: string | null
          times_used: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          event_date?: string | null
          generation_id: string
          id?: string
          is_selected?: boolean | null
          last_used_at?: string | null
          opportunity?: string | null
          platform_account_id?: string | null
          times_used?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          event_date?: string | null
          generation_id?: string
          id?: string
          is_selected?: boolean | null
          last_used_at?: string | null
          opportunity?: string | null
          platform_account_id?: string | null
          times_used?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_insights_events_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "brand_insights_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_insights_generations: {
        Row: {
          brand_id: string | null
          country: string | null
          created_at: string | null
          generated_by: string | null
          id: string
          platform_account_id: string | null
          status: string | null
          total_events: number | null
          total_questions: number | null
          total_trends: number | null
          updated_at: string | null
          week_start_date: string
        }
        Insert: {
          brand_id?: string | null
          country?: string | null
          created_at?: string | null
          generated_by?: string | null
          id?: string
          platform_account_id?: string | null
          status?: string | null
          total_events?: number | null
          total_questions?: number | null
          total_trends?: number | null
          updated_at?: string | null
          week_start_date: string
        }
        Update: {
          brand_id?: string | null
          country?: string | null
          created_at?: string | null
          generated_by?: string | null
          id?: string
          platform_account_id?: string | null
          status?: string | null
          total_events?: number | null
          total_questions?: number | null
          total_trends?: number | null
          updated_at?: string | null
          week_start_date?: string
        }
        Relationships: []
      }
      brand_insights_questions: {
        Row: {
          brand_id: string | null
          content_type_suggestion: string | null
          created_at: string | null
          embedding: string | null
          generation_id: string
          id: string
          is_selected: boolean | null
          last_used_at: string | null
          niche: string
          platform_account_id: string | null
          question_text: string
          social_platform: string | null
          times_used: number | null
          updated_at: string | null
          why_relevant: string | null
        }
        Insert: {
          brand_id?: string | null
          content_type_suggestion?: string | null
          created_at?: string | null
          embedding?: string | null
          generation_id: string
          id?: string
          is_selected?: boolean | null
          last_used_at?: string | null
          niche: string
          platform_account_id?: string | null
          question_text: string
          social_platform?: string | null
          times_used?: number | null
          updated_at?: string | null
          why_relevant?: string | null
        }
        Update: {
          brand_id?: string | null
          content_type_suggestion?: string | null
          created_at?: string | null
          embedding?: string | null
          generation_id?: string
          id?: string
          is_selected?: boolean | null
          last_used_at?: string | null
          niche?: string
          platform_account_id?: string | null
          question_text?: string
          social_platform?: string | null
          times_used?: number | null
          updated_at?: string | null
          why_relevant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_insights_questions_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "brand_insights_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_insights_trends: {
        Row: {
          brand_id: string | null
          created_at: string | null
          description: string | null
          embedding: string | null
          generation_id: string
          id: string
          is_selected: boolean | null
          last_used_at: string | null
          platform_account_id: string | null
          relevance_to_brand: string | null
          source: string | null
          times_used: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          generation_id: string
          id?: string
          is_selected?: boolean | null
          last_used_at?: string | null
          platform_account_id?: string | null
          relevance_to_brand?: string | null
          source?: string | null
          times_used?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          generation_id?: string
          id?: string
          is_selected?: boolean | null
          last_used_at?: string | null
          platform_account_id?: string | null
          relevance_to_brand?: string | null
          source?: string | null
          times_used?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_insights_trends_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "brand_insights_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_drafts: {
        Row: {
          ad_account_id: string
          campaign_name: string | null
          created_at: string
          draft_data: Json
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_account_id: string
          campaign_name?: string | null
          created_at?: string
          draft_data: Json
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_account_id?: string
          campaign_name?: string | null
          created_at?: string
          draft_data?: Json
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      client_submissions: {
        Row: {
          error_message: string | null
          form_data: Json
          report_openai_file_id: string | null
          status: string
          submission_id: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          error_message?: string | null
          form_data: Json
          report_openai_file_id?: string | null
          status?: string
          submission_id?: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          error_message?: string | null
          form_data?: Json
          report_openai_file_id?: string | null
          status?: string
          submission_id?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          biography: string | null
          created_at: string | null
          ig_user_id: string
          last_scraped_at: string | null
          profile_pic_url: string | null
          updated_at: string | null
          username: string
          verified: boolean | null
        }
        Insert: {
          biography?: string | null
          created_at?: string | null
          ig_user_id: string
          last_scraped_at?: string | null
          profile_pic_url?: string | null
          updated_at?: string | null
          username: string
          verified?: boolean | null
        }
        Update: {
          biography?: string | null
          created_at?: string | null
          ig_user_id?: string
          last_scraped_at?: string | null
          profile_pic_url?: string | null
          updated_at?: string | null
          username?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      connected_accounts: {
        Row: {
          access_token: string | null
          account_name: string | null
          business_context_prompt: string | null
          client_account_id: string
          client_account_name: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          media_plan_prompt: string | null
          metadata: Json | null
          platform_type: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          account_name?: string | null
          business_context_prompt?: string | null
          client_account_id: string
          client_account_name: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          media_plan_prompt?: string | null
          metadata?: Json | null
          platform_type: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          account_name?: string | null
          business_context_prompt?: string | null
          client_account_id?: string
          client_account_name?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          media_plan_prompt?: string | null
          metadata?: Json | null
          platform_type?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_grid_versions: {
        Row: {
          content_grid_id: string | null
          created_at: string
          grid_data: Json
          grid_id: string | null
          id: string
          notes: string | null
          version_number: number
        }
        Insert: {
          content_grid_id?: string | null
          created_at?: string
          grid_data: Json
          grid_id?: string | null
          id?: string
          notes?: string | null
          version_number: number
        }
        Update: {
          content_grid_id?: string | null
          created_at?: string
          grid_data?: Json
          grid_id?: string | null
          id?: string
          notes?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_grid_versions_content_grid_id_fkey"
            columns: ["content_grid_id"]
            isOneToOne: false
            referencedRelation: "generated_content_grids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_grid_versions_grid_id_fkey"
            columns: ["grid_id"]
            isOneToOne: false
            referencedRelation: "generated_content_grids"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_content_grids: {
        Row: {
          assistant_entry_id: string | null
          connected_account_id: string | null
          created_at: string
          generated_content_data: Json
          generation_timestamp: string
          id: string
          is_positive_feedback: boolean | null
          openai_assistant_id_ref: string
          openai_thread_id: string
          original_prompt_data: Json | null
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assistant_entry_id?: string | null
          connected_account_id?: string | null
          created_at?: string
          generated_content_data: Json
          generation_timestamp?: string
          id?: string
          is_positive_feedback?: boolean | null
          openai_assistant_id_ref: string
          openai_thread_id: string
          original_prompt_data?: Json | null
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assistant_entry_id?: string | null
          connected_account_id?: string | null
          created_at?: string
          generated_content_data?: Json
          generation_timestamp?: string
          id?: string
          is_positive_feedback?: boolean | null
          openai_assistant_id_ref?: string
          openai_thread_id?: string
          original_prompt_data?: Json | null
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_generated_content_grids_assistants"
            columns: ["assistant_entry_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_content_grids_connected_account_id_fkey"
            columns: ["connected_account_id"]
            isOneToOne: false
            referencedRelation: "connected_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_jobs: {
        Row: {
          account_id: string
          aspect_ratio: string | null
          created_at: string
          error_message: string | null
          final_asset_url: string | null
          id: string
          output_path: string
          prompt: string | null
          status: string
          user_id: string
        }
        Insert: {
          account_id: string
          aspect_ratio?: string | null
          created_at?: string
          error_message?: string | null
          final_asset_url?: string | null
          id?: string
          output_path: string
          prompt?: string | null
          status?: string
          user_id: string
        }
        Update: {
          account_id?: string
          aspect_ratio?: string | null
          created_at?: string
          error_message?: string | null
          final_asset_url?: string | null
          id?: string
          output_path?: string
          prompt?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      impersonation_logs: {
        Row: {
          admin_user_id: string
          created_at: string
          ended_at: string | null
          id: string
          impersonated_user_id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          impersonated_user_id: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          impersonated_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_logs_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_logs_impersonated_user_id_fkey"
            columns: ["impersonated_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      JainaDocuments: {
        Row: {
          ad_account_id: string
          content: string | null
          created_at: string
          embedding: string | null
          file_name: string
          file_path: string
          file_type: string | null
          id: number
        }
        Insert: {
          ad_account_id: string
          content?: string | null
          created_at?: string
          embedding?: string | null
          file_name: string
          file_path: string
          file_type?: string | null
          id?: number
        }
        Update: {
          ad_account_id?: string
          content?: string | null
          created_at?: string
          embedding?: string | null
          file_name?: string
          file_path?: string
          file_type?: string | null
          id?: number
        }
        Relationships: []
      }
      locations: {
        Row: {
          address: string
          created_at: string | null
          id: string
          label: string | null
        }
        Insert: {
          address: string
          created_at?: string | null
          id?: string
          label?: string | null
        }
        Update: {
          address?: string
          created_at?: string | null
          id?: string
          label?: string | null
        }
        Relationships: []
      }
      mock_connected_accounts: {
        Row: {
          created_at: string
          data: Json
          id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
        }
        Relationships: []
      }
      organic_posts: {
        Row: {
          caption: string | null
          created_at: string | null
          embedding: string | null
          id: number
          instagram_account_id: string | null
          is_carousel: boolean
          media_urls: string[]
          platform: string
          post_types: string[]
          published_media_id: string | null
          user_email: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: never
          instagram_account_id?: string | null
          is_carousel: boolean
          media_urls: string[]
          platform: string
          post_types: string[]
          published_media_id?: string | null
          user_email?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: never
          instagram_account_id?: string | null
          is_carousel?: boolean
          media_urls?: string[]
          platform?: string
          post_types?: string[]
          published_media_id?: string | null
          user_email?: string | null
        }
        Relationships: []
      }
      organic_reports: {
        Row: {
          account_id: string
          analysis_data: Json | null
          created_at: string
          date_range: Json
          error_message: string | null
          frequency: string
          id: string
          instagram_id: string | null
          pdf_status: string | null
          pdf_url: string | null
          platform: string
          posts_count: number | null
          report_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          analysis_data?: Json | null
          created_at?: string
          date_range: Json
          error_message?: string | null
          frequency: string
          id?: string
          instagram_id?: string | null
          pdf_status?: string | null
          pdf_url?: string | null
          platform: string
          posts_count?: number | null
          report_id: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          analysis_data?: Json | null
          created_at?: string
          date_range?: Json
          error_message?: string | null
          frequency?: string
          id?: string
          instagram_id?: string | null
          pdf_status?: string | null
          pdf_url?: string | null
          platform?: string
          posts_count?: number | null
          report_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_connections: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string | null
          created_at: string
          id: number
          is_connected: boolean
          platform_id: string
          platform_name: string | null
          raw_data: Json | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          created_at?: string
          id?: number
          is_connected?: boolean
          platform_id: string
          platform_name?: string | null
          raw_data?: Json | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          created_at?: string
          id?: number
          is_connected?: boolean
          platform_id?: string
          platform_name?: string | null
          raw_data?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          how_noticed: string | null
          id: string
          is_admin: boolean | null
          is_root: boolean | null
          jaina_access: boolean
          name: string | null
          Trend_Access: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          how_noticed?: string | null
          id: string
          is_admin?: boolean | null
          is_root?: boolean | null
          jaina_access?: boolean
          name?: string | null
          Trend_Access?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          how_noticed?: string | null
          id?: string
          is_admin?: boolean | null
          is_root?: boolean | null
          jaina_access?: boolean
          name?: string | null
          Trend_Access?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          ad_groups: string[] | null
          campaigns: string[] | null
          client_id: string
          client_name: string
          created_at: string
          end_requested_date: string
          id: string
          is_example: boolean | null
          pdf_report: string | null
          platform_main_account: string
          platform_type: string
          report_bulk_data: Json | null
          report_id: string | null
          report_name: string
          report_type: string
          scheduled_execution_date: string | null
          scheduled_report_id: string | null
          start_requested_date: string
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
          user_id: string
          variable_analyze: string[]
        }
        Insert: {
          ad_groups?: string[] | null
          campaigns?: string[] | null
          client_id: string
          client_name: string
          created_at?: string
          end_requested_date: string
          id?: string
          is_example?: boolean | null
          pdf_report?: string | null
          platform_main_account: string
          platform_type: string
          report_bulk_data?: Json | null
          report_id?: string | null
          report_name: string
          report_type: string
          scheduled_execution_date?: string | null
          scheduled_report_id?: string | null
          start_requested_date: string
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
          user_id: string
          variable_analyze: string[]
        }
        Update: {
          ad_groups?: string[] | null
          campaigns?: string[] | null
          client_id?: string
          client_name?: string
          created_at?: string
          end_requested_date?: string
          id?: string
          is_example?: boolean | null
          pdf_report?: string | null
          platform_main_account?: string
          platform_type?: string
          report_bulk_data?: Json | null
          report_id?: string | null
          report_name?: string
          report_type?: string
          scheduled_execution_date?: string | null
          scheduled_report_id?: string | null
          start_requested_date?: string
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
          user_id?: string
          variable_analyze?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "reports_scheduled_report_id_fkey"
            columns: ["scheduled_report_id"]
            isOneToOne: false
            referencedRelation: "scheduled_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_reports: {
        Row: {
          client_id: string
          client_name: string
          created_at: string | null
          id: string
          last_execution: string | null
          next_execution: string | null
          platform_main_account: string
          platform_type: string
          report_bulk_data: Json | null
          report_name: string
          report_type: string
          status: Database["public"]["Enums"]["scheduled_report_status"]
          updated_at: string | null
          user_id: string
          variable_analyze: string[]
        }
        Insert: {
          client_id: string
          client_name: string
          created_at?: string | null
          id?: string
          last_execution?: string | null
          next_execution?: string | null
          platform_main_account: string
          platform_type: string
          report_bulk_data?: Json | null
          report_name: string
          report_type: string
          status?: Database["public"]["Enums"]["scheduled_report_status"]
          updated_at?: string | null
          user_id: string
          variable_analyze: string[]
        }
        Update: {
          client_id?: string
          client_name?: string
          created_at?: string | null
          id?: string
          last_execution?: string | null
          next_execution?: string | null
          platform_main_account?: string
          platform_type?: string
          report_bulk_data?: Json | null
          report_name?: string
          report_type?: string
          status?: Database["public"]["Enums"]["scheduled_report_status"]
          updated_at?: string | null
          user_id?: string
          variable_analyze?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ScheduledPosts: {
        Row: {
          created_at: string | null
          encrypted_refresh_token: string
          error_message: string | null
          id: string
          post_content: Json
          posted_at: string | null
          scheduled_for: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          encrypted_refresh_token: string
          error_message?: string | null
          id?: string
          post_content: Json
          posted_at?: string | null
          scheduled_for: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          encrypted_refresh_token?: string
          error_message?: string | null
          id?: string
          post_content?: Json
          posted_at?: string | null
          scheduled_for?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      schedules: {
        Row: {
          created_at: string | null
          day_type: string
          departure_time: string
          destination: string
          id: string
          origin: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_type: string
          departure_time: string
          destination: string
          id?: string
          origin: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_type?: string
          departure_time?: string
          destination?: string
          id?: string
          origin?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      user_competitors: {
        Row: {
          created_at: string | null
          ig_user_id: string
          platform_account_id: string
        }
        Insert: {
          created_at?: string | null
          ig_user_id: string
          platform_account_id: string
        }
        Update: {
          created_at?: string | null
          ig_user_id?: string
          platform_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_competitors_ig_user_id_fkey"
            columns: ["ig_user_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["ig_user_id"]
          },
        ]
      }
    }
    Views: {
      meta_targeting_behaviors: {
        Row: {
          audience_size_lower_bound: number | null
          audience_size_upper_bound: number | null
          created_at: string | null
          description: string | null
          embedding: string | null
          embedding_model: string | null
          id: number | null
          is_deprecated: boolean | null
          is_real_time_cluster: boolean | null
          locale: string | null
          name: string | null
          path: string[] | null
          platform: string | null
          platform_category_id: string | null
          source_payload: Json | null
          updated_at: string | null
        }
        Insert: {
          audience_size_lower_bound?: number | null
          audience_size_upper_bound?: number | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          embedding_model?: string | null
          id?: number | null
          is_deprecated?: boolean | null
          is_real_time_cluster?: boolean | null
          locale?: string | null
          name?: string | null
          path?: string[] | null
          platform?: string | null
          platform_category_id?: string | null
          source_payload?: Json | null
          updated_at?: string | null
        }
        Update: {
          audience_size_lower_bound?: number | null
          audience_size_upper_bound?: number | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          embedding_model?: string | null
          id?: number | null
          is_deprecated?: boolean | null
          is_real_time_cluster?: boolean | null
          locale?: string | null
          name?: string | null
          path?: string[] | null
          platform?: string | null
          platform_category_id?: string | null
          source_payload?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      meta_targeting_demographics: {
        Row: {
          audience_size_lower_bound: number | null
          audience_size_upper_bound: number | null
          category: string | null
          created_at: string | null
          description: string | null
          embedding: string | null
          embedding_model: string | null
          id: number | null
          is_deprecated: boolean | null
          locale: string | null
          name: string | null
          path: string[] | null
          platform: string | null
          platform_category_id: string | null
          source_payload: Json | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          audience_size_lower_bound?: number | null
          audience_size_upper_bound?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          embedding_model?: string | null
          id?: number | null
          is_deprecated?: boolean | null
          locale?: string | null
          name?: string | null
          path?: string[] | null
          platform?: string | null
          platform_category_id?: string | null
          source_payload?: Json | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          audience_size_lower_bound?: number | null
          audience_size_upper_bound?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          embedding_model?: string | null
          id?: number | null
          is_deprecated?: boolean | null
          locale?: string | null
          name?: string | null
          path?: string[] | null
          platform?: string | null
          platform_category_id?: string | null
          source_payload?: Json | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      meta_targeting_interests: {
        Row: {
          audience_size_lower_bound: number | null
          audience_size_upper_bound: number | null
          created_at: string | null
          description: string | null
          embedding: string | null
          embedding_model: string | null
          id: number | null
          is_deprecated: boolean | null
          locale: string | null
          name: string | null
          path: string[] | null
          platform: string | null
          platform_category_id: string | null
          source_payload: Json | null
          updated_at: string | null
        }
        Insert: {
          audience_size_lower_bound?: number | null
          audience_size_upper_bound?: number | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          embedding_model?: string | null
          id?: number | null
          is_deprecated?: boolean | null
          locale?: string | null
          name?: string | null
          path?: string[] | null
          platform?: string | null
          platform_category_id?: string | null
          source_payload?: Json | null
          updated_at?: string | null
        }
        Update: {
          audience_size_lower_bound?: number | null
          audience_size_upper_bound?: number | null
          created_at?: string | null
          description?: string | null
          embedding?: string | null
          embedding_model?: string | null
          id?: number | null
          is_deprecated?: boolean | null
          locale?: string | null
          name?: string | null
          path?: string[] | null
          platform?: string | null
          platform_category_id?: string | null
          source_payload?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_impersonate: {
        Args: { admin_id: string; target_id: string }
        Returns: boolean
      }
      decrypt_token: { Args: { token_to_decrypt: string }; Returns: string }
      get_all_assistants_with_user_email: {
        Args: never
        Returns: {
          connected_account_id: string
          created_at: string
          id: string
          is_approved: boolean
          openai_assistant_id: string
          openai_assistant_name: string
          openai_thread_id: string
          openai_vector_store_id: string
          updated_at: string
          user_email: string
          user_id: string
        }[]
      }
      get_generation_stats: {
        Args: { p_generation_id: string }
        Returns: {
          generation_id: string
          selected_events: number
          selected_questions: number
          selected_trends: number
          total_events: number
          total_questions: number
          total_trends: number
        }[]
      }
      get_next_version_number: { Args: { grid_id: string }; Returns: number }
      get_uid_by_ad_account_id: {
        Args: { ad_account_id_to_check: string }
        Returns: string
      }
      get_uid_by_organic_account_id: {
        Args: { p_account_id: string }
        Returns: string
      }
      impersonate_user: {
        Args: { admin_id: string; target_id: string }
        Returns: Json
      }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      is_root: { Args: never; Returns: boolean }
      mark_brand_insight_as_selected: {
        Args: { p_item_id: string; p_item_type: string }
        Returns: boolean
      }
      match_ad_targeting: {
        Args: {
          p_match_count?: number
          p_match_threshold?: number
          p_query_embedding_text: string
          p_table: string
        }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "interests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      match_ad_targeting_behaviors: {
        Args: {
          p_match_count?: number
          p_match_threshold?: number
          p_query_embedding_text: string
        }
        Returns: {
          audience_size_lower_bound: number
          audience_size_upper_bound: number
          description: string
          distance: number
          id: string
          name: string
        }[]
      }
      match_ad_targeting_demographics: {
        Args: {
          p_match_count?: number
          p_match_threshold?: number
          p_query_embedding_text: string
        }
        Returns: {
          audience_size_lower_bound: number
          audience_size_upper_bound: number
          description: string
          distance: number
          id: string
          name: string
        }[]
      }
      match_ad_targeting_interests: {
        Args: {
          p_match_count?: number
          p_match_threshold?: number
          p_query_embedding_text: string
        }
        Returns: {
          audience_size_lower_bound: number
          audience_size_upper_bound: number
          description: string
          distance: number
          id: string
          name: string
        }[]
      }
      match_antonidas_documents:
        | {
            Args: {
              p_instagram_business_account_id: string
              p_match_count: number
              p_match_threshold: number
              p_query_embeddings: string[]
              p_table_names: string[]
            }
            Returns: {
              content: string
              similarity: number
              source: string
            }[]
          }
        | {
            Args: {
              p_match_count: number
              p_match_threshold: number
              p_platform: string
              p_platform_account_id: string
              p_query_embeddings: string[]
              p_table_names: string[]
            }
            Returns: {
              content: string
              similarity: number
              source: string
            }[]
          }
      match_jaina_documents:
        | {
            Args: {
              p_ad_account_id: string
              p_match_count: number
              p_match_threshold: number
              p_query_embedding: string
            }
            Returns: {
              content: string
              file_name: string
              id: number
              similarity: number
            }[]
          }
        | {
            Args: {
              p_ad_account_id: string
              p_match_count: number
              p_match_threshold: number
              p_query_embeddings: string[]
            }
            Returns: {
              content: string
              file_name: string
              id: number
              similarity: number
            }[]
          }
      process_scheduled_reports: { Args: never; Returns: Json }
      search_brand_insights_events: {
        Args: {
          p_exclude_selected?: boolean
          p_limit?: number
          p_platform_account_id: string
          p_query_embedding: string
        }
        Returns: {
          created_at: string
          description: string
          event_date: string
          id: string
          opportunity: string
          similarity: number
          times_used: number
          title: string
        }[]
      }
      search_brand_insights_questions: {
        Args: {
          p_exclude_selected?: boolean
          p_limit?: number
          p_niche?: string
          p_platform_account_id: string
          p_query_embedding: string
          p_social_platform?: string
        }
        Returns: {
          content_type_suggestion: string
          created_at: string
          id: string
          niche: string
          question_text: string
          similarity: number
          social_platform: string
          times_used: number
          why_relevant: string
        }[]
      }
      search_brand_insights_trends: {
        Args: {
          p_exclude_selected?: boolean
          p_limit?: number
          p_platform_account_id: string
          p_query_embedding: string
        }
        Returns: {
          created_at: string
          description: string
          id: string
          relevance_to_brand: string
          similarity: number
          source: string
          times_used: number
          title: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      trigger_due_posts_publication: { Args: never; Returns: undefined }
      trigger_scheduled_reports: { Args: never; Returns: Json }
      upsert_stg_mongo_users_batch: { Args: { p_rows: Json }; Returns: Json }
    }
    Enums: {
      report_status: "in-progress" | "active" | "inactive" | "deleted"
      scheduled_report_status: "active" | "paused" | "failed" | "cancelled"
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
  public: {
    Enums: {
      report_status: ["in-progress", "active", "inactive", "deleted"],
      scheduled_report_status: ["active", "paused", "failed", "cancelled"],
    },
  },
} as const
