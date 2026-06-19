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
  brand_integrations: {
    Tables: {
      google_ad_accounts: {
        Row: {
          brand_integration_id: string
          currency_code: string | null
          customer_id: string
          descriptive_name: string | null
          id: string
          raw_profile: Json | null
          synced_at: string | null
          time_zone: string | null
        }
        Insert: {
          brand_integration_id: string
          currency_code?: string | null
          customer_id: string
          descriptive_name?: string | null
          id?: string
          raw_profile?: Json | null
          synced_at?: string | null
          time_zone?: string | null
        }
        Update: {
          brand_integration_id?: string
          currency_code?: string | null
          customer_id?: string
          descriptive_name?: string | null
          id?: string
          raw_profile?: Json | null
          synced_at?: string | null
          time_zone?: string | null
        }
        Relationships: []
      }
      google_dv360_advertisers: {
        Row: {
          advertiser_id: string
          brand_integration_id: string
          display_name: string | null
          id: string
          partner_id: string | null
          raw_profile: Json | null
          synced_at: string | null
        }
        Insert: {
          advertiser_id: string
          brand_integration_id: string
          display_name?: string | null
          id?: string
          partner_id?: string | null
          raw_profile?: Json | null
          synced_at?: string | null
        }
        Update: {
          advertiser_id?: string
          brand_integration_id?: string
          display_name?: string | null
          id?: string
          partner_id?: string | null
          raw_profile?: Json | null
          synced_at?: string | null
        }
        Relationships: []
      }
      google_youtube_channels: {
        Row: {
          brand_integration_id: string
          channel_id: string
          id: string
          raw_profile: Json | null
          synced_at: string | null
          title: string | null
        }
        Insert: {
          brand_integration_id: string
          channel_id: string
          id?: string
          raw_profile?: Json | null
          synced_at?: string | null
          title?: string | null
        }
        Update: {
          brand_integration_id?: string
          channel_id?: string
          id?: string
          raw_profile?: Json | null
          synced_at?: string | null
          title?: string | null
        }
        Relationships: []
      }
      integration_assets: {
        Row: {
          brand_integration_id: string
          provider: string
          snapshot: Json
          synced_at: string
        }
        Insert: {
          brand_integration_id: string
          provider: string
          snapshot?: Json
          synced_at?: string
        }
        Update: {
          brand_integration_id?: string
          provider?: string
          snapshot?: Json
          synced_at?: string
        }
        Relationships: []
      }
      meta_ad_accounts: {
        Row: {
          ad_account_id: string
          ad_account_id_prefixed: string | null
          brand_integration_id: string
          business_id: string | null
          id: string
          is_business: boolean | null
          name: string | null
          permissions: Json | null
          raw_profile: Json | null
          synced_at: string | null
        }
        Insert: {
          ad_account_id: string
          ad_account_id_prefixed?: string | null
          brand_integration_id: string
          business_id?: string | null
          id?: string
          is_business?: boolean | null
          name?: string | null
          permissions?: Json | null
          raw_profile?: Json | null
          synced_at?: string | null
        }
        Update: {
          ad_account_id?: string
          ad_account_id_prefixed?: string | null
          brand_integration_id?: string
          business_id?: string | null
          id?: string
          is_business?: boolean | null
          name?: string | null
          permissions?: Json | null
          raw_profile?: Json | null
          synced_at?: string | null
        }
        Relationships: []
      }
      meta_businesses: {
        Row: {
          brand_integration_id: string
          business_id: string
          id: string
          name: string | null
          raw_profile: Json | null
        }
        Insert: {
          brand_integration_id: string
          business_id: string
          id?: string
          name?: string | null
          raw_profile?: Json | null
        }
        Update: {
          brand_integration_id?: string
          business_id?: string
          id?: string
          name?: string | null
          raw_profile?: Json | null
        }
        Relationships: []
      }
      meta_instagram_accounts: {
        Row: {
          ad_account_id: string | null
          brand_integration_id: string
          business_id: string | null
          id: string
          ig_id: string
          raw_profile: Json | null
          username: string | null
        }
        Insert: {
          ad_account_id?: string | null
          brand_integration_id: string
          business_id?: string | null
          id?: string
          ig_id: string
          raw_profile?: Json | null
          username?: string | null
        }
        Update: {
          ad_account_id?: string | null
          brand_integration_id?: string
          business_id?: string | null
          id?: string
          ig_id?: string
          raw_profile?: Json | null
          username?: string | null
        }
        Relationships: []
      }
      meta_pages: {
        Row: {
          ad_account_id: string | null
          brand_integration_id: string
          business_id: string | null
          id: string
          name: string | null
          page_id: string
          raw_profile: Json | null
        }
        Insert: {
          ad_account_id?: string | null
          brand_integration_id: string
          business_id?: string | null
          id?: string
          name?: string | null
          page_id: string
          raw_profile?: Json | null
        }
        Update: {
          ad_account_id?: string | null
          brand_integration_id?: string
          business_id?: string | null
          id?: string
          name?: string | null
          page_id?: string
          raw_profile?: Json | null
        }
        Relationships: []
      }
      meta_threads_accounts: {
        Row: {
          ad_account_id: string | null
          brand_integration_id: string
          business_id: string | null
          id: string
          raw_profile: Json | null
          threads_user_id: string
          username: string | null
        }
        Insert: {
          ad_account_id?: string | null
          brand_integration_id: string
          business_id?: string | null
          id?: string
          raw_profile?: Json | null
          threads_user_id: string
          username?: string | null
        }
        Update: {
          ad_account_id?: string | null
          brand_integration_id?: string
          business_id?: string | null
          id?: string
          raw_profile?: Json | null
          threads_user_id?: string
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      set_integration_snapshot: {
        Args: {
          p_brand_integration_id: string
          p_provider: string
          p_snapshot: Json
          p_synced_at: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  brand_profiles: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          brand_profile_id: string | null
          created_at: string
          id: string
          metadata: Json
          request_id: string | null
          status: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          brand_profile_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          request_id?: string | null
          status?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          brand_profile_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          request_id?: string | null
          status?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_user_directory: {
        Row: {
          auth_created_at: string | null
          email: string
          is_admin: boolean
          name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_created_at?: string | null
          email: string
          is_admin?: boolean
          name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_created_at?: string | null
          email?: string
          is_admin?: boolean
          name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      brand_competitors: {
        Row: {
          brand_id: string
          created_at: string | null
          id: string
          instagram_followers_count: number | null
          instagram_handle: string | null
          instagram_name: string | null
          instagram_user_id: string | null
          instagram_username: string | null
          is_user_tagged: boolean
          is_verified: boolean | null
          last_resolved_at: string | null
          meta_page_id: string | null
          metadata: Json | null
          name: string
          tagged_at: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string | null
          id?: string
          instagram_followers_count?: number | null
          instagram_handle?: string | null
          instagram_name?: string | null
          instagram_user_id?: string | null
          instagram_username?: string | null
          is_user_tagged?: boolean
          is_verified?: boolean | null
          last_resolved_at?: string | null
          meta_page_id?: string | null
          metadata?: Json | null
          name: string
          tagged_at?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string | null
          id?: string
          instagram_followers_count?: number | null
          instagram_handle?: string | null
          instagram_name?: string | null
          instagram_user_id?: string | null
          instagram_username?: string | null
          is_user_tagged?: boolean
          is_verified?: boolean | null
          last_resolved_at?: string | null
          meta_page_id?: string | null
          metadata?: Json | null
          name?: string
          tagged_at?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_competitors_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
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
          category: string
          created_at: string
          error_code: string | null
          error_message: string | null
          external_url: string | null
          id: string
          kind: string | null
          mime_type: string | null
          name: string
          page_count: number | null
          preview_path: string | null
          progress_percent: number | null
          progress_step: string | null
          size: number | null
          source: string
          status: string
          storage_path: string | null
          text_excerpt: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          category?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          external_url?: string | null
          id: string
          kind?: string | null
          mime_type?: string | null
          name: string
          page_count?: number | null
          preview_path?: string | null
          progress_percent?: number | null
          progress_step?: string | null
          size?: number | null
          source: string
          status?: string
          storage_path?: string | null
          text_excerpt?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          category?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          external_url?: string | null
          id?: string
          kind?: string | null
          mime_type?: string | null
          name?: string
          page_count?: number | null
          preview_path?: string | null
          progress_percent?: number | null
          progress_step?: string | null
          size?: number | null
          source?: string
          status?: string
          storage_path?: string | null
          text_excerpt?: string | null
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
      brand_guideline_jobs: {
        Row: {
          attempts: number
          brand_id: string
          claimed_at: string | null
          completed_at: string | null
          enqueued_at: string
          error: Json | null
          heartbeat_at: string | null
          job_id: string
          payload: Json
          status: Database["brand_profiles"]["Enums"]["brand_guideline_job_status"]
          trigger: string
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          brand_id: string
          claimed_at?: string | null
          completed_at?: string | null
          enqueued_at?: string
          error?: Json | null
          heartbeat_at?: string | null
          job_id?: string
          payload?: Json
          status?: Database["brand_profiles"]["Enums"]["brand_guideline_job_status"]
          trigger?: string
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          brand_id?: string
          claimed_at?: string | null
          completed_at?: string | null
          enqueued_at?: string
          error?: Json | null
          heartbeat_at?: string | null
          job_id?: string
          payload?: Json
          status?: Database["brand_profiles"]["Enums"]["brand_guideline_job_status"]
          trigger?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_guideline_jobs_brand_fkey"
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
      brand_html_reports: {
        Row: {
          brand_id: string
          created_at: string | null
          created_by: string | null
          id: string
          metadata: Json | null
          public_url: string | null
          report_type: string[] | null
          storage_path: string
          title: string
          updated_at: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          metadata?: Json | null
          public_url?: string | null
          report_type?: string[] | null
          storage_path: string
          title: string
          updated_at?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          metadata?: Json | null
          public_url?: string | null
          report_type?: string[] | null
          storage_path?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_html_reports_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_integration_grants: {
        Row: {
          brand_profile_id: string
          granted_at: string
          granted_by: string
          id: string
          integration_id: string
          revoked_at: string | null
          revoked_by: string | null
          updated_at: string
        }
        Insert: {
          brand_profile_id: string
          granted_at?: string
          granted_by: string
          id?: string
          integration_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          updated_at?: string
        }
        Update: {
          brand_profile_id?: string
          granted_at?: string
          granted_by?: string
          id?: string
          integration_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_integration_grants_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_integration_grants_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "user_integrations"
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
          is_primary: boolean
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
          is_primary?: boolean
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
          is_primary?: boolean
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
          approval_chain_required: boolean
          brand_colors: Json
          brand_name: string
          brand_typography: Json
          brand_voice: Json | null
          completed_at: string | null
          context: Json
          created_at: string
          created_by: string
          description: string | null
          id: string
          logo_path: string | null
          target_audience: Json | null
          tier: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          approval_chain_required?: boolean
          brand_colors?: Json
          brand_name: string
          brand_typography?: Json
          brand_voice?: Json | null
          completed_at?: string | null
          context?: Json
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          logo_path?: string | null
          target_audience?: Json | null
          tier?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          approval_chain_required?: boolean
          brand_colors?: Json
          brand_name?: string
          brand_typography?: Json
          brand_voice?: Json | null
          completed_at?: string | null
          context?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          logo_path?: string | null
          target_audience?: Json | null
          tier?: number
          updated_at?: string
        }
        Relationships: []
      }
      brand_report_composites: {
        Row: {
          brand_profile_id: string
          brand_report_id: string | null
          composite: Json
          composite_version: string | null
          created_at: string
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          id: string
          run_context_snapshot: Json | null
          source_phase: string | null
          summary_markdown: string | null
          updated_at: string
        }
        Insert: {
          brand_profile_id: string
          brand_report_id?: string | null
          composite: Json
          composite_version?: string | null
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          id?: string
          run_context_snapshot?: Json | null
          source_phase?: string | null
          summary_markdown?: string | null
          updated_at?: string
        }
        Update: {
          brand_profile_id?: string
          brand_report_id?: string | null
          composite?: Json
          composite_version?: string | null
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          id?: string
          run_context_snapshot?: Json | null
          source_phase?: string | null
          summary_markdown?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_report_composites_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_report_composites_brand_report_id_fkey"
            columns: ["brand_report_id"]
            isOneToOne: false
            referencedRelation: "brand_reports"
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
      brand_report_jobs: {
        Row: {
          attempts: number
          brand_id: string
          claimed_at: string | null
          completed_at: string | null
          enqueued_at: string
          error: Json | null
          heartbeat_at: string | null
          job_id: string
          payload: Json
          preview_run_id: string
          status: Database["brand_profiles"]["Enums"]["brand_report_job_status"]
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          brand_id: string
          claimed_at?: string | null
          completed_at?: string | null
          enqueued_at?: string
          error?: Json | null
          heartbeat_at?: string | null
          job_id?: string
          payload: Json
          preview_run_id: string
          status?: Database["brand_profiles"]["Enums"]["brand_report_job_status"]
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          brand_id?: string
          claimed_at?: string | null
          completed_at?: string | null
          enqueued_at?: string
          error?: Json | null
          heartbeat_at?: string | null
          job_id?: string
          payload?: Json
          preview_run_id?: string
          status?: Database["brand_profiles"]["Enums"]["brand_report_job_status"]
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_report_jobs_preview_run_id_fkey"
            columns: ["preview_run_id"]
            isOneToOne: true
            referencedRelation: "preview_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_report_readiness: {
        Row: {
          brand_profile_id: string
          brand_report_id: string | null
          created_at: string
          dimensions: Json
          id: string
          overall_score: number | null
          recommendations: Json
          source_phase: string | null
          updated_at: string
        }
        Insert: {
          brand_profile_id: string
          brand_report_id?: string | null
          created_at?: string
          dimensions?: Json
          id?: string
          overall_score?: number | null
          recommendations?: Json
          source_phase?: string | null
          updated_at?: string
        }
        Update: {
          brand_profile_id?: string
          brand_report_id?: string | null
          created_at?: string
          dimensions?: Json
          id?: string
          overall_score?: number | null
          recommendations?: Json
          source_phase?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_report_readiness_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_report_readiness_brand_report_id_fkey"
            columns: ["brand_report_id"]
            isOneToOne: false
            referencedRelation: "brand_reports"
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
      budget_pacing_cache: {
        Row: {
          ad_account_id: string
          brand_profile_id: string
          created_at: string
          expires_at: string
          fetched_at: string
          id: string
          payload: Json
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          brand_profile_id: string
          created_at?: string
          expires_at: string
          fetched_at?: string
          id?: string
          payload: Json
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          brand_profile_id?: string
          created_at?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_pacing_cache_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_active_view: {
        Row: {
          brand_profile_id: string
          last_seen_at: string
          room_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_profile_id: string
          last_seen_at?: string
          room_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          brand_profile_id?: string
          last_seen_at?: string
          room_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_active_view_brand_profile_id_fkey"
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
      canvas_run_requests: {
        Row: {
          brand_profile_id: string
          created_at: string
          error: string | null
          id: string
          node_ids: Json | null
          requested_by: string
          result: Json | null
          room_id: string
          status: string
          updated_at: string
        }
        Insert: {
          brand_profile_id: string
          created_at?: string
          error?: string | null
          id?: string
          node_ids?: Json | null
          requested_by: string
          result?: Json | null
          room_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          brand_profile_id?: string
          created_at?: string
          error?: string | null
          id?: string
          node_ids?: Json | null
          requested_by?: string
          result?: Json | null
          room_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_run_requests_brand_profile_id_fkey"
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
          edges: Json
          editor_session_id: string | null
          editor_user_id: string | null
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
          edges?: Json
          editor_session_id?: string | null
          editor_user_id?: string | null
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
          edges?: Json
          editor_session_id?: string | null
          editor_user_id?: string | null
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
      media_insight_snapshots: {
        Row: {
          account_id: string
          brand_id: string
          channel: string
          computed_at: string
          computed_by: string | null
          id: string
          insight_count: number
          peer_set_size: number
          platform: string
          range_preset: string
          range_since: string | null
          range_until: string | null
          source: string
        }
        Insert: {
          account_id: string
          brand_id: string
          channel: string
          computed_at?: string
          computed_by?: string | null
          id?: string
          insight_count?: number
          peer_set_size?: number
          platform: string
          range_preset: string
          range_since?: string | null
          range_until?: string | null
          source?: string
        }
        Update: {
          account_id?: string
          brand_id?: string
          channel?: string
          computed_at?: string
          computed_by?: string | null
          id?: string
          insight_count?: number
          peer_set_size?: number
          platform?: string
          range_preset?: string
          range_since?: string | null
          range_until?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_insight_snapshots_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_insights: {
        Row: {
          account_id: string
          acknowledged_at: string | null
          action_state: string
          brand_id: string
          category: string | null
          channel: string
          confidence: number | null
          created_at: string
          entity_id: string | null
          entity_name: string | null
          entity_permalink: string | null
          evidence: Json
          fingerprint: string | null
          id: string
          platform: string
          primary_metric: string | null
          recommendation: string | null
          resolved_at: string | null
          resolved_by: string | null
          scope: string
          severity: string
          snapshot_id: string
          source: string
          status: string
          summary: string
          title: string | null
        }
        Insert: {
          account_id: string
          acknowledged_at?: string | null
          action_state?: string
          brand_id: string
          category?: string | null
          channel: string
          confidence?: number | null
          created_at?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_permalink?: string | null
          evidence?: Json
          fingerprint?: string | null
          id?: string
          platform: string
          primary_metric?: string | null
          recommendation?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scope: string
          severity: string
          snapshot_id: string
          source: string
          status: string
          summary: string
          title?: string | null
        }
        Update: {
          account_id?: string
          acknowledged_at?: string | null
          action_state?: string
          brand_id?: string
          category?: string | null
          channel?: string
          confidence?: number | null
          created_at?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_permalink?: string | null
          evidence?: Json
          fingerprint?: string | null
          id?: string
          platform?: string
          primary_metric?: string | null
          recommendation?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scope?: string
          severity?: string
          snapshot_id?: string
          source?: string
          status?: string
          summary?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_insights_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_insights_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "media_insight_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_media_campaign_indexes: {
        Row: {
          brand_id: string
          campaign_ids: string[]
          created_at: string
          created_by: string
          id: string
          meta_account_id: string
          name: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          campaign_ids?: string[]
          created_at?: string
          created_by?: string
          id?: string
          meta_account_id: string
          name: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          campaign_ids?: string[]
          created_at?: string
          created_by?: string
          id?: string
          meta_account_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_campaign_indexes_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_media_campaign_insights: {
        Row: {
          ad_account_id: string
          brand_id: string
          campaign_id: string | null
          campaign_name: string | null
          created_at: string
          evidence: Json
          fingerprint: string | null
          id: string
          primary_metric: string
          recommendation: string | null
          scope: string
          severity: string
          snapshot_id: string
          source: string
          status: string
          summary: string
          title: string
        }
        Insert: {
          ad_account_id: string
          brand_id: string
          campaign_id?: string | null
          campaign_name?: string | null
          created_at?: string
          evidence: Json
          fingerprint?: string | null
          id?: string
          primary_metric: string
          recommendation?: string | null
          scope: string
          severity: string
          snapshot_id: string
          source: string
          status: string
          summary: string
          title: string
        }
        Update: {
          ad_account_id?: string
          brand_id?: string
          campaign_id?: string | null
          campaign_name?: string | null
          created_at?: string
          evidence?: Json
          fingerprint?: string | null
          id?: string
          primary_metric?: string
          recommendation?: string | null
          scope?: string
          severity?: string
          snapshot_id?: string
          source?: string
          status?: string
          summary?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_campaign_insights_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_campaign_insights_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "paid_media_insight_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_media_insight_snapshots: {
        Row: {
          ad_account_id: string
          brand_id: string
          computed_at: string
          computed_by: string | null
          id: string
          insight_count: number
          peer_set_size: number
          platform: string
          range_preset: string
          range_since: string | null
          range_until: string | null
          source: string
        }
        Insert: {
          ad_account_id: string
          brand_id: string
          computed_at?: string
          computed_by?: string | null
          id?: string
          insight_count: number
          peer_set_size: number
          platform?: string
          range_preset: string
          range_since?: string | null
          range_until?: string | null
          source?: string
        }
        Update: {
          ad_account_id?: string
          brand_id?: string
          computed_at?: string
          computed_by?: string | null
          id?: string
          insight_count?: number
          peer_set_size?: number
          platform?: string
          range_preset?: string
          range_since?: string | null
          range_until?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_insight_snapshots_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          acknowledged_at: string | null
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
          acknowledged_at?: string | null
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
          acknowledged_at?: string | null
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
      preview_run_events: {
        Row: {
          created_at: string
          kind: string
          payload: Json
          run_id: string
          sequence: number
        }
        Insert: {
          created_at?: string
          kind: string
          payload: Json
          run_id: string
          sequence: number
        }
        Update: {
          created_at?: string
          kind?: string
          payload?: Json
          run_id?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "preview_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "preview_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      preview_runs: {
        Row: {
          brand_id: string
          completed_at: string | null
          error: Json | null
          id: string
          input_hash: string
          last_heartbeat_at: string | null
          prompt_version: number
          request_context: Json | null
          result: Json | null
          started_at: string
          status: string
        }
        Insert: {
          brand_id: string
          completed_at?: string | null
          error?: Json | null
          id?: string
          input_hash: string
          last_heartbeat_at?: string | null
          prompt_version: number
          request_context?: Json | null
          result?: Json | null
          started_at?: string
          status: string
        }
        Update: {
          brand_id?: string
          completed_at?: string | null
          error?: Json | null
          id?: string
          input_hash?: string
          last_heartbeat_at?: string | null
          prompt_version?: number
          request_context?: Json | null
          result?: Json | null
          started_at?: string
          status?: string
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
      user_brand_preferences: {
        Row: {
          active_brand_id: string
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_brand_id: string
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_brand_id?: string
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_brand_preferences_active_brand_id_fkey"
            columns: ["active_brand_id"]
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
      workflow_library: {
        Row: {
          brand_profile_id: string | null
          content: Json
          copied_at: string | null
          copied_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          promoted_from_workflow_id: string | null
          source_brand_profile_id: string | null
          source_scope: string
          source_workflow_id: string | null
          tags: string[]
          updated_at: string
          visibility: string
        }
        Insert: {
          brand_profile_id?: string | null
          content?: Json
          copied_at?: string | null
          copied_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          promoted_from_workflow_id?: string | null
          source_brand_profile_id?: string | null
          source_scope?: string
          source_workflow_id?: string | null
          tags?: string[]
          updated_at?: string
          visibility?: string
        }
        Update: {
          brand_profile_id?: string | null
          content?: Json
          copied_at?: string | null
          copied_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          promoted_from_workflow_id?: string | null
          source_brand_profile_id?: string | null
          source_scope?: string
          source_workflow_id?: string | null
          tags?: string[]
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_library_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_library_source_brand_profile_id_fkey"
            columns: ["source_brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      jaina_conversation_messages: {
        Row: {
          ad_account_id: string | null
          brand_id: string | null
          content: string | null
          created_at: string | null
          id: number | null
          role: string | null
          session_id: string | null
          user_email: string | null
        }
        Insert: {
          ad_account_id?: string | null
          brand_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: number | null
          role?: string | null
          session_id?: string | null
          user_email?: string | null
        }
        Update: {
          ad_account_id?: string | null
          brand_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: number | null
          role?: string | null
          session_id?: string | null
          user_email?: string | null
        }
        Relationships: []
      }
      jaina_conversation_run_events: {
        Row: {
          created_at: string | null
          event_type: string | null
          id: number | null
          payload: Json | null
          run_id: string | null
          user_email: string | null
        }
        Insert: {
          created_at?: string | null
          event_type?: string | null
          id?: number | null
          payload?: Json | null
          run_id?: string | null
          user_email?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string | null
          id?: number | null
          payload?: Json | null
          run_id?: string | null
          user_email?: string | null
        }
        Relationships: []
      }
      jaina_conversation_runs: {
        Row: {
          ad_account_id: string | null
          brand_id: string | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: number | null
          query: string | null
          result_payload: Json | null
          result_type: string | null
          run_id: string | null
          session_id: string | null
          started_at: string | null
          status: string | null
          updated_at: string | null
          user_email: string | null
        }
        Insert: {
          ad_account_id?: string | null
          brand_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: number | null
          query?: string | null
          result_payload?: Json | null
          result_type?: string | null
          run_id?: string | null
          session_id?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_email?: string | null
        }
        Update: {
          ad_account_id?: string | null
          brand_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: number | null
          query?: string | null
          result_payload?: Json | null
          result_type?: string | null
          run_id?: string | null
          session_id?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_email?: string | null
        }
        Relationships: []
      }
      jaina_conversation_sessions: {
        Row: {
          ad_account_id: string | null
          brand_id: string | null
          conversation_title: string | null
          created_at: string | null
          id: number | null
          last_message_at: string | null
          last_message_preview: string | null
          last_message_role: string | null
          session_id: string | null
          updated_at: string | null
          user_email: string | null
        }
        Insert: {
          ad_account_id?: string | null
          brand_id?: string | null
          conversation_title?: string | null
          created_at?: string | null
          id?: number | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_role?: string | null
          session_id?: string | null
          updated_at?: string | null
          user_email?: string | null
        }
        Update: {
          ad_account_id?: string | null
          brand_id?: string | null
          conversation_title?: string | null
          created_at?: string | null
          id?: number | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_role?: string | null
          session_id?: string | null
          updated_at?: string | null
          user_email?: string | null
        }
        Relationships: []
      }
      organic_calendar_drafts: {
        Row: {
          brand_id: string | null
          content_json: Json | null
          content_plan_id: string | null
          created_at: string | null
          id: string | null
          instagram_post_id: string | null
          platform_account_id: string | null
          position: Json | null
          published_at: string | null
          scheduled_date: string | null
          slot_data: Json | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          brand_id?: string | null
          content_json?: Json | null
          content_plan_id?: string | null
          created_at?: string | null
          id?: string | null
          instagram_post_id?: string | null
          platform_account_id?: string | null
          position?: Json | null
          published_at?: string | null
          scheduled_date?: string | null
          slot_data?: Json | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          brand_id?: string | null
          content_json?: Json | null
          content_plan_id?: string | null
          created_at?: string | null
          id?: string | null
          instagram_post_id?: string | null
          platform_account_id?: string | null
          position?: Json | null
          published_at?: string | null
          scheduled_date?: string | null
          slot_data?: Json | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
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
      organic_chat_messages: {
        Row: {
          brand_id: string | null
          content: string | null
          created_at: string | null
          id: number | null
          role: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          brand_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: number | null
          role?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          brand_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: number | null
          role?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      organic_chat_sessions: {
        Row: {
          brand_id: string | null
          created_at: string | null
          id: number | null
          last_message_at: string | null
          last_message_preview: string | null
          last_message_role: string | null
          session_id: string | null
          timezone: string | null
          title: string | null
          updated_at: string | null
          user_id: string | null
          week_start: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          id?: number | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_role?: string | null
          session_id?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
          week_start?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          id?: number | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_role?: string | null
          session_id?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
          week_start?: string | null
        }
        Relationships: []
      }
      organic_content_plans: {
        Row: {
          brand_id: string | null
          created_at: string | null
          guidance: string | null
          id: string | null
          placements: Json | null
          platform_account_ids: Json | null
          run_idempotency_key: string | null
          session_id: string | null
          status: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string | null
          week_start: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          guidance?: string | null
          id?: string | null
          placements?: Json | null
          platform_account_ids?: Json | null
          run_idempotency_key?: string | null
          session_id?: string | null
          status?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
          week_start?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          guidance?: string | null
          id?: string | null
          placements?: Json | null
          platform_account_ids?: Json | null
          run_idempotency_key?: string | null
          session_id?: string | null
          status?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
          week_start?: string | null
        }
        Relationships: []
      }
      organic_draft_sessions: {
        Row: {
          backlog_drafts: Json | null
          brand_profile_id: string | null
          days: Json | null
          id: string | null
          saved_at: string | null
          user_id: string | null
          week_start_id: string | null
        }
        Insert: {
          backlog_drafts?: Json | null
          brand_profile_id?: string | null
          days?: Json | null
          id?: string | null
          saved_at?: string | null
          user_id?: string | null
          week_start_id?: string | null
        }
        Update: {
          backlog_drafts?: Json | null
          brand_profile_id?: string | null
          days?: Json | null
          id?: string | null
          saved_at?: string | null
          user_id?: string | null
          week_start_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organic_draft_sessions_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organic_publish_attempts: {
        Row: {
          attempted_at: string | null
          brand_id: string | null
          caption_sent: string | null
          completed_at: string | null
          draft_id: string | null
          error_code: string | null
          error_message: string | null
          id: number | null
          ig_user_id: string | null
          instagram_post_id: string | null
          media_urls: Json | null
          post_type: string | null
          status: string | null
        }
        Insert: {
          attempted_at?: string | null
          brand_id?: string | null
          caption_sent?: string | null
          completed_at?: string | null
          draft_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: number | null
          ig_user_id?: string | null
          instagram_post_id?: string | null
          media_urls?: Json | null
          post_type?: string | null
          status?: string | null
        }
        Update: {
          attempted_at?: string | null
          brand_id?: string | null
          caption_sent?: string | null
          completed_at?: string | null
          draft_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: number | null
          ig_user_id?: string | null
          instagram_post_id?: string | null
          media_urls?: Json | null
          post_type?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organic_publish_attempts_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "organic_calendar_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organic_publish_attempts_post_fk"
            columns: ["instagram_post_id"]
            isOneToOne: false
            referencedRelation: "organic_published_posts"
            referencedColumns: ["instagram_post_id"]
          },
        ]
      }
      organic_published_posts: {
        Row: {
          brand_id: string | null
          caption: string | null
          content_snapshot: Json | null
          created_at: string | null
          draft_id: string | null
          ig_user_id: string | null
          insights_last_synced_at: string | null
          instagram_post_id: string | null
          media_urls: Json | null
          permalink: string | null
          post_type: string | null
          published_at: string | null
        }
        Insert: {
          brand_id?: string | null
          caption?: string | null
          content_snapshot?: Json | null
          created_at?: string | null
          draft_id?: string | null
          ig_user_id?: string | null
          insights_last_synced_at?: string | null
          instagram_post_id?: string | null
          media_urls?: Json | null
          permalink?: string | null
          post_type?: string | null
          published_at?: string | null
        }
        Update: {
          brand_id?: string | null
          caption?: string | null
          content_snapshot?: Json | null
          created_at?: string | null
          draft_id?: string | null
          ig_user_id?: string | null
          insights_last_synced_at?: string | null
          instagram_post_id?: string | null
          media_urls?: Json | null
          permalink?: string | null
          post_type?: string | null
          published_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organic_published_posts_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "organic_calendar_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      organic_whatsapp_brands: {
        Row: {
          brand_id: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          updated_at: string | null
          user_id: string | null
          wa_id: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          updated_at?: string | null
          user_id?: string | null
          wa_id?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          updated_at?: string | null
          user_id?: string | null
          wa_id?: string | null
        }
        Relationships: []
      }
      paid_media_ad_objects: {
        Row: {
          brand_id: string | null
          created_at: string | null
          external_object_id: string | null
          id: string | null
          name: string | null
          object_type: string | null
          platform: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          external_object_id?: string | null
          id?: string | null
          name?: string | null
          object_type?: string | null
          platform?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          external_object_id?: string | null
          id?: string | null
          name?: string | null
          object_type?: string | null
          platform?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_ad_objects_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_media_catalog_products: {
        Row: {
          availability: string | null
          brand_id: string | null
          catalog_id: string | null
          created_at: string | null
          currency: string | null
          external_product_id: string | null
          id: string | null
          image_url: string | null
          product_url: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          availability?: string | null
          brand_id?: string | null
          catalog_id?: string | null
          created_at?: string | null
          currency?: string | null
          external_product_id?: string | null
          id?: string | null
          image_url?: string | null
          product_url?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          availability?: string | null
          brand_id?: string | null
          catalog_id?: string | null
          created_at?: string | null
          currency?: string | null
          external_product_id?: string | null
          id?: string | null
          image_url?: string | null
          product_url?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_catalog_products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_catalog_products_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "paid_media_product_catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_media_product_ad_activity: {
        Row: {
          active_from: string | null
          active_to: string | null
          ad_object_id: string | null
          brand_id: string | null
          catalog_id: string | null
          created_at: string | null
          first_seen_at: string | null
          id: string | null
          is_active: boolean | null
          last_seen_at: string | null
          product_id: string | null
          source: string | null
          sync_job_id: string | null
          updated_at: string | null
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          ad_object_id?: string | null
          brand_id?: string | null
          catalog_id?: string | null
          created_at?: string | null
          first_seen_at?: string | null
          id?: string | null
          is_active?: boolean | null
          last_seen_at?: string | null
          product_id?: string | null
          source?: string | null
          sync_job_id?: string | null
          updated_at?: string | null
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          ad_object_id?: string | null
          brand_id?: string | null
          catalog_id?: string | null
          created_at?: string | null
          first_seen_at?: string | null
          id?: string | null
          is_active?: boolean | null
          last_seen_at?: string | null
          product_id?: string | null
          source?: string | null
          sync_job_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_product_ad_activity_ad_object_id_fkey"
            columns: ["ad_object_id"]
            isOneToOne: false
            referencedRelation: "paid_media_ad_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_product_ad_activity_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_product_ad_activity_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "paid_media_product_catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_product_ad_activity_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "paid_media_catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_media_product_catalog_links: {
        Row: {
          active_from: string | null
          active_to: string | null
          ad_object_id: string | null
          brand_id: string | null
          catalog_id: string | null
          created_at: string | null
          first_seen_at: string | null
          id: string | null
          is_active: boolean | null
          last_seen_at: string | null
          product_id: string | null
          source: string | null
          sync_job_id: string | null
          updated_at: string | null
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          ad_object_id?: string | null
          brand_id?: string | null
          catalog_id?: string | null
          created_at?: string | null
          first_seen_at?: string | null
          id?: string | null
          is_active?: boolean | null
          last_seen_at?: string | null
          product_id?: string | null
          source?: string | null
          sync_job_id?: string | null
          updated_at?: string | null
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          ad_object_id?: string | null
          brand_id?: string | null
          catalog_id?: string | null
          created_at?: string | null
          first_seen_at?: string | null
          id?: string | null
          is_active?: boolean | null
          last_seen_at?: string | null
          product_id?: string | null
          source?: string | null
          sync_job_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_product_catalog_links_ad_object_id_fkey"
            columns: ["ad_object_id"]
            isOneToOne: false
            referencedRelation: "paid_media_ad_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_product_catalog_links_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_product_catalog_links_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "paid_media_product_catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_product_catalog_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "paid_media_catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_media_product_catalogs: {
        Row: {
          brand_id: string | null
          business_id: string | null
          catalog_store_id: string | null
          config: Json | null
          created_at: string | null
          currency: string | null
          data_feed_enabled: boolean | null
          default_image_url: string | null
          external_catalog_id: string | null
          fallback_image_url: string | null
          feed_count: number | null
          feed_url: string | null
          id: string | null
          last_synced_at: string | null
          linked_ad_object_ids: string[] | null
          linked_ad_object_level: string | null
          name: string | null
          notes: string | null
          product_count: number | null
          product_set_count: number | null
          product_tagging_enabled: boolean | null
          sync_status: string | null
          updated_at: string | null
          vertical: string | null
        }
        Insert: {
          brand_id?: string | null
          business_id?: string | null
          catalog_store_id?: string | null
          config?: Json | null
          created_at?: string | null
          currency?: string | null
          data_feed_enabled?: boolean | null
          default_image_url?: string | null
          external_catalog_id?: string | null
          fallback_image_url?: string | null
          feed_count?: number | null
          feed_url?: string | null
          id?: string | null
          last_synced_at?: string | null
          linked_ad_object_ids?: string[] | null
          linked_ad_object_level?: string | null
          name?: string | null
          notes?: string | null
          product_count?: number | null
          product_set_count?: number | null
          product_tagging_enabled?: boolean | null
          sync_status?: string | null
          updated_at?: string | null
          vertical?: string | null
        }
        Update: {
          brand_id?: string | null
          business_id?: string | null
          catalog_store_id?: string | null
          config?: Json | null
          created_at?: string | null
          currency?: string | null
          data_feed_enabled?: boolean | null
          default_image_url?: string | null
          external_catalog_id?: string | null
          fallback_image_url?: string | null
          feed_count?: number | null
          feed_url?: string | null
          id?: string | null
          last_synced_at?: string | null
          linked_ad_object_ids?: string[] | null
          linked_ad_object_level?: string | null
          name?: string | null
          notes?: string | null
          product_count?: number | null
          product_set_count?: number | null
          product_tagging_enabled?: boolean | null
          sync_status?: string | null
          updated_at?: string | null
          vertical?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_product_catalogs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      strategic_analyses: {
        Row: {
          active: boolean | null
          analysis_embedding: string | null
          analysis_json: Json | null
          audience_embedding: string | null
          audience_embedding_model: string | null
          audience_embedding_text: string | null
          brand_id: string | null
          competition_embedding: string | null
          competition_embedding_model: string | null
          competition_embedding_text: string | null
          created_at: string | null
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
          updated_at: string | null
          voice_embedding: string | null
          voice_embedding_model: string | null
          voice_embedding_text: string | null
        }
        Insert: {
          active?: boolean | null
          analysis_embedding?: string | null
          analysis_json?: Json | null
          audience_embedding?: string | null
          audience_embedding_model?: string | null
          audience_embedding_text?: string | null
          brand_id?: string | null
          competition_embedding?: string | null
          competition_embedding_model?: string | null
          competition_embedding_text?: string | null
          created_at?: string | null
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
          updated_at?: string | null
          voice_embedding?: string | null
          voice_embedding_model?: string | null
          voice_embedding_text?: string | null
        }
        Update: {
          active?: boolean | null
          analysis_embedding?: string | null
          analysis_json?: Json | null
          audience_embedding?: string | null
          audience_embedding_model?: string | null
          audience_embedding_text?: string | null
          brand_id?: string | null
          competition_embedding?: string | null
          competition_embedding_model?: string | null
          competition_embedding_text?: string | null
          created_at?: string | null
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
          updated_at?: string | null
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
          brand_id: string | null
          created_at: string | null
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          id: string | null
          label: string | null
          run_id: string | null
          section: string | null
          updated_at: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          id?: string | null
          label?: string | null
          run_id?: string | null
          section?: string | null
          updated_at?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          id?: string | null
          label?: string | null
          run_id?: string | null
          section?: string | null
          updated_at?: string | null
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
          brand_id: string | null
          completed_at: string | null
          error: Json | null
          id: string | null
          phases: Json | null
          result_ref: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          brand_id?: string | null
          completed_at?: string | null
          error?: Json | null
          id?: string | null
          phases?: Json | null
          result_ref?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          brand_id?: string | null
          completed_at?: string | null
          error?: Json | null
          id?: string | null
          phases?: Json | null
          result_ref?: string | null
          started_at?: string | null
          status?: string | null
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
      claim_next_brand_guideline_job: {
        Args: { p_lease_ttl_sec: number; p_worker_id: string }
        Returns: {
          attempts: number
          brand_id: string
          claimed_at: string | null
          completed_at: string | null
          enqueued_at: string
          error: Json | null
          heartbeat_at: string | null
          job_id: string
          payload: Json
          status: Database["brand_profiles"]["Enums"]["brand_guideline_job_status"]
          trigger: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "brand_guideline_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_next_brand_report_job: {
        Args: { p_lease_ttl_sec: number; p_worker_id: string }
        Returns: {
          attempts: number
          brand_id: string
          claimed_at: string | null
          completed_at: string | null
          enqueued_at: string
          error: Json | null
          heartbeat_at: string | null
          job_id: string
          payload: Json
          preview_run_id: string
          status: Database["brand_profiles"]["Enums"]["brand_report_job_status"]
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "brand_report_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cleanup_old_canvas_sessions: { Args: never; Returns: undefined }
      cleanup_old_chat_messages: { Args: never; Returns: undefined }
      complete_brand_guideline_job_owned: {
        Args: {
          p_error?: Json
          p_job_id: string
          p_status: Database["brand_profiles"]["Enums"]["brand_guideline_job_status"]
          p_worker_id: string
        }
        Returns: boolean
      }
      complete_brand_report_job_owned: {
        Args: {
          p_error?: Json
          p_job_id: string
          p_status: Database["brand_profiles"]["Enums"]["brand_report_job_status"]
          p_worker_id: string
        }
        Returns: boolean
      }
      decrypt_token: { Args: { ct: string }; Returns: string }
      encrypt_token: { Args: { token: string }; Returns: string }
      enqueue_brand_guideline_job: {
        Args: { p_brand_id: string; p_payload: Json; p_trigger: string }
        Returns: string
      }
      enqueue_brand_report_job: {
        Args: { p_brand_id: string; p_payload: Json; p_preview_run_id: string }
        Returns: string
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
      get_active_brand_id: { Args: never; Returns: string }
      get_brand_integration_summary: {
        Args: { p_brand_profile_id: string }
        Returns: {
          account_name: string
          account_status: string
          account_type: string
          alias: string
          assignment_id: string
          external_account_id: string
          integration_account_id: string
          linked_at: string
          platform_key: string
          provider_integration_id: string
          settings: Json
        }[]
      }
      get_brand_integration_token: {
        Args: { p_brand_profile_id: string; p_provider: string }
        Returns: string
      }
      get_brand_timezone: { Args: { brand_id: string }; Returns: string }
      get_latest_media_insights: {
        Args: {
          p_account_id: string
          p_brand_id: string
          p_channel?: string
          p_limit?: number
          p_scope?: string
        }
        Returns: {
          account_id: string
          acknowledged_at: string | null
          action_state: string
          brand_id: string
          category: string | null
          channel: string
          confidence: number | null
          created_at: string
          entity_id: string | null
          entity_name: string | null
          entity_permalink: string | null
          evidence: Json
          fingerprint: string | null
          id: string
          platform: string
          primary_metric: string | null
          recommendation: string | null
          resolved_at: string | null
          resolved_by: string | null
          scope: string
          severity: string
          snapshot_id: string
          source: string
          status: string
          summary: string
          title: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "media_insights"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_latest_paid_media_insights: {
        Args: { p_ad_account_id: string; p_brand_id: string; p_limit?: number }
        Returns: {
          ad_account_id: string
          brand_id: string
          campaign_id: string | null
          campaign_name: string | null
          created_at: string
          evidence: Json
          fingerprint: string | null
          id: string
          primary_metric: string
          recommendation: string | null
          scope: string
          severity: string
          snapshot_id: string
          source: string
          status: string
          summary: string
          title: string
        }[]
        SetofOptions: {
          from: "*"
          to: "paid_media_campaign_insights"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_media_insight_streak: {
        Args: {
          p_account_id: string
          p_brand_id: string
          p_channel?: string
          p_fingerprint: string
          p_lookback_days?: number
        }
        Returns: number
      }
      get_paid_media_insight_streak: {
        Args: {
          p_ad_account_id: string
          p_brand_id: string
          p_fingerprint: string
          p_lookback_days?: number
        }
        Returns: number
      }
      get_user_integration_summary: {
        Args: { p_user_id: string }
        Returns: {
          asset_id: string
          asset_name: string
          asset_status: string
          asset_type: string
          created_at: string
          external_account_id: string
          platform_key: string
          provider: string
        }[]
      }
      grant_integration_to_brand: {
        Args: { p_brand_profile_id: string; p_integration_id: string }
        Returns: string
      }
      has_brand_access:
        | { Args: { brand_id: string }; Returns: boolean }
        | { Args: { p_brand_id: string; p_user_id: string }; Returns: boolean }
      heartbeat_brand_guideline_job: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: boolean
      }
      heartbeat_brand_report_job: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: boolean
      }
      is_brand_admin: { Args: { brand_id: string }; Returns: boolean }
      list_brand_integrations: {
        Args: { p_brand_profile_id: string }
        Returns: {
          grant_id: string
          granted_at: string
          granted_by: string
          integration_id: string
          provider: string
        }[]
      }
      list_my_connection_grants: {
        Args: never
        Returns: {
          brand_name: string
          brand_profile_id: string
          granted_at: string
          integration_id: string
        }[]
      }
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
      resolve_admin_user_directory_name: {
        Args: { metadata: Json }
        Returns: string
      }
      resolve_google_integration_token_context: {
        Args: { p_brand_profile_id: string; p_customer_id?: string }
        Returns: {
          access_token: string
          expires_at: string
          integration_id: string
          login_customer_id: string
          refresh_token: string
        }[]
      }
      revoke_integration_from_brand: {
        Args: { p_grant_id: string }
        Returns: undefined
      }
      search_admin_user_directory: {
        Args: { p_limit?: number; p_offset?: number; p_query: string }
        Returns: {
          auth_created_at: string
          email: string
          is_admin: boolean
          name: string
          total_count: number
          user_id: string
        }[]
      }
      search_brand_report_embeddings: {
        Args: {
          p_brand_id: string
          p_limit?: number
          p_query_embedding: string
        }
        Returns: {
          brand_profile_id: string
          embedding_model: string
          embedding_text: string
          id: string
          similarity: number
          source_phase: string
          synced_at: string
        }[]
      }
      search_strategic_analysis_embeddings: {
        Args: {
          p_brand_id: string
          p_limit?: number
          p_query_embedding: string
        }
        Returns: {
          brand_id: string
          embedding_model: string
          embedding_text: string
          id: string
          label: string
          run_id: string
          section: string
          similarity: number
          updated_at: string
        }[]
      }
    }
    Enums: {
      brand_guideline_job_status: "queued" | "running" | "completed" | "failed"
      brand_report_job_status: "queued" | "running" | "completed" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  brand_trends: {
    Tables: {
      events: {
        Row: {
          analysis_tags: string[]
          brand_id: string
          confidence: number | null
          created_at: string
          description: string
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          event_date: string | null
          generation_id: string
          id: string
          last_used_at: string | null
          metadata: Json
          opportunity: string | null
          platforms: string[]
          primary_platform: string | null
          signal_window_end: string | null
          signal_window_start: string | null
          source: string | null
          source_platform_breakdown: Json
          source_signal_count: number
          source_url: string | null
          times_used: number
          title: string
          updated_at: string
        }
        Insert: {
          analysis_tags?: string[]
          brand_id: string
          confidence?: number | null
          created_at?: string
          description: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          event_date?: string | null
          generation_id: string
          id?: string
          last_used_at?: string | null
          metadata?: Json
          opportunity?: string | null
          platforms?: string[]
          primary_platform?: string | null
          signal_window_end?: string | null
          signal_window_start?: string | null
          source?: string | null
          source_platform_breakdown?: Json
          source_signal_count?: number
          source_url?: string | null
          times_used?: number
          title: string
          updated_at?: string
        }
        Update: {
          analysis_tags?: string[]
          brand_id?: string
          confidence?: number | null
          created_at?: string
          description?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          event_date?: string | null
          generation_id?: string
          id?: string
          last_used_at?: string | null
          metadata?: Json
          opportunity?: string | null
          platforms?: string[]
          primary_platform?: string | null
          signal_window_end?: string | null
          signal_window_start?: string | null
          source?: string | null
          source_platform_breakdown?: Json
          source_signal_count?: number
          source_url?: string | null
          times_used?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_execution_leases: {
        Row: {
          created_at: string
          generation_id: string
          lease_acquired_at: string
          lease_expires_at: string
          lease_owner: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          generation_id: string
          lease_acquired_at?: string
          lease_expires_at: string
          lease_owner: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          generation_id?: string
          lease_acquired_at?: string
          lease_expires_at?: string
          lease_owner?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_execution_leases_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: true
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_messages: {
        Row: {
          brand_id: string
          created_at: string
          event_type: string
          generation_id: string
          id: number
          payload: Json
          progress_percent: number | null
          queue_message_id: number | null
          stage: string | null
          stage_message: string | null
          status: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          event_type: string
          generation_id: string
          id?: never
          payload?: Json
          progress_percent?: number | null
          queue_message_id?: number | null
          stage?: string | null
          stage_message?: string | null
          status: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          event_type?: string
          generation_id?: string
          id?: never
          payload?: Json
          progress_percent?: number | null
          queue_message_id?: number | null
          stage?: string | null
          stage_message?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_messages_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          brand_id: string
          completed_at: string | null
          country: string | null
          created_at: string
          error: string | null
          generated_by: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          model_version: string | null
          selected_social_platforms: string[]
          started_at: string | null
          status: string
          total_events: number
          total_questions: number
          total_trends: number
          updated_at: string
          week_start_date: string
          workflow_version: string | null
        }
        Insert: {
          brand_id: string
          completed_at?: string | null
          country?: string | null
          created_at?: string
          error?: string | null
          generated_by?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          model_version?: string | null
          selected_social_platforms?: string[]
          started_at?: string | null
          status?: string
          total_events?: number
          total_questions?: number
          total_trends?: number
          updated_at?: string
          week_start_date: string
          workflow_version?: string | null
        }
        Update: {
          brand_id?: string
          completed_at?: string | null
          country?: string | null
          created_at?: string
          error?: string | null
          generated_by?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          model_version?: string | null
          selected_social_platforms?: string[]
          started_at?: string | null
          status?: string
          total_events?: number
          total_questions?: number
          total_trends?: number
          updated_at?: string
          week_start_date?: string
          workflow_version?: string | null
        }
        Relationships: []
      }
      insight_sources: {
        Row: {
          brand_id: string
          created_at: string
          generation_id: string
          id: string
          insight_id: string
          insight_type: string
          platform: string
          rationale: string | null
          raw_signal_id: string
          relevance_weight: number | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          generation_id: string
          id?: string
          insight_id: string
          insight_type: string
          platform: string
          rationale?: string | null
          raw_signal_id: string
          relevance_weight?: number | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          generation_id?: string
          id?: string
          insight_id?: string
          insight_type?: string
          platform?: string
          rationale?: string | null
          raw_signal_id?: string
          relevance_weight?: number | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insight_sources_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insight_sources_raw_signal_id_fkey"
            columns: ["raw_signal_id"]
            isOneToOne: false
            referencedRelation: "raw_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          analysis_tags: string[]
          brand_id: string
          confidence: number | null
          content_type_suggestion: string | null
          created_at: string
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          generation_id: string
          id: string
          last_used_at: string | null
          metadata: Json
          niche: string
          question_text: string
          social_platform: string | null
          social_platforms: string[]
          source_platform_breakdown: Json
          source_signal_count: number
          times_used: number
          updated_at: string
          why_relevant: string | null
        }
        Insert: {
          analysis_tags?: string[]
          brand_id: string
          confidence?: number | null
          content_type_suggestion?: string | null
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          generation_id: string
          id?: string
          last_used_at?: string | null
          metadata?: Json
          niche: string
          question_text: string
          social_platform?: string | null
          social_platforms?: string[]
          source_platform_breakdown?: Json
          source_signal_count?: number
          times_used?: number
          updated_at?: string
          why_relevant?: string | null
        }
        Update: {
          analysis_tags?: string[]
          brand_id?: string
          confidence?: number | null
          content_type_suggestion?: string | null
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          generation_id?: string
          id?: string
          last_used_at?: string | null
          metadata?: Json
          niche?: string
          question_text?: string
          social_platform?: string | null
          social_platforms?: string[]
          source_platform_breakdown?: Json
          source_signal_count?: number
          times_used?: number
          updated_at?: string
          why_relevant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_signals: {
        Row: {
          author_handle: string | null
          body: string
          brand_id: string
          collected_at: string
          created_at: string
          dedupe_hash: string | null
          engagement_metrics: Json
          id: string
          language: string | null
          metadata: Json
          platform: string
          published_at: string | null
          raw_payload: Json
          region: string | null
          signal_type: string
          source_id: string
          source_run_id: string
          source_url: string | null
          tags: string[]
          title: string | null
          tool_call_id: string | null
          tool_name: string
          updated_at: string
        }
        Insert: {
          author_handle?: string | null
          body: string
          brand_id: string
          collected_at?: string
          created_at?: string
          dedupe_hash?: string | null
          engagement_metrics?: Json
          id?: string
          language?: string | null
          metadata?: Json
          platform: string
          published_at?: string | null
          raw_payload?: Json
          region?: string | null
          signal_type: string
          source_id: string
          source_run_id: string
          source_url?: string | null
          tags?: string[]
          title?: string | null
          tool_call_id?: string | null
          tool_name?: string
          updated_at?: string
        }
        Update: {
          author_handle?: string | null
          body?: string
          brand_id?: string
          collected_at?: string
          created_at?: string
          dedupe_hash?: string | null
          engagement_metrics?: Json
          id?: string
          language?: string | null
          metadata?: Json
          platform?: string
          published_at?: string | null
          raw_payload?: Json
          region?: string | null
          signal_type?: string
          source_id?: string
          source_run_id?: string
          source_url?: string | null
          tags?: string[]
          title?: string | null
          tool_call_id?: string | null
          tool_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_signals_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "source_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      source_runs: {
        Row: {
          brand_id: string
          created_at: string
          fetched_total: number
          generation_id: string | null
          id: string
          metadata: Json
          platforms: string[]
          provider: string
          run_notes: string | null
          status: string
          updated_at: string
          week_start_date: string
          window_end: string
          window_start: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          fetched_total?: number
          generation_id?: string | null
          id?: string
          metadata?: Json
          platforms?: string[]
          provider?: string
          run_notes?: string | null
          status?: string
          updated_at?: string
          week_start_date: string
          window_end: string
          window_start: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          fetched_total?: number
          generation_id?: string | null
          id?: string
          metadata?: Json
          platforms?: string[]
          provider?: string
          run_notes?: string | null
          status?: string
          updated_at?: string
          week_start_date?: string
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_runs_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: []
      }
      trends: {
        Row: {
          analysis_tags: string[]
          brand_id: string
          confidence: number | null
          created_at: string
          description: string
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          generation_id: string
          id: string
          last_used_at: string | null
          metadata: Json
          platforms: string[]
          primary_platform: string | null
          relevance_to_brand: string | null
          signal_window_end: string | null
          signal_window_start: string | null
          source: string | null
          source_platform_breakdown: Json
          source_signal_count: number
          source_url: string | null
          times_used: number
          title: string
          updated_at: string
        }
        Insert: {
          analysis_tags?: string[]
          brand_id: string
          confidence?: number | null
          created_at?: string
          description: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          generation_id: string
          id?: string
          last_used_at?: string | null
          metadata?: Json
          platforms?: string[]
          primary_platform?: string | null
          relevance_to_brand?: string | null
          signal_window_end?: string | null
          signal_window_start?: string | null
          source?: string | null
          source_platform_breakdown?: Json
          source_signal_count?: number
          source_url?: string | null
          times_used?: number
          title: string
          updated_at?: string
        }
        Update: {
          analysis_tags?: string[]
          brand_id?: string
          confidence?: number | null
          created_at?: string
          description?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          generation_id?: string
          id?: string
          last_used_at?: string | null
          metadata?: Json
          platforms?: string[]
          primary_platform?: string | null
          relevance_to_brand?: string | null
          signal_window_end?: string | null
          signal_window_start?: string | null
          source?: string | null
          source_platform_breakdown?: Json
          source_signal_count?: number
          source_url?: string | null
          times_used?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trends_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      event_embeddings: {
        Row: {
          analysis_tags: string[] | null
          brand_id: string | null
          created_at: string | null
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          generation_id: string | null
          id: string | null
          platforms: string[] | null
          primary_platform: string | null
          source_platform_breakdown: Json | null
          source_signal_count: number | null
        }
        Insert: {
          analysis_tags?: string[] | null
          brand_id?: string | null
          created_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          generation_id?: string | null
          id?: string | null
          platforms?: string[] | null
          primary_platform?: string | null
          source_platform_breakdown?: Json | null
          source_signal_count?: number | null
        }
        Update: {
          analysis_tags?: string[] | null
          brand_id?: string | null
          created_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          generation_id?: string | null
          id?: string | null
          platforms?: string[] | null
          primary_platform?: string | null
          source_platform_breakdown?: Json | null
          source_signal_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "events_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      question_embeddings: {
        Row: {
          analysis_tags: string[] | null
          brand_id: string | null
          created_at: string | null
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          generation_id: string | null
          id: string | null
          social_platform: string | null
          social_platforms: string[] | null
          source_platform_breakdown: Json | null
          source_signal_count: number | null
        }
        Insert: {
          analysis_tags?: string[] | null
          brand_id?: string | null
          created_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          generation_id?: string | null
          id?: string | null
          social_platform?: string | null
          social_platforms?: string[] | null
          source_platform_breakdown?: Json | null
          source_signal_count?: number | null
        }
        Update: {
          analysis_tags?: string[] | null
          brand_id?: string | null
          created_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          generation_id?: string | null
          id?: string | null
          social_platform?: string | null
          social_platforms?: string[] | null
          source_platform_breakdown?: Json | null
          source_signal_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      trend_embeddings: {
        Row: {
          analysis_tags: string[] | null
          brand_id: string | null
          created_at: string | null
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          generation_id: string | null
          id: string | null
          platforms: string[] | null
          primary_platform: string | null
          source_platform_breakdown: Json | null
          source_signal_count: number | null
        }
        Insert: {
          analysis_tags?: string[] | null
          brand_id?: string | null
          created_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          generation_id?: string | null
          id?: string | null
          platforms?: string[] | null
          primary_platform?: string | null
          source_platform_breakdown?: Json | null
          source_signal_count?: number | null
        }
        Update: {
          analysis_tags?: string[] | null
          brand_id?: string | null
          created_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          generation_id?: string | null
          id?: string | null
          platforms?: string[] | null
          primary_platform?: string | null
          source_platform_breakdown?: Json | null
          source_signal_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trends_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      append_generation_message: {
        Args: {
          p_brand_id: string
          p_event_type: string
          p_generation_id: string
          p_payload?: Json
          p_progress_percent?: number
          p_stage?: string
          p_stage_message?: string
          p_status: string
        }
        Returns: Json
      }
      claim_generation_execution_lease: {
        Args: {
          p_generation_id: string
          p_lease_owner?: string
          p_ttl_seconds?: number
        }
        Returns: boolean
      }
      ingest_raw_signal: {
        Args: {
          p_author_handle?: string
          p_body?: string
          p_brand_id: string
          p_dedupe_hash?: string
          p_engagement_metrics?: Json
          p_language?: string
          p_metadata?: Json
          p_platform: string
          p_published_at?: string
          p_raw_payload?: Json
          p_region?: string
          p_signal_type: string
          p_source_id: string
          p_source_run_id: string
          p_source_url?: string
          p_tags?: string[]
          p_title?: string
          p_tool_call_id?: string
          p_tool_name?: string
        }
        Returns: {
          author_handle: string | null
          body: string
          brand_id: string
          collected_at: string
          created_at: string
          dedupe_hash: string | null
          engagement_metrics: Json
          id: string
          language: string | null
          metadata: Json
          platform: string
          published_at: string | null
          raw_payload: Json
          region: string | null
          signal_type: string
          source_id: string
          source_run_id: string
          source_url: string | null
          tags: string[]
          title: string | null
          tool_call_id: string | null
          tool_name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "raw_signals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_generation_execution_lease: {
        Args: {
          p_force?: boolean
          p_generation_id: string
          p_lease_owner?: string
        }
        Returns: boolean
      }
      search_events: {
        Args: {
          p_brand_id: string
          p_exclude_selected?: boolean
          p_limit?: number
          p_platforms?: string[]
          p_query_embedding: string
        }
        Returns: {
          analysis_tags: string[]
          brand_id: string
          created_at: string
          description: string
          event_date: string
          generation_id: string
          id: string
          opportunity: string
          platforms: string[]
          primary_platform: string
          similarity: number
          source: string
          source_platform_breakdown: Json
          source_signal_count: number
          source_url: string
          times_used: number
          title: string
        }[]
      }
      search_questions: {
        Args: {
          p_brand_id: string
          p_exclude_selected?: boolean
          p_limit?: number
          p_platforms?: string[]
          p_query_embedding: string
        }
        Returns: {
          analysis_tags: string[]
          brand_id: string
          content_type_suggestion: string
          created_at: string
          generation_id: string
          id: string
          niche: string
          question_text: string
          similarity: number
          social_platform: string
          social_platforms: string[]
          source_platform_breakdown: Json
          source_signal_count: number
          times_used: number
          why_relevant: string
        }[]
      }
      search_trends: {
        Args: {
          p_brand_id: string
          p_exclude_selected?: boolean
          p_limit?: number
          p_platforms?: string[]
          p_query_embedding: string
        }
        Returns: {
          analysis_tags: string[]
          brand_id: string
          created_at: string
          description: string
          generation_id: string
          id: string
          platforms: string[]
          primary_platform: string
          relevance_to_brand: string
          similarity: number
          source: string
          source_platform_breakdown: Json
          source_signal_count: number
          source_url: string
          times_used: number
          title: string
        }[]
      }
      upsert_generation: {
        Args: {
          p_brand_id: string
          p_generated_by?: string
          p_metadata?: Json
          p_model_version?: string
          p_selected_social_platforms?: string[]
          p_week_start_date: string
          p_window_end?: string
          p_window_start?: string
          p_workflow_version?: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  DCO_Campaigns: {
    Tables: {
      rule_action_logs: {
        Row: {
          action_id: string | null
          action_payload: Json | null
          action_type: string
          actor_id: string | null
          brand_id: string
          decision_note: string | null
          error: string | null
          evaluation_id: string | null
          id: string
          is_automated: boolean
          is_dry_run: boolean | null
          meta_account_id: string | null
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          metadata: Json | null
          occurred_at: string
          params_changed: Json | null
          result: Json | null
          rule_id: string | null
          scope_id: string | null
          scope_type: string
          status: string | null
        }
        Insert: {
          action_id?: string | null
          action_payload?: Json | null
          action_type: string
          actor_id?: string | null
          brand_id: string
          decision_note?: string | null
          error?: string | null
          evaluation_id?: string | null
          id?: string
          is_automated?: boolean
          is_dry_run?: boolean | null
          meta_account_id?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          metadata?: Json | null
          occurred_at?: string
          params_changed?: Json | null
          result?: Json | null
          rule_id?: string | null
          scope_id?: string | null
          scope_type: string
          status?: string | null
        }
        Update: {
          action_id?: string | null
          action_payload?: Json | null
          action_type?: string
          actor_id?: string | null
          brand_id?: string
          decision_note?: string | null
          error?: string | null
          evaluation_id?: string | null
          id?: string
          is_automated?: boolean
          is_dry_run?: boolean | null
          meta_account_id?: string | null
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          metadata?: Json | null
          occurred_at?: string
          params_changed?: Json | null
          result?: Json | null
          rule_id?: string | null
          scope_id?: string | null
          scope_type?: string
          status?: string | null
        }
        Relationships: []
      }
      timeline_accounts: {
        Row: {
          account_id: string
          account_name: string | null
          brand_id: string
          currency: string | null
          first_block: string | null
          hourly_since: string | null
          last_block: string | null
          last_built_at: string | null
          total_blocks: number | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          account_name?: string | null
          brand_id: string
          currency?: string | null
          first_block?: string | null
          hourly_since?: string | null
          last_block?: string | null
          last_built_at?: string | null
          total_blocks?: number | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          account_name?: string | null
          brand_id?: string
          currency?: string | null
          first_block?: string | null
          hourly_since?: string | null
          last_block?: string | null
          last_built_at?: string | null
          total_blocks?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      timeline_ad_blocks: {
        Row: {
          account_id: string
          active_since: string | null
          active_until: string | null
          ad_id: string | null
          ad_name: string | null
          block_end: string
          block_start: string
          boundary_left: string
          boundary_right: string
          brand_id: string
          built_at: string
          camp_clicks: number | null
          camp_conversions: number | null
          camp_cpa: number | null
          camp_cpc: number | null
          camp_ctr_pct: number | null
          camp_impressions: number | null
          camp_revenue: number | null
          camp_roas: number | null
          camp_spend: number | null
          campaign_active_since: string | null
          campaign_active_until: string | null
          campaign_boundary_left: string | null
          campaign_boundary_right: string | null
          campaign_id: string
          campaign_name: string
          campaign_objective: string | null
          campaign_status: string | null
          clicks: number
          content_hash: string | null
          conversions: number
          cpa: number
          cpc: number
          created_at: string
          ctr_pct: number
          id: string
          impressions: number
          resolution: string
          revenue: number
          roas: number
          spend: number
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          account_id: string
          active_since?: string | null
          active_until?: string | null
          ad_id?: string | null
          ad_name?: string | null
          block_end: string
          block_start: string
          boundary_left?: string
          boundary_right?: string
          brand_id: string
          built_at?: string
          camp_clicks?: number | null
          camp_conversions?: number | null
          camp_cpa?: number | null
          camp_cpc?: number | null
          camp_ctr_pct?: number | null
          camp_impressions?: number | null
          camp_revenue?: number | null
          camp_roas?: number | null
          camp_spend?: number | null
          campaign_active_since?: string | null
          campaign_active_until?: string | null
          campaign_boundary_left?: string | null
          campaign_boundary_right?: string | null
          campaign_id: string
          campaign_name: string
          campaign_objective?: string | null
          campaign_status?: string | null
          clicks?: number
          content_hash?: string | null
          conversions?: number
          cpa?: number
          cpc?: number
          created_at?: string
          ctr_pct?: number
          id?: string
          impressions?: number
          resolution?: string
          revenue?: number
          roas?: number
          spend?: number
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          account_id?: string
          active_since?: string | null
          active_until?: string | null
          ad_id?: string | null
          ad_name?: string | null
          block_end?: string
          block_start?: string
          boundary_left?: string
          boundary_right?: string
          brand_id?: string
          built_at?: string
          camp_clicks?: number | null
          camp_conversions?: number | null
          camp_cpa?: number | null
          camp_cpc?: number | null
          camp_ctr_pct?: number | null
          camp_impressions?: number | null
          camp_revenue?: number | null
          camp_roas?: number | null
          camp_spend?: number | null
          campaign_active_since?: string | null
          campaign_active_until?: string | null
          campaign_boundary_left?: string | null
          campaign_boundary_right?: string | null
          campaign_id?: string
          campaign_name?: string
          campaign_objective?: string | null
          campaign_status?: string | null
          clicks?: number
          content_hash?: string | null
          conversions?: number
          cpa?: number
          cpc?: number
          created_at?: string
          ctr_pct?: number
          id?: string
          impressions?: number
          resolution?: string
          revenue?: number
          roas?: number
          spend?: number
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      timeline_blocks: {
        Row: {
          account_id: string
          block_end: string
          block_start: string
          brand_id: string
          built_at: string
          campaigns: Json
          content_hash: string | null
          deltas: Json
          events: Json
          id: string
          resolution: string
          summary: Json
          version: number
        }
        Insert: {
          account_id: string
          block_end: string
          block_start: string
          brand_id: string
          built_at?: string
          campaigns?: Json
          content_hash?: string | null
          deltas?: Json
          events?: Json
          id?: string
          resolution?: string
          summary?: Json
          version?: number
        }
        Update: {
          account_id?: string
          block_end?: string
          block_start?: string
          brand_id?: string
          built_at?: string
          campaigns?: Json
          content_hash?: string | null
          deltas?: Json
          events?: Json
          id?: string
          resolution?: string
          summary?: Json
          version?: number
        }
        Relationships: []
      }
      timeline_events: {
        Row: {
          account_id: string
          block_start: string
          brand_id: string
          campaign_id: string | null
          campaign_name: string | null
          changes: Json | null
          created_at: string
          event_id: string | null
          id: string
          is_automated: boolean
          is_dry_run: boolean | null
          metrics_at_event: Json | null
          rule_name: string | null
          scope: string
          scope_id: string | null
          scope_name: string | null
          summary: string | null
          timestamp: string
          type: string
        }
        Insert: {
          account_id: string
          block_start: string
          brand_id: string
          campaign_id?: string | null
          campaign_name?: string | null
          changes?: Json | null
          created_at?: string
          event_id?: string | null
          id?: string
          is_automated?: boolean
          is_dry_run?: boolean | null
          metrics_at_event?: Json | null
          rule_name?: string | null
          scope?: string
          scope_id?: string | null
          scope_name?: string | null
          summary?: string | null
          timestamp: string
          type: string
        }
        Update: {
          account_id?: string
          block_start?: string
          brand_id?: string
          campaign_id?: string | null
          campaign_name?: string | null
          changes?: Json | null
          created_at?: string
          event_id?: string | null
          id?: string
          is_automated?: boolean
          is_dry_run?: boolean | null
          metrics_at_event?: Json | null
          rule_name?: string | null
          scope?: string
          scope_id?: string | null
          scope_name?: string | null
          summary?: string | null
          timestamp?: string
          type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      upsert_ad_blocks: { Args: { rows: Json }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  organic: {
    Tables: {
      awareness_reports: {
        Row: {
          brand_id: string
          created_at: string
          external_account_id: string
          generated_at: string
          id: string
          payload: Json
          run_id: string
          window_end: string
          window_start: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          external_account_id: string
          generated_at?: string
          id?: string
          payload: Json
          run_id: string
          window_end: string
          window_start: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          external_account_id?: string
          generated_at?: string
          id?: string
          payload?: Json
          run_id?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      hyperframe_mp4_renders: {
        Row: {
          brand_id: string
          composition_id: string
          created_at: string
          draft_id: string | null
          error_message: string | null
          mp4_bucket: string | null
          mp4_path: string | null
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          composition_id: string
          created_at?: string
          draft_id?: string | null
          error_message?: string | null
          mp4_bucket?: string | null
          mp4_path?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          composition_id?: string
          created_at?: string
          draft_id?: string | null
          error_message?: string | null
          mp4_bucket?: string | null
          mp4_path?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      media_insights_cache: {
        Row: {
          expires_at: string
          external_account_id: string
          fetched_at: string
          media_id: string
          payload: Json
          request_hash: string
        }
        Insert: {
          expires_at: string
          external_account_id: string
          fetched_at?: string
          media_id: string
          payload: Json
          request_hash: string
        }
        Update: {
          expires_at?: string
          external_account_id?: string
          fetched_at?: string
          media_id?: string
          payload?: Json
          request_hash?: string
        }
        Relationships: []
      }
      organic_agent_plans: {
        Row: {
          brand_id: string
          created_at: string
          estimated_duration_seconds: number
          evidence: Json
          items: Json
          kind: string
          plan_id: string
          schedule: Json | null
          session_id: string
          status: string
          strategy_brief: Json | null
          summary: string
          title: string
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          estimated_duration_seconds?: number
          evidence?: Json
          items: Json
          kind?: string
          plan_id: string
          schedule?: Json | null
          session_id: string
          status?: string
          strategy_brief?: Json | null
          summary: string
          title: string
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          estimated_duration_seconds?: number
          evidence?: Json
          items?: Json
          kind?: string
          plan_id?: string
          schedule?: Json | null
          session_id?: string
          status?: string
          strategy_brief?: Json | null
          summary?: string
          title?: string
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      organic_agent_run_events: {
        Row: {
          created_at: string
          event_id: string
          payload: Json
          run_id: string
          seq: number
          type: string
        }
        Insert: {
          created_at?: string
          event_id: string
          payload: Json
          run_id: string
          seq: number
          type: string
        }
        Update: {
          created_at?: string
          event_id?: string
          payload?: Json
          run_id?: string
          seq?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "organic_agent_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "organic_agent_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      organic_agent_runs: {
        Row: {
          brand_id: string
          created_at: string
          error_message: string | null
          expires_at: string
          finished_at: string | null
          idempotency_key: string | null
          request_payload: Json
          run_id: string
          session_id: string
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          error_message?: string | null
          expires_at?: string
          finished_at?: string | null
          idempotency_key?: string | null
          request_payload: Json
          run_id: string
          session_id: string
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          error_message?: string | null
          expires_at?: string
          finished_at?: string | null
          idempotency_key?: string | null
          request_payload?: Json
          run_id?: string
          session_id?: string
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      organic_calendar_drafts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          content_json: Json | null
          content_plan_id: string | null
          created_at: string
          id: string
          instagram_post_id: string | null
          media_stage: string
          platform: string | null
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
          approved_at?: string | null
          approved_by?: string | null
          brand_id: string
          content_json?: Json | null
          content_plan_id?: string | null
          created_at?: string
          id?: string
          instagram_post_id?: string | null
          media_stage?: string
          platform?: string | null
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
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          content_json?: Json | null
          content_plan_id?: string | null
          created_at?: string
          id?: string
          instagram_post_id?: string | null
          media_stage?: string
          platform?: string | null
          platform_account_id?: string
          position?: Json | null
          published_at?: string | null
          scheduled_date?: string | null
          slot_data?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      organic_chat_messages: {
        Row: {
          brand_id: string
          content: string
          created_at: string
          id: number
          metadata: Json | null
          role: string
          session_id: string
          ui_cards: Json
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          brand_id: string
          content: string
          created_at?: string
          id?: never
          metadata?: Json | null
          role: string
          session_id: string
          ui_cards?: Json
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          brand_id?: string
          content?: string
          created_at?: string
          id?: never
          metadata?: Json | null
          role?: string
          session_id?: string
          ui_cards?: Json
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      organic_chat_sessions: {
        Row: {
          brand_id: string
          created_at: string
          id: number
          last_message_at: string | null
          last_message_preview: string | null
          last_message_role: string | null
          session_id: string
          timezone: string
          title: string | null
          updated_at: string
          user_email: string | null
          user_id: string
          week_start: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: never
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_role?: string | null
          session_id: string
          timezone?: string
          title?: string | null
          updated_at?: string
          user_email?: string | null
          user_id: string
          week_start?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: never
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_role?: string | null
          session_id?: string
          timezone?: string
          title?: string | null
          updated_at?: string
          user_email?: string | null
          user_id?: string
          week_start?: string | null
        }
        Relationships: []
      }
      organic_content_plans: {
        Row: {
          brand_id: string
          created_at: string
          guidance: string | null
          id: string
          placements: Json
          platform_account_ids: Json
          run_idempotency_key: string | null
          session_id: string
          status: string
          timezone: string
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          guidance?: string | null
          id?: string
          placements?: Json
          platform_account_ids?: Json
          run_idempotency_key?: string | null
          session_id: string
          status?: string
          timezone?: string
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          guidance?: string | null
          id?: string
          placements?: Json
          platform_account_ids?: Json
          run_idempotency_key?: string | null
          session_id?: string
          status?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      organic_draft_sessions: {
        Row: {
          backlog_drafts: Json
          brand_profile_id: string
          days: Json
          id: string
          saved_at: string
          user_id: string
          week_start_id: string
        }
        Insert: {
          backlog_drafts?: Json
          brand_profile_id: string
          days?: Json
          id?: string
          saved_at?: string
          user_id: string
          week_start_id: string
        }
        Update: {
          backlog_drafts?: Json
          brand_profile_id?: string
          days?: Json
          id?: string
          saved_at?: string
          user_id?: string
          week_start_id?: string
        }
        Relationships: []
      }
      organic_persist_failures: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          payload: Json | null
          placement_id: string
          reason: string
          run_id: string
          user_id: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          payload?: Json | null
          placement_id: string
          reason: string
          run_id: string
          user_id?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          payload?: Json | null
          placement_id?: string
          reason?: string
          run_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      organic_publish_attempts: {
        Row: {
          attempted_at: string
          brand_id: string
          caption_sent: string | null
          completed_at: string | null
          draft_id: string | null
          error_code: string | null
          error_message: string | null
          id: number
          ig_user_id: string
          instagram_post_id: string | null
          media_urls: Json | null
          post_type: string
          status: string
        }
        Insert: {
          attempted_at?: string
          brand_id: string
          caption_sent?: string | null
          completed_at?: string | null
          draft_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: never
          ig_user_id: string
          instagram_post_id?: string | null
          media_urls?: Json | null
          post_type: string
          status: string
        }
        Update: {
          attempted_at?: string
          brand_id?: string
          caption_sent?: string | null
          completed_at?: string | null
          draft_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: never
          ig_user_id?: string
          instagram_post_id?: string | null
          media_urls?: Json | null
          post_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "organic_publish_attempts_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "organic_calendar_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organic_publish_attempts_post_fk"
            columns: ["instagram_post_id"]
            isOneToOne: false
            referencedRelation: "organic_published_posts"
            referencedColumns: ["instagram_post_id"]
          },
        ]
      }
      organic_published_posts: {
        Row: {
          brand_id: string
          caption: string | null
          content_snapshot: Json | null
          created_at: string
          draft_id: string | null
          ig_user_id: string
          insights_last_synced_at: string | null
          instagram_post_id: string
          media_urls: Json | null
          permalink: string | null
          post_type: string
          published_at: string
        }
        Insert: {
          brand_id: string
          caption?: string | null
          content_snapshot?: Json | null
          created_at?: string
          draft_id?: string | null
          ig_user_id: string
          insights_last_synced_at?: string | null
          instagram_post_id: string
          media_urls?: Json | null
          permalink?: string | null
          post_type: string
          published_at: string
        }
        Update: {
          brand_id?: string
          caption?: string | null
          content_snapshot?: Json | null
          created_at?: string
          draft_id?: string | null
          ig_user_id?: string
          insights_last_synced_at?: string | null
          instagram_post_id?: string
          media_urls?: Json | null
          permalink?: string | null
          post_type?: string
          published_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organic_published_posts_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "organic_calendar_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      organic_runs: {
        Row: {
          brand_id: string
          finished_at: string | null
          heartbeat_at: string
          idempotency_key: string | null
          run_id: string
          started_at: string
          status: string
          summary: Json | null
          user_id: string | null
        }
        Insert: {
          brand_id: string
          finished_at?: string | null
          heartbeat_at?: string
          idempotency_key?: string | null
          run_id: string
          started_at?: string
          status?: string
          summary?: Json | null
          user_id?: string | null
        }
        Update: {
          brand_id?: string
          finished_at?: string | null
          heartbeat_at?: string
          idempotency_key?: string | null
          run_id?: string
          started_at?: string
          status?: string
          summary?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      organic_whatsapp_brands: {
        Row: {
          brand_id: string
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
          wa_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
          wa_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
          wa_id?: string
        }
        Relationships: []
      }
      post_generation_jobs: {
        Row: {
          account_id: string | null
          attempts: number
          brand_id: string
          cancel_requested: boolean
          claimed_at: string | null
          completed_at: string | null
          creative_brief: Json | null
          dead_lettered_at: string | null
          dispatch_context: Json | null
          draft_id: string | null
          enqueued_at: string
          error: Json | null
          expires_at: string
          guidance_prompt: string | null
          heartbeat_at: string | null
          job_id: string
          job_type: string
          last_error: Json | null
          max_attempts: number
          next_run_at: string
          payload: Json | null
          plan_id: string | null
          plan_item_id: string | null
          platform: string
          progress: Json
          scheduled_at: string
          session_id: string
          started_at: string | null
          status: Database["organic"]["Enums"]["post_generation_job_status"]
          trend_id: string | null
          updated_at: string
          user_id: string
          worker_id: string | null
        }
        Insert: {
          account_id?: string | null
          attempts?: number
          brand_id: string
          cancel_requested?: boolean
          claimed_at?: string | null
          completed_at?: string | null
          creative_brief?: Json | null
          dead_lettered_at?: string | null
          dispatch_context?: Json | null
          draft_id?: string | null
          enqueued_at?: string
          error?: Json | null
          expires_at?: string
          guidance_prompt?: string | null
          heartbeat_at?: string | null
          job_id?: string
          job_type?: string
          last_error?: Json | null
          max_attempts?: number
          next_run_at?: string
          payload?: Json | null
          plan_id?: string | null
          plan_item_id?: string | null
          platform: string
          progress?: Json
          scheduled_at: string
          session_id: string
          started_at?: string | null
          status?: Database["organic"]["Enums"]["post_generation_job_status"]
          trend_id?: string | null
          updated_at?: string
          user_id: string
          worker_id?: string | null
        }
        Update: {
          account_id?: string | null
          attempts?: number
          brand_id?: string
          cancel_requested?: boolean
          claimed_at?: string | null
          completed_at?: string | null
          creative_brief?: Json | null
          dead_lettered_at?: string | null
          dispatch_context?: Json | null
          draft_id?: string | null
          enqueued_at?: string
          error?: Json | null
          expires_at?: string
          guidance_prompt?: string | null
          heartbeat_at?: string | null
          job_id?: string
          job_type?: string
          last_error?: Json | null
          max_attempts?: number
          next_run_at?: string
          payload?: Json | null
          plan_id?: string | null
          plan_item_id?: string | null
          platform?: string
          progress?: Json
          scheduled_at?: string
          session_id?: string
          started_at?: string | null
          status?: Database["organic"]["Enums"]["post_generation_job_status"]
          trend_id?: string | null
          updated_at?: string
          user_id?: string
          worker_id?: string | null
        }
        Relationships: []
      }
      post_metric_snapshots: {
        Row: {
          brand_id: string | null
          captured_date: string
          comments: number | null
          external_account_id: string
          fetched_at: string
          id: string
          likes: number | null
          media_id: string
          reach: number | null
          reels_avg_watch_time: number | null
          reels_skip_rate: number | null
          reels_video_view_total_time: number | null
          saved: number | null
          shares: number | null
          total_interactions: number | null
          views: number | null
        }
        Insert: {
          brand_id?: string | null
          captured_date: string
          comments?: number | null
          external_account_id: string
          fetched_at?: string
          id?: string
          likes?: number | null
          media_id: string
          reach?: number | null
          reels_avg_watch_time?: number | null
          reels_skip_rate?: number | null
          reels_video_view_total_time?: number | null
          saved?: number | null
          shares?: number | null
          total_interactions?: number | null
          views?: number | null
        }
        Update: {
          brand_id?: string | null
          captured_date?: string
          comments?: number | null
          external_account_id?: string
          fetched_at?: string
          id?: string
          likes?: number | null
          media_id?: string
          reach?: number | null
          reels_avg_watch_time?: number | null
          reels_skip_rate?: number | null
          reels_video_view_total_time?: number | null
          saved?: number | null
          shares?: number | null
          total_interactions?: number | null
          views?: number | null
        }
        Relationships: []
      }
      tiktok_account_metrics: {
        Row: {
          avatar_url: string | null
          bio_description: string | null
          brand_id: string
          created_at: string
          display_name: string | null
          external_account_id: string
          fetched_at: string
          follower_count: number | null
          following_count: number | null
          id: string
          integration_account_id: string
          is_verified: boolean | null
          likes_count: number | null
          profile_deep_link: string | null
          username: string | null
          video_count: number | null
        }
        Insert: {
          avatar_url?: string | null
          bio_description?: string | null
          brand_id: string
          created_at?: string
          display_name?: string | null
          external_account_id: string
          fetched_at?: string
          follower_count?: number | null
          following_count?: number | null
          id?: string
          integration_account_id: string
          is_verified?: boolean | null
          likes_count?: number | null
          profile_deep_link?: string | null
          username?: string | null
          video_count?: number | null
        }
        Update: {
          avatar_url?: string | null
          bio_description?: string | null
          brand_id?: string
          created_at?: string
          display_name?: string | null
          external_account_id?: string
          fetched_at?: string
          follower_count?: number | null
          following_count?: number | null
          id?: string
          integration_account_id?: string
          is_verified?: boolean | null
          likes_count?: number | null
          profile_deep_link?: string | null
          username?: string | null
          video_count?: number | null
        }
        Relationships: []
      }
      tiktok_videos: {
        Row: {
          brand_id: string
          comment_count: number | null
          cover_image_url: string | null
          create_time: string | null
          created_at: string
          duration: number | null
          embed_html: string | null
          embed_link: string | null
          external_account_id: string
          fetched_at: string
          height: number | null
          id: string
          integration_account_id: string
          like_count: number | null
          share_count: number | null
          share_url: string | null
          title: string | null
          updated_at: string
          video_description: string | null
          video_id: string
          view_count: number | null
          width: number | null
        }
        Insert: {
          brand_id: string
          comment_count?: number | null
          cover_image_url?: string | null
          create_time?: string | null
          created_at?: string
          duration?: number | null
          embed_html?: string | null
          embed_link?: string | null
          external_account_id: string
          fetched_at?: string
          height?: number | null
          id?: string
          integration_account_id: string
          like_count?: number | null
          share_count?: number | null
          share_url?: string | null
          title?: string | null
          updated_at?: string
          video_description?: string | null
          video_id: string
          view_count?: number | null
          width?: number | null
        }
        Update: {
          brand_id?: string
          comment_count?: number | null
          cover_image_url?: string | null
          create_time?: string | null
          created_at?: string
          duration?: number | null
          embed_html?: string | null
          embed_link?: string | null
          external_account_id?: string
          fetched_at?: string
          height?: number | null
          id?: string
          integration_account_id?: string
          like_count?: number | null
          share_count?: number | null
          share_url?: string | null
          title?: string | null
          updated_at?: string
          video_description?: string | null
          video_id?: string
          view_count?: number | null
          width?: number | null
        }
        Relationships: []
      }
      trend_signals: {
        Row: {
          brand_id: string
          discovered_at: string
          expires_at: string | null
          growth_rate: number | null
          id: string
          kind: string
          label: string
          metadata: Json
          platform: string
          sample_count: number
          sample_url: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          discovered_at?: string
          expires_at?: string | null
          growth_rate?: number | null
          id?: string
          kind: string
          label: string
          metadata?: Json
          platform: string
          sample_count?: number
          sample_url?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          discovered_at?: string
          expires_at?: string | null
          growth_rate?: number | null
          id?: string
          kind?: string
          label?: string
          metadata?: Json
          platform?: string
          sample_count?: number
          sample_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_post_generation_job: {
        Args: { p_job_id: string }
        Returns: {
          account_id: string | null
          attempts: number
          brand_id: string
          cancel_requested: boolean
          claimed_at: string | null
          completed_at: string | null
          creative_brief: Json | null
          dead_lettered_at: string | null
          dispatch_context: Json | null
          draft_id: string | null
          enqueued_at: string
          error: Json | null
          expires_at: string
          guidance_prompt: string | null
          heartbeat_at: string | null
          job_id: string
          job_type: string
          last_error: Json | null
          max_attempts: number
          next_run_at: string
          payload: Json | null
          plan_id: string | null
          plan_item_id: string | null
          platform: string
          progress: Json
          scheduled_at: string
          session_id: string
          started_at: string | null
          status: Database["organic"]["Enums"]["post_generation_job_status"]
          trend_id: string | null
          updated_at: string
          user_id: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "post_generation_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_next_post_generation_job: {
        Args: { p_lease_ttl_sec: number; p_worker_id: string }
        Returns: {
          account_id: string | null
          attempts: number
          brand_id: string
          cancel_requested: boolean
          claimed_at: string | null
          completed_at: string | null
          creative_brief: Json | null
          dead_lettered_at: string | null
          dispatch_context: Json | null
          draft_id: string | null
          enqueued_at: string
          error: Json | null
          expires_at: string
          guidance_prompt: string | null
          heartbeat_at: string | null
          job_id: string
          job_type: string
          last_error: Json | null
          max_attempts: number
          next_run_at: string
          payload: Json | null
          plan_id: string | null
          plan_item_id: string | null
          platform: string
          progress: Json
          scheduled_at: string
          session_id: string
          started_at: string | null
          status: Database["organic"]["Enums"]["post_generation_job_status"]
          trend_id: string | null
          updated_at: string
          user_id: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "post_generation_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_post_generation_job: {
        Args: {
          p_draft_id?: string
          p_error?: Json
          p_job_id: string
          p_status: Database["organic"]["Enums"]["post_generation_job_status"]
        }
        Returns: undefined
      }
      complete_post_generation_job_owned: {
        Args: {
          p_draft_id?: string
          p_error?: Json
          p_job_id: string
          p_status: Database["organic"]["Enums"]["post_generation_job_status"]
          p_worker_id: string
        }
        Returns: boolean
      }
      enqueue_post_generation_job: {
        Args: {
          p_account_id: string
          p_brand_id: string
          p_creative_brief?: Json
          p_guidance_prompt: string
          p_job_type?: string
          p_payload?: Json
          p_plan_id?: string
          p_plan_item_id?: string
          p_platform: string
          p_scheduled_at: string
          p_session_id: string
          p_trend_id: string
          p_user_id: string
        }
        Returns: string
      }
      fail_or_retry_post_generation_job: {
        Args: {
          p_backoff_sec: number
          p_error: Json
          p_job_id: string
          p_worker_id: string
        }
        Returns: string
      }
      get_post_generation_job: {
        Args: { p_job_id: string }
        Returns: {
          account_id: string | null
          attempts: number
          brand_id: string
          cancel_requested: boolean
          claimed_at: string | null
          completed_at: string | null
          creative_brief: Json | null
          dead_lettered_at: string | null
          dispatch_context: Json | null
          draft_id: string | null
          enqueued_at: string
          error: Json | null
          expires_at: string
          guidance_prompt: string | null
          heartbeat_at: string | null
          job_id: string
          job_type: string
          last_error: Json | null
          max_attempts: number
          next_run_at: string
          payload: Json | null
          plan_id: string | null
          plan_item_id: string | null
          platform: string
          progress: Json
          scheduled_at: string
          session_id: string
          started_at: string | null
          status: Database["organic"]["Enums"]["post_generation_job_status"]
          trend_id: string | null
          updated_at: string
          user_id: string
          worker_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "post_generation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      heartbeat_post_generation_job: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: boolean
      }
      list_post_generation_jobs_by_session:
        | {
            Args: { p_brand_id: string; p_limit?: number; p_session_id: string }
            Returns: {
              account_id: string | null
              attempts: number
              brand_id: string
              cancel_requested: boolean
              claimed_at: string | null
              completed_at: string | null
              creative_brief: Json | null
              dead_lettered_at: string | null
              dispatch_context: Json | null
              draft_id: string | null
              enqueued_at: string
              error: Json | null
              expires_at: string
              guidance_prompt: string | null
              heartbeat_at: string | null
              job_id: string
              job_type: string
              last_error: Json | null
              max_attempts: number
              next_run_at: string
              payload: Json | null
              plan_id: string | null
              plan_item_id: string | null
              platform: string
              progress: Json
              scheduled_at: string
              session_id: string
              started_at: string | null
              status: Database["organic"]["Enums"]["post_generation_job_status"]
              trend_id: string | null
              updated_at: string
              user_id: string
              worker_id: string | null
            }[]
            SetofOptions: {
              from: "*"
              to: "post_generation_jobs"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
            Args: {
              p_brand_id: string
              p_limit?: number
              p_session_id: string
              p_user_id: string
            }
            Returns: {
              account_id: string | null
              attempts: number
              brand_id: string
              cancel_requested: boolean
              claimed_at: string | null
              completed_at: string | null
              creative_brief: Json | null
              dead_lettered_at: string | null
              dispatch_context: Json | null
              draft_id: string | null
              enqueued_at: string
              error: Json | null
              expires_at: string
              guidance_prompt: string | null
              heartbeat_at: string | null
              job_id: string
              job_type: string
              last_error: Json | null
              max_attempts: number
              next_run_at: string
              payload: Json | null
              plan_id: string | null
              plan_item_id: string | null
              platform: string
              progress: Json
              scheduled_at: string
              session_id: string
              started_at: string | null
              status: Database["organic"]["Enums"]["post_generation_job_status"]
              trend_id: string | null
              updated_at: string
              user_id: string
              worker_id: string | null
            }[]
            SetofOptions: {
              from: "*"
              to: "post_generation_jobs"
              isOneToOne: false
              isSetofReturn: true
            }
          }
      requeue_post_generation_job: {
        Args: { p_backoff_sec: number; p_job_id: string; p_worker_id: string }
        Returns: boolean
      }
      update_post_generation_job_progress: {
        Args: { p_job_id: string; p_progress: Json }
        Returns: undefined
      }
    }
    Enums: {
      post_generation_job_status:
        | "queued"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  paid_media: {
    Tables: {
      paid_media_ad_objects: {
        Row: {
          brand_id: string
          created_at: string
          external_object_id: string
          id: string
          name: string | null
          object_type: string
          platform: string
          status: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          external_object_id: string
          id?: string
          name?: string | null
          object_type: string
          platform: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          external_object_id?: string
          id?: string
          name?: string | null
          object_type?: string
          platform?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      paid_media_catalog_products: {
        Row: {
          availability: string
          brand_id: string
          catalog_id: string
          created_at: string
          currency: string | null
          external_product_id: string
          id: string
          image_url: string | null
          product_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          availability?: string
          brand_id: string
          catalog_id: string
          created_at?: string
          currency?: string | null
          external_product_id: string
          id?: string
          image_url?: string | null
          product_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          availability?: string
          brand_id?: string
          catalog_id?: string
          created_at?: string
          currency?: string | null
          external_product_id?: string
          id?: string
          image_url?: string | null
          product_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_catalog_products_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "paid_media_product_catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_media_product_ad_activity: {
        Row: {
          active_from: string | null
          active_to: string | null
          ad_object_id: string
          brand_id: string
          catalog_id: string
          created_at: string
          first_seen_at: string
          id: string
          is_active: boolean
          last_seen_at: string
          product_id: string
          source: string
          sync_job_id: string | null
          updated_at: string
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          ad_object_id: string
          brand_id: string
          catalog_id: string
          created_at?: string
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          product_id: string
          source?: string
          sync_job_id?: string | null
          updated_at?: string
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          ad_object_id?: string
          brand_id?: string
          catalog_id?: string
          created_at?: string
          first_seen_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          product_id?: string
          source?: string
          sync_job_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_product_ad_activity_ad_object_id_fkey"
            columns: ["ad_object_id"]
            isOneToOne: false
            referencedRelation: "paid_media_ad_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_product_ad_activity_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "paid_media_product_catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_product_ad_activity_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "paid_media_catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_media_product_catalog_links: {
        Row: {
          active_from: string | null
          active_to: string | null
          ad_object_id: string
          brand_id: string
          catalog_id: string
          created_at: string
          first_seen_at: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          product_id: string
          source: string | null
          sync_job_id: string | null
          updated_at: string
        }
        Insert: {
          active_from?: string | null
          active_to?: string | null
          ad_object_id: string
          brand_id: string
          catalog_id: string
          created_at?: string
          first_seen_at?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          product_id: string
          source?: string | null
          sync_job_id?: string | null
          updated_at?: string
        }
        Update: {
          active_from?: string | null
          active_to?: string | null
          ad_object_id?: string
          brand_id?: string
          catalog_id?: string
          created_at?: string
          first_seen_at?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          product_id?: string
          source?: string | null
          sync_job_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_media_product_catalog_links_ad_object_id_fkey"
            columns: ["ad_object_id"]
            isOneToOne: false
            referencedRelation: "paid_media_ad_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_product_catalog_links_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "paid_media_product_catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_media_product_catalog_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "paid_media_catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_media_product_catalogs: {
        Row: {
          brand_id: string
          business_id: string | null
          catalog_store_id: string | null
          config: Json
          created_at: string
          currency: string | null
          data_feed_enabled: boolean
          default_image_url: string | null
          external_catalog_id: string | null
          fallback_image_url: string | null
          feed_count: number
          feed_url: string | null
          id: string
          last_synced_at: string | null
          linked_ad_object_ids: string[]
          linked_ad_object_level: string
          name: string
          notes: string | null
          product_count: number
          product_set_count: number
          product_tagging_enabled: boolean
          sync_status: string
          updated_at: string
          vertical: string
        }
        Insert: {
          brand_id: string
          business_id?: string | null
          catalog_store_id?: string | null
          config?: Json
          created_at?: string
          currency?: string | null
          data_feed_enabled?: boolean
          default_image_url?: string | null
          external_catalog_id?: string | null
          fallback_image_url?: string | null
          feed_count?: number
          feed_url?: string | null
          id?: string
          last_synced_at?: string | null
          linked_ad_object_ids?: string[]
          linked_ad_object_level?: string
          name: string
          notes?: string | null
          product_count?: number
          product_set_count?: number
          product_tagging_enabled?: boolean
          sync_status?: string
          updated_at?: string
          vertical?: string
        }
        Update: {
          brand_id?: string
          business_id?: string | null
          catalog_store_id?: string | null
          config?: Json
          created_at?: string
          currency?: string | null
          data_feed_enabled?: boolean
          default_image_url?: string | null
          external_catalog_id?: string | null
          fallback_image_url?: string | null
          feed_count?: number
          feed_url?: string | null
          id?: string
          last_synced_at?: string | null
          linked_ad_object_ids?: string[]
          linked_ad_object_level?: string
          name?: string
          notes?: string | null
          product_count?: number
          product_set_count?: number
          product_tagging_enabled?: boolean
          sync_status?: string
          updated_at?: string
          vertical?: string
        }
        Relationships: []
      }
      report_jobs: {
        Row: {
          ad_account_id: string
          artifact_grounding: Json | null
          brand_id: string
          campaign_ids: string[] | null
          campaign_targets: Json | null
          created_at: string
          delivered_at: string | null
          delivery_attempts: number
          delivery_claimed_at: string | null
          delivery_claimed_by: string | null
          delivery_status: string | null
          directionality: string | null
          error_message: string | null
          file_path: string | null
          file_url: string | null
          job_id: string
          origin_channel_id: string | null
          origin_platform: string | null
          origin_platform_user_id: string | null
          origin_thread_id: string | null
          status: string
          step_index: number
          step_name: string | null
          steps_json: Json
          updated_at: string
          user_email: string | null
        }
        Insert: {
          ad_account_id: string
          artifact_grounding?: Json | null
          brand_id: string
          campaign_ids?: string[] | null
          campaign_targets?: Json | null
          created_at?: string
          delivered_at?: string | null
          delivery_attempts?: number
          delivery_claimed_at?: string | null
          delivery_claimed_by?: string | null
          delivery_status?: string | null
          directionality?: string | null
          error_message?: string | null
          file_path?: string | null
          file_url?: string | null
          job_id: string
          origin_channel_id?: string | null
          origin_platform?: string | null
          origin_platform_user_id?: string | null
          origin_thread_id?: string | null
          status?: string
          step_index?: number
          step_name?: string | null
          steps_json?: Json
          updated_at?: string
          user_email?: string | null
        }
        Update: {
          ad_account_id?: string
          artifact_grounding?: Json | null
          brand_id?: string
          campaign_ids?: string[] | null
          campaign_targets?: Json | null
          created_at?: string
          delivered_at?: string | null
          delivery_attempts?: number
          delivery_claimed_at?: string | null
          delivery_claimed_by?: string | null
          delivery_status?: string | null
          directionality?: string | null
          error_message?: string | null
          file_path?: string | null
          file_url?: string | null
          job_id?: string
          origin_channel_id?: string | null
          origin_platform?: string | null
          origin_platform_user_id?: string | null
          origin_thread_id?: string | null
          status?: string
          step_index?: number
          step_name?: string | null
          steps_json?: Json
          updated_at?: string
          user_email?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
      rule_action_decisions: {
        Row: {
          action_type: string
          actor_id: string
          actor_user_id: string | null
          brand_id: string
          decided_at: string
          decision: string
          error: string | null
          id: string
          is_dry_run: boolean
          note: string | null
          reason: string | null
          rule_action_id: string
          scope_id: string | null
          scope_type: string | null
          upstream_result: Json | null
        }
        Insert: {
          action_type: string
          actor_id: string
          actor_user_id?: string | null
          brand_id: string
          decided_at?: string
          decision: string
          error?: string | null
          id?: string
          is_dry_run?: boolean
          note?: string | null
          reason?: string | null
          rule_action_id: string
          scope_id?: string | null
          scope_type?: string | null
          upstream_result?: Json | null
        }
        Update: {
          action_type?: string
          actor_id?: string
          actor_user_id?: string | null
          brand_id?: string
          decided_at?: string
          decision?: string
          error?: string | null
          id?: string
          is_dry_run?: boolean
          note?: string | null
          reason?: string | null
          rule_action_id?: string
          scope_id?: string | null
          scope_type?: string | null
          upstream_result?: Json | null
        }
        Relationships: []
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
      workflow_library: {
        Row: {
          content: Json
          created_at: string
          description: string | null
          id: string
          name: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          description?: string | null
          id?: string
          name: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
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
      get_google_access_token: {
        Args: { p_customer_id: string }
        Returns: string
      }
      get_meta_access_token: {
        Args: { p_ad_account_id: string }
        Returns: string
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
      match_brand_documents: {
        Args: {
          filter_brand_id: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: number
          similarity: number
        }[]
      }
      match_brand_insights_events: {
        Args: {
          filter_brand_id: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          description: string
          event_date: string
          id: string
          opportunity: string
          similarity: number
          title: string
        }[]
      }
      match_brand_insights_questions: {
        Args: {
          filter_brand_id: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          id: string
          niche: string
          question_text: string
          similarity: number
          social_platform: string
          why_relevant: string
        }[]
      }
      match_brand_insights_trends: {
        Args: {
          filter_brand_id: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          description: string
          id: string
          relevance_to_brand: string
          similarity: number
          title: string
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
      match_strategic_analysis_embeddings: {
        Args: {
          filter_brand_id: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          embedding_text: string
          id: string
          label: string
          section: string
          similarity: number
        }[]
      }
      process_scheduled_reports: { Args: never; Returns: Json }
      resolve_meta_context_by_brand_id: {
        Args: { p_brand_id: string }
        Returns: {
          access_token: string
          ad_account_id: string
          facebook_page_ids: string[]
          instagram_account_ids: string[]
          integration_ids: string[]
          resolution_source: string
        }[]
      }
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
  brand_integrations: {
    Enums: {},
  },
  brand_profiles: {
    Enums: {
      brand_guideline_job_status: ["queued", "running", "completed", "failed"],
      brand_report_job_status: ["queued", "running", "completed", "failed"],
    },
  },
  brand_trends: {
    Enums: {},
  },
  DCO_Campaigns: {
    Enums: {},
  },
  organic: {
    Enums: {
      post_generation_job_status: [
        "queued",
        "running",
        "completed",
        "failed",
        "cancelled",
      ],
    },
  },
  paid_media: {
    Enums: {},
  },
  public: {
    Enums: {
      report_status: ["in-progress", "active", "inactive", "deleted"],
      scheduled_report_status: ["active", "paused", "failed", "cancelled"],
    },
  },
} as const
