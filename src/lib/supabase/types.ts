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
      agent_sessions: {
        Row: {
          app_name: string
          created_at: string
          events: Json
          session_id: string
          state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          app_name: string
          created_at?: string
          events?: Json
          session_id: string
          state?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          app_name?: string
          created_at?: string
          events?: Json
          session_id?: string
          state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      brand_guideline_tags: {
        Row: {
          created_at: string
          description: string
          embedding: string | null
          embedding_model: string | null
          guideline_id: string
          id: string
          label: string
          section: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          embedding?: string | null
          embedding_model?: string | null
          guideline_id: string
          id?: string
          label: string
          section: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          embedding?: string | null
          embedding_model?: string | null
          guideline_id?: string
          id?: string
          label?: string
          section?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_guideline_tags_guideline_id_fkey"
            columns: ["guideline_id"]
            isOneToOne: false
            referencedRelation: "brand_guidelines"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_guidelines: {
        Row: {
          approved_at: string | null
          brand_id: string
          colors: Json
          created_at: string
          created_by: string | null
          id: string
          logo: Json
          notes: string | null
          purpose: string
          stationery: Json
          status: string
          style_design: Json
          typography: Json
          updated_at: string
          updated_by: string | null
          verbal_identity: Json
          version: number
        }
        Insert: {
          approved_at?: string | null
          brand_id: string
          colors: Json
          created_at?: string
          created_by?: string | null
          id?: string
          logo: Json
          notes?: string | null
          purpose: string
          stationery: Json
          status?: string
          style_design: Json
          typography: Json
          updated_at?: string
          updated_by?: string | null
          verbal_identity: Json
          version?: number
        }
        Update: {
          approved_at?: string | null
          brand_id?: string
          colors?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          logo?: Json
          notes?: string | null
          purpose?: string
          stationery?: Json
          status?: string
          style_design?: Json
          typography?: Json
          updated_at?: string
          updated_by?: string | null
          verbal_identity?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_guidelines_brand_id_fkey"
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
          asset_pk: string | null
          asset_table: string | null
          brand_profile_id: string
          business_id: string | null
          created_at: string
          external_id: string | null
          id: string
          integration_account_id: string
          integration_id: string | null
          linked_at: string | null
          metadata: Json | null
          name: string | null
          settings: Json
          type: string | null
          updated_at: string
        }
        Insert: {
          alias?: string | null
          asset_pk?: string | null
          asset_table?: string | null
          brand_profile_id: string
          business_id?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          integration_account_id: string
          integration_id?: string | null
          linked_at?: string | null
          metadata?: Json | null
          name?: string | null
          settings?: Json
          type?: string | null
          updated_at?: string
        }
        Update: {
          alias?: string | null
          asset_pk?: string | null
          asset_table?: string | null
          brand_profile_id?: string
          business_id?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          integration_account_id?: string
          integration_id?: string | null
          linked_at?: string | null
          metadata?: Json | null
          name?: string | null
          settings?: Json
          type?: string | null
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
      brand_profile_user_integrations: {
        Row: {
          brand_profile_id: string
          created_at: string
          id: string
          integration_id: string
          updated_at: string
        }
        Insert: {
          brand_profile_id: string
          created_at?: string
          id?: string
          integration_id: string
          updated_at?: string
        }
        Update: {
          brand_profile_id?: string
          created_at?: string
          id?: string
          integration_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_profiles_user_integrations_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_profiles_user_integrations_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "user_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profiles: {
        Row: {
          active: boolean
          brand_name: string
          completed_at: string | null
          context: Json
          created_at: string
          created_by: string
          id: string
          logo_path: string | null
          tier: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand_name: string
          completed_at?: string | null
          context?: Json
          created_at?: string
          created_by: string
          id?: string
          logo_path?: string | null
          tier?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand_name?: string
          completed_at?: string | null
          context?: Json
          created_at?: string
          created_by?: string
          id?: string
          logo_path?: string | null
          tier?: number
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
          active: boolean
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
          active?: boolean
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
          active?: boolean
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
      canvas_rooms: {
        Row: {
          brand_profile_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          brand_profile_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          brand_profile_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_rooms_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_sessions: {
        Row: {
          brand_profile_id: string
          created_at: string
          deleted_edge_ids: Json | null
          deleted_node_ids: Json | null
          editor_session_id: string | null
          editor_user_id: string | null
          edges: Json
          nodes: Json
          revision: number
          room_id: string
          updated_at: string
        }
        Insert: {
          brand_profile_id: string
          created_at?: string
          deleted_edge_ids?: Json | null
          deleted_node_ids?: Json | null
          editor_session_id?: string | null
          editor_user_id?: string | null
          edges?: Json
          nodes?: Json
          revision?: number
          room_id: string
          updated_at?: string
        }
        Update: {
          brand_profile_id?: string
          created_at?: string
          deleted_edge_ids?: Json | null
          deleted_node_ids?: Json | null
          editor_session_id?: string | null
          editor_user_id?: string | null
          edges?: Json
          nodes?: Json
          revision?: number
          room_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_sessions_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "canvas_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_workflows: {
        Row: {
          brand_profile_id: string
          created_at: string
          description: string | null
          edges: Json
          id: string
          metadata: Json | null
          name: string
          nodes: Json
          updated_at: string
        }
        Insert: {
          brand_profile_id: string
          created_at?: string
          description?: string | null
          edges?: Json
          id?: string
          metadata?: Json | null
          name: string
          nodes?: Json
          updated_at?: string
        }
        Update: {
          brand_profile_id?: string
          created_at?: string
          description?: string | null
          edges?: Json
          id?: string
          metadata?: Json | null
          name?: string
          nodes?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_workflows_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          brand_profile_id: string
          content: string
          created_at: string
          id: string
          room_id: string
          user_avatar: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          brand_profile_id: string
          content: string
          created_at?: string
          id?: string
          room_id?: string
          user_avatar?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          brand_profile_id?: string
          content?: string
          created_at?: string
          id?: string
          room_id?: string
          user_avatar?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_accounts_assets: {
        Row: {
          ad_account_id: string | null
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
          ad_account_id?: string | null
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
          ad_account_id?: string | null
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
          revoked_at: string | null
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
          revoked_at?: string | null
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
          revoked_at?: string | null
          role?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      organic_calendar_drafts: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          platform_account_id: string
          position: Json | null
          published_at: string | null
          scheduled_date: string | null
          slot_data: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          platform_account_id: string
          position?: Json | null
          published_at?: string | null
          scheduled_date?: string | null
          slot_data: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          platform_account_id?: string
          position?: Json | null
          published_at?: string | null
          scheduled_date?: string | null
          slot_data?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organic_calendar_drafts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          brand_profile_id: string
          created_at: string
          email: string | null
          id: string
          role: string
          tier: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_profile_id: string
          created_at?: string
          email?: string | null
          id?: string
          role: string
          tier?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_profile_id?: string
          created_at?: string
          email?: string | null
          id?: string
          role?: string
          tier?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          brand_profile_id: string
          category: string
          created_at: string
          id: string
          name: string
          prompt: string
          source: string
          updated_at: string
        }
        Insert: {
          brand_profile_id: string
          category?: string
          created_at?: string
          id?: string
          name: string
          prompt: string
          source?: string
          updated_at?: string
        }
        Update: {
          brand_profile_id?: string
          category?: string
          created_at?: string
          id?: string
          name?: string
          prompt?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_templates_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reporting_cache: {
        Row: {
          account_id: string
          cache_key: string
          created_at: string
          expires_at: string
          fetched_at: string
          id: string
          payload: Json
          provider: string
          range_preset: string
          range_since: string | null
          range_until: string | null
          scope_id: string
          scope_type: string
          updated_at: string
        }
        Insert: {
          account_id: string
          cache_key: string
          created_at?: string
          expires_at: string
          fetched_at?: string
          id?: string
          payload: Json
          provider: string
          range_preset: string
          range_since?: string | null
          range_until?: string | null
          scope_id: string
          scope_type: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          cache_key?: string
          created_at?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          payload?: Json
          provider?: string
          range_preset?: string
          range_since?: string | null
          range_until?: string | null
          scope_id?: string
          scope_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      strategic_analyses: {
        Row: {
          active: boolean
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
          active?: boolean
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
          active?: boolean
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
      cleanup_old_canvas_sessions: { Args: never; Returns: undefined }
      cleanup_old_chat_messages: { Args: never; Returns: undefined }
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
      get_active_brand_id: { Args: never; Returns: string }
      get_brand_timezone: { Args: { brand_id: string }; Returns: string }
      has_brand_access: { Args: { brand_id: string }; Returns: boolean }
      is_brand_admin: { Args: { brand_id: string }; Returns: boolean }
      reporting_cache_get_organic_metrics_cache: {
        Args: {
          p_external_account_id: string
          p_platform: string
          p_range_since: string
          p_range_until: string
          p_request_hash: string
        }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "organic_metrics_cache"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reporting_cache_get_organic_metrics_cache_range: {
        Args: {
          p_external_account_id: string
          p_platform: string
          p_range_since: string
          p_range_until: string
          p_request_hash: string
        }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "organic_metrics_cache"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reporting_cache_upsert_organic_metrics_cache: {
        Args: {
          p_brand_id: string
          p_comparison: Json
          p_external_account_id: string
          p_fetched_at: string
          p_integration_account_id: string
          p_metrics: Json
          p_platform: string
          p_range_json: Json
          p_range_preset: string
          p_range_since: string
          p_range_until: string
          p_raw_response: Json
          p_request_hash: string
        }
        Returns: unknown
        SetofOptions: {
          from: "*"
          to: "organic_metrics_cache"
          isOneToOne: true
          isSetofReturn: false
        }
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
