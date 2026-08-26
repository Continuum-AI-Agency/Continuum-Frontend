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
  agent_workspace: {
    Tables: {
      alignments: {
        Row: {
          brand_id: string
          created_at: string
          goal_id: string
          id: string
          record: Json
          status: string
          subject_id: string
          subject_kind: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          goal_id: string
          id: string
          record: Json
          status: string
          subject_id: string
          subject_kind: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          goal_id?: string
          id?: string
          record?: Json
          status?: string
          subject_id?: string
          subject_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "alignments_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_dependency_versions: {
        Row: {
          artifact_id: string
          brand_id: string
          captured_at: string
          goal_id: string
          upstream_accepted_version_id: string
          upstream_artifact_id: string
        }
        Insert: {
          artifact_id: string
          brand_id: string
          captured_at?: string
          goal_id: string
          upstream_accepted_version_id: string
          upstream_artifact_id: string
        }
        Update: {
          artifact_id?: string
          brand_id?: string
          captured_at?: string
          goal_id?: string
          upstream_accepted_version_id?: string
          upstream_artifact_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifact_dependency_versions_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifact_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_dependency_versions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_dependency_versions_upstream_artifact_id_fkey"
            columns: ["upstream_artifact_id"]
            isOneToOne: false
            referencedRelation: "artifact_refs"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_refs: {
        Row: {
          accepted_at: string | null
          accepted_by: Json | null
          accepted_version_id: string | null
          artifact_type: string
          brand_id: string
          completed_section_ids: Json
          content_schema_id: string | null
          content_schema_version: number | null
          contributors: Json
          created_at: string
          evidence_ids: Json
          format: string
          goal_id: string
          head_version_id: string | null
          id: string
          library_asset_id: string
          promoted_at: string | null
          promoted_document_id: string | null
          record: Json
          required_section_ids: Json
          requirement: string
          resource_ids: Json
          reviewers: Json
          stale_at: string | null
          stale_reason: string | null
          status: string
          template_artifact_id: string | null
          title: string
          updated_at: string
          validated_version_id: string | null
          waiver_reason: string | null
          workstream_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: Json | null
          accepted_version_id?: string | null
          artifact_type: string
          brand_id: string
          completed_section_ids?: Json
          content_schema_id?: string | null
          content_schema_version?: number | null
          contributors?: Json
          created_at?: string
          evidence_ids?: Json
          format: string
          goal_id: string
          head_version_id?: string | null
          id: string
          library_asset_id: string
          promoted_at?: string | null
          promoted_document_id?: string | null
          record: Json
          required_section_ids?: Json
          requirement: string
          resource_ids?: Json
          reviewers?: Json
          stale_at?: string | null
          stale_reason?: string | null
          status: string
          template_artifact_id?: string | null
          title: string
          updated_at?: string
          validated_version_id?: string | null
          waiver_reason?: string | null
          workstream_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: Json | null
          accepted_version_id?: string | null
          artifact_type?: string
          brand_id?: string
          completed_section_ids?: Json
          content_schema_id?: string | null
          content_schema_version?: number | null
          contributors?: Json
          created_at?: string
          evidence_ids?: Json
          format?: string
          goal_id?: string
          head_version_id?: string | null
          id?: string
          library_asset_id?: string
          promoted_at?: string | null
          promoted_document_id?: string | null
          record?: Json
          required_section_ids?: Json
          requirement?: string
          resource_ids?: Json
          reviewers?: Json
          stale_at?: string | null
          stale_reason?: string | null
          status?: string
          template_artifact_id?: string | null
          title?: string
          updated_at?: string
          validated_version_id?: string | null
          waiver_reason?: string | null
          workstream_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artifact_refs_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_refs_workstream_id_fkey"
            columns: ["workstream_id"]
            isOneToOne: false
            referencedRelation: "workstreams"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_reviews: {
        Row: {
          artifact_id: string
          brand_id: string
          decision: string
          goal_id: string
          id: string
          note: string | null
          reviewed_at: string
          reviewed_by: Json
          version_id: string
        }
        Insert: {
          artifact_id: string
          brand_id: string
          decision: string
          goal_id: string
          id?: string
          note?: string | null
          reviewed_at?: string
          reviewed_by: Json
          version_id: string
        }
        Update: {
          artifact_id?: string
          brand_id?: string
          decision?: string
          goal_id?: string
          id?: string
          note?: string | null
          reviewed_at?: string
          reviewed_by?: Json
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifact_reviews_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifact_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_reviews_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          assignee: Json | null
          brand_id: string
          capability: string
          created_at: string
          goal_id: string
          id: string
          record: Json
          responsibility: string
          status: string
          updated_at: string
          workstream_id: string | null
        }
        Insert: {
          assignee?: Json | null
          brand_id: string
          capability: string
          created_at?: string
          goal_id: string
          id: string
          record: Json
          responsibility: string
          status: string
          updated_at?: string
          workstream_id?: string | null
        }
        Update: {
          assignee?: Json | null
          brand_id?: string
          capability?: string
          created_at?: string
          goal_id?: string
          id?: string
          record?: Json
          responsibility?: string
          status?: string
          updated_at?: string
          workstream_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_workstream_id_fkey"
            columns: ["workstream_id"]
            isOneToOne: false
            referencedRelation: "workstreams"
            referencedColumns: ["id"]
          },
        ]
      }
      command_receipts: {
        Row: {
          brand_id: string
          command_id: string
          created_at: string
          goal_id: string
          response: Json
        }
        Insert: {
          brand_id: string
          command_id: string
          created_at?: string
          goal_id: string
          response: Json
        }
        Update: {
          brand_id?: string
          command_id?: string
          created_at?: string
          goal_id?: string
          response?: Json
        }
        Relationships: [
          {
            foreignKeyName: "command_receipts_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          brand_id: string
          created_at: string
          decided_at: string
          goal_id: string
          id: string
          question: string
          record: Json
        }
        Insert: {
          brand_id: string
          created_at?: string
          decided_at: string
          goal_id: string
          id: string
          question: string
          record: Json
        }
        Update: {
          brand_id?: string
          created_at?: string
          decided_at?: string
          goal_id?: string
          id?: string
          question?: string
          record?: Json
        }
        Relationships: [
          {
            foreignKeyName: "decisions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      dependencies: {
        Row: {
          brand_id: string
          created_at: string
          from_id: string
          from_kind: string
          goal_id: string
          id: string
          rationale: string | null
          record: Json
          relationship: string
          required: boolean
          to_id: string
          to_kind: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          from_id: string
          from_kind: string
          goal_id: string
          id: string
          rationale?: string | null
          record: Json
          relationship: string
          required?: boolean
          to_id: string
          to_kind: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          from_id?: string
          from_kind?: string
          goal_id?: string
          id?: string
          rationale?: string | null
          record?: Json
          relationship?: string
          required?: boolean
          to_id?: string
          to_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "dependencies_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          actor: Json
          brand_id: string
          command_id: string
          created_at: string
          data: Json
          goal_id: string
          id: string
          revision: number
          sequence: number
          type: string
        }
        Insert: {
          actor: Json
          brand_id: string
          command_id: string
          created_at?: string
          data?: Json
          goal_id: string
          id?: string
          revision: number
          sequence: number
          type: string
        }
        Update: {
          actor?: Json
          brand_id?: string
          command_id?: string
          created_at?: string
          data?: Json
          goal_id?: string
          id?: string
          revision?: number
          sequence?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          artifact_id: string | null
          brand_id: string
          claim: string
          confidence: number
          created_at: string
          goal_id: string
          id: string
          record: Json
          source: Json
        }
        Insert: {
          artifact_id?: string | null
          brand_id: string
          claim: string
          confidence: number
          created_at?: string
          goal_id: string
          id: string
          record: Json
          source: Json
        }
        Update: {
          artifact_id?: string | null
          brand_id?: string
          claim?: string
          confidence?: number
          created_at?: string
          goal_id?: string
          id?: string
          record?: Json
          source?: Json
        }
        Relationships: [
          {
            foreignKeyName: "evidence_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifact_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_artifact_validations: {
        Row: {
          artifact_id: string
          artifact_type: string
          brand_id: string
          checklist_item_ids: Json
          content_schema_version: number
          content_sha256: string
          errors: Json
          goal_id: string
          id: string
          record: Json
          valid: boolean
          validated_at: string
          version_id: string
        }
        Insert: {
          artifact_id: string
          artifact_type: string
          brand_id: string
          checklist_item_ids?: Json
          content_schema_version: number
          content_sha256: string
          errors?: Json
          goal_id: string
          id?: string
          record: Json
          valid: boolean
          validated_at?: string
          version_id: string
        }
        Update: {
          artifact_id?: string
          artifact_type?: string
          brand_id?: string
          checklist_item_ids?: Json
          content_schema_version?: number
          content_sha256?: string
          errors?: Json
          goal_id?: string
          id?: string
          record?: Json
          valid?: boolean
          validated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_artifact_validations_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifact_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_artifact_validations_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_capability_routes: {
        Row: {
          backup_user_id: string | null
          brand_id: string
          capability: string
          created_at: string
          created_by: string | null
          escalation_user_id: string | null
          goal_id: string | null
          id: string
          primary_user_id: string
          sla_hours: Json
          updated_at: string
        }
        Insert: {
          backup_user_id?: string | null
          brand_id: string
          capability: string
          created_at?: string
          created_by?: string | null
          escalation_user_id?: string | null
          goal_id?: string | null
          id?: string
          primary_user_id: string
          sla_hours?: Json
          updated_at?: string
        }
        Update: {
          backup_user_id?: string | null
          brand_id?: string
          capability?: string
          created_at?: string
          created_by?: string | null
          escalation_user_id?: string | null
          goal_id?: string | null
          id?: string
          primary_user_id?: string
          sla_hours?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_capability_routes_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_chat_deliveries: {
        Row: {
          acknowledged_at: string | null
          brand_id: string
          connection_id: string | null
          created_at: string
          delivered_at: string | null
          delivery_attempts: number
          failed_at: string | null
          failure_summary: string | null
          goal_id: string
          id: string
          lease_claimed_at: string | null
          lease_claimed_by: string | null
          next_attempt_at: string
          platform: string | null
          provider_channel_id: string | null
          provider_message_id: string | null
          provider_thread_id: string | null
          recipient_user_id: string
          request_id: string
          status: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          brand_id: string
          connection_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_attempts?: number
          failed_at?: string | null
          failure_summary?: string | null
          goal_id: string
          id?: string
          lease_claimed_at?: string | null
          lease_claimed_by?: string | null
          next_attempt_at?: string
          platform?: string | null
          provider_channel_id?: string | null
          provider_message_id?: string | null
          provider_thread_id?: string | null
          recipient_user_id: string
          request_id: string
          status: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          brand_id?: string
          connection_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_attempts?: number
          failed_at?: string | null
          failure_summary?: string | null
          goal_id?: string
          id?: string
          lease_claimed_at?: string | null
          lease_claimed_by?: string | null
          next_attempt_at?: string
          platform?: string | null
          provider_channel_id?: string | null
          provider_message_id?: string | null
          provider_thread_id?: string | null
          recipient_user_id?: string
          request_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_chat_deliveries_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_chat_deliveries_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "input_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_checklist_items: {
        Row: {
          artifact_id: string
          blocker: string | null
          brand_id: string
          confidence: number | null
          created_at: string
          definition: Json
          definition_id: string
          evidence_ids: Json
          goal_id: string
          id: string
          provenance: Json | null
          request_ids: Json
          resolved_version_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          artifact_id: string
          blocker?: string | null
          brand_id: string
          confidence?: number | null
          created_at?: string
          definition: Json
          definition_id: string
          evidence_ids?: Json
          goal_id: string
          id: string
          provenance?: Json | null
          request_ids?: Json
          resolved_version_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          artifact_id?: string
          blocker?: string | null
          brand_id?: string
          confidence?: number | null
          created_at?: string
          definition?: Json
          definition_id?: string
          evidence_ids?: Json
          goal_id?: string
          id?: string
          provenance?: Json | null
          request_ids?: Json
          resolved_version_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_checklist_items_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifact_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_checklist_items_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_child_runs: {
        Row: {
          brand_id: string
          child_run_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          goal_id: string
          harness_run_id: string
          parent_run_id: string | null
          request_id: string | null
          result_type: string | null
          session_id: string
          started_at: string | null
          status: string
          updated_at: string
          work_node_id: string | null
        }
        Insert: {
          brand_id: string
          child_run_id: string
          completed_at?: string | null
          created_at: string
          error_message?: string | null
          goal_id: string
          harness_run_id: string
          parent_run_id?: string | null
          request_id?: string | null
          result_type?: string | null
          session_id: string
          started_at?: string | null
          status: string
          updated_at?: string
          work_node_id?: string | null
        }
        Update: {
          brand_id?: string
          child_run_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          goal_id?: string
          harness_run_id?: string
          parent_run_id?: string | null
          request_id?: string | null
          result_type?: string | null
          session_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          work_node_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_child_runs_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_child_runs_harness_run_id_fkey"
            columns: ["harness_run_id"]
            isOneToOne: false
            referencedRelation: "run_checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_child_runs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "input_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_child_runs_work_node_id_fkey"
            columns: ["work_node_id"]
            isOneToOne: false
            referencedRelation: "goal_work_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_evidence_attachments: {
        Row: {
          brand_id: string
          bucket_id: string
          captured_at: string
          captured_by: Json
          filename: string
          goal_id: string
          id: string
          mime_type: string
          request_id: string | null
          sha256: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          brand_id: string
          bucket_id: string
          captured_at?: string
          captured_by: Json
          filename: string
          goal_id: string
          id?: string
          mime_type: string
          request_id?: string | null
          sha256: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          brand_id?: string
          bucket_id?: string
          captured_at?: string
          captured_by?: Json
          filename?: string
          goal_id?: string
          id?: string
          mime_type?: string
          request_id?: string | null
          sha256?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_evidence_attachments_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_evidence_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "input_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_plan_versions: {
        Row: {
          activated_at: string | null
          activated_by: Json | null
          brand_id: string
          created_at: string
          created_by: Json
          goal_id: string
          id: string
          record: Json
          status: string
          summary: string
          version: number
        }
        Insert: {
          activated_at?: string | null
          activated_by?: Json | null
          brand_id: string
          created_at?: string
          created_by: Json
          goal_id: string
          id: string
          record: Json
          status: string
          summary: string
          version: number
        }
        Update: {
          activated_at?: string | null
          activated_by?: Json | null
          brand_id?: string
          created_at?: string
          created_by?: Json
          goal_id?: string
          id?: string
          record?: Json
          status?: string
          summary?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "goal_plan_versions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_request_checklist_items: {
        Row: {
          checklist_item_id: string
          created_at: string
          request_id: string
        }
        Insert: {
          checklist_item_id: string
          created_at?: string
          request_id: string
        }
        Update: {
          checklist_item_id?: string
          created_at?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_request_checklist_items_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "goal_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_request_checklist_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "input_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_request_target_resolutions: {
        Row: {
          active_user_id: string
          backup_user_id: string | null
          brand_id: string
          created_at: string
          due_at: string
          escalation_user_id: string | null
          goal_id: string
          id: string
          primary_user_id: string
          reassigned_at: string | null
          request_id: string
          requested_target: Json
          resolved_at: string | null
          stage: string
          target_index: number
        }
        Insert: {
          active_user_id: string
          backup_user_id?: string | null
          brand_id: string
          created_at?: string
          due_at: string
          escalation_user_id?: string | null
          goal_id: string
          id?: string
          primary_user_id: string
          reassigned_at?: string | null
          request_id: string
          requested_target: Json
          resolved_at?: string | null
          stage?: string
          target_index: number
        }
        Update: {
          active_user_id?: string
          backup_user_id?: string | null
          brand_id?: string
          created_at?: string
          due_at?: string
          escalation_user_id?: string | null
          goal_id?: string
          id?: string
          primary_user_id?: string
          reassigned_at?: string | null
          request_id?: string
          requested_target?: Json
          resolved_at?: string | null
          stage?: string
          target_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "goal_request_target_resolutions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_request_target_resolutions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "input_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_run_wakeups: {
        Row: {
          attempts: number
          available_at: string
          brand_id: string
          child_run_id: string | null
          created_at: string
          dedupe_key: string
          dispatched_at: string | null
          goal_id: string
          harness_run_id: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lease_token: string | null
          request_id: string | null
          status: string
          trigger_kind: string
          updated_at: string
          work_node_id: string | null
        }
        Insert: {
          attempts?: number
          available_at?: string
          brand_id: string
          child_run_id?: string | null
          created_at?: string
          dedupe_key: string
          dispatched_at?: string | null
          goal_id: string
          harness_run_id: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          lease_token?: string | null
          request_id?: string | null
          status?: string
          trigger_kind: string
          updated_at?: string
          work_node_id?: string | null
        }
        Update: {
          attempts?: number
          available_at?: string
          brand_id?: string
          child_run_id?: string | null
          created_at?: string
          dedupe_key?: string
          dispatched_at?: string | null
          goal_id?: string
          harness_run_id?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          lease_token?: string | null
          request_id?: string | null
          status?: string
          trigger_kind?: string
          updated_at?: string
          work_node_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_run_wakeups_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_run_wakeups_harness_run_id_fkey"
            columns: ["harness_run_id"]
            isOneToOne: false
            referencedRelation: "run_checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_run_wakeups_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "input_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_run_wakeups_work_node_id_fkey"
            columns: ["work_node_id"]
            isOneToOne: false
            referencedRelation: "goal_work_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_supervisor_queue: {
        Row: {
          attempts: number
          available_at: string
          brand_id: string
          created_at: string
          goal_id: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lease_token: string | null
          reason: string
          status: string
          updated_at: string
          wake_pending: boolean
        }
        Insert: {
          attempts?: number
          available_at?: string
          brand_id: string
          created_at?: string
          goal_id: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          lease_token?: string | null
          reason: string
          status?: string
          updated_at?: string
          wake_pending?: boolean
        }
        Update: {
          attempts?: number
          available_at?: string
          brand_id?: string
          created_at?: string
          goal_id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          lease_token?: string | null
          reason?: string
          status?: string
          updated_at?: string
          wake_pending?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "goal_supervisor_queue_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: true
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_work_node_artifacts: {
        Row: {
          artifact_id: string
          created_at: string
          work_node_id: string
        }
        Insert: {
          artifact_id: string
          created_at?: string
          work_node_id: string
        }
        Update: {
          artifact_id?: string
          created_at?: string
          work_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_work_node_artifacts_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifact_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_work_node_artifacts_work_node_id_fkey"
            columns: ["work_node_id"]
            isOneToOne: false
            referencedRelation: "goal_work_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_work_node_dependencies: {
        Row: {
          created_at: string
          dependency_node_id: string
          work_node_id: string
        }
        Insert: {
          created_at?: string
          dependency_node_id: string
          work_node_id: string
        }
        Update: {
          created_at?: string
          dependency_node_id?: string
          work_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_work_node_dependencies_dependency_node_id_fkey"
            columns: ["dependency_node_id"]
            isOneToOne: false
            referencedRelation: "goal_work_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_work_node_dependencies_work_node_id_fkey"
            columns: ["work_node_id"]
            isOneToOne: false
            referencedRelation: "goal_work_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_work_node_results: {
        Row: {
          artifact_id: string | null
          base_version_id: string | null
          brand_id: string
          child_run_id: string | null
          created_at: string
          goal_id: string
          id: string
          outcome: string
          produced_version_id: string | null
          rationale: Json
          work_node_id: string
          work_product: Json
        }
        Insert: {
          artifact_id?: string | null
          base_version_id?: string | null
          brand_id: string
          child_run_id?: string | null
          created_at?: string
          goal_id: string
          id?: string
          outcome: string
          produced_version_id?: string | null
          rationale: Json
          work_node_id: string
          work_product: Json
        }
        Update: {
          artifact_id?: string | null
          base_version_id?: string | null
          brand_id?: string
          child_run_id?: string | null
          created_at?: string
          goal_id?: string
          id?: string
          outcome?: string
          produced_version_id?: string | null
          rationale?: Json
          work_node_id?: string
          work_product?: Json
        }
        Relationships: [
          {
            foreignKeyName: "goal_work_node_results_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifact_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_work_node_results_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_work_node_results_work_node_id_fkey"
            columns: ["work_node_id"]
            isOneToOne: false
            referencedRelation: "goal_work_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_work_nodes: {
        Row: {
          attempt: number
          brand_id: string
          completed_at: string | null
          created_at: string
          executor: Json
          goal_id: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lease_token: string | null
          max_attempts: number
          objective: string
          plan_id: string
          priority: number
          purpose: string
          record: Json
          required_capability: string | null
          retry_at: string | null
          session_id: string | null
          status: string
          title: string
          updated_at: string
          workstream_id: string
        }
        Insert: {
          attempt?: number
          brand_id: string
          completed_at?: string | null
          created_at?: string
          executor: Json
          goal_id: string
          id: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          lease_token?: string | null
          max_attempts?: number
          objective: string
          plan_id: string
          priority?: number
          purpose: string
          record: Json
          required_capability?: string | null
          retry_at?: string | null
          session_id?: string | null
          status?: string
          title: string
          updated_at?: string
          workstream_id: string
        }
        Update: {
          attempt?: number
          brand_id?: string
          completed_at?: string | null
          created_at?: string
          executor?: Json
          goal_id?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          lease_token?: string | null
          max_attempts?: number
          objective?: string
          plan_id?: string
          priority?: number
          purpose?: string
          record?: Json
          required_capability?: string | null
          retry_at?: string | null
          session_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          workstream_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_work_nodes_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_work_nodes_workstream_id_fkey"
            columns: ["workstream_id"]
            isOneToOne: false
            referencedRelation: "workstreams"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          active_plan_id: string | null
          active_plan_version: number | null
          brand_id: string
          completed_at: string | null
          completed_summary: string | null
          created_at: string
          created_by: Json
          facilitator: Json | null
          id: string
          invited_member_ids: Json
          kind: string
          next_sequence: number
          objective: string
          revision: number
          scope: Json
          status: string
          success_criteria: Json
          template_id: string | null
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          active_plan_id?: string | null
          active_plan_version?: number | null
          brand_id: string
          completed_at?: string | null
          completed_summary?: string | null
          created_at?: string
          created_by: Json
          facilitator?: Json | null
          id?: string
          invited_member_ids?: Json
          kind: string
          next_sequence?: number
          objective: string
          revision?: number
          scope?: Json
          status?: string
          success_criteria?: Json
          template_id?: string | null
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          active_plan_id?: string | null
          active_plan_version?: number | null
          brand_id?: string
          completed_at?: string | null
          completed_summary?: string | null
          created_at?: string
          created_by?: Json
          facilitator?: Json | null
          id?: string
          invited_member_ids?: Json
          kind?: string
          next_sequence?: number
          objective?: string
          revision?: number
          scope?: Json
          status?: string
          success_criteria?: Json
          template_id?: string | null
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      input_requests: {
        Row: {
          blocked_node_refs: Json
          brand_id: string
          created_at: string
          due_at: string | null
          expected_response: Json
          goal_id: string
          id: string
          kind: string
          prompt: string
          record: Json
          resolution_policy: Json
          resolved_at: string | null
          status: string
          targets: Json
        }
        Insert: {
          blocked_node_refs?: Json
          brand_id: string
          created_at?: string
          due_at?: string | null
          expected_response?: Json
          goal_id: string
          id: string
          kind: string
          prompt: string
          record: Json
          resolution_policy: Json
          resolved_at?: string | null
          status: string
          targets: Json
        }
        Update: {
          blocked_node_refs?: Json
          brand_id?: string
          created_at?: string
          due_at?: string | null
          expected_response?: Json
          goal_id?: string
          id?: string
          kind?: string
          prompt?: string
          record?: Json
          resolution_policy?: Json
          resolved_at?: string | null
          status?: string
          targets?: Json
        }
        Relationships: [
          {
            foreignKeyName: "input_requests_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      input_responses: {
        Row: {
          brand_id: string
          created_at: string
          evidence_attachment_ids: Json
          evidence_ids: Json
          goal_id: string
          id: string
          record: Json
          request_id: string
          responder: Json
          response: string
          structured_value: Json | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          evidence_attachment_ids?: Json
          evidence_ids?: Json
          goal_id: string
          id: string
          record: Json
          request_id: string
          responder: Json
          response: string
          structured_value?: Json | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          evidence_attachment_ids?: Json
          evidence_ids?: Json
          goal_id?: string
          id?: string
          record?: Json
          request_id?: string
          responder?: Json
          response?: string
          structured_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "input_responses_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "input_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "input_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_refs: {
        Row: {
          brand_id: string
          created_at: string
          goal_id: string
          id: string
          kind: string
          record: Json
          resource_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          goal_id: string
          id: string
          kind: string
          record: Json
          resource_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          goal_id?: string
          id?: string
          kind?: string
          record?: Json
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_refs_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      run_checkpoints: {
        Row: {
          ad_account_id: string | null
          assignment_id: string | null
          blocked_request_id: string | null
          brand_id: string
          checkpoint: Json
          checkpoint_version: number
          execution_user_email: string | null
          execution_user_id: string | null
          goal_id: string
          harness_key: string | null
          id: string
          jaina_session_id: string | null
          last_child_run_id: string | null
          last_goal_sequence: number
          lease_expires_at: string | null
          lease_holder: Json | null
          lease_token: string | null
          run_id: string
          started_at: string
          status: string
          updated_at: string
          work_node_id: string | null
        }
        Insert: {
          ad_account_id?: string | null
          assignment_id?: string | null
          blocked_request_id?: string | null
          brand_id: string
          checkpoint?: Json
          checkpoint_version?: number
          execution_user_email?: string | null
          execution_user_id?: string | null
          goal_id: string
          harness_key?: string | null
          id?: string
          jaina_session_id?: string | null
          last_child_run_id?: string | null
          last_goal_sequence?: number
          lease_expires_at?: string | null
          lease_holder?: Json | null
          lease_token?: string | null
          run_id: string
          started_at?: string
          status: string
          updated_at?: string
          work_node_id?: string | null
        }
        Update: {
          ad_account_id?: string | null
          assignment_id?: string | null
          blocked_request_id?: string | null
          brand_id?: string
          checkpoint?: Json
          checkpoint_version?: number
          execution_user_email?: string | null
          execution_user_id?: string | null
          goal_id?: string
          harness_key?: string | null
          id?: string
          jaina_session_id?: string | null
          last_child_run_id?: string | null
          last_goal_sequence?: number
          lease_expires_at?: string | null
          lease_holder?: Json | null
          lease_token?: string | null
          run_id?: string
          started_at?: string
          status?: string
          updated_at?: string
          work_node_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "run_checkpoints_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_checkpoints_blocked_request_id_fkey"
            columns: ["blocked_request_id"]
            isOneToOne: false
            referencedRelation: "input_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_checkpoints_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_checkpoints_work_node_id_fkey"
            columns: ["work_node_id"]
            isOneToOne: false
            referencedRelation: "goal_work_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      workstreams: {
        Row: {
          brand_id: string
          created_at: string
          goal_id: string
          id: string
          objective: string
          plan_id: string
          position: number
          record: Json
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          goal_id: string
          id: string
          objective: string
          plan_id: string
          position?: number
          record: Json
          status: string
          title: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          goal_id?: string
          id?: string
          objective?: string
          plan_id?: string
          position?: number
          record?: Json
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workstreams_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_goal_harness_checkpoint: {
        Args: {
          p_blocked_request_id?: string
          p_checkpoint?: Json
          p_expected_version: number
          p_harness_run_id: string
          p_jaina_session_id?: string
          p_last_child_run_id?: string
          p_last_goal_sequence?: number
          p_status: string
        }
        Returns: {
          ad_account_id: string | null
          assignment_id: string | null
          blocked_request_id: string | null
          brand_id: string
          checkpoint: Json
          checkpoint_version: number
          execution_user_email: string | null
          execution_user_id: string | null
          goal_id: string
          harness_key: string | null
          id: string
          jaina_session_id: string | null
          last_child_run_id: string | null
          last_goal_sequence: number
          lease_expires_at: string | null
          lease_holder: Json | null
          lease_token: string | null
          run_id: string
          started_at: string
          status: string
          updated_at: string
          work_node_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "run_checkpoints"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      append_event: {
        Args: {
          p_actor: Json
          p_brand_id: string
          p_command_id: string
          p_data: Json
          p_goal_id: string
          p_revision: number
          p_type: string
        }
        Returns: {
          actor: Json
          brand_id: string
          command_id: string
          created_at: string
          data: Json
          goal_id: string
          id: string
          revision: number
          sequence: number
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_read_goal: {
        Args: { p_brand_id: string; p_goal_id: string; p_user_id: string }
        Returns: boolean
      }
      claim_goal_chat_delivery: {
        Args: {
          p_claimed_by: string
          p_delivery_id: string
          p_lease_seconds?: number
        }
        Returns: {
          acknowledged_at: string | null
          brand_id: string
          connection_id: string | null
          created_at: string
          delivered_at: string | null
          delivery_attempts: number
          failed_at: string | null
          failure_summary: string | null
          goal_id: string
          id: string
          lease_claimed_at: string | null
          lease_claimed_by: string | null
          next_attempt_at: string
          platform: string | null
          provider_channel_id: string | null
          provider_message_id: string | null
          provider_thread_id: string | null
          recipient_user_id: string
          request_id: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "goal_chat_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_goal_run_wakeup: {
        Args: { p_lease_owner: string; p_lease_seconds?: number }
        Returns: {
          attempts: number
          available_at: string
          brand_id: string
          child_run_id: string | null
          created_at: string
          dedupe_key: string
          dispatched_at: string | null
          goal_id: string
          harness_run_id: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lease_token: string | null
          request_id: string | null
          status: string
          trigger_kind: string
          updated_at: string
          work_node_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "goal_run_wakeups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_goal_supervisor: {
        Args: { p_lease_seconds?: number; p_worker: string }
        Returns: {
          attempts: number
          available_at: string
          brand_id: string
          created_at: string
          goal_id: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lease_token: string | null
          reason: string
          status: string
          updated_at: string
          wake_pending: boolean
        }
        SetofOptions: {
          from: "*"
          to: "goal_supervisor_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_ready_goal_work_nodes: {
        Args: {
          p_brand_limit?: number
          p_goal_id: string
          p_goal_limit?: number
          p_lease_seconds?: number
          p_worker: string
        }
        Returns: {
          attempt: number
          brand_id: string
          completed_at: string | null
          created_at: string
          executor: Json
          goal_id: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lease_token: string | null
          max_attempts: number
          objective: string
          plan_id: string
          priority: number
          purpose: string
          record: Json
          required_capability: string | null
          retry_at: string | null
          session_id: string | null
          status: string
          title: string
          updated_at: string
          workstream_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "goal_work_nodes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_goal: { Args: { p_payload: Json }; Returns: Json }
      create_goal_input_wait: {
        Args: {
          p_agent_run_id: string
          p_expected_version: number
          p_goal_id: string
          p_harness_run_id: string
          p_request: Json
        }
        Returns: Json
      }
      enqueue_goal_harness_timer: {
        Args: {
          p_available_at: string
          p_dedupe_key: string
          p_harness_run_id: string
        }
        Returns: string
      }
      ensure_goal_harness_checkpoint: {
        Args: {
          p_ad_account_id?: string
          p_assignment_id?: string
          p_execution_user_email: string
          p_execution_user_id: string
          p_goal_id: string
          p_harness_key: string
          p_jaina_session_id: string
        }
        Returns: {
          ad_account_id: string | null
          assignment_id: string | null
          blocked_request_id: string | null
          brand_id: string
          checkpoint: Json
          checkpoint_version: number
          execution_user_email: string | null
          execution_user_id: string | null
          goal_id: string
          harness_key: string | null
          id: string
          jaina_session_id: string | null
          last_child_run_id: string | null
          last_goal_sequence: number
          lease_expires_at: string | null
          lease_holder: Json | null
          lease_token: string | null
          run_id: string
          started_at: string
          status: string
          updated_at: string
          work_node_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "run_checkpoints"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_goal_work_node_checkpoint: {
        Args: {
          p_ad_account_id?: string
          p_assignment_id?: string
          p_execution_user_email: string
          p_execution_user_id: string
          p_goal_id: string
          p_harness_key: string
          p_jaina_session_id: string
          p_work_node_id: string
        }
        Returns: {
          ad_account_id: string | null
          assignment_id: string | null
          blocked_request_id: string | null
          brand_id: string
          checkpoint: Json
          checkpoint_version: number
          execution_user_email: string | null
          execution_user_id: string | null
          goal_id: string
          harness_key: string | null
          id: string
          jaina_session_id: string | null
          last_child_run_id: string | null
          last_goal_sequence: number
          lease_expires_at: string | null
          lease_holder: Json | null
          lease_token: string | null
          run_id: string
          started_at: string
          status: string
          updated_at: string
          work_node_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "run_checkpoints"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      escalate_goal_request_targets: {
        Args: { p_limit?: number }
        Returns: {
          active_user_id: string
          backup_user_id: string | null
          brand_id: string
          created_at: string
          due_at: string
          escalation_user_id: string | null
          goal_id: string
          id: string
          primary_user_id: string
          reassigned_at: string | null
          request_id: string
          requested_target: Json
          resolved_at: string | null
          stage: string
          target_index: number
        }[]
        SetofOptions: {
          from: "*"
          to: "goal_request_target_resolutions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      execute_goal_command: { Args: { p_payload: Json }; Returns: Json }
      execute_goal_request_response: {
        Args: { p_payload: Json }
        Returns: Json
      }
      finish_goal_run_wakeup: {
        Args: {
          p_child_run_id?: string
          p_error?: string
          p_lease_token: string
          p_retry_after_seconds?: number
          p_status: string
          p_wakeup_id: string
        }
        Returns: boolean
      }
      finish_goal_supervisor: {
        Args: {
          p_error?: string
          p_goal_id: string
          p_lease_token: string
          p_retry_at?: string
          p_status: string
        }
        Returns: boolean
      }
      finish_goal_work_node: {
        Args: {
          p_error?: string
          p_lease_token: string
          p_retry_at?: string
          p_status: string
          p_work_node_id: string
        }
        Returns: {
          attempt: number
          brand_id: string
          completed_at: string | null
          created_at: string
          executor: Json
          goal_id: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lease_token: string | null
          max_attempts: number
          objective: string
          plan_id: string
          priority: number
          purpose: string
          record: Json
          required_capability: string | null
          retry_at: string | null
          session_id: string | null
          status: string
          title: string
          updated_at: string
          workstream_id: string
        }
        SetofOptions: {
          from: "*"
          to: "goal_work_nodes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_goal_snapshot: { Args: { p_goal_id: string }; Returns: Json }
      get_goal_storage_object_owner: {
        Args: { p_bucket_id: string; p_name: string }
        Returns: string
      }
      invalidate_goal_artifacts: {
        Args: {
          p_artifact_ids: string[]
          p_goal_id: string
          p_reason: string
          p_source_id: string
        }
        Returns: number
      }
      record_goal_artifact_validation: {
        Args: { p_payload: Json }
        Returns: Json
      }
      record_goal_work_node_result: { Args: { p_payload: Json }; Returns: Json }
      sync_goal_work_nodes: {
        Args: { p_goal_id: string; p_nodes: Json }
        Returns: undefined
      }
      upsert_goal_capability_route: {
        Args: { p_created_by: string; p_goal_id: string; p_payload: Json }
        Returns: {
          backup_user_id: string | null
          brand_id: string
          capability: string
          created_at: string
          created_by: string | null
          escalation_user_id: string | null
          goal_id: string | null
          id: string
          primary_user_id: string
          sla_hours: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "goal_capability_routes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      wake_goal_supervisor: {
        Args: { p_available_at?: string; p_goal_id: string; p_reason: string }
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
      google_analytics_properties: {
        Row: {
          account_id: string | null
          brand_integration_id: string
          display_name: string | null
          id: string
          property_id: string
          raw_profile: Json
          synced_at: string
        }
        Insert: {
          account_id?: string | null
          brand_integration_id: string
          display_name?: string | null
          id?: string
          property_id: string
          raw_profile?: Json
          synced_at?: string
        }
        Update: {
          account_id?: string | null
          brand_integration_id?: string
          display_name?: string | null
          id?: string
          property_id?: string
          raw_profile?: Json
          synced_at?: string
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
      linkedin_ad_accounts: {
        Row: {
          account_id: string
          brand_integration_id: string
          created_at: string
          currency_code: string | null
          id: string
          name: string | null
          raw_profile: Json
          status: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          brand_integration_id: string
          created_at?: string
          currency_code?: string | null
          id?: string
          name?: string | null
          raw_profile?: Json
          status?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          brand_integration_id?: string
          created_at?: string
          currency_code?: string | null
          id?: string
          name?: string | null
          raw_profile?: Json
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      linkedin_organizations: {
        Row: {
          brand_integration_id: string
          created_at: string
          id: string
          localized_name: string | null
          organization_id: string
          raw_profile: Json
          updated_at: string
          vanity_name: string | null
        }
        Insert: {
          brand_integration_id: string
          created_at?: string
          id?: string
          localized_name?: string | null
          organization_id: string
          raw_profile?: Json
          updated_at?: string
          vanity_name?: string | null
        }
        Update: {
          brand_integration_id?: string
          created_at?: string
          id?: string
          localized_name?: string | null
          organization_id?: string
          raw_profile?: Json
          updated_at?: string
          vanity_name?: string | null
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
      tiktok_users: {
        Row: {
          avatar_url: string | null
          brand_integration_id: string
          created_at: string
          display_name: string | null
          id: string
          open_id: string
          profile_deep_link: string | null
          raw_profile: Json
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          brand_integration_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          open_id: string
          profile_deep_link?: string | null
          raw_profile?: Json
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          brand_integration_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          open_id?: string
          profile_deep_link?: string | null
          raw_profile?: Json
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      x_users: {
        Row: {
          brand_integration_id: string
          created_at: string
          id: string
          name: string | null
          profile_image_url: string | null
          raw_profile: Json
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          brand_integration_id: string
          created_at?: string
          id?: string
          name?: string | null
          profile_image_url?: string | null
          raw_profile?: Json
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          brand_integration_id?: string
          created_at?: string
          id?: string
          name?: string | null
          profile_image_url?: string | null
          raw_profile?: Json
          updated_at?: string
          user_id?: string
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
      ad_naming_schemas: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          delimiter: string
          fields: Json
          id: string
          is_active: boolean
          platform: string
          updated_at: string
          version: number
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          delimiter?: string
          fields: Json
          id?: string
          is_active?: boolean
          platform: string
          updated_at?: string
          version?: number
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          delimiter?: string
          fields?: Json
          id?: string
          is_active?: boolean
          platform?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_naming_schemas_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "ad_naming_schemas_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
      ai_studio_canvas_composer_run_events: {
        Row: {
          data: Json
          event_id: string
          run_id: string
          seq: number
          ts: string
          type: string
        }
        Insert: {
          data?: Json
          event_id: string
          run_id: string
          seq: number
          ts?: string
          type: string
        }
        Update: {
          data?: Json
          event_id?: string
          run_id?: string
          seq?: number
          ts?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_studio_canvas_composer_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_studio_canvas_composer_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      ai_studio_canvas_composer_runs: {
        Row: {
          brand_id: string
          created_at: string
          deadline_at: string
          error_message: string | null
          finished_at: string | null
          idempotency_key: string | null
          initiator: string
          initiator_agent: string | null
          last_seq: number | null
          request: Json
          room_id: string
          run_id: string
          started_at: string | null
          status: string
          terminal_summary: string | null
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          deadline_at?: string
          error_message?: string | null
          finished_at?: string | null
          idempotency_key?: string | null
          initiator?: string
          initiator_agent?: string | null
          last_seq?: number | null
          request?: Json
          room_id: string
          run_id?: string
          started_at?: string | null
          status?: string
          terminal_summary?: string | null
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          deadline_at?: string
          error_message?: string | null
          finished_at?: string | null
          idempotency_key?: string | null
          initiator?: string
          initiator_agent?: string | null
          last_seq?: number | null
          request?: Json
          room_id?: string
          run_id?: string
          started_at?: string | null
          status?: string
          terminal_summary?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_studio_canvas_graph_changes: {
        Row: {
          affected_edge_ids: string[]
          affected_node_ids: string[]
          base_revision: number | null
          brand_profile_id: string
          created_at: string
          created_by: string
          decided_at: string | null
          id: string
          operations: Json
          proposed_edges: Json
          proposed_nodes: Json
          room_id: string
          run_id: string
          status: string
          summary: string
        }
        Insert: {
          affected_edge_ids?: string[]
          affected_node_ids?: string[]
          base_revision?: number | null
          brand_profile_id: string
          created_at?: string
          created_by: string
          decided_at?: string | null
          id?: string
          operations: Json
          proposed_edges: Json
          proposed_nodes: Json
          room_id: string
          run_id: string
          status?: string
          summary: string
        }
        Update: {
          affected_edge_ids?: string[]
          affected_node_ids?: string[]
          base_revision?: number | null
          brand_profile_id?: string
          created_at?: string
          created_by?: string
          decided_at?: string | null
          id?: string
          operations?: Json
          proposed_edges?: Json
          proposed_nodes?: Json
          room_id?: string
          run_id?: string
          status?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_studio_canvas_graph_changes_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "ai_studio_canvas_graph_changes_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_studio_canvas_graph_changes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "canvas_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_studio_canvas_graph_changes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_studio_canvas_composer_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      ai_studio_hyperframe_messages: {
        Row: {
          assets: Json
          content: string
          created_at: string
          id: number
          role: string
          run_id: string | null
          session_id: string
        }
        Insert: {
          assets?: Json
          content: string
          created_at?: string
          id?: number
          role: string
          run_id?: string | null
          session_id: string
        }
        Update: {
          assets?: Json
          content?: string
          created_at?: string
          id?: number
          role?: string
          run_id?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_studio_hyperframe_messages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_studio_hyperframe_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_studio_hyperframe_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_studio_hyperframe_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_studio_hyperframe_revisions: {
        Row: {
          aspect_ratio: string
          composition_bucket: string
          composition_path: string
          created_at: string
          duration_seconds: number
          fingerprint: string
          fps: number
          height: number
          id: string
          lint_warnings: Json
          model: string
          parent_revision_id: string | null
          revision_number: number
          run_id: string
          session_id: string
          source_asset_ids: string[]
          visual_warnings: Json
          width: number
        }
        Insert: {
          aspect_ratio: string
          composition_bucket?: string
          composition_path: string
          created_at?: string
          duration_seconds: number
          fingerprint: string
          fps?: number
          height: number
          id?: string
          lint_warnings?: Json
          model: string
          parent_revision_id?: string | null
          revision_number: number
          run_id: string
          session_id: string
          source_asset_ids?: string[]
          visual_warnings?: Json
          width: number
        }
        Update: {
          aspect_ratio?: string
          composition_bucket?: string
          composition_path?: string
          created_at?: string
          duration_seconds?: number
          fingerprint?: string
          fps?: number
          height?: number
          id?: string
          lint_warnings?: Json
          model?: string
          parent_revision_id?: string | null
          revision_number?: number
          run_id?: string
          session_id?: string
          source_asset_ids?: string[]
          visual_warnings?: Json
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_studio_hyperframe_revisions_parent_revision_id_fkey"
            columns: ["parent_revision_id"]
            isOneToOne: false
            referencedRelation: "ai_studio_hyperframe_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_studio_hyperframe_revisions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_studio_hyperframe_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_studio_hyperframe_revisions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_studio_hyperframe_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_studio_hyperframe_run_events: {
        Row: {
          data: Json
          event_id: string
          run_id: string
          seq: number
          ts: string
          type: string
        }
        Insert: {
          data?: Json
          event_id?: string
          run_id: string
          seq: number
          ts?: string
          type: string
        }
        Update: {
          data?: Json
          event_id?: string
          run_id?: string
          seq?: number
          ts?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_studio_hyperframe_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_studio_hyperframe_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_studio_hyperframe_runs: {
        Row: {
          brand_id: string
          created_at: string
          deadline_at: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          last_seq: number | null
          request: Json
          session_id: string
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          deadline_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_seq?: number | null
          request?: Json
          session_id: string
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          deadline_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_seq?: number | null
          request?: Json
          session_id?: string
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_studio_hyperframe_runs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_studio_hyperframe_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_studio_hyperframe_sessions: {
        Row: {
          brand_id: string
          canvas_id: string
          created_at: string
          id: string
          model: string
          node_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_id: string
          canvas_id: string
          created_at?: string
          id?: string
          model?: string
          node_id: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          canvas_id?: string
          created_at?: string
          id?: string
          model?: string
          node_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audience_group_members: {
        Row: {
          attempt: number
          brand_id: string
          created_at: string
          definition: Json
          dependency_member_key: string | null
          error_message: string | null
          id: string
          kind: string
          member_key: string
          meta_audience_id: string | null
          provider_snapshot: Json | null
          status: string
          updated_at: string
          version_id: string
        }
        Insert: {
          attempt?: number
          brand_id: string
          created_at?: string
          definition: Json
          dependency_member_key?: string | null
          error_message?: string | null
          id?: string
          kind: string
          member_key: string
          meta_audience_id?: string | null
          provider_snapshot?: Json | null
          status?: string
          updated_at?: string
          version_id: string
        }
        Update: {
          attempt?: number
          brand_id?: string
          created_at?: string
          definition?: Json
          dependency_member_key?: string | null
          error_message?: string | null
          id?: string
          kind?: string
          member_key?: string
          meta_audience_id?: string | null
          provider_snapshot?: Json | null
          status?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_group_members_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "audience_group_members_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_group_members_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "audience_group_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      audience_group_versions: {
        Row: {
          approval_expires_at: string
          approval_token_hash: string
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          content_hash: string
          created_at: string
          created_by: string
          group_id: string
          id: string
          manifest: Json
          status: string
          targeting_spec: Json | null
          updated_at: string
          version: number
        }
        Insert: {
          approval_expires_at: string
          approval_token_hash: string
          approved_at?: string | null
          approved_by?: string | null
          brand_id: string
          content_hash: string
          created_at?: string
          created_by: string
          group_id: string
          id?: string
          manifest: Json
          status?: string
          targeting_spec?: Json | null
          updated_at?: string
          version: number
        }
        Update: {
          approval_expires_at?: string
          approval_token_hash?: string
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          content_hash?: string
          created_at?: string
          created_by?: string
          group_id?: string
          id?: string
          manifest?: Json
          status?: string
          targeting_spec?: Json | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "audience_group_versions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "audience_group_versions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_group_versions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "audience_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      audience_groups: {
        Row: {
          ad_account_id: string
          archived_at: string | null
          brand_id: string
          created_at: string
          created_by: string
          current_version_id: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          archived_at?: string | null
          brand_id: string
          created_at?: string
          created_by: string
          current_version_id?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          archived_at?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_groups_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "audience_groups_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_groups_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "audience_group_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      audience_personas: {
        Row: {
          ad_account_id: string | null
          as_of: string
          audience_node_id: string
          brand_id: string
          confidence: number | null
          content_hash: string
          created_at: string
          dimension: string
          flags: string[]
          id: string
          observed_at: string
          persona_key: string
          proposed_targeting: Json | null
          report: Json
          segment: string
          window: string
        }
        Insert: {
          ad_account_id?: string | null
          as_of: string
          audience_node_id: string
          brand_id: string
          confidence?: number | null
          content_hash: string
          created_at?: string
          dimension: string
          flags?: string[]
          id?: string
          observed_at?: string
          persona_key: string
          proposed_targeting?: Json | null
          report: Json
          segment: string
          window: string
        }
        Update: {
          ad_account_id?: string | null
          as_of?: string
          audience_node_id?: string
          brand_id?: string
          confidence?: number | null
          content_hash?: string
          created_at?: string
          dimension?: string
          flags?: string[]
          id?: string
          observed_at?: string
          persona_key?: string
          proposed_targeting?: Json | null
          report?: Json
          segment?: string
          window?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_personas_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "audience_personas_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audience_publish_runs: {
        Row: {
          actor_id: string
          attempt: number
          brand_id: string
          completed_at: string | null
          id: string
          operation_id: string
          request_hash: string
          started_at: string
          status: string
          updated_at: string
          version_id: string
        }
        Insert: {
          actor_id: string
          attempt?: number
          brand_id: string
          completed_at?: string | null
          id?: string
          operation_id: string
          request_hash: string
          started_at?: string
          status?: string
          updated_at?: string
          version_id: string
        }
        Update: {
          actor_id?: string
          attempt?: number
          brand_id?: string
          completed_at?: string | null
          id?: string
          operation_id?: string
          request_hash?: string
          started_at?: string
          status?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_publish_runs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "audience_publish_runs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_publish_runs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "audience_group_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_action_receipts: {
        Row: {
          action_kind: string
          completed_at: string | null
          created_at: string
          effect: string
          error: Json | null
          external_id: string | null
          id: string
          idempotency_key: string
          node_run_id: string
          request: Json | null
          response: Json | null
          run_id: string
          status: string
          summary: string | null
        }
        Insert: {
          action_kind: string
          completed_at?: string | null
          created_at?: string
          effect?: string
          error?: Json | null
          external_id?: string | null
          id?: string
          idempotency_key: string
          node_run_id: string
          request?: Json | null
          response?: Json | null
          run_id: string
          status: string
          summary?: string | null
        }
        Update: {
          action_kind?: string
          completed_at?: string | null
          created_at?: string
          effect?: string
          error?: Json | null
          external_id?: string | null
          id?: string
          idempotency_key?: string
          node_run_id?: string
          request?: Json | null
          response?: Json | null
          run_id?: string
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_action_receipts_node_run_id_fkey"
            columns: ["node_run_id"]
            isOneToOne: false
            referencedRelation: "automation_node_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_action_receipts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      automation_events: {
        Row: {
          brand_id: string
          event_type: string
          id: string
          idempotency_key: string
          occurred_at: string
          payload: Json
          processed_at: string | null
        }
        Insert: {
          brand_id: string
          event_type: string
          id?: string
          idempotency_key: string
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
        }
        Update: {
          brand_id?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "automation_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_node_run_events: {
        Row: {
          error: Json | null
          event_type: string
          expires_at: string
          id: string
          node_id: string
          occurred_at: string
          payload_hash: string
          payload_redacted: Json
          run_id: string
          seq: number
          status: string
          tool_name: string | null
        }
        Insert: {
          error?: Json | null
          event_type: string
          expires_at?: string
          id?: string
          node_id: string
          occurred_at?: string
          payload_hash: string
          payload_redacted?: Json
          run_id: string
          seq: number
          status: string
          tool_name?: string | null
        }
        Update: {
          error?: Json | null
          event_type?: string
          expires_at?: string
          id?: string
          node_id?: string
          occurred_at?: string
          payload_hash?: string
          payload_redacted?: Json
          run_id?: string
          seq?: number
          status?: string
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_node_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      automation_node_runs: {
        Row: {
          attempt: number
          completed_at: string | null
          created_at: string
          duration_ms: number
          error: Json | null
          id: string
          idempotency_key: string
          input: Json | null
          node_id: string
          node_type: string
          output: Json | null
          run_id: string
          selected_handle: string | null
          started_at: string | null
          status: string
          worker_id: string | null
        }
        Insert: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number
          error?: Json | null
          id?: string
          idempotency_key: string
          input?: Json | null
          node_id: string
          node_type: string
          output?: Json | null
          run_id: string
          selected_handle?: string | null
          started_at?: string | null
          status: string
          worker_id?: string | null
        }
        Update: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number
          error?: Json | null
          id?: string
          idempotency_key?: string
          input?: Json | null
          node_id?: string
          node_type?: string
          output?: Json | null
          run_id?: string
          selected_handle?: string | null
          started_at?: string | null
          status?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_node_runs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          attempts: number
          automation_id: string
          brand_id: string
          claimed_at: string | null
          completed_at: string | null
          deadline_at: string | null
          email_attempts: number
          email_claimed_at: string | null
          email_error: string | null
          email_status: string
          emailed_at: string | null
          enqueued_at: string
          error: Json | null
          execution_mode: string
          execution_summary: Json | null
          execution_user_id: string | null
          heartbeat_at: string | null
          next_email_attempt_at: string
          not_before: string
          origin_env: string | null
          recipients_snapshot: Json | null
          requested_by: string | null
          resend_message_ids: string[]
          result: Json | null
          run_id: string
          scheduled_for: string
          started_at: string | null
          status: Database["brand_profiles"]["Enums"]["automation_run_status"]
          trigger: string
          trigger_idempotency_key: string | null
          trigger_node_id: string | null
          trigger_payload: Json
          worker_id: string | null
          workflow_definition_hash: string | null
          workflow_definition_snapshot: Json | null
          workflow_revision: number | null
          workflow_version_id: string | null
        }
        Insert: {
          attempts?: number
          automation_id: string
          brand_id: string
          claimed_at?: string | null
          completed_at?: string | null
          deadline_at?: string | null
          email_attempts?: number
          email_claimed_at?: string | null
          email_error?: string | null
          email_status?: string
          emailed_at?: string | null
          enqueued_at?: string
          error?: Json | null
          execution_mode?: string
          execution_summary?: Json | null
          execution_user_id?: string | null
          heartbeat_at?: string | null
          next_email_attempt_at?: string
          not_before?: string
          origin_env?: string | null
          recipients_snapshot?: Json | null
          requested_by?: string | null
          resend_message_ids?: string[]
          result?: Json | null
          run_id?: string
          scheduled_for: string
          started_at?: string | null
          status?: Database["brand_profiles"]["Enums"]["automation_run_status"]
          trigger: string
          trigger_idempotency_key?: string | null
          trigger_node_id?: string | null
          trigger_payload?: Json
          worker_id?: string | null
          workflow_definition_hash?: string | null
          workflow_definition_snapshot?: Json | null
          workflow_revision?: number | null
          workflow_version_id?: string | null
        }
        Update: {
          attempts?: number
          automation_id?: string
          brand_id?: string
          claimed_at?: string | null
          completed_at?: string | null
          deadline_at?: string | null
          email_attempts?: number
          email_claimed_at?: string | null
          email_error?: string | null
          email_status?: string
          emailed_at?: string | null
          enqueued_at?: string
          error?: Json | null
          execution_mode?: string
          execution_summary?: Json | null
          execution_user_id?: string | null
          heartbeat_at?: string | null
          next_email_attempt_at?: string
          not_before?: string
          origin_env?: string | null
          recipients_snapshot?: Json | null
          requested_by?: string | null
          resend_message_ids?: string[]
          result?: Json | null
          run_id?: string
          scheduled_for?: string
          started_at?: string | null
          status?: Database["brand_profiles"]["Enums"]["automation_run_status"]
          trigger?: string
          trigger_idempotency_key?: string | null
          trigger_node_id?: string | null
          trigger_payload?: Json
          worker_id?: string | null
          workflow_definition_hash?: string | null
          workflow_definition_snapshot?: Json | null
          workflow_revision?: number | null
          workflow_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "automation_runs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "automation_workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_trigger_bindings: {
        Row: {
          automation_id: string
          config: Json
          cooldown_until: string | null
          created_at: string
          cron_expr: string | null
          enabled: boolean
          id: string
          last_evaluated_at: string | null
          last_evaluated_value: number | null
          next_run_at: string | null
          node_id: string
          timezone: string | null
          trigger_type: string
          updated_at: string
          workflow_version_id: string
        }
        Insert: {
          automation_id: string
          config?: Json
          cooldown_until?: string | null
          created_at?: string
          cron_expr?: string | null
          enabled?: boolean
          id?: string
          last_evaluated_at?: string | null
          last_evaluated_value?: number | null
          next_run_at?: string | null
          node_id: string
          timezone?: string | null
          trigger_type: string
          updated_at?: string
          workflow_version_id: string
        }
        Update: {
          automation_id?: string
          config?: Json
          cooldown_until?: string | null
          created_at?: string
          cron_expr?: string | null
          enabled?: boolean
          id?: string
          last_evaluated_at?: string | null
          last_evaluated_value?: number | null
          next_run_at?: string | null
          node_id?: string
          timezone?: string | null
          trigger_type?: string
          updated_at?: string
          workflow_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_trigger_bindings_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_trigger_bindings_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "automation_workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_webhook_deliveries: {
        Row: {
          attempt_count: number
          claimed_at: string | null
          created_at: string
          delivered_at: string | null
          destination_id: string
          error: string | null
          id: string
          idempotency_key: string
          node_id: string
          request_body: Json
          response_body: string | null
          response_status: number | null
          run_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          destination_id: string
          error?: string | null
          id?: string
          idempotency_key: string
          node_id: string
          request_body: Json
          response_body?: string | null
          response_status?: number | null
          run_id: string
          status: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          destination_id?: string
          error?: string | null
          id?: string
          idempotency_key?: string
          node_id?: string
          request_body?: Json
          response_body?: string | null
          response_status?: number | null
          run_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_webhook_deliveries_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "automation_webhook_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_webhook_deliveries_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      automation_webhook_destinations: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          method: string
          name: string
          secret_encrypted: string
          updated_at: string
          url: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          method?: string
          name: string
          secret_encrypted: string
          updated_at?: string
          url: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          method?: string
          name?: string
          secret_encrypted?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_webhook_destinations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "automation_webhook_destinations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_webhook_endpoints: {
        Row: {
          automation_id: string
          brand_id: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          last_received_at: string | null
          name: string
          node_id: string
          payload_schema: Json
          public_id: string
          secret_encrypted: string
          secret_hash: string
          updated_at: string
          workflow_version_id: string
        }
        Insert: {
          automation_id: string
          brand_id: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          last_received_at?: string | null
          name: string
          node_id: string
          payload_schema?: Json
          public_id: string
          secret_encrypted: string
          secret_hash: string
          updated_at?: string
          workflow_version_id: string
        }
        Update: {
          automation_id?: string
          brand_id?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          last_received_at?: string | null
          name?: string
          node_id?: string
          payload_schema?: Json
          public_id?: string
          secret_encrypted?: string
          secret_hash?: string
          updated_at?: string
          workflow_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_webhook_endpoints_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_webhook_endpoints_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "automation_webhook_endpoints_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_webhook_endpoints_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "automation_workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_webhooks: {
        Row: {
          automation_id: string
          created_at: string
          enabled: boolean
          id: string
          last_received_at: string | null
          node_id: string
          secret_hash: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_received_at?: string | null
          node_id: string
          secret_hash: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_received_at?: string | null
          node_id?: string
          secret_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_webhooks_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflow_versions: {
        Row: {
          automation_id: string
          created_at: string
          created_by: string | null
          definition: Json
          definition_hash: string
          id: string
          published_at: string | null
          published_by: string | null
          revision: number
          state: string
          version: number
        }
        Insert: {
          automation_id: string
          created_at?: string
          created_by?: string | null
          definition: Json
          definition_hash: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          revision?: number
          state: string
          version: number
        }
        Update: {
          automation_id?: string
          created_at?: string
          created_by?: string | null
          definition?: Json
          definition_hash?: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          revision?: number
          state?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflow_versions_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          active_version_id: string | null
          agent: string
          brand_id: string
          created_at: string
          created_by: string | null
          cron_expr: string
          draft_version_id: string | null
          enabled: boolean
          id: string
          is_published: boolean | null
          last_run_at: string | null
          last_run_id: string | null
          last_run_status:
            | Database["brand_profiles"]["Enums"]["automation_run_status"]
            | null
          name: string
          next_run_at: string
          prompt: string
          recipients: Json
          run_as_user_id: string | null
          schedule_config: Json
          timezone: string
          updated_at: string
          workflow_status: string
        }
        Insert: {
          active_version_id?: string | null
          agent: string
          brand_id: string
          created_at?: string
          created_by?: string | null
          cron_expr: string
          draft_version_id?: string | null
          enabled?: boolean
          id?: string
          is_published?: boolean | null
          last_run_at?: string | null
          last_run_id?: string | null
          last_run_status?:
            | Database["brand_profiles"]["Enums"]["automation_run_status"]
            | null
          name: string
          next_run_at: string
          prompt: string
          recipients?: Json
          run_as_user_id?: string | null
          schedule_config: Json
          timezone?: string
          updated_at?: string
          workflow_status?: string
        }
        Update: {
          active_version_id?: string | null
          agent?: string
          brand_id?: string
          created_at?: string
          created_by?: string | null
          cron_expr?: string
          draft_version_id?: string | null
          enabled?: boolean
          id?: string
          is_published?: boolean | null
          last_run_at?: string | null
          last_run_id?: string | null
          last_run_status?:
            | Database["brand_profiles"]["Enums"]["automation_run_status"]
            | null
          name?: string
          next_run_at?: string
          prompt?: string
          recipients?: Json
          run_as_user_id?: string | null
          schedule_config?: Json
          timezone?: string
          updated_at?: string
          workflow_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_active_version_id_fkey"
            columns: ["active_version_id"]
            isOneToOne: false
            referencedRelation: "automation_workflow_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "automations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automations_draft_version_id_fkey"
            columns: ["draft_version_id"]
            isOneToOne: false
            referencedRelation: "automation_workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_book: {
        Row: {
          assembled: Json
          brand_id: string
          created_at: string
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          error: Json | null
          refreshed_at: string | null
          source_versions: Json
          status: Database["brand_profiles"]["Enums"]["brand_book_status"]
          updated_at: string
        }
        Insert: {
          assembled?: Json
          brand_id: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          error?: Json | null
          refreshed_at?: string | null
          source_versions?: Json
          status?: Database["brand_profiles"]["Enums"]["brand_book_status"]
          updated_at?: string
        }
        Update: {
          assembled?: Json
          brand_id?: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          error?: Json | null
          refreshed_at?: string | null
          source_versions?: Json
          status?: Database["brand_profiles"]["Enums"]["brand_book_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_book_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_book_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_book_jobs: {
        Row: {
          attempts: number
          brand_id: string
          claimed_at: string | null
          completed_at: string | null
          enqueued_at: string
          error: Json | null
          heartbeat_at: string | null
          job_id: string
          origin_env: string | null
          payload: Json
          status: Database["brand_profiles"]["Enums"]["brand_book_job_status"]
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
          origin_env?: string | null
          payload?: Json
          status?: Database["brand_profiles"]["Enums"]["brand_book_job_status"]
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
          origin_env?: string | null
          payload?: Json
          status?: Database["brand_profiles"]["Enums"]["brand_book_job_status"]
          trigger?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_book_jobs_brand_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_book_jobs_brand_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
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
          meta_page_name: string | null
          meta_page_resolution_candidates: Json
          meta_page_resolution_confidence: number | null
          meta_page_resolution_error: string | null
          meta_page_resolution_status: string
          meta_page_resolved_at: string | null
          metadata: Json | null
          name: string
          recommendation_dismissed_at: string | null
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
          meta_page_name?: string | null
          meta_page_resolution_candidates?: Json
          meta_page_resolution_confidence?: number | null
          meta_page_resolution_error?: string | null
          meta_page_resolution_status?: string
          meta_page_resolved_at?: string | null
          metadata?: Json | null
          name: string
          recommendation_dismissed_at?: string | null
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
          meta_page_name?: string | null
          meta_page_resolution_candidates?: Json
          meta_page_resolution_confidence?: number | null
          meta_page_resolution_error?: string | null
          meta_page_resolution_status?: string
          meta_page_resolved_at?: string | null
          metadata?: Json | null
          name?: string
          recommendation_dismissed_at?: string | null
          tagged_at?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_competitors_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_competitors_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_deep_jobs: {
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
          status: Database["brand_profiles"]["Enums"]["brand_deep_job_status"]
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
          status?: Database["brand_profiles"]["Enums"]["brand_deep_job_status"]
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
          status?: Database["brand_profiles"]["Enums"]["brand_deep_job_status"]
          trigger?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_deep_jobs_brand_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_deep_jobs_brand_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_design_system_sections: {
        Row: {
          brand_id: string
          confidence: number
          content: Json
          created_at: string
          design_system_id: string
          edited_at: string | null
          edited_by: string | null
          embedding: string | null
          embedding_text: string | null
          enabled: boolean
          exemplars: Json
          id: string
          provenance: string
          rules: Json
          section: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          confidence?: number
          content?: Json
          created_at?: string
          design_system_id: string
          edited_at?: string | null
          edited_by?: string | null
          embedding?: string | null
          embedding_text?: string | null
          enabled?: boolean
          exemplars?: Json
          id?: string
          provenance?: string
          rules?: Json
          section: string
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          confidence?: number
          content?: Json
          created_at?: string
          design_system_id?: string
          edited_at?: string | null
          edited_by?: string | null
          embedding?: string | null
          embedding_text?: string | null
          enabled?: boolean
          exemplars?: Json
          id?: string
          provenance?: string
          rules?: Json
          section?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_design_system_sections_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_design_system_sections_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_design_system_sections_design_system_id_fkey"
            columns: ["design_system_id"]
            isOneToOne: false
            referencedRelation: "brand_design_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_design_systems: {
        Row: {
          activated_at: string | null
          adherence: Json
          brand_id: string
          checksum: string | null
          conflicts: Json
          created_at: string
          error_code: string | null
          error_message: string | null
          fonts: Json
          id: string
          is_active: boolean
          progress_percent: number | null
          progress_step: string | null
          rigor_evidence: Json
          rigor_tier: string
          rigor_tier_override: string | null
          source_document_id: string | null
          source_kind: string
          status: string
          tokens: Json
          updated_at: string
          version: number
        }
        Insert: {
          activated_at?: string | null
          adherence?: Json
          brand_id: string
          checksum?: string | null
          conflicts?: Json
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          fonts?: Json
          id?: string
          is_active?: boolean
          progress_percent?: number | null
          progress_step?: string | null
          rigor_evidence?: Json
          rigor_tier?: string
          rigor_tier_override?: string | null
          source_document_id?: string | null
          source_kind?: string
          status?: string
          tokens?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          activated_at?: string | null
          adherence?: Json
          brand_id?: string
          checksum?: string | null
          conflicts?: Json
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          fonts?: Json
          id?: string
          is_active?: boolean
          progress_percent?: number | null
          progress_step?: string | null
          rigor_evidence?: Json
          rigor_tier?: string
          rigor_tier_override?: string | null
          source_document_id?: string | null
          source_kind?: string
          status?: string
          tokens?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_design_systems_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_design_systems_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_design_systems_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "brand_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_design_systems_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "brand_documents_active"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_direction: {
        Row: {
          brand_id: string
          checksum: string | null
          created_at: string
          updated_at: string
          version: number
        }
        Insert: {
          brand_id: string
          checksum?: string | null
          created_at?: string
          updated_at?: string
          version?: number
        }
        Update: {
          brand_id?: string
          checksum?: string | null
          created_at?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_direction_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_direction_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_direction_examples: {
        Row: {
          added_at: string
          added_by: string | null
          annotations: Json
          applies_to: Json
          asset_id: string
          authority: string
          brand_id: string
          id: string
          kind: string
          rights_note: string | null
          version_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          annotations?: Json
          applies_to?: Json
          asset_id: string
          authority: string
          brand_id: string
          id?: string
          kind: string
          rights_note?: string | null
          version_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          annotations?: Json
          applies_to?: Json
          asset_id?: string
          authority?: string
          brand_id?: string
          id?: string
          kind?: string
          rights_note?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_direction_examples_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_direction_examples_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_direction_rules: {
        Row: {
          applicability: Json
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          confidence: number
          created_at: string
          id: string
          last_applied_at: string | null
          observability: string
          payload: Json
          piece: string
          provenance: string
          rationale: string | null
          rule_key: string
          source_version: Json
          strength: string
          supersedes: string[]
          updated_at: string
        }
        Insert: {
          applicability: Json
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          brand_id: string
          confidence: number
          created_at?: string
          id?: string
          last_applied_at?: string | null
          observability: string
          payload: Json
          piece: string
          provenance: string
          rationale?: string | null
          rule_key: string
          source_version: Json
          strength: string
          supersedes?: string[]
          updated_at?: string
        }
        Update: {
          applicability?: Json
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          confidence?: number
          created_at?: string
          id?: string
          last_applied_at?: string | null
          observability?: string
          payload?: Json
          piece?: string
          provenance?: string
          rationale?: string | null
          rule_key?: string
          source_version?: Json
          strength?: string
          supersedes?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_direction_rules_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_direction_rules_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_document_chunks: {
        Row: {
          brand_id: string
          category: string
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string
          embedding_model: string | null
          id: number
          tokens: number | null
        }
        Insert: {
          brand_id: string
          category?: string
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding: string
          embedding_model?: string | null
          id?: number
          tokens?: number | null
        }
        Update: {
          brand_id?: string
          category?: string
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string
          embedding_model?: string | null
          id?: number
          tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_document_chunks_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_document_chunks_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "brand_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "brand_documents_active"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_documents: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          brand_id: string
          category: string
          created_at: string
          display_name: string | null
          error_code: string | null
          error_message: string | null
          expires_at: string | null
          external_url: string | null
          goal_artifact_type: string | null
          id: string
          kind: string | null
          library_asset_id: string | null
          library_version_id: string | null
          mime_type: string | null
          name: string
          page_count: number | null
          preview_path: string | null
          progress_percent: number | null
          progress_step: string | null
          purge_after: string | null
          purge_claimed_at: string | null
          retention: string
          scope_key: string | null
          size: number | null
          source: string
          status: string
          storage_bucket: string
          storage_path: string | null
          superseded_storage_paths: string[]
          text_excerpt: string | null
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          brand_id: string
          category?: string
          created_at?: string
          display_name?: string | null
          error_code?: string | null
          error_message?: string | null
          expires_at?: string | null
          external_url?: string | null
          goal_artifact_type?: string | null
          id: string
          kind?: string | null
          library_asset_id?: string | null
          library_version_id?: string | null
          mime_type?: string | null
          name: string
          page_count?: number | null
          preview_path?: string | null
          progress_percent?: number | null
          progress_step?: string | null
          purge_after?: string | null
          purge_claimed_at?: string | null
          retention?: string
          scope_key?: string | null
          size?: number | null
          source: string
          status?: string
          storage_bucket?: string
          storage_path?: string | null
          superseded_storage_paths?: string[]
          text_excerpt?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          brand_id?: string
          category?: string
          created_at?: string
          display_name?: string | null
          error_code?: string | null
          error_message?: string | null
          expires_at?: string | null
          external_url?: string | null
          goal_artifact_type?: string | null
          id?: string
          kind?: string | null
          library_asset_id?: string | null
          library_version_id?: string | null
          mime_type?: string | null
          name?: string
          page_count?: number | null
          preview_path?: string | null
          progress_percent?: number | null
          progress_step?: string | null
          purge_after?: string | null
          purge_claimed_at?: string | null
          retention?: string
          scope_key?: string | null
          size?: number | null
          source?: string
          status?: string
          storage_bucket?: string
          storage_path?: string | null
          superseded_storage_paths?: string[]
          text_excerpt?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_documents_brand_profile_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
          deadline_at: string | null
          enqueued_at: string
          error: Json | null
          heartbeat_at: string | null
          job_id: string
          not_before: string
          origin_env: string | null
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
          deadline_at?: string | null
          enqueued_at?: string
          error?: Json | null
          heartbeat_at?: string | null
          job_id?: string
          not_before?: string
          origin_env?: string | null
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
          deadline_at?: string | null
          enqueued_at?: string
          error?: Json | null
          heartbeat_at?: string | null
          job_id?: string
          not_before?: string
          origin_env?: string | null
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["provider_integration_id"]
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
      brand_intelligence_jobs: {
        Row: {
          attempts: number
          brand_id: string
          claimed_at: string | null
          completed_at: string | null
          enqueued_at: string
          error: Json | null
          heartbeat_at: string | null
          input_hash: string | null
          job_id: string
          origin_env: string | null
          progress: Json
          source_versions: Json
          started_at: string | null
          status: Database["brand_profiles"]["Enums"]["brand_intelligence_job_status"]
          trigger: string
          updated_at: string
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
          input_hash?: string | null
          job_id?: string
          origin_env?: string | null
          progress?: Json
          source_versions?: Json
          started_at?: string | null
          status?: Database["brand_profiles"]["Enums"]["brand_intelligence_job_status"]
          trigger: string
          updated_at?: string
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
          input_hash?: string | null
          job_id?: string
          origin_env?: string | null
          progress?: Json
          source_versions?: Json
          started_at?: string | null
          status?: Database["brand_profiles"]["Enums"]["brand_intelligence_job_status"]
          trigger?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_intelligence_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_intelligence_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_intelligence_profiles: {
        Row: {
          brand_id: string
          created_at: string
          input_hash: string
          last_error: Json | null
          last_run_id: string | null
          profile: Json
          refreshed_at: string
          schema_version: number
          source_versions: Json
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          input_hash: string
          last_error?: Json | null
          last_run_id?: string | null
          profile: Json
          refreshed_at: string
          schema_version?: number
          source_versions?: Json
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          input_hash?: string
          last_error?: Json | null
          last_run_id?: string | null
          profile?: Json
          refreshed_at?: string
          schema_version?: number
          source_versions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_intelligence_profiles_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_intelligence_profiles_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_intelligence_profiles_last_run_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "brand_intelligence_jobs"
            referencedColumns: ["job_id"]
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
            foreignKeyName: "brand_profile_integration_accounts_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["integration_account_id"]
          },
          {
            foreignKeyName: "brand_profile_integration_accounts_integration_account_id_fkey"
            columns: ["integration_account_id"]
            isOneToOne: false
            referencedRelation: "integration_accounts_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_profile_integration_accounts_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["provider_integration_id"]
          },
          {
            foreignKeyName: "brand_profile_integration_accounts_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "user_integrations"
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["provider_integration_id"]
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
          email_report_opt_in: boolean
          id: string
          logo_path: string | null
          target_audience: Json | null
          tier: number
          timezone: string
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
          email_report_opt_in?: boolean
          id?: string
          logo_path?: string | null
          target_audience?: Json | null
          tier?: number
          timezone?: string
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
          email_report_opt_in?: boolean
          id?: string
          logo_path?: string | null
          target_audience?: Json | null
          tier?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      brand_report_composites: {
        Row: {
          brand_md: string | null
          brand_md_edited: string | null
          brand_profile_id: string
          brand_report_id: string | null
          brand_tokens: Json | null
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
          brand_md?: string | null
          brand_md_edited?: string | null
          brand_profile_id: string
          brand_report_id?: string | null
          brand_tokens?: Json | null
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
          brand_md?: string | null
          brand_md_edited?: string | null
          brand_profile_id?: string
          brand_report_id?: string | null
          brand_tokens?: Json | null
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
          kind: string
          name: string
        }
        Insert: {
          brand_profile_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name: string
        }
        Update: {
          brand_profile_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_rooms_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "chat_messages_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_concepts: {
        Row: {
          angle_id: string
          angle_scope: string
          brand_id: string
          content_hash: string
          created_at: string
          description: string | null
          embedding: string | null
          embedding_model: string
          grounded_on: Json
          id: string
          label: string
          merged_into_id: string | null
          minted_by: string
          minted_model: string | null
          slug: string
          status: string
          updated_at: string
          vocab_version: number
        }
        Insert: {
          angle_id: string
          angle_scope: string
          brand_id: string
          content_hash: string
          created_at?: string
          description?: string | null
          embedding?: string | null
          embedding_model?: string
          grounded_on?: Json
          id?: string
          label: string
          merged_into_id?: string | null
          minted_by: string
          minted_model?: string | null
          slug: string
          status?: string
          updated_at?: string
          vocab_version?: number
        }
        Update: {
          angle_id?: string
          angle_scope?: string
          brand_id?: string
          content_hash?: string
          created_at?: string
          description?: string | null
          embedding?: string | null
          embedding_model?: string
          grounded_on?: Json
          id?: string
          label?: string
          merged_into_id?: string | null
          minted_by?: string
          minted_model?: string | null
          slug?: string
          status?: string
          updated_at?: string
          vocab_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "creative_concepts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "creative_concepts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_concepts_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "creative_concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_strategy_insights: {
        Row: {
          archetype: string | null
          brand_id: string
          confidence: number | null
          created_at: string
          description: string
          embedding: string | null
          embedding_model: string | null
          evidence: Json
          exemplars: Json
          id: string
          insight_id: string
          kind: string
          label: string
          performance_summary: string | null
          recommendation: string
          refreshed_at: string | null
          surface: string
          tags: string[]
        }
        Insert: {
          archetype?: string | null
          brand_id: string
          confidence?: number | null
          created_at?: string
          description?: string
          embedding?: string | null
          embedding_model?: string | null
          evidence?: Json
          exemplars?: Json
          id?: string
          insight_id: string
          kind: string
          label: string
          performance_summary?: string | null
          recommendation?: string
          refreshed_at?: string | null
          surface: string
          tags?: string[]
        }
        Update: {
          archetype?: string | null
          brand_id?: string
          confidence?: number | null
          created_at?: string
          description?: string
          embedding?: string | null
          embedding_model?: string | null
          evidence?: Json
          exemplars?: Json
          id?: string
          insight_id?: string
          kind?: string
          label?: string
          performance_summary?: string | null
          recommendation?: string
          refreshed_at?: string | null
          surface?: string
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "creative_strategy_insights_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "creative_strategy_insights_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_strategy_jobs: {
        Row: {
          attempts: number
          brand_id: string
          claimed_at: string | null
          completed_at: string | null
          enqueued_at: string
          error: Json | null
          heartbeat_at: string | null
          job_id: string
          origin_env: string | null
          payload: Json
          status: Database["brand_profiles"]["Enums"]["creative_strategy_job_status"]
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
          origin_env?: string | null
          payload?: Json
          status?: Database["brand_profiles"]["Enums"]["creative_strategy_job_status"]
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
          origin_env?: string | null
          payload?: Json
          status?: Database["brand_profiles"]["Enums"]["creative_strategy_job_status"]
          trigger?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creative_strategy_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "creative_strategy_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_strategy_reports: {
        Row: {
          brand_id: string
          content_hash: string | null
          created_at: string
          error: Json | null
          refreshed_at: string | null
          report: Json
          source_versions: Json
          status: Database["brand_profiles"]["Enums"]["creative_strategy_status"]
          updated_at: string
          window_days: number
        }
        Insert: {
          brand_id: string
          content_hash?: string | null
          created_at?: string
          error?: Json | null
          refreshed_at?: string | null
          report?: Json
          source_versions?: Json
          status?: Database["brand_profiles"]["Enums"]["creative_strategy_status"]
          updated_at?: string
          window_days?: number
        }
        Update: {
          brand_id?: string
          content_hash?: string | null
          created_at?: string
          error?: Json | null
          refreshed_at?: string | null
          report?: Json
          source_versions?: Json
          status?: Database["brand_profiles"]["Enums"]["creative_strategy_status"]
          updated_at?: string
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "creative_strategy_reports_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "creative_strategy_reports_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_daily_snapshots: {
        Row: {
          brand_id: string
          composer_version: string
          document: Json
          generated_at: string
          id: string
          input_fingerprint: string
          local_date: string
          scoring_version: string
          selection_trace: Json
          source_watermarks: Json
          status: string
          timezone: string
        }
        Insert: {
          brand_id: string
          composer_version: string
          document: Json
          generated_at?: string
          id?: string
          input_fingerprint: string
          local_date: string
          scoring_version: string
          selection_trace?: Json
          source_watermarks?: Json
          status: string
          timezone: string
        }
        Update: {
          brand_id?: string
          composer_version?: string
          document?: Json
          generated_at?: string
          id?: string
          input_fingerprint?: string
          local_date?: string
          scoring_version?: string
          selection_trace?: Json
          source_watermarks?: Json
          status?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_daily_snapshots_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "dashboard_daily_snapshots_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_deliveries: {
        Row: {
          accepted_at: string | null
          attempt_count: number
          brand_id: string | null
          classification: string
          created_at: string
          delivered_at: string | null
          email_kind: string
          failed_at: string | null
          id: string
          idempotency_key: string
          last_error_code: string | null
          last_provider_event_at: string | null
          next_attempt_at: string
          provider_message_id: string | null
          recipient_class: string
          recipient_email: string
          source_id: string
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          attempt_count?: number
          brand_id?: string | null
          classification: string
          created_at?: string
          delivered_at?: string | null
          email_kind: string
          failed_at?: string | null
          id?: string
          idempotency_key: string
          last_error_code?: string | null
          last_provider_event_at?: string | null
          next_attempt_at?: string
          provider_message_id?: string | null
          recipient_class?: string
          recipient_email: string
          source_id: string
          source_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          attempt_count?: number
          brand_id?: string | null
          classification?: string
          created_at?: string
          delivered_at?: string | null
          email_kind?: string
          failed_at?: string | null
          id?: string
          idempotency_key?: string
          last_error_code?: string | null
          last_provider_event_at?: string | null
          next_attempt_at?: string
          provider_message_id?: string | null
          recipient_class?: string
          recipient_email?: string
          source_id?: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_deliveries_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "email_deliveries_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_delivery_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          occurred_at: string
          provider_event_id: string
          provider_message_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          occurred_at: string
          provider_event_id: string
          provider_message_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          occurred_at?: string
          provider_event_id?: string
          provider_message_id?: string
        }
        Relationships: []
      }
      email_suppressions: {
        Row: {
          created_at: string
          id: string
          reason: string
          recipient_email: string
          scope: string
          scope_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          recipient_email: string
          scope: string
          scope_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          recipient_email?: string
          scope?: string
          scope_id?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          brand_id: string
          created_at: string
          expires_at: string
          id: string
          recipient_email: string
          scope: string
          scope_id: string
          source_id: string
          source_type: string
          token_hash: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          expires_at: string
          id?: string
          recipient_email: string
          scope: string
          scope_id: string
          source_id: string
          source_type: string
          token_hash: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          recipient_email?: string
          scope?: string
          scope_id?: string
          source_id?: string
          source_type?: string
          token_hash?: string
          updated_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_unsubscribe_tokens_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "email_unsubscribe_tokens_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      first_value_report_jobs: {
        Row: {
          attempts: number
          brand_id: string
          created_at: string
          deadline_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          payload_snapshot: Json | null
          report_type: string
          resend_message_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          brand_id: string
          created_at?: string
          deadline_at: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload_snapshot?: Json | null
          report_type?: string
          resend_message_id?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          brand_id?: string
          created_at?: string
          deadline_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload_snapshot?: Json | null
          report_type?: string
          resend_message_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "first_value_report_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "first_value_report_jobs_brand_id_fkey"
            columns: ["brand_id"]
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["provider_integration_id"]
          },
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
          last_email_error: string | null
          last_email_message_id: string | null
          last_emailed_at: string | null
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
          last_email_error?: string | null
          last_email_message_id?: string | null
          last_emailed_at?: string | null
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
          last_email_error?: string | null
          last_email_message_id?: string | null
          last_emailed_at?: string | null
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
      notifications: {
        Row: {
          actor_user_id: string | null
          brand_id: string
          created_at: string
          id: string
          kind: string
          payload: Json
          read_at: string | null
          recipient_user_id: string
        }
        Insert: {
          actor_user_id?: string | null
          brand_id: string
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          recipient_user_id: string
        }
        Update: {
          actor_user_id?: string | null
          brand_id?: string
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          recipient_user_id?: string
        }
        Relationships: []
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "paid_media_insight_snapshots_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_scaffold_gate_approvals: {
        Row: {
          approval_expires_at: string
          approval_token_hash: string
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          content_hash: string
          created_at: string
          created_by: string
          gate: string
          id: string
          resume_expires_at: string
          resume_messages: Json
          sdk_approval_id: string
          sdk_tool_call_id: string
          sdk_tool_name: string
          status: string
          updated_at: string
          version_id: string
        }
        Insert: {
          approval_expires_at: string
          approval_token_hash: string
          approved_at?: string | null
          approved_by?: string | null
          brand_id: string
          content_hash: string
          created_at?: string
          created_by: string
          gate: string
          id?: string
          resume_expires_at: string
          resume_messages: Json
          sdk_approval_id: string
          sdk_tool_call_id: string
          sdk_tool_name: string
          status?: string
          updated_at?: string
          version_id: string
        }
        Update: {
          approval_expires_at?: string
          approval_token_hash?: string
          approved_at?: string | null
          approved_by?: string | null
          brand_id?: string
          content_hash?: string
          created_at?: string
          created_by?: string
          gate?: string
          id?: string
          resume_expires_at?: string
          resume_messages?: Json
          sdk_approval_id?: string
          sdk_tool_call_id?: string
          sdk_tool_name?: string
          status?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_scaffold_gate_approvals_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "paid_scaffold_gate_approvals_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_scaffold_gate_approvals_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "paid_scaffold_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_scaffold_nodes: {
        Row: {
          activated_at: string | null
          angle_key: string | null
          attempt: number
          brand_id: string
          concept_key: string | null
          created_at: string
          created_status: string
          creative_asset_id: string | null
          creative_media: Json | null
          error_message: string | null
          id: string
          inherit_angle_key: string | null
          inherit_parent_id: string | null
          inherit_product_key: string | null
          level: string
          meta_creative_id: string | null
          meta_object_id: string | null
          name: string
          ordinal: number
          parent_id: string | null
          path_key: string
          payload: Json
          product_key: string | null
          provider_snapshot: Json | null
          status: string
          updated_at: string
          version_id: string
        }
        Insert: {
          activated_at?: string | null
          angle_key?: string | null
          attempt?: number
          brand_id: string
          concept_key?: string | null
          created_at?: string
          created_status?: string
          creative_asset_id?: string | null
          creative_media?: Json | null
          error_message?: string | null
          id?: string
          inherit_angle_key?: string | null
          inherit_parent_id?: string | null
          inherit_product_key?: string | null
          level: string
          meta_creative_id?: string | null
          meta_object_id?: string | null
          name: string
          ordinal: number
          parent_id?: string | null
          path_key: string
          payload?: Json
          product_key?: string | null
          provider_snapshot?: Json | null
          status?: string
          updated_at?: string
          version_id: string
        }
        Update: {
          activated_at?: string | null
          angle_key?: string | null
          attempt?: number
          brand_id?: string
          concept_key?: string | null
          created_at?: string
          created_status?: string
          creative_asset_id?: string | null
          creative_media?: Json | null
          error_message?: string | null
          id?: string
          inherit_angle_key?: string | null
          inherit_parent_id?: string | null
          inherit_product_key?: string | null
          level?: string
          meta_creative_id?: string | null
          meta_object_id?: string | null
          name?: string
          ordinal?: number
          parent_id?: string | null
          path_key?: string
          payload?: Json
          product_key?: string | null
          provider_snapshot?: Json | null
          status?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_scaffold_nodes_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "paid_scaffold_nodes_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_scaffold_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "paid_scaffold_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_scaffold_nodes_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "paid_scaffold_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_ad_inherits_adset_product_and_angle"
            columns: [
              "inherit_parent_id",
              "inherit_product_key",
              "inherit_angle_key",
            ]
            isOneToOne: false
            referencedRelation: "paid_scaffold_nodes"
            referencedColumns: ["id", "product_key", "angle_key"]
          },
        ]
      }
      paid_scaffold_operations: {
        Row: {
          actor_id: string
          attempt: number
          brand_id: string
          completed_at: string | null
          gate: string
          id: string
          operation_id: string
          receipt: Json | null
          reconciliation: Json | null
          request_hash: string
          started_at: string
          status: string
          updated_at: string
          version_id: string
        }
        Insert: {
          actor_id: string
          attempt?: number
          brand_id: string
          completed_at?: string | null
          gate: string
          id?: string
          operation_id: string
          receipt?: Json | null
          reconciliation?: Json | null
          request_hash: string
          started_at?: string
          status?: string
          updated_at?: string
          version_id: string
        }
        Update: {
          actor_id?: string
          attempt?: number
          brand_id?: string
          completed_at?: string | null
          gate?: string
          id?: string
          operation_id?: string
          receipt?: Json | null
          reconciliation?: Json | null
          request_hash?: string
          started_at?: string
          status?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_scaffold_operations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "paid_scaffold_operations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_scaffold_operations_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "paid_scaffold_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_scaffold_versions: {
        Row: {
          brand_id: string
          content_hash: string
          created_at: string
          created_by: string
          id: string
          lifecycle: string
          manifest: Json
          naming_schema_id: string | null
          naming_schema_version: number | null
          scaffold_id: string
          special_ad_categories: string[]
          updated_at: string
          version: number
        }
        Insert: {
          brand_id: string
          content_hash: string
          created_at?: string
          created_by: string
          id?: string
          lifecycle?: string
          manifest: Json
          naming_schema_id?: string | null
          naming_schema_version?: number | null
          scaffold_id: string
          special_ad_categories?: string[]
          updated_at?: string
          version: number
        }
        Update: {
          brand_id?: string
          content_hash?: string
          created_at?: string
          created_by?: string
          id?: string
          lifecycle?: string
          manifest?: Json
          naming_schema_id?: string | null
          naming_schema_version?: number | null
          scaffold_id?: string
          special_ad_categories?: string[]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "paid_scaffold_versions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "paid_scaffold_versions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_scaffold_versions_scaffold_id_fkey"
            columns: ["scaffold_id"]
            isOneToOne: false
            referencedRelation: "paid_scaffolds"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_scaffolds: {
        Row: {
          ad_account_id: string
          archived_at: string | null
          brand_id: string
          created_at: string
          created_by: string
          current_version_id: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          archived_at?: string | null
          brand_id: string
          created_at?: string
          created_by: string
          current_version_id?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          archived_at?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_scaffolds_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "paid_scaffolds_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_scaffolds_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "paid_scaffold_versions"
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
          receives_email_report: boolean
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
          receives_email_report?: boolean
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
          receives_email_report?: boolean
          role?: string
          tier?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissions_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "permissions_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
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
          created_by: string | null
          description: string | null
          id: string
          name: string
          prompt: string
          slug: string | null
          source: string
          status: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          brand_profile_id: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          prompt: string
          slug?: string | null
          source?: string
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          brand_profile_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          prompt?: string
          slug?: string | null
          source?: string
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_templates_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "prompt_templates_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_send_receipts: {
        Row: {
          brand_id: string
          created_at: string
          error: string | null
          id: string
          recipients: string[]
          report_type: string
          requested_by: string | null
          resend_message_ids: string[]
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          error?: string | null
          id?: string
          recipients?: string[]
          report_type: string
          requested_by?: string | null
          resend_message_ids?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          error?: string | null
          id?: string
          recipients?: string[]
          report_type?: string
          requested_by?: string | null
          resend_message_ids?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_send_receipts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "report_send_receipts_brand_id_fkey"
            columns: ["brand_id"]
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
      virality_brand_stats: {
        Row: {
          brand_id: string
          hook_rate_mean: number | null
          hook_rate_p10: number | null
          hook_rate_p25: number | null
          hook_rate_p50: number | null
          hook_rate_p75: number | null
          hook_rate_p90: number | null
          hook_rate_stddev: number | null
          refreshed_at: string
          sample_size: number
        }
        Insert: {
          brand_id: string
          hook_rate_mean?: number | null
          hook_rate_p10?: number | null
          hook_rate_p25?: number | null
          hook_rate_p50?: number | null
          hook_rate_p75?: number | null
          hook_rate_p90?: number | null
          hook_rate_stddev?: number | null
          refreshed_at?: string
          sample_size?: number
        }
        Update: {
          brand_id?: string
          hook_rate_mean?: number | null
          hook_rate_p10?: number | null
          hook_rate_p25?: number | null
          hook_rate_p50?: number | null
          hook_rate_p75?: number | null
          hook_rate_p90?: number | null
          hook_rate_stddev?: number | null
          refreshed_at?: string
          sample_size?: number
        }
        Relationships: [
          {
            foreignKeyName: "virality_brand_stats_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "virality_brand_stats_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      virality_scores: {
        Row: {
          brand_id: string
          components: Json
          confidence: number | null
          created_at: string
          grade: string
          grounding: Json
          hook_text: string
          id: string
          model: string | null
          observed_captured_at: string | null
          observed_hook_rate: number | null
          observed_retention: number | null
          predicted_at: string
          predicted_overall: number
          rubric_version: string
          subject_ref: string | null
          subject_type: string
        }
        Insert: {
          brand_id: string
          components?: Json
          confidence?: number | null
          created_at?: string
          grade: string
          grounding?: Json
          hook_text: string
          id?: string
          model?: string | null
          observed_captured_at?: string | null
          observed_hook_rate?: number | null
          observed_retention?: number | null
          predicted_at?: string
          predicted_overall: number
          rubric_version: string
          subject_ref?: string | null
          subject_type: string
        }
        Update: {
          brand_id?: string
          components?: Json
          confidence?: number | null
          created_at?: string
          grade?: string
          grounding?: Json
          hook_text?: string
          id?: string
          model?: string | null
          observed_captured_at?: string | null
          observed_hook_rate?: number | null
          observed_retention?: number | null
          predicted_at?: string
          predicted_overall?: number
          rubric_version?: string
          subject_ref?: string | null
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "virality_scores_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "virality_scores_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
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
      brand_access_directory: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          email: string | null
          is_creator: boolean | null
          role: string | null
          user_id: string | null
        }
        Relationships: []
      }
      brand_account_directory: {
        Row: {
          account_name: string | null
          account_type: string | null
          ad_account_id: string | null
          alias: string | null
          assignment_id: string | null
          brand_id: string | null
          brand_name: string | null
          external_account_id: string | null
          grant_active: boolean | null
          integration_account_id: string | null
          integration_status: string | null
          is_primary: boolean | null
          linked_at: string | null
          owner_user_id: string | null
          platform_key: string | null
          provider: string | null
          provider_integration_id: string | null
          token_expires_at: string | null
        }
        Relationships: []
      }
      brand_ad_account_directory: {
        Row: {
          account_name: string | null
          ad_account_id: string | null
          ad_account_id_prefixed: string | null
          brand_id: string | null
          business_id: string | null
          is_business: boolean | null
          provider: string | null
          provider_integration_id: string | null
          synced_at: string | null
        }
        Relationships: []
      }
      brand_documents_active: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          brand_id: string | null
          category: string | null
          created_at: string | null
          display_name: string | null
          error_code: string | null
          error_message: string | null
          expires_at: string | null
          external_url: string | null
          goal_artifact_type: string | null
          id: string | null
          kind: string | null
          library_asset_id: string | null
          library_version_id: string | null
          mime_type: string | null
          name: string | null
          page_count: number | null
          preview_path: string | null
          progress_percent: number | null
          progress_step: string | null
          purge_after: string | null
          purge_claimed_at: string | null
          retention: string | null
          scope_key: string | null
          size: number | null
          source: string | null
          status: string | null
          storage_bucket: string | null
          storage_path: string | null
          superseded_storage_paths: string[] | null
          text_excerpt: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          brand_id?: string | null
          category?: string | null
          created_at?: string | null
          display_name?: string | null
          error_code?: string | null
          error_message?: string | null
          expires_at?: string | null
          external_url?: string | null
          goal_artifact_type?: string | null
          id?: string | null
          kind?: string | null
          library_asset_id?: string | null
          library_version_id?: string | null
          mime_type?: string | null
          name?: string | null
          page_count?: number | null
          preview_path?: string | null
          progress_percent?: number | null
          progress_step?: string | null
          purge_after?: string | null
          purge_claimed_at?: string | null
          retention?: string | null
          scope_key?: string | null
          size?: number | null
          source?: string | null
          status?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          superseded_storage_paths?: string[] | null
          text_excerpt?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          brand_id?: string | null
          category?: string | null
          created_at?: string | null
          display_name?: string | null
          error_code?: string | null
          error_message?: string | null
          expires_at?: string | null
          external_url?: string | null
          goal_artifact_type?: string | null
          id?: string | null
          kind?: string | null
          library_asset_id?: string | null
          library_version_id?: string | null
          mime_type?: string | null
          name?: string | null
          page_count?: number | null
          preview_path?: string | null
          progress_percent?: number | null
          progress_step?: string | null
          purge_after?: string | null
          purge_claimed_at?: string | null
          retention?: string | null
          scope_key?: string | null
          size?: number | null
          source?: string | null
          status?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          superseded_storage_paths?: string[] | null
          text_excerpt?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_documents_brand_profile_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_documents_brand_profile_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
        Relationships: [
          {
            foreignKeyName: "jaina_conversation_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "jaina_conversation_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      jaina_conversation_runs: {
        Row: {
          ad_account_id: string | null
          ad_account_ids: string[] | null
          brand_id: string | null
          completed_at: string | null
          coordinator_heartbeat_at: string | null
          coordinator_lease_expires_at: string | null
          coordinator_lease_owner: string | null
          coordinator_lease_token: string | null
          created_at: string | null
          error_message: string | null
          goal_harness_run_id: string | null
          goal_id: string | null
          goal_request_id: string | null
          goal_work_node_id: string | null
          id: number | null
          idempotency_key: string | null
          initiator: string | null
          initiator_agent: string | null
          next_event_seq: number | null
          parent_run_id: string | null
          query: string | null
          request_snapshot: Json | null
          result_payload: Json | null
          result_type: string | null
          run_id: string | null
          runtime_checkpoint: Json | null
          runtime_stage: string | null
          runtime_version: string | null
          session_id: string | null
          started_at: string | null
          status: string | null
          updated_at: string | null
          user_email: string | null
        }
        Insert: {
          ad_account_id?: string | null
          ad_account_ids?: string[] | null
          brand_id?: string | null
          completed_at?: string | null
          coordinator_heartbeat_at?: string | null
          coordinator_lease_expires_at?: string | null
          coordinator_lease_owner?: string | null
          coordinator_lease_token?: string | null
          created_at?: string | null
          error_message?: string | null
          goal_harness_run_id?: string | null
          goal_id?: string | null
          goal_request_id?: string | null
          goal_work_node_id?: string | null
          id?: number | null
          idempotency_key?: string | null
          initiator?: string | null
          initiator_agent?: string | null
          next_event_seq?: number | null
          parent_run_id?: string | null
          query?: string | null
          request_snapshot?: Json | null
          result_payload?: Json | null
          result_type?: string | null
          run_id?: string | null
          runtime_checkpoint?: Json | null
          runtime_stage?: string | null
          runtime_version?: string | null
          session_id?: string | null
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_email?: string | null
        }
        Update: {
          ad_account_id?: string | null
          ad_account_ids?: string[] | null
          brand_id?: string | null
          completed_at?: string | null
          coordinator_heartbeat_at?: string | null
          coordinator_lease_expires_at?: string | null
          coordinator_lease_owner?: string | null
          coordinator_lease_token?: string | null
          created_at?: string | null
          error_message?: string | null
          goal_harness_run_id?: string | null
          goal_id?: string | null
          goal_request_id?: string | null
          goal_work_node_id?: string | null
          id?: number | null
          idempotency_key?: string | null
          initiator?: string | null
          initiator_agent?: string | null
          next_event_seq?: number | null
          parent_run_id?: string | null
          query?: string | null
          request_snapshot?: Json | null
          result_payload?: Json | null
          result_type?: string | null
          run_id?: string | null
          runtime_checkpoint?: Json | null
          runtime_stage?: string | null
          runtime_version?: string | null
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
          ad_account_ids: string[] | null
          brand_id: string | null
          caller_run_id: string | null
          caller_session_id: string | null
          conversation_title: string | null
          created_at: string | null
          cross_call_id: string | null
          id: number | null
          initiator: string | null
          initiator_agent: string | null
          last_message_at: string | null
          last_message_preview: string | null
          last_message_role: string | null
          preview: string | null
          session_id: string | null
          tags: string[] | null
          updated_at: string | null
          user_email: string | null
        }
        Insert: {
          ad_account_id?: string | null
          ad_account_ids?: string[] | null
          brand_id?: string | null
          caller_run_id?: string | null
          caller_session_id?: string | null
          conversation_title?: string | null
          created_at?: string | null
          cross_call_id?: string | null
          id?: number | null
          initiator?: string | null
          initiator_agent?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_role?: string | null
          preview?: string | null
          session_id?: string | null
          tags?: string[] | null
          updated_at?: string | null
          user_email?: string | null
        }
        Update: {
          ad_account_id?: string | null
          ad_account_ids?: string[] | null
          brand_id?: string | null
          caller_run_id?: string | null
          caller_session_id?: string | null
          conversation_title?: string | null
          created_at?: string | null
          cross_call_id?: string | null
          id?: number | null
          initiator?: string | null
          initiator_agent?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_role?: string | null
          preview?: string | null
          session_id?: string | null
          tags?: string[] | null
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
          platform: string | null
          platform_account_id: string | null
          platform_post_id: string | null
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
          platform?: string | null
          platform_account_id?: string | null
          platform_post_id?: string | null
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
          platform?: string | null
          platform_account_id?: string | null
          platform_post_id?: string | null
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
            columns: ["platform_post_id"]
            isOneToOne: false
            referencedRelation: "organic_published_posts"
            referencedColumns: ["platform_post_id"]
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
          platform: string | null
          platform_account_id: string | null
          platform_post_id: string | null
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
          platform?: string | null
          platform_account_id?: string | null
          platform_post_id?: string | null
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
          platform?: string | null
          platform_account_id?: string | null
          platform_post_id?: string | null
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
            referencedRelation: "brand_account_directory"
            referencedColumns: ["brand_id"]
          },
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
      advance_automation_next_run: {
        Args: { p_automation_id: string; p_expected: string; p_next: string }
        Returns: boolean
      }
      advance_automation_trigger_next_run: {
        Args: { p_binding_id: string; p_expected: string; p_next: string }
        Returns: boolean
      }
      apply_ai_studio_canvas_graph_change: {
        Args: {
          p_brand_profile_id: string
          p_change_id: string
          p_room_id: string
          p_user_id: string
        }
        Returns: string
      }
      apply_email_delivery_event: {
        Args: {
          p_event_type: string
          p_occurred_at: string
          p_provider_event_id: string
          p_provider_message_id: string
          p_status: string
        }
        Returns: boolean
      }
      attach_paid_scaffold_node_creative: {
        Args: {
          p_asset_id: string
          p_path_key: string
          p_user_id?: string
          p_version_id: string
        }
        Returns: Json
      }
      automation_trigger_run_rejection: {
        Args: {
          p_automation_id: string
          p_trigger: string
          p_trigger_node_id: string
        }
        Returns: string
      }
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
      claim_audience_group_publish: {
        Args: {
          p_approval_token_hash: string
          p_content_hash: string
          p_user_id?: string
          p_version_id: string
        }
        Returns: Json
      }
      claim_automation_run_email: {
        Args: { p_run_id: string }
        Returns: boolean
      }
      claim_brand_document_purge_batch: {
        Args: { p_limit?: number }
        Returns: {
          bucket: string
          document_id: string
          paths: string[]
        }[]
      }
      claim_due_automation_triggers: {
        Args: { p_env?: string; p_limit: number }
        Returns: {
          automation_id: string
          binding_id: string
          cron_expr: string
          run_id: string
          scheduled_for: string
          timezone: string
          trigger_node_id: string
        }[]
      }
      claim_due_automations: {
        Args: { p_env?: string; p_limit: number }
        Returns: {
          automation_id: string
          cron_expr: string
          run_id: string
          scheduled_for: string
          timezone: string
        }[]
      }
      claim_email_delivery: {
        Args: {
          p_recipient_email: string
          p_source_id: string
          p_source_type: string
        }
        Returns: boolean
      }
      claim_first_value_report_jobs: {
        Args: { p_limit?: number; p_lock_owner?: string }
        Returns: {
          attempts: number
          brand_id: string
          deadline_at: string
          id: string
          report_type: string
          scheduled_at: string
          user_id: string
        }[]
      }
      claim_next_automation_run: {
        Args: { p_env?: string; p_lease_ttl_sec: number; p_worker_id: string }
        Returns: {
          attempts: number
          automation_id: string
          brand_id: string
          claimed_at: string | null
          completed_at: string | null
          deadline_at: string | null
          email_attempts: number
          email_claimed_at: string | null
          email_error: string | null
          email_status: string
          emailed_at: string | null
          enqueued_at: string
          error: Json | null
          execution_mode: string
          execution_summary: Json | null
          execution_user_id: string | null
          heartbeat_at: string | null
          next_email_attempt_at: string
          not_before: string
          origin_env: string | null
          recipients_snapshot: Json | null
          requested_by: string | null
          resend_message_ids: string[]
          result: Json | null
          run_id: string
          scheduled_for: string
          started_at: string | null
          status: Database["brand_profiles"]["Enums"]["automation_run_status"]
          trigger: string
          trigger_idempotency_key: string | null
          trigger_node_id: string | null
          trigger_payload: Json
          worker_id: string | null
          workflow_definition_hash: string | null
          workflow_definition_snapshot: Json | null
          workflow_revision: number | null
          workflow_version_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "automation_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_next_brand_book_job: {
        Args: { p_env?: string; p_lease_ttl_sec: number; p_worker_id: string }
        Returns: {
          attempts: number
          brand_id: string
          claimed_at: string | null
          completed_at: string | null
          enqueued_at: string
          error: Json | null
          heartbeat_at: string | null
          job_id: string
          origin_env: string | null
          payload: Json
          status: Database["brand_profiles"]["Enums"]["brand_book_job_status"]
          trigger: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "brand_book_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_next_brand_deep_job: {
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
          status: Database["brand_profiles"]["Enums"]["brand_deep_job_status"]
          trigger: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "brand_deep_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_next_brand_guideline_job: {
        Args: { p_env?: string; p_lease_ttl_sec: number; p_worker_id: string }
        Returns: {
          attempts: number
          brand_id: string
          claimed_at: string | null
          completed_at: string | null
          deadline_at: string | null
          enqueued_at: string
          error: Json | null
          heartbeat_at: string | null
          job_id: string
          not_before: string
          origin_env: string | null
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
      claim_next_brand_intelligence_job: {
        Args: { p_env?: string; p_lease_ttl_sec: number; p_worker_id: string }
        Returns: {
          attempts: number
          brand_id: string
          claimed_at: string | null
          completed_at: string | null
          enqueued_at: string
          error: Json | null
          heartbeat_at: string | null
          input_hash: string | null
          job_id: string
          origin_env: string | null
          progress: Json
          source_versions: Json
          started_at: string | null
          status: Database["brand_profiles"]["Enums"]["brand_intelligence_job_status"]
          trigger: string
          updated_at: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "brand_intelligence_jobs"
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
      claim_next_creative_strategy_job: {
        Args: { p_env?: string; p_lease_ttl_sec: number; p_worker_id: string }
        Returns: {
          attempts: number
          brand_id: string
          claimed_at: string | null
          completed_at: string | null
          enqueued_at: string
          error: Json | null
          heartbeat_at: string | null
          job_id: string
          origin_env: string | null
          payload: Json
          status: Database["brand_profiles"]["Enums"]["creative_strategy_job_status"]
          trigger: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "creative_strategy_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_paid_scaffold_gate: {
        Args: {
          p_approval_token_hash: string
          p_content_hash: string
          p_gate: string
          p_user_id?: string
          p_version_id: string
        }
        Returns: Json
      }
      cleanup_old_canvas_sessions: { Args: never; Returns: undefined }
      cleanup_old_chat_messages: { Args: never; Returns: undefined }
      complete_audience_group_publish: {
        Args: {
          p_targeting_spec?: Json
          p_user_id?: string
          p_version_id: string
        }
        Returns: Json
      }
      complete_automation_run_owned: {
        Args: {
          p_error?: Json
          p_result?: Json
          p_run_id: string
          p_status: Database["brand_profiles"]["Enums"]["automation_run_status"]
          p_worker_id: string
        }
        Returns: boolean
      }
      complete_brand_book_job_owned: {
        Args: {
          p_error?: Json
          p_job_id: string
          p_status: Database["brand_profiles"]["Enums"]["brand_book_job_status"]
          p_worker_id: string
        }
        Returns: boolean
      }
      complete_brand_deep_job_owned: {
        Args: {
          p_error?: Json
          p_job_id: string
          p_status: Database["brand_profiles"]["Enums"]["brand_deep_job_status"]
          p_worker_id: string
        }
        Returns: boolean
      }
      complete_brand_guideline_job_owned: {
        Args: {
          p_error?: Json
          p_job_id: string
          p_status: Database["brand_profiles"]["Enums"]["brand_guideline_job_status"]
          p_worker_id: string
        }
        Returns: boolean
      }
      complete_brand_intelligence_job_owned: {
        Args: {
          p_error?: Json
          p_input_hash?: string
          p_job_id: string
          p_profile?: Json
          p_schema_version?: number
          p_source_versions?: Json
          p_status: Database["brand_profiles"]["Enums"]["brand_intelligence_job_status"]
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
      complete_creative_strategy_job_owned: {
        Args: {
          p_error?: Json
          p_job_id: string
          p_status: Database["brand_profiles"]["Enums"]["creative_strategy_job_status"]
          p_worker_id: string
        }
        Returns: boolean
      }
      complete_paid_scaffold_gate: {
        Args: {
          p_gate: string
          p_receipt?: Json
          p_user_id?: string
          p_version_id: string
        }
        Returns: Json
      }
      confirm_brand_documents_purged: {
        Args: { p_document_ids: string[] }
        Returns: number
      }
      create_audience_group_draft: {
        Args: {
          p_ad_account_id: string
          p_approval_expires_at: string
          p_approval_token_hash: string
          p_brand_id: string
          p_content_hash: string
          p_group_id?: string
          p_manifest: Json
          p_members: Json
          p_name: string
          p_user_id?: string
        }
        Returns: Json
      }
      create_automation_workflow_draft: {
        Args: {
          p_agent: string
          p_brand_id: string
          p_cron_expr: string
          p_definition: Json
          p_definition_hash: string
          p_name: string
          p_next_run_at: string
          p_prompt: string
          p_recipients: Json
          p_schedule_config: Json
          p_timezone: string
          p_user_id: string
        }
        Returns: {
          automation_id: string
          created_at: string
          created_by: string | null
          definition: Json
          definition_hash: string
          id: string
          published_at: string | null
          published_by: string | null
          revision: number
          state: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "automation_workflow_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_canvas_workspace: {
        Args: { p_brand_profile_id: string; p_name: string; p_user_id?: string }
        Returns: Json
      }
      create_paid_scaffold_draft: {
        Args: {
          p_ad_account_id: string
          p_brand_id: string
          p_content_hash: string
          p_manifest: Json
          p_name: string
          p_naming_schema_id?: string
          p_naming_schema_version?: number
          p_nodes: Json
          p_scaffold_id?: string
          p_special_ad_categories?: string[]
          p_user_id?: string
        }
        Returns: Json
      }
      decrypt_token: { Args: { ct: string }; Returns: string }
      decrypt_tokens: { Args: { p_cts: string[] }; Returns: string[] }
      encrypt_token: { Args: { token: string }; Returns: string }
      enqueue_automation_run_manual: {
        Args: {
          p_automation_id: string
          p_env?: string
          p_requested_by: string
        }
        Returns: string
      }
      enqueue_automation_trigger_run: {
        Args: {
          p_automation_id: string
          p_env?: string
          p_idempotency_key: string
          p_requested_by?: string
          p_trigger: string
          p_trigger_node_id: string
          p_trigger_payload: Json
        }
        Returns: string
      }
      enqueue_brand_book_job: {
        Args: { p_brand_id: string; p_payload: Json; p_trigger: string }
        Returns: string
      }
      enqueue_brand_deep_job: {
        Args: { p_brand_id: string; p_payload: Json; p_trigger: string }
        Returns: string
      }
      enqueue_brand_guideline_job: {
        Args: { p_brand_id: string; p_payload: Json; p_trigger: string }
        Returns: string
      }
      enqueue_brand_intelligence_job: {
        Args: {
          p_brand_id: string
          p_source_versions?: Json
          p_trigger?: string
        }
        Returns: string
      }
      enqueue_brand_report_job: {
        Args: { p_brand_id: string; p_payload: Json; p_preview_run_id: string }
        Returns: string
      }
      enqueue_continuum_report_schedules: { Args: never; Returns: number }
      enqueue_creative_strategy_job: {
        Args: { p_brand_id: string; p_payload: Json; p_trigger: string }
        Returns: string
      }
      enqueue_first_value_report_job: {
        Args: { p_brand_id: string; p_completed_at?: string; p_user_id: string }
        Returns: string
      }
      enqueue_weekly_digest_reports: { Args: never; Returns: number }
      ensure_default_canvas_room: {
        Args: { p_brand_profile_id: string; p_created_by?: string }
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
      finalize_email_delivery: {
        Args: {
          p_error_code?: string
          p_provider_message_id?: string
          p_recipient_email: string
          p_source_id: string
          p_source_type: string
          p_status: string
        }
        Returns: boolean
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
      has_brand_editor_access: {
        Args: { p_brand_id: string; p_user_id: string }
        Returns: boolean
      }
      heartbeat_automation_run: {
        Args: { p_run_id: string; p_worker_id: string }
        Returns: boolean
      }
      heartbeat_brand_book_job: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: boolean
      }
      heartbeat_brand_deep_job: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: boolean
      }
      heartbeat_brand_guideline_job: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: boolean
      }
      heartbeat_brand_intelligence_job: {
        Args: { p_job_id: string; p_progress?: Json; p_worker_id: string }
        Returns: boolean
      }
      heartbeat_brand_report_job: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: boolean
      }
      heartbeat_creative_strategy_job: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: boolean
      }
      invoke_automation_report_sweep: { Args: never; Returns: number }
      invoke_brand_document_purge: { Args: never; Returns: number }
      invoke_first_value_report_worker: { Args: never; Returns: number }
      invoke_warm_brand_data_worker: { Args: never; Returns: number }
      is_brand_admin: { Args: { brand_id: string }; Returns: boolean }
      is_brand_member: {
        Args: { p_brand_id: string; p_user_id: string }
        Returns: boolean
      }
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
      list_orphaned_brand_document_objects: {
        Args: { p_limit?: number }
        Returns: {
          bucket: string
          path: string
        }[]
      }
      match_creative_insights: {
        Args: {
          p_brand_id: string
          p_kinds?: string[]
          p_match_count?: number
          p_query_embedding: string
          p_surfaces?: string[]
        }
        Returns: {
          archetype: string
          confidence: number
          description: string
          evidence: Json
          exemplars: Json
          insight_id: string
          kind: string
          label: string
          performance_summary: string
          recommendation: string
          similarity: number
          surface: string
          tags: string[]
        }[]
      }
      open_paid_scaffold_gate: {
        Args: {
          p_approval_expires_at: string
          p_approval_token_hash: string
          p_content_hash: string
          p_gate: string
          p_resume_expires_at: string
          p_resume_messages: Json
          p_sdk_approval_id: string
          p_sdk_tool_call_id: string
          p_sdk_tool_name: string
          p_user_id?: string
          p_version_id: string
        }
        Returns: Json
      }
      publish_automation_workflow: {
        Args: {
          p_automation_id: string
          p_user_id: string
          p_version_id: string
        }
        Returns: {
          automation_id: string
          created_at: string
          created_by: string | null
          definition: Json
          definition_hash: string
          id: string
          published_at: string | null
          published_by: string | null
          revision: number
          state: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "automation_workflow_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purge_automation_workflow_evidence: { Args: never; Returns: Json }
      purge_email_delivery_history: { Args: never; Returns: Json }
      record_audience_group_member_result: {
        Args: {
          p_error_message?: string
          p_member_key: string
          p_meta_audience_id?: string
          p_provider_snapshot?: Json
          p_status: string
          p_user_id?: string
          p_version_id: string
        }
        Returns: undefined
      }
      record_paid_scaffold_node_creative_upload: {
        Args: {
          p_creative_media: Json
          p_path_key: string
          p_user_id?: string
          p_version_id: string
        }
        Returns: Json
      }
      record_paid_scaffold_node_result: {
        Args: {
          p_error_message?: string
          p_meta_creative_id?: string
          p_meta_object_id?: string
          p_path_key: string
          p_provider_snapshot?: Json
          p_status: string
          p_user_id?: string
          p_version_id: string
        }
        Returns: undefined
      }
      refresh_virality_brand_stats: { Args: never; Returns: number }
      report_send_recently_sent: {
        Args: { p_brand_id: string; p_within?: string }
        Returns: boolean
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
      reschedule_automation_run: {
        Args: { p_not_before: string; p_run_id: string; p_worker_id: string }
        Returns: boolean
      }
      reschedule_brand_guideline_job: {
        Args: { p_job_id: string; p_not_before: string; p_worker_id: string }
        Returns: boolean
      }
      reserve_report_send: {
        Args: {
          p_brand_id: string
          p_recipients: string[]
          p_report_type: string
          p_requested_by: string
          p_within?: string
        }
        Returns: string
      }
      resolve_admin_user_directory_name: {
        Args: { metadata: Json }
        Returns: string
      }
      resolve_google_analytics_integration_token_context: {
        Args: { p_brand_profile_id: string; p_property_id?: string }
        Returns: {
          access_token: string
          expires_at: string
          integration_id: string
          refresh_token: string
        }[]
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
      resolve_integration_token_context: {
        Args: {
          p_asset_type?: string
          p_brand_profile_id: string
          p_external_account_id?: string
          p_provider: string
        }
        Returns: {
          access_token: string
          expires_at: string
          integration_id: string
          matched_asset_type: string
          matched_external_account_id: string
          metadata: Json
          platform_email: string
          platform_user_id: string
          provider: string
          refresh_token: string
        }[]
      }
      resolve_paid_scaffold_gate: {
        Args: {
          p_approval_token_hash?: string
          p_decision: string
          p_gate: string
          p_sdk_approval_id: string
          p_user_id?: string
          p_version_id: string
        }
        Returns: Json
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
      set_brand_timezone: {
        Args: { brand_id: string; tz: string }
        Returns: string
      }
      sweep_expired_brand_documents: { Args: never; Returns: Json }
      sweep_pending_automation_emails: {
        Args: { p_limit: number }
        Returns: string[]
      }
      unpublish_automation_workflow: {
        Args: { p_automation_id: string; p_user_id: string }
        Returns: {
          automation_id: string
          created_at: string
          created_by: string | null
          definition: Json
          definition_hash: string
          id: string
          published_at: string | null
          published_by: string | null
          revision: number
          state: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "automation_workflow_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      automation_run_status: "queued" | "running" | "completed" | "failed"
      brand_book_job_status: "queued" | "running" | "completed" | "failed"
      brand_book_status: "assembling" | "ready" | "error"
      brand_deep_job_status: "queued" | "running" | "completed" | "failed"
      brand_guideline_job_status: "queued" | "running" | "completed" | "failed"
      brand_intelligence_job_status:
        | "queued"
        | "running"
        | "completed"
        | "failed"
      brand_report_job_status: "queued" | "running" | "completed" | "failed"
      creative_strategy_job_status:
        | "queued"
        | "running"
        | "completed"
        | "failed"
      creative_strategy_status: "assembling" | "ready" | "error" | "empty"
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
  external_connections: {
    Tables: {
      chat_brand_preferences: {
        Row: {
          brand_id: string
          connection_id: string
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_id: string
          connection_id: string
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          connection_id?: string
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_brand_preferences_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "chat_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_connections: {
        Row: {
          created_at: string
          display_name: string | null
          dm_channel_id: string | null
          dm_thread_id: string | null
          handle: string | null
          id: string
          last_verified_at: string
          platform: string
          platform_user_id: string
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          dm_channel_id?: string | null
          dm_thread_id?: string | null
          handle?: string | null
          id?: string
          last_verified_at?: string
          platform: string
          platform_user_id: string
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          dm_channel_id?: string | null
          dm_thread_id?: string | null
          handle?: string | null
          id?: string
          last_verified_at?: string
          platform?: string
          platform_user_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      chat_digest_subscriptions: {
        Row: {
          active: boolean
          brand_id: string
          channel_id: string
          created_at: string
          created_by: string | null
          id: string
          last_sent_at: string | null
          platform: string
          prompt: string
          send_hour_local: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          brand_id: string
          channel_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_sent_at?: string | null
          platform: string
          prompt: string
          send_hour_local?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          brand_id?: string
          channel_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_sent_at?: string | null
          platform?: string
          prompt?: string
          send_hour_local?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      chat_link_token_uses: {
        Row: {
          consumed_at: string
          consumed_by_user_id: string
          expires_at: string
          nonce: string
          platform: string
          platform_user_id: string
          workspace_id: string
        }
        Insert: {
          consumed_at?: string
          consumed_by_user_id: string
          expires_at: string
          nonce: string
          platform: string
          platform_user_id: string
          workspace_id: string
        }
        Update: {
          consumed_at?: string
          consumed_by_user_id?: string
          expires_at?: string
          nonce?: string
          platform?: string
          platform_user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      chat_platform_users: {
        Row: {
          ad_account_id: string | null
          brand_id: string
          created_at: string
          display_name: string | null
          id: string
          platform: string
          platform_user_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          ad_account_id?: string | null
          brand_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          platform: string
          platform_user_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          ad_account_id?: string | null
          brand_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          platform?: string
          platform_user_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      slack_installations: {
        Row: {
          app_id: string
          bot_token_encrypted: string
          bot_user_id: string
          enterprise_id: string | null
          installation_id: string
          installed_at: string
          installed_by_platform_user_id: string | null
          installed_by_user_id: string | null
          is_enterprise_install: boolean
          revoked_at: string | null
          scopes: string[] | null
          status: string
          team_id: string
          team_name: string | null
          updated_at: string
        }
        Insert: {
          app_id: string
          bot_token_encrypted: string
          bot_user_id: string
          enterprise_id?: string | null
          installation_id: string
          installed_at?: string
          installed_by_platform_user_id?: string | null
          installed_by_user_id?: string | null
          is_enterprise_install?: boolean
          revoked_at?: string | null
          scopes?: string[] | null
          status?: string
          team_id: string
          team_name?: string | null
          updated_at?: string
        }
        Update: {
          app_id?: string
          bot_token_encrypted?: string
          bot_user_id?: string
          enterprise_id?: string | null
          installation_id?: string
          installed_at?: string
          installed_by_platform_user_id?: string | null
          installed_by_user_id?: string | null
          is_enterprise_install?: boolean
          revoked_at?: string | null
          scopes?: string[] | null
          status?: string
          team_id?: string
          team_name?: string | null
          updated_at?: string
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
  integrations: {
    Tables: {
      google: {
        Row: {
          access_token_secret: string | null
          account_name: string | null
          created_at: string | null
          google_user_id: string | null
          id: string
          integration_user_id: string | null
          refresh_token_secret: string | null
          root_email: string | null
          token_expires_at: string | null
          token_metadata: Json | null
          updated_at: string | null
          user_email: string | null
        }
        Insert: {
          access_token_secret?: string | null
          account_name?: string | null
          created_at?: string | null
          google_user_id?: string | null
          id?: string
          integration_user_id?: string | null
          refresh_token_secret?: string | null
          root_email?: string | null
          token_expires_at?: string | null
          token_metadata?: Json | null
          updated_at?: string | null
          user_email?: string | null
        }
        Update: {
          access_token_secret?: string | null
          account_name?: string | null
          created_at?: string | null
          google_user_id?: string | null
          id?: string
          integration_user_id?: string | null
          refresh_token_secret?: string | null
          root_email?: string | null
          token_expires_at?: string | null
          token_metadata?: Json | null
          updated_at?: string | null
          user_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_integration_user_id_fkey"
            columns: ["integration_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      google_ad_account_access: {
        Row: {
          account_id: string | null
          created_at: string | null
          google_ads_id: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          google_ads_id?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          google_ads_id?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_ad_account_access_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "google_ad_accounts"
            referencedColumns: ["account_id"]
          },
        ]
      }
      google_ad_accounts: {
        Row: {
          account_id: string
          account_name: string | null
          created_at: string | null
          is_manager: boolean | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          account_name?: string | null
          created_at?: string | null
          is_manager?: boolean | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          account_name?: string | null
          created_at?: string | null
          is_manager?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      meta_ad_account_access: {
        Row: {
          ad_account_id: string
          created_at: string
          id: string
          meta_ads_id: string
          permissions: Json | null
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          created_at?: string
          id?: string
          meta_ads_id: string
          permissions?: Json | null
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          created_at?: string
          id?: string
          meta_ads_id?: string
          permissions?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_account_access_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_accounts"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "meta_ad_account_access_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "vw_meta_ad_accounts_with_access"
            referencedColumns: ["ad_account_id"]
          },
          {
            foreignKeyName: "meta_ad_account_access_meta_ads_id_fkey"
            columns: ["meta_ads_id"]
            isOneToOne: false
            referencedRelation: "meta_ads"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_accounts: {
        Row: {
          ad_account_id: string | null
          ad_account_id_prefixed: string | null
          business_id: string | null
          created_at: string
          id: string
          is_business: boolean | null
          meta_user_id: string | null
          name: string | null
          permissions: Json | null
          updated_at: string
        }
        Insert: {
          ad_account_id?: string | null
          ad_account_id_prefixed?: string | null
          business_id?: string | null
          created_at?: string
          id?: string
          is_business?: boolean | null
          meta_user_id?: string | null
          name?: string | null
          permissions?: Json | null
          updated_at?: string
        }
        Update: {
          ad_account_id?: string | null
          ad_account_id_prefixed?: string | null
          business_id?: string | null
          created_at?: string
          id?: string
          is_business?: boolean | null
          meta_user_id?: string | null
          name?: string | null
          permissions?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "meta_businesses"
            referencedColumns: ["business_id"]
          },
        ]
      }
      meta_ads: {
        Row: {
          access_token_secret: string | null
          account_name: string | null
          created_at: string
          id: string
          integration_user_id: string | null
          meta_user_id: string | null
          root_email: string | null
          token_expires_at: string | null
          token_metadata: Json | null
          updated_at: string
          user_email: string
        }
        Insert: {
          access_token_secret?: string | null
          account_name?: string | null
          created_at?: string
          id?: string
          integration_user_id?: string | null
          meta_user_id?: string | null
          root_email?: string | null
          token_expires_at?: string | null
          token_metadata?: Json | null
          updated_at?: string
          user_email: string
        }
        Update: {
          access_token_secret?: string | null
          account_name?: string | null
          created_at?: string
          id?: string
          integration_user_id?: string | null
          meta_user_id?: string | null
          root_email?: string | null
          token_expires_at?: string | null
          token_metadata?: Json | null
          updated_at?: string
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_integration_user_id_fkey"
            columns: ["integration_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_user_email_fkey"
            columns: ["user_email"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["email"]
          },
        ]
      }
      meta_businesses: {
        Row: {
          business_id: string
          created_at: string
          name: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      meta_instagram_accounts: {
        Row: {
          business_id: string
          created_at: string
          ig_id: string
          username: string
        }
        Insert: {
          business_id: string
          created_at?: string
          ig_id: string
          username: string
        }
        Update: {
          business_id?: string
          created_at?: string
          ig_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_instagram_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "meta_businesses"
            referencedColumns: ["business_id"]
          },
        ]
      }
      meta_pages: {
        Row: {
          business_id: string
          created_at: string
          name: string | null
          page_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          name?: string | null
          page_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          name?: string | null
          page_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_pages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "meta_businesses"
            referencedColumns: ["business_id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          id: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      youtube_channel_access: {
        Row: {
          channel_id: string | null
          created_at: string | null
          id: string
          updated_at: string | null
          youtube_id: string | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          youtube_id?: string | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "youtube_channel_access_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "youtube_channels"
            referencedColumns: ["channel_id"]
          },
        ]
      }
      youtube_channels: {
        Row: {
          channel_id: string
          created_at: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      AntonidasDeepResearch: {
        Row: {
          ad_account_id: string | null
          content: string | null
          created_at: string | null
          deep_research_batch_id: string | null
          embedding: string | null
          id: number | null
          instagram_business_account_id: string | null
        }
        Insert: {
          ad_account_id?: string | null
          content?: string | null
          created_at?: string | null
          deep_research_batch_id?: string | null
          embedding?: string | null
          id?: number | null
          instagram_business_account_id?: string | null
        }
        Update: {
          ad_account_id?: string | null
          content?: string | null
          created_at?: string | null
          deep_research_batch_id?: string | null
          embedding?: string | null
          id?: number | null
          instagram_business_account_id?: string | null
        }
        Relationships: []
      }
      AntonidasOnboarding: {
        Row: {
          ad_account_id: string | null
          approved_at: string | null
          content: string | null
          created_at: string | null
          deep_research_batch_id: string | null
          embedding: string | null
          id: number | null
          initial_edited_fields: Json | null
          initial_user_edited: boolean | null
          instagram_business_account_id: string | null
          report_markdown: string | null
          status: string | null
          version: number | null
        }
        Insert: {
          ad_account_id?: string | null
          approved_at?: string | null
          content?: string | null
          created_at?: string | null
          deep_research_batch_id?: string | null
          embedding?: string | null
          id?: number | null
          initial_edited_fields?: Json | null
          initial_user_edited?: boolean | null
          instagram_business_account_id?: string | null
          report_markdown?: string | null
          status?: string | null
          version?: number | null
        }
        Update: {
          ad_account_id?: string | null
          approved_at?: string | null
          content?: string | null
          created_at?: string | null
          deep_research_batch_id?: string | null
          embedding?: string | null
          id?: number | null
          initial_edited_fields?: Json | null
          initial_user_edited?: boolean | null
          instagram_business_account_id?: string | null
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
          created_at: string | null
          deep_research_batch_id: string | null
          embedding: string | null
          id: string | null
          instagram_business_account_id: string | null
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
          created_at?: string | null
          deep_research_batch_id?: string | null
          embedding?: string | null
          id?: string | null
          instagram_business_account_id?: string | null
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
          created_at?: string | null
          deep_research_batch_id?: string | null
          embedding?: string | null
          id?: string | null
          instagram_business_account_id?: string | null
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
      brand_insights: {
        Row: {
          country: string | null
          country_code: string | null
          created_at: string | null
          embedding: string | null
          id: string | null
          instagram_business_account_id: string | null
          is_latest: boolean | null
          questions_by_niche: Json | null
          trends_and_events: Json | null
          updated_at: string | null
          version: number | null
          week_start_date: string | null
        }
        Insert: {
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string | null
          instagram_business_account_id?: string | null
          is_latest?: boolean | null
          questions_by_niche?: Json | null
          trends_and_events?: Json | null
          updated_at?: string | null
          version?: number | null
          week_start_date?: string | null
        }
        Update: {
          country?: string | null
          country_code?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: string | null
          instagram_business_account_id?: string | null
          is_latest?: boolean | null
          questions_by_niche?: Json | null
          trends_and_events?: Json | null
          updated_at?: string | null
          version?: number | null
          week_start_date?: string | null
        }
        Relationships: []
      }
      vw_meta_ad_accounts_with_access: {
        Row: {
          ad_account_id: string | null
          ad_account_id_prefixed: string | null
          business_id: string | null
          controller_count: number | null
          created_at: string | null
          id: string | null
          is_business: boolean | null
          meta_ads_emails: string[] | null
          meta_ads_ids: string[] | null
          name: string | null
          permissions: Json | null
          updated_at: string | null
        }
        Insert: {
          ad_account_id?: string | null
          ad_account_id_prefixed?: string | null
          business_id?: string | null
          controller_count?: never
          created_at?: string | null
          id?: string | null
          is_business?: boolean | null
          meta_ads_emails?: never
          meta_ads_ids?: never
          name?: string | null
          permissions?: Json | null
          updated_at?: string | null
        }
        Update: {
          ad_account_id?: string | null
          ad_account_id_prefixed?: string | null
          business_id?: string | null
          controller_count?: never
          created_at?: string | null
          id?: string | null
          is_business?: boolean | null
          meta_ads_emails?: never
          meta_ads_ids?: never
          name?: string | null
          permissions?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "meta_businesses"
            referencedColumns: ["business_id"]
          },
        ]
      }
    }
    Functions: {
      apply_meta_etl_from_stg: {
        Args: { p_dry_run?: boolean; p_oid: string }
        Returns: Json
      }
      find_auth_user_id: { Args: { p_email: string }; Returns: string }
      upsert_meta_ad_account_access_from_stg: {
        Args: { p_dry_run?: boolean; p_oid: string }
        Returns: Json
      }
      upsert_meta_ad_accounts_from_stg: {
        Args: { p_dry_run?: boolean; p_oid: string }
        Returns: Json
      }
      upsert_meta_ads_from_stg: {
        Args: { p_dry_run?: boolean; p_oid: string }
        Returns: Json
      }
      upsert_meta_businesses_from_stg: {
        Args: { p_dry_run?: boolean; p_oid: string }
        Returns: Json
      }
      upsert_meta_instagram_accounts_from_stg: {
        Args: { p_dry_run?: boolean; p_oid: string }
        Returns: Json
      }
      upsert_meta_pages_from_stg: {
        Args: { p_dry_run?: boolean; p_oid: string }
        Returns: Json
      }
      upsert_users_from_stg: {
        Args: { p_dry_run?: boolean; p_oid: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  jaina: {
    Tables: {
      jaina_conversation_messages: {
        Row: {
          ad_account_id: string | null
          brand_id: string | null
          content: string
          created_at: string
          id: number
          metadata: Json | null
          role: string
          session_id: string
          user_email: string
        }
        Insert: {
          ad_account_id?: string | null
          brand_id?: string | null
          content: string
          created_at?: string
          id?: never
          metadata?: Json | null
          role: string
          session_id: string
          user_email: string
        }
        Update: {
          ad_account_id?: string | null
          brand_id?: string | null
          content?: string
          created_at?: string
          id?: never
          metadata?: Json | null
          role?: string
          session_id?: string
          user_email?: string
        }
        Relationships: []
      }
      jaina_conversation_run_events: {
        Row: {
          created_at: string
          event_id: string | null
          event_type: string
          id: number
          payload: Json
          run_id: string
          seq: number | null
          user_email: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          event_type: string
          id?: never
          payload?: Json
          run_id: string
          seq?: number | null
          user_email: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          event_type?: string
          id?: never
          payload?: Json
          run_id?: string
          seq?: number | null
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "jaina_conversation_run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "jaina_conversation_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      jaina_conversation_runs: {
        Row: {
          ad_account_id: string | null
          ad_account_ids: string[] | null
          brand_id: string | null
          completed_at: string | null
          coordinator_heartbeat_at: string | null
          coordinator_lease_expires_at: string | null
          coordinator_lease_owner: string | null
          coordinator_lease_token: string | null
          created_at: string
          error_message: string | null
          goal_harness_run_id: string | null
          goal_id: string | null
          goal_request_id: string | null
          goal_work_node_id: string | null
          id: number
          idempotency_key: string | null
          initiator: string
          initiator_agent: string | null
          next_event_seq: number
          parent_run_id: string | null
          query: string | null
          request_snapshot: Json | null
          result_payload: Json | null
          result_type: string | null
          run_id: string
          runtime_checkpoint: Json
          runtime_stage: string
          runtime_version: string | null
          session_id: string
          started_at: string | null
          status: string
          updated_at: string
          user_email: string
        }
        Insert: {
          ad_account_id?: string | null
          ad_account_ids?: string[] | null
          brand_id?: string | null
          completed_at?: string | null
          coordinator_heartbeat_at?: string | null
          coordinator_lease_expires_at?: string | null
          coordinator_lease_owner?: string | null
          coordinator_lease_token?: string | null
          created_at?: string
          error_message?: string | null
          goal_harness_run_id?: string | null
          goal_id?: string | null
          goal_request_id?: string | null
          goal_work_node_id?: string | null
          id?: never
          idempotency_key?: string | null
          initiator?: string
          initiator_agent?: string | null
          next_event_seq?: number
          parent_run_id?: string | null
          query?: string | null
          request_snapshot?: Json | null
          result_payload?: Json | null
          result_type?: string | null
          run_id: string
          runtime_checkpoint?: Json
          runtime_stage?: string
          runtime_version?: string | null
          session_id: string
          started_at?: string | null
          status: string
          updated_at?: string
          user_email: string
        }
        Update: {
          ad_account_id?: string | null
          ad_account_ids?: string[] | null
          brand_id?: string | null
          completed_at?: string | null
          coordinator_heartbeat_at?: string | null
          coordinator_lease_expires_at?: string | null
          coordinator_lease_owner?: string | null
          coordinator_lease_token?: string | null
          created_at?: string
          error_message?: string | null
          goal_harness_run_id?: string | null
          goal_id?: string | null
          goal_request_id?: string | null
          goal_work_node_id?: string | null
          id?: never
          idempotency_key?: string | null
          initiator?: string
          initiator_agent?: string | null
          next_event_seq?: number
          parent_run_id?: string | null
          query?: string | null
          request_snapshot?: Json | null
          result_payload?: Json | null
          result_type?: string | null
          run_id?: string
          runtime_checkpoint?: Json
          runtime_stage?: string
          runtime_version?: string | null
          session_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_email?: string
        }
        Relationships: []
      }
      jaina_conversation_sessions: {
        Row: {
          ad_account_id: string | null
          ad_account_ids: string[] | null
          brand_id: string | null
          caller_run_id: string | null
          caller_session_id: string | null
          conversation_title: string | null
          created_at: string
          cross_call_id: string | null
          id: number
          initiator: string
          initiator_agent: string | null
          last_message_at: string | null
          last_message_preview: string | null
          last_message_role: string | null
          preview: string | null
          session_id: string
          tags: string[]
          updated_at: string
          user_email: string
        }
        Insert: {
          ad_account_id?: string | null
          ad_account_ids?: string[] | null
          brand_id?: string | null
          caller_run_id?: string | null
          caller_session_id?: string | null
          conversation_title?: string | null
          created_at?: string
          cross_call_id?: string | null
          id?: never
          initiator?: string
          initiator_agent?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_role?: string | null
          preview?: string | null
          session_id: string
          tags?: string[]
          updated_at?: string
          user_email: string
        }
        Update: {
          ad_account_id?: string | null
          ad_account_ids?: string[] | null
          brand_id?: string | null
          caller_run_id?: string | null
          caller_session_id?: string | null
          conversation_title?: string | null
          created_at?: string
          cross_call_id?: string | null
          id?: never
          initiator?: string
          initiator_agent?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_role?: string | null
          preview?: string | null
          session_id?: string
          tags?: string[]
          updated_at?: string
          user_email?: string
        }
        Relationships: []
      }
      jaina_execution_objective_attempts: {
        Row: {
          attempt_id: string
          attempt_number: number
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          heartbeat_at: string | null
          input_hash: string
          lease_token: string
          objective_id: string
          receipt: Json | null
          retryable: boolean
          run_id: string
          runtime_id: string | null
          started_at: string | null
          status: string
          usage: Json
        }
        Insert: {
          attempt_id?: string
          attempt_number: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          heartbeat_at?: string | null
          input_hash: string
          lease_token: string
          objective_id: string
          receipt?: Json | null
          retryable?: boolean
          run_id: string
          runtime_id?: string | null
          started_at?: string | null
          status?: string
          usage?: Json
        }
        Update: {
          attempt_id?: string
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          heartbeat_at?: string | null
          input_hash?: string
          lease_token?: string
          objective_id?: string
          receipt?: Json | null
          retryable?: boolean
          run_id?: string
          runtime_id?: string | null
          started_at?: string | null
          status?: string
          usage?: Json
        }
        Relationships: [
          {
            foreignKeyName: "jaina_execution_objective_attempts_run_id_objective_id_fkey"
            columns: ["run_id", "objective_id"]
            isOneToOne: false
            referencedRelation: "jaina_execution_objectives"
            referencedColumns: ["run_id", "objective_id"]
          },
        ]
      }
      jaina_execution_objective_dependencies: {
        Row: {
          created_at: string
          dependency_objective_id: string
          objective_id: string
          policy: string
          run_id: string
        }
        Insert: {
          created_at?: string
          dependency_objective_id: string
          objective_id: string
          policy?: string
          run_id: string
        }
        Update: {
          created_at?: string
          dependency_objective_id?: string
          objective_id?: string
          policy?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jaina_execution_objective_dep_run_id_dependency_objective__fkey"
            columns: ["run_id", "dependency_objective_id"]
            isOneToOne: false
            referencedRelation: "jaina_execution_objectives"
            referencedColumns: ["run_id", "objective_id"]
          },
          {
            foreignKeyName: "jaina_execution_objective_dependencies_run_id_objective_id_fkey"
            columns: ["run_id", "objective_id"]
            isOneToOne: false
            referencedRelation: "jaina_execution_objectives"
            referencedColumns: ["run_id", "objective_id"]
          },
        ]
      }
      jaina_execution_objectives: {
        Row: {
          attempt_count: number
          completed_at: string | null
          context_fingerprint: string
          created_at: string
          description: string | null
          details: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lease_token: string | null
          max_attempts: number
          not_before: string | null
          objective_id: string
          objective_key: string
          ordinal: number
          reason_code: string | null
          receipt: Json | null
          run_id: string
          scope: string | null
          status: string
          success_criteria: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          context_fingerprint: string
          created_at?: string
          description?: string | null
          details?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          lease_token?: string | null
          max_attempts?: number
          not_before?: string | null
          objective_id: string
          objective_key: string
          ordinal: number
          reason_code?: string | null
          receipt?: Json | null
          run_id: string
          scope?: string | null
          status?: string
          success_criteria?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          context_fingerprint?: string
          created_at?: string
          description?: string | null
          details?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          lease_token?: string | null
          max_attempts?: number
          not_before?: string | null
          objective_id?: string
          objective_key?: string
          ordinal?: number
          reason_code?: string | null
          receipt?: Json | null
          run_id?: string
          scope?: string | null
          status?: string
          success_criteria?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "jaina_execution_objectives_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "jaina_conversation_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      jaina_session_run_leases: {
        Row: {
          created_at: string
          lease_expires_at: string
          lease_holder: string
          lease_token: string
          run_id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          lease_expires_at: string
          lease_holder: string
          lease_token: string
          run_id: string
          session_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          lease_expires_at?: string
          lease_holder?: string
          lease_token?: string
          run_id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      jaina_tool_cache: {
        Row: {
          cache_key: string
          created_at: string
          id: string
          result: Json
          run_id: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          id?: string
          result?: Json
          run_id: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          id?: string
          result?: Json
          run_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_jaina_run_event: {
        Args: { p_event_type: string; p_payload: Json; p_run_id: string }
        Returns: {
          event_id: string
          seq: number
          ts: string
        }[]
      }
      claim_next_async_run: {
        Args: { p_lease_seconds?: number; p_worker: string }
        Returns: {
          ad_account_id: string | null
          ad_account_ids: string[] | null
          brand_id: string | null
          completed_at: string | null
          coordinator_heartbeat_at: string | null
          coordinator_lease_expires_at: string | null
          coordinator_lease_owner: string | null
          coordinator_lease_token: string | null
          created_at: string
          error_message: string | null
          goal_harness_run_id: string | null
          goal_id: string | null
          goal_request_id: string | null
          goal_work_node_id: string | null
          id: number
          idempotency_key: string | null
          initiator: string
          initiator_agent: string | null
          next_event_seq: number
          parent_run_id: string | null
          query: string | null
          request_snapshot: Json | null
          result_payload: Json | null
          result_type: string | null
          run_id: string
          runtime_checkpoint: Json
          runtime_stage: string
          runtime_version: string | null
          session_id: string
          started_at: string | null
          status: string
          updated_at: string
          user_email: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jaina_conversation_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_ready_objectives: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_run_id: string
          p_worker: string
        }
        Returns: {
          attempt_count: number
          attempt_id: string
          context_fingerprint: string
          description: string
          lease_token: string
          max_attempts: number
          objective_id: string
          objective_key: string
          ordinal: number
          run_id: string
          scope: string
          status: string
          success_criteria: string
          title: string
          version: number
        }[]
      }
      cleanup_jaina_tool_cache: { Args: never; Returns: number }
      finish_objective_attempt: {
        Args: {
          p_attempt_id: string
          p_error_code?: string
          p_error_message?: string
          p_lease_token: string
          p_receipt?: Json
          p_retry_at?: string
          p_retryable?: boolean
          p_status: string
        }
        Returns: {
          attempt_count: number
          completed_at: string | null
          context_fingerprint: string
          created_at: string
          description: string | null
          details: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          lease_token: string | null
          max_attempts: number
          not_before: string | null
          objective_id: string
          objective_key: string
          ordinal: number
          reason_code: string | null
          receipt: Json | null
          run_id: string
          scope: string | null
          status: string
          success_criteria: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "jaina_execution_objectives"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_jaina_tool_cache:
        | { Args: { p_cache_key: string; p_run_id: string }; Returns: Json }
        | {
            Args: {
              p_cache_key: string
              p_max_age_seconds?: number
              p_run_id: string
            }
            Returns: Json
          }
      heartbeat_async_run: {
        Args: {
          p_lease_seconds?: number
          p_lease_token: string
          p_run_id: string
        }
        Returns: boolean
      }
      heartbeat_objective_attempt: {
        Args: {
          p_attempt_id: string
          p_lease_seconds?: number
          p_lease_token: string
        }
        Returns: boolean
      }
      is_valid_objective_transition: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      persist_jaina_objective_graph: {
        Args: { p_objectives: Json; p_run_id: string }
        Returns: number
      }
      recover_expired_objective_leases: {
        Args: { p_run_id: string }
        Returns: number
      }
      release_session_run_lease: {
        Args: { p_lease_token: string; p_run_id: string; p_session_id: string }
        Returns: boolean
      }
      renew_session_run_lease: {
        Args: {
          p_lease_seconds?: number
          p_lease_token: string
          p_run_id: string
          p_session_id: string
        }
        Returns: boolean
      }
      set_jaina_tool_cache: {
        Args: { p_cache_key: string; p_result: Json; p_run_id: string }
        Returns: undefined
      }
      try_claim_session_run_lease: {
        Args: {
          p_lease_holder: string
          p_lease_seconds?: number
          p_run_id: string
          p_session_id: string
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
  media: {
    Tables: {
      ad_render_jobs: {
        Row: {
          binding_id: string
          brand_id: string
          contract_hash: string
          created_at: string
          created_by: string
          delivery_receipts: Json
          delivery_target: Json
          error: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          outputs: Json
          render_input: Json
          status: string
          task_uid: string | null
          template_key: string
          template_name: string
          updated_at: string
        }
        Insert: {
          binding_id: string
          brand_id: string
          contract_hash: string
          created_at?: string
          created_by: string
          delivery_receipts?: Json
          delivery_target?: Json
          error?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          outputs?: Json
          render_input?: Json
          status?: string
          task_uid?: string | null
          template_key: string
          template_name: string
          updated_at?: string
        }
        Update: {
          binding_id?: string
          brand_id?: string
          contract_hash?: string
          created_at?: string
          created_by?: string
          delivery_receipts?: Json
          delivery_target?: Json
          error?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          outputs?: Json
          render_input?: Json
          status?: string
          task_uid?: string | null
          template_key?: string
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_render_jobs_binding_brand_fk"
            columns: ["binding_id", "brand_id"]
            isOneToOne: false
            referencedRelation: "render_workspace_bindings"
            referencedColumns: ["id", "brand_id"]
          },
        ]
      }
      asset_campaigns: {
        Row: {
          asset_id: string
          brand_id: string
          campaign_id: string
          created_at: string
          version_id: string
        }
        Insert: {
          asset_id: string
          brand_id: string
          campaign_id: string
          created_at?: string
          version_id: string
        }
        Update: {
          asset_id?: string
          brand_id?: string
          campaign_id?: string
          created_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_campaigns_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_campaigns_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_deployments: {
        Row: {
          ad_id: string | null
          asset_id: string
          asset_version_id: string | null
          brand_id: string
          confidence: number
          created_by: string | null
          creative_row_id: string | null
          id: string
          link_method: string
          linked_at: string
          platform: string | null
          platform_post_id: string | null
          producer_id: string | null
          producer_kind: string | null
          surface: string
          version_number: number | null
        }
        Insert: {
          ad_id?: string | null
          asset_id: string
          asset_version_id?: string | null
          brand_id: string
          confidence?: number
          created_by?: string | null
          creative_row_id?: string | null
          id?: string
          link_method: string
          linked_at?: string
          platform?: string | null
          platform_post_id?: string | null
          producer_id?: string | null
          producer_kind?: string | null
          surface: string
          version_number?: number | null
        }
        Update: {
          ad_id?: string | null
          asset_id?: string
          asset_version_id?: string | null
          brand_id?: string
          confidence?: number
          created_by?: string | null
          creative_row_id?: string | null
          id?: string
          link_method?: string
          linked_at?: string
          platform?: string | null
          platform_post_id?: string | null
          producer_id?: string | null
          producer_kind?: string | null
          surface?: string
          version_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_deployments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_deployments_asset_version_id_fkey"
            columns: ["asset_version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_field_values: {
        Row: {
          asset_id: string
          brand_id: string
          field_id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          asset_id: string
          brand_id: string
          field_id: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          asset_id?: string
          brand_id?: string
          field_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "asset_field_values_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_group_members: {
        Row: {
          asset_id: string
          brand_id: string
          created_at: string
          group_id: string
          position: number
        }
        Insert: {
          asset_id: string
          brand_id: string
          created_at?: string
          group_id: string
          position: number
        }
        Update: {
          asset_id?: string
          brand_id?: string
          created_at?: string
          group_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "asset_group_members_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "asset_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_groups: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          external_key: string | null
          id: string
          kind: string
          origin_ref: Json
          title: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          external_key?: string | null
          id?: string
          kind: string
          origin_ref?: Json
          title?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          external_key?: string | null
          id?: string
          kind?: string
          origin_ref?: Json
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      asset_lineage: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          derived_asset_id: string
          derived_version_id: string
          id: string
          operation: string
          parameters: Json
          source_asset_id: string
          source_version_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          derived_asset_id: string
          derived_version_id: string
          id?: string
          operation: string
          parameters?: Json
          source_asset_id: string
          source_version_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          derived_asset_id?: string
          derived_version_id?: string
          id?: string
          operation?: string
          parameters?: Json
          source_asset_id?: string
          source_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_lineage_derived_asset_id_fkey"
            columns: ["derived_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_lineage_derived_version_id_fkey"
            columns: ["derived_version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_lineage_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_lineage_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_performance_index: {
        Row: {
          asset_id: string
          brand_id: string
          evidence: Json
          is_leading: boolean
          performance_window: string
          refreshed_at: string
          score: number | null
          version_id: string
        }
        Insert: {
          asset_id: string
          brand_id: string
          evidence?: Json
          is_leading?: boolean
          performance_window: string
          refreshed_at?: string
          score?: number | null
          version_id: string
        }
        Update: {
          asset_id?: string
          brand_id?: string
          evidence?: Json
          is_leading?: boolean
          performance_window?: string
          refreshed_at?: string
          score?: number | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_performance_index_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_performance_index_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_placements: {
        Row: {
          asset_id: string
          brand_id: string
          created_at: string
          created_by: string | null
          external_ref: string | null
          id: string
          placement: string
          surface: string | null
          version_id: string
        }
        Insert: {
          asset_id: string
          brand_id: string
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          id?: string
          placement: string
          surface?: string | null
          version_id: string
        }
        Update: {
          asset_id?: string
          brand_id?: string
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          id?: string
          placement?: string
          surface?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_placements_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_placements_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_renditions: {
        Row: {
          asset_id: string
          asset_version_id: string
          brand_id: string
          bucket: string | null
          created_at: string
          created_by: string | null
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          height: number | null
          id: string
          mime_type: string | null
          renderer: string | null
          renderer_version: string | null
          role: string
          size_bytes: number | null
          source_checksum: string | null
          state: string
          storage_path: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          asset_id: string
          asset_version_id: string
          brand_id: string
          bucket?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          renderer?: string | null
          renderer_version?: string | null
          role: string
          size_bytes?: number | null
          source_checksum?: string | null
          state?: string
          storage_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          asset_id?: string
          asset_version_id?: string
          brand_id?: string
          bucket?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          renderer?: string | null
          renderer_version?: string | null
          role?: string
          size_bytes?: number | null
          source_checksum?: string | null
          state?: string
          storage_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_renditions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_renditions_asset_version_id_fkey"
            columns: ["asset_version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_review_events: {
        Row: {
          actor: string | null
          asset_id: string
          brand_id: string
          created_at: string
          from_status: string
          id: string
          note: string | null
          to_status: string
        }
        Insert: {
          actor?: string | null
          asset_id: string
          brand_id: string
          created_at?: string
          from_status: string
          id?: string
          note?: string | null
          to_status: string
        }
        Update: {
          actor?: string | null
          asset_id?: string
          brand_id?: string
          created_at?: string
          from_status?: string
          id?: string
          note?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_review_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_usage_rights: {
        Row: {
          asset_id: string
          brand_id: string
          notes: string | null
          status: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          version_id: string
        }
        Insert: {
          asset_id: string
          brand_id: string
          notes?: string | null
          status: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          version_id: string
        }
        Update: {
          asset_id?: string
          brand_id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_usage_rights_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_usage_rights_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_version_insights: {
        Row: {
          asset_id: string
          brand_id: string
          created_at: string
          grounded_on: Json
          insight: string
          insight_key: string
          model: string | null
          source: string
          version_number: number | null
        }
        Insert: {
          asset_id: string
          brand_id: string
          created_at?: string
          grounded_on?: Json
          insight: string
          insight_key: string
          model?: string | null
          source?: string
          version_number?: number | null
        }
        Update: {
          asset_id?: string
          brand_id?: string
          created_at?: string
          grounded_on?: Json
          insight?: string
          insight_key?: string
          model?: string | null
          source?: string
          version_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_version_insights_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_versions: {
        Row: {
          analysis_metadata: Json
          asset_id: string
          base_version_id: string | null
          brand_id: string
          bucket: string
          checksum: string | null
          created_at: string
          created_by: string | null
          duration_ms: number | null
          file_name: string
          height: number | null
          id: string
          integrity_state: string
          mime_type: string
          note: string | null
          size_bytes: number | null
          storage_path: string
          version_number: number
          width: number | null
        }
        Insert: {
          analysis_metadata?: Json
          asset_id: string
          base_version_id?: string | null
          brand_id: string
          bucket: string
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          file_name: string
          height?: number | null
          id?: string
          integrity_state?: string
          mime_type: string
          note?: string | null
          size_bytes?: number | null
          storage_path: string
          version_number: number
          width?: number | null
        }
        Update: {
          analysis_metadata?: Json
          asset_id?: string
          base_version_id?: string | null
          brand_id?: string
          bucket?: string
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          file_name?: string
          height?: number | null
          id?: string
          integrity_state?: string
          mime_type?: string
          note?: string | null
          size_bytes?: number | null
          storage_path?: string
          version_number?: number
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_versions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_versions_base_version_id_fkey"
            columns: ["base_version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          ad_creative_analysis: Json | null
          brand_id: string
          bucket: string
          checksum: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          detected_objects: Json
          duration_ms: number | null
          embedding_image: string | null
          embedding_model: string | null
          embedding_text: string | null
          error_code: string | null
          error_message: string | null
          file_name: string
          has_image_embedding: boolean | null
          head_version_id: string | null
          height: number | null
          id: string
          integrity_state: string
          kind: string
          mime_type: string
          origin_ref: Json | null
          progress_step: string | null
          review_status: string
          review_status_updated_at: string | null
          size_bytes: number | null
          source: string
          status: string
          storage_path: string
          tags: string[]
          thumbnail_path: string | null
          title: string | null
          transcript: string | null
          transcript_segments: Json | null
          transcript_source: string | null
          updated_at: string
          video_insights: Json | null
          width: number | null
        }
        Insert: {
          ad_creative_analysis?: Json | null
          brand_id: string
          bucket?: string
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          detected_objects?: Json
          duration_ms?: number | null
          embedding_image?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          error_code?: string | null
          error_message?: string | null
          file_name: string
          has_image_embedding?: boolean | null
          head_version_id?: string | null
          height?: number | null
          id?: string
          integrity_state?: string
          kind: string
          mime_type: string
          origin_ref?: Json | null
          progress_step?: string | null
          review_status?: string
          review_status_updated_at?: string | null
          size_bytes?: number | null
          source?: string
          status?: string
          storage_path: string
          tags?: string[]
          thumbnail_path?: string | null
          title?: string | null
          transcript?: string | null
          transcript_segments?: Json | null
          transcript_source?: string | null
          updated_at?: string
          video_insights?: Json | null
          width?: number | null
        }
        Update: {
          ad_creative_analysis?: Json | null
          brand_id?: string
          bucket?: string
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          detected_objects?: Json
          duration_ms?: number | null
          embedding_image?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          error_code?: string | null
          error_message?: string | null
          file_name?: string
          has_image_embedding?: boolean | null
          head_version_id?: string | null
          height?: number | null
          id?: string
          integrity_state?: string
          kind?: string
          mime_type?: string
          origin_ref?: Json | null
          progress_step?: string | null
          review_status?: string
          review_status_updated_at?: string | null
          size_bytes?: number | null
          source?: string
          status?: string
          storage_path?: string
          tags?: string[]
          thumbnail_path?: string | null
          title?: string | null
          transcript?: string | null
          transcript_segments?: Json | null
          transcript_source?: string | null
          updated_at?: string
          video_insights?: Json | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_head_version_fk"
            columns: ["head_version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_render_jobs: {
        Row: {
          attempt_count: number
          brand_id: string
          claimed_by: string | null
          claimed_client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          execution_spec: Json
          id: string
          input_manifest: Json
          kind: string
          lease_expires_at: string | null
          lease_token: string | null
          phase: string | null
          progress: number
          result_asset_ids: string[]
          result_asset_refs: Json
          service_worker_id: string | null
          source_id: string
          source_revision: string
          state: string
          title: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          brand_id: string
          claimed_by?: string | null
          claimed_client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          execution_spec: Json
          id?: string
          input_manifest?: Json
          kind: string
          lease_expires_at?: string | null
          lease_token?: string | null
          phase?: string | null
          progress?: number
          result_asset_ids?: string[]
          result_asset_refs?: Json
          service_worker_id?: string | null
          source_id: string
          source_revision: string
          state?: string
          title: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          brand_id?: string
          claimed_by?: string | null
          claimed_client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          execution_spec?: Json
          id?: string
          input_manifest?: Json
          kind?: string
          lease_expires_at?: string | null
          lease_token?: string | null
          phase?: string | null
          progress?: number
          result_asset_ids?: string[]
          result_asset_refs?: Json
          service_worker_id?: string | null
          source_id?: string
          source_revision?: string
          state?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      collection_items: {
        Row: {
          added_at: string
          added_by: string | null
          asset_id: string
          collection_id: string
          position: number
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          asset_id: string
          collection_id: string
          position?: number
        }
        Update: {
          added_at?: string
          added_by?: string | null
          asset_id?: string
          collection_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          brand_id: string
          cover_asset_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          name: string
          smart_query: Json | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          cover_asset_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name: string
          smart_query?: Json | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          cover_asset_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
          smart_query?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_cover_asset_id_fkey"
            columns: ["cover_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          annotation: Json | null
          asset_id: string
          body: string
          brand_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          external_reviewer_session_id: string | null
          id: string
          mentions: Json
          parent_comment_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string
          version_id: string | null
          visibility: string
        }
        Insert: {
          annotation?: Json | null
          asset_id: string
          body: string
          brand_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          external_reviewer_session_id?: string | null
          id?: string
          mentions?: Json
          parent_comment_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
          version_id?: string | null
          visibility?: string
        }
        Update: {
          annotation?: Json | null
          asset_id?: string
          body?: string
          brand_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          external_reviewer_session_id?: string | null
          id?: string
          mentions?: Json
          parent_comment_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
          version_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_external_reviewer_session_id_fkey"
            columns: ["external_reviewer_session_id"]
            isOneToOne: false
            referencedRelation: "external_reviewer_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          options: Json
          position: number
          type: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          options?: Json
          position?: number
          type: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          options?: Json
          position?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      editor_generation_batches: {
        Row: {
          brand_id: string
          completed_at: string | null
          completed_count: number
          created_at: string
          failed_count: number
          id: string
          input_fingerprint: string
          kind: string
          project_id: string
          requested_by: string | null
          requested_count: number
          shot_id: string | null
          state: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          completed_at?: string | null
          completed_count?: number
          created_at?: string
          failed_count?: number
          id?: string
          input_fingerprint: string
          kind: string
          project_id: string
          requested_by?: string | null
          requested_count: number
          shot_id?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          completed_at?: string | null
          completed_count?: number
          created_at?: string
          failed_count?: number
          id?: string
          input_fingerprint?: string
          kind?: string
          project_id?: string
          requested_by?: string | null
          requested_count?: number
          shot_id?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "editor_generation_batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "editor_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      editor_generation_jobs: {
        Row: {
          attempt_count: number
          batch_id: string
          brand_id: string
          candidate_index: number
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          input_fingerprint: string
          kind: string
          lease_expires_at: string | null
          lease_token: string | null
          model: string
          project_id: string
          provider: string
          provider_operation_id: string | null
          request: Json
          result_asset_id: string | null
          result_payload: Json | null
          result_version_id: string | null
          retryable: boolean
          shot_id: string | null
          state: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          attempt_count?: number
          batch_id: string
          brand_id: string
          candidate_index: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          input_fingerprint: string
          kind: string
          lease_expires_at?: string | null
          lease_token?: string | null
          model: string
          project_id: string
          provider: string
          provider_operation_id?: string | null
          request: Json
          result_asset_id?: string | null
          result_payload?: Json | null
          result_version_id?: string | null
          retryable?: boolean
          shot_id?: string | null
          state?: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          attempt_count?: number
          batch_id?: string
          brand_id?: string
          candidate_index?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          input_fingerprint?: string
          kind?: string
          lease_expires_at?: string | null
          lease_token?: string | null
          model?: string
          project_id?: string
          provider?: string
          provider_operation_id?: string | null
          request?: Json
          result_asset_id?: string | null
          result_payload?: Json | null
          result_version_id?: string | null
          retryable?: boolean
          shot_id?: string | null
          state?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "editor_generation_jobs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "editor_generation_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editor_generation_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "editor_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editor_generation_jobs_result_asset_id_fkey"
            columns: ["result_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editor_generation_jobs_result_version_id_fkey"
            columns: ["result_version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      editor_project_bindings: {
        Row: {
          binding_type: string
          brand_id: string
          created_at: string
          external_id: string
          id: string
          project_id: string
        }
        Insert: {
          binding_type: string
          brand_id: string
          created_at?: string
          external_id: string
          id?: string
          project_id: string
        }
        Update: {
          binding_type?: string
          brand_id?: string
          created_at?: string
          external_id?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "editor_project_bindings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "editor_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      editor_project_revisions: {
        Row: {
          actor_id: string | null
          actor_type: string
          batch_id: string | null
          brand_id: string
          created_at: string
          document: Json
          fingerprint: string
          id: string
          idempotency_key: string | null
          project_id: string
          revision: number
          summary: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          batch_id?: string | null
          brand_id: string
          created_at?: string
          document: Json
          fingerprint: string
          id?: string
          idempotency_key?: string | null
          project_id: string
          revision: number
          summary: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          batch_id?: string | null
          brand_id?: string
          created_at?: string
          document?: Json
          fingerprint?: string
          id?: string
          idempotency_key?: string | null
          project_id?: string
          revision?: number
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "editor_project_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "editor_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      editor_projects: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          document: Json
          fingerprint: string
          id: string
          revision: number
          schema_version: number
          stage: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          document: Json
          fingerprint: string
          id?: string
          revision?: number
          schema_version?: number
          stage: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          document?: Json
          fingerprint?: string
          id?: string
          revision?: number
          schema_version?: number
          stage?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      external_review_decisions: {
        Row: {
          asset_id: string
          brand_id: string
          decided_at: string
          decision: string
          external_reviewer_session_id: string
          id: string
          note: string | null
          share_link_id: string
          version_id: string
        }
        Insert: {
          asset_id: string
          brand_id: string
          decided_at?: string
          decision: string
          external_reviewer_session_id: string
          id?: string
          note?: string | null
          share_link_id: string
          version_id: string
        }
        Update: {
          asset_id?: string
          brand_id?: string
          decided_at?: string
          decision?: string
          external_reviewer_session_id?: string
          id?: string
          note?: string | null
          share_link_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_review_decisions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_review_decisions_external_reviewer_session_id_fkey"
            columns: ["external_reviewer_session_id"]
            isOneToOne: false
            referencedRelation: "external_reviewer_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_review_decisions_share_link_id_fkey"
            columns: ["share_link_id"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_review_decisions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      external_reviewer_sessions: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          expires_at: string
          id: string
          revoked_at: string | null
          session_token_hash: string
          share_link_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          expires_at: string
          id?: string
          revoked_at?: string | null
          session_token_hash: string
          share_link_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          revoked_at?: string | null
          session_token_hash?: string
          share_link_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_reviewer_sessions_share_link_id_fkey"
            columns: ["share_link_id"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      figma_references: {
        Row: {
          asset_id: string
          brand_id: string
          figma_file_key: string
          figma_file_name: string | null
          figma_node_id: string
          figma_node_name: string | null
          id: string
          imported_at: string
          imported_by: string | null
          source_updated_at: string | null
          version_id: string
        }
        Insert: {
          asset_id: string
          brand_id: string
          figma_file_key: string
          figma_file_name?: string | null
          figma_node_id: string
          figma_node_name?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          source_updated_at?: string | null
          version_id: string
        }
        Update: {
          asset_id?: string
          brand_id?: string
          figma_file_key?: string
          figma_file_name?: string | null
          figma_node_id?: string
          figma_node_name?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          source_updated_at?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "figma_references_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "figma_references_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_forms: {
        Row: {
          allowed_extensions: string[]
          brand_id: string
          created_at: string
          created_by: string | null
          destination_collection_id: string | null
          id: string
          is_active: boolean
          name: string
          required_metadata: Json
          updated_at: string
        }
        Insert: {
          allowed_extensions?: string[]
          brand_id: string
          created_at?: string
          created_by?: string | null
          destination_collection_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          required_metadata?: Json
          updated_at?: string
        }
        Update: {
          allowed_extensions?: string[]
          brand_id?: string
          created_at?: string
          created_by?: string | null
          destination_collection_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          required_metadata?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_forms_destination_collection_id_fkey"
            columns: ["destination_collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_submissions: {
        Row: {
          asset_id: string | null
          brand_id: string
          created_at: string
          id: string
          intake_form_id: string
          metadata: Json
          submitter_email: string | null
          submitter_name: string | null
          validation_errors: Json
          validation_status: string
        }
        Insert: {
          asset_id?: string | null
          brand_id: string
          created_at?: string
          id?: string
          intake_form_id: string
          metadata?: Json
          submitter_email?: string | null
          submitter_name?: string | null
          validation_errors?: Json
          validation_status?: string
        }
        Update: {
          asset_id?: string | null
          brand_id?: string
          created_at?: string
          id?: string
          intake_form_id?: string
          metadata?: Json
          submitter_email?: string | null
          submitter_name?: string | null
          validation_errors?: Json
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_submissions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_submissions_intake_form_id_fkey"
            columns: ["intake_form_id"]
            isOneToOne: false
            referencedRelation: "intake_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      preview_jobs: {
        Row: {
          adapter: string
          asset_id: string
          asset_version_id: string
          attempts: number
          available_at: string
          brand_id: string
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          lease_expires_at: string | null
          leased_by: string | null
          max_attempts: number
          state: string
          updated_at: string
        }
        Insert: {
          adapter: string
          asset_id: string
          asset_version_id: string
          attempts?: number
          available_at?: string
          brand_id: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          lease_expires_at?: string | null
          leased_by?: string | null
          max_attempts?: number
          state?: string
          updated_at?: string
        }
        Update: {
          adapter?: string
          asset_id?: string
          asset_version_id?: string
          attempts?: number
          available_at?: string
          brand_id?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          lease_expires_at?: string | null
          leased_by?: string | null
          max_attempts?: number
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "preview_jobs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preview_jobs_asset_version_id_fkey"
            columns: ["asset_version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      render_input_sets: {
        Row: {
          brand_id: string
          contract_hash: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          template_key: string
          updated_at: string
          variables: Json
        }
        Insert: {
          brand_id: string
          contract_hash: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          template_key: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          brand_id?: string
          contract_hash?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          template_key?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      render_template_memberships: {
        Row: {
          binding_id: string
          brand_id: string
          created_at: string
          enabled: boolean
          id: string
          template_key: string
          updated_at: string
        }
        Insert: {
          binding_id: string
          brand_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          template_key: string
          updated_at?: string
        }
        Update: {
          binding_id?: string
          brand_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_template_membership_binding_brand_fk"
            columns: ["binding_id", "brand_id"]
            isOneToOne: false
            referencedRelation: "render_workspace_bindings"
            referencedColumns: ["id", "brand_id"]
          },
        ]
      }
      render_workspace_bindings: {
        Row: {
          brand_id: string
          client_key: string
          created_at: string
          created_by: string | null
          enabled: boolean
          environment_key: string
          id: string
          is_default: boolean
          picinst: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_key: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          environment_key: string
          id?: string
          is_default?: boolean
          picinst: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_key?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          environment_key?: string
          id?: string
          is_default?: boolean
          picinst?: string
          updated_at?: string
        }
        Relationships: []
      }
      review_assignments: {
        Row: {
          brand_id: string
          created_at: string
          decided_at: string | null
          decision: string | null
          id: string
          note: string | null
          review_request_id: string
          reviewer_user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          decided_at?: string | null
          decision?: string | null
          id?: string
          note?: string | null
          review_request_id: string
          reviewer_user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          decided_at?: string | null
          decision?: string | null
          id?: string
          note?: string | null
          review_request_id?: string
          reviewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_assignments_review_request_id_fkey"
            columns: ["review_request_id"]
            isOneToOne: false
            referencedRelation: "review_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      review_requests: {
        Row: {
          asset_id: string
          brand_id: string
          completed_at: string | null
          created_at: string
          due_at: string | null
          id: string
          note: string | null
          requested_by: string | null
          status: string
          updated_at: string
          version_id: string
        }
        Insert: {
          asset_id: string
          brand_id: string
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          note?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
          version_id: string
        }
        Update: {
          asset_id?: string
          brand_id?: string
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          note?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_requests_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_requests_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_views: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          is_shared: boolean
          layout: string
          name: string
          query: Json
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_shared?: boolean
          layout?: string
          name: string
          query: Json
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_shared?: boolean
          layout?: string
          name?: string
          query?: Json
          updated_at?: string
        }
        Relationships: []
      }
      share_link_assets: {
        Row: {
          asset_id: string
          position: number
          share_link_id: string
          version_id: string | null
        }
        Insert: {
          asset_id: string
          position?: number
          share_link_id: string
          version_id?: string | null
        }
        Update: {
          asset_id?: string
          position?: number
          share_link_id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_link_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_link_assets_share_link_id_fkey"
            columns: ["share_link_id"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_link_assets_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          allow_approval: boolean
          allow_comments: boolean
          allow_download: boolean
          asset_id: string | null
          brand_id: string
          collection_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          membership_snapshotted_at: string | null
          passcode_hash: string | null
          permissions: string
          pinned_version_id: string | null
          require_identity: boolean
          revoked_at: string | null
          scope: string
          show_custom_fields: boolean
          show_metadata: boolean
          token: string
          version_mode: string
        }
        Insert: {
          allow_approval?: boolean
          allow_comments?: boolean
          allow_download?: boolean
          asset_id?: string | null
          brand_id: string
          collection_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          membership_snapshotted_at?: string | null
          passcode_hash?: string | null
          permissions?: string
          pinned_version_id?: string | null
          require_identity?: boolean
          revoked_at?: string | null
          scope: string
          show_custom_fields?: boolean
          show_metadata?: boolean
          token: string
          version_mode?: string
        }
        Update: {
          allow_approval?: boolean
          allow_comments?: boolean
          allow_download?: boolean
          asset_id?: string | null
          brand_id?: string
          collection_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          membership_snapshotted_at?: string | null
          passcode_hash?: string | null
          permissions?: string
          pinned_version_id?: string | null
          require_identity?: boolean
          revoked_at?: string | null
          scope?: string
          show_custom_fields?: boolean
          show_metadata?: boolean
          token?: string
          version_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_pinned_version_id_fkey"
            columns: ["pinned_version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_aliases: {
        Row: {
          alias: string
          brand_id: string
          canonical_tag: string
          created_at: string
          created_by: string | null
        }
        Insert: {
          alias: string
          brand_id: string
          canonical_tag: string
          created_at?: string
          created_by?: string | null
        }
        Update: {
          alias?: string
          brand_id?: string
          canonical_tag?: string
          created_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
      timeline_drafts: {
        Row: {
          asset_id: string
          brand_id: string
          created_at: string
          created_by: string
          document: Json
          id: string
          last_rendered_at: string | null
          rendered_asset_id: string | null
          schema_version: number
          status: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          brand_id: string
          created_at?: string
          created_by: string
          document: Json
          id?: string
          last_rendered_at?: string | null
          rendered_asset_id?: string | null
          schema_version?: number
          status?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          brand_id?: string
          created_at?: string
          created_by?: string
          document?: Json
          id?: string
          last_rendered_at?: string | null
          rendered_asset_id?: string | null
          schema_version?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_drafts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_drafts_rendered_asset_id_fkey"
            columns: ["rendered_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      video_chapters: {
        Row: {
          asset_id: string
          brand_id: string
          created_at: string
          embedding_text: string | null
          end_ms: number
          id: string
          start_ms: number
          summary: string | null
          title: string
          version_id: string
        }
        Insert: {
          asset_id: string
          brand_id: string
          created_at?: string
          embedding_text?: string | null
          end_ms: number
          id?: string
          start_ms: number
          summary?: string | null
          title: string
          version_id: string
        }
        Update: {
          asset_id?: string
          brand_id?: string
          created_at?: string
          embedding_text?: string | null
          end_ms?: number
          id?: string
          start_ms?: number
          summary?: string | null
          title?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_chapters_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_chapters_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _assert_brand: { Args: { p_brand_id: string }; Returns: undefined }
      _window_metrics: { Args: { w: Json }; Returns: Json }
      asset_in_brand: {
        Args: { p_asset_id: string; p_brand_id: string }
        Returns: boolean
      }
      can_operate_brand: {
        Args: { p_brand_id: string; p_user_id: string }
        Returns: boolean
      }
      claim_client_render_job: {
        Args: {
          p_brand_id: string
          p_client_id: string
          p_job_id: string
          p_user_id: string
        }
        Returns: {
          attempt_count: number
          brand_id: string
          claimed_by: string | null
          claimed_client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          execution_spec: Json
          id: string
          input_manifest: Json
          kind: string
          lease_expires_at: string | null
          lease_token: string | null
          phase: string | null
          progress: number
          result_asset_ids: string[]
          result_asset_refs: Json
          service_worker_id: string | null
          source_id: string
          source_revision: string
          state: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "client_render_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_editor_generation_job: {
        Args: { p_max_active?: number; p_provider: string; p_worker_id: string }
        Returns: {
          attempt_count: number
          batch_id: string
          brand_id: string
          candidate_index: number
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          input_fingerprint: string
          kind: string
          lease_expires_at: string | null
          lease_token: string | null
          model: string
          project_id: string
          provider: string
          provider_operation_id: string | null
          request: Json
          result_asset_id: string | null
          result_payload: Json | null
          result_version_id: string | null
          retryable: boolean
          shot_id: string | null
          state: string
          updated_at: string
          worker_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "editor_generation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_service_url_ingest_job: {
        Args: {
          p_job_id?: string
          p_lease_seconds?: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          brand_id: string
          claimed_by: string | null
          claimed_client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          execution_spec: Json
          id: string
          input_manifest: Json
          kind: string
          lease_expires_at: string | null
          lease_token: string | null
          phase: string | null
          progress: number
          result_asset_ids: string[]
          result_asset_refs: Json
          service_worker_id: string | null
          source_id: string
          source_revision: string
          state: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "client_render_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      commit_editor_project_revision: {
        Args: {
          p_actor_id: string
          p_actor_type: string
          p_batch_id: string
          p_document: Json
          p_expected_fingerprint: string
          p_expected_revision: number
          p_idempotency_key: string
          p_new_fingerprint: string
          p_project_id: string
          p_stage: string
          p_summary: string
          p_title: string
        }
        Returns: {
          brand_id: string
          created_at: string
          created_by: string | null
          document: Json
          fingerprint: string
          id: string
          revision: number
          schema_version: number
          stage: string
          title: string
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "editor_projects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_client_render_job: {
        Args: {
          p_job_id: string
          p_lease_token: string
          p_result_asset_ids: string[]
          p_user_id: string
        }
        Returns: {
          attempt_count: number
          brand_id: string
          claimed_by: string | null
          claimed_client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          execution_spec: Json
          id: string
          input_manifest: Json
          kind: string
          lease_expires_at: string | null
          lease_token: string | null
          phase: string | null
          progress: number
          result_asset_ids: string[]
          result_asset_refs: Json
          service_worker_id: string | null
          source_id: string
          source_revision: string
          state: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "client_render_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_service_url_ingest_job: {
        Args: {
          p_job_id: string
          p_lease_token: string
          p_result_asset_ids: string[]
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          brand_id: string
          claimed_by: string | null
          claimed_client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          execution_spec: Json
          id: string
          input_manifest: Json
          kind: string
          lease_expires_at: string | null
          lease_token: string | null
          phase: string | null
          progress: number
          result_asset_ids: string[]
          result_asset_refs: Json
          service_worker_id: string | null
          source_id: string
          source_revision: string
          state: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "client_render_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_editor_project: {
        Args: {
          p_actor_id: string
          p_binding_type?: string
          p_brand_id: string
          p_document: Json
          p_external_id?: string
          p_fingerprint: string
          p_project_id: string
          p_stage: string
          p_title: string
        }
        Returns: {
          brand_id: string
          created_at: string
          created_by: string | null
          document: Json
          fingerprint: string
          id: string
          revision: number
          schema_version: number
          stage: string
          title: string
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "editor_projects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      enqueue_editor_generation_batch: {
        Args: {
          p_input_fingerprint: string
          p_kind: string
          p_project_id: string
          p_requested_by: string
          p_requests: Json
          p_shot_id: string
        }
        Returns: {
          brand_id: string
          completed_at: string | null
          completed_count: number
          created_at: string
          failed_count: number
          id: string
          input_fingerprint: string
          kind: string
          project_id: string
          requested_by: string | null
          requested_count: number
          shot_id: string | null
          state: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "editor_generation_batches"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fail_service_url_ingest_job: {
        Args: {
          p_error_code: string
          p_error_message: string
          p_job_id: string
          p_lease_token: string
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          brand_id: string
          claimed_by: string | null
          claimed_client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          execution_spec: Json
          id: string
          input_manifest: Json
          kind: string
          lease_expires_at: string | null
          lease_token: string | null
          phase: string | null
          progress: number
          result_asset_ids: string[]
          result_asset_refs: Json
          service_worker_id: string | null
          source_id: string
          source_revision: string
          state: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "client_render_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      head_version_number: { Args: { p_asset_id: string }; Returns: number }
      heartbeat_service_url_ingest_job: {
        Args: {
          p_job_id: string
          p_lease_seconds?: number
          p_lease_token: string
          p_phase: string
          p_progress: number
          p_state: string
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          brand_id: string
          claimed_by: string | null
          claimed_client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          execution_spec: Json
          id: string
          input_manifest: Json
          kind: string
          lease_expires_at: string | null
          lease_token: string | null
          phase: string | null
          progress: number
          result_asset_ids: string[]
          result_asset_refs: Json
          service_worker_id: string | null
          source_id: string
          source_revision: string
          state: string
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "client_render_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      library_browse_facets: {
        Args: {
          p_brand_id: string
          p_campaign_ids?: string[]
          p_collection_id?: string
          p_leading_only?: boolean
          p_media_type?: string
          p_owner_ids?: string[]
          p_performance_window?: string
          p_placements?: string[]
          p_review_statuses?: string[]
          p_search?: string
          p_shared?: boolean
          p_sources?: string[]
          p_tags?: string[]
          p_usage_rights?: string[]
          p_used?: boolean
        }
        Returns: {
          facet: string
          result_count: number
          value: string
        }[]
      }
      library_browse_page: {
        Args: {
          p_brand_id: string
          p_campaign_ids?: string[]
          p_collection_id?: string
          p_cursor?: Json
          p_leading_only?: boolean
          p_limit?: number
          p_media_type?: string
          p_owner_ids?: string[]
          p_performance_window?: string
          p_placements?: string[]
          p_review_statuses?: string[]
          p_search?: string
          p_shared?: boolean
          p_sort?: string
          p_sources?: string[]
          p_tags?: string[]
          p_usage_rights?: string[]
          p_used?: boolean
        }
        Returns: {
          asset_id: string
          performance_score: number
          sort_number: number
          sort_text: string
          sort_time: string
          usage_count: number
        }[]
      }
      library_create_goal_artifact: { Args: { p_payload: Json }; Returns: Json }
      library_create_goal_markdown_artifact: {
        Args: { p_payload: Json }
        Returns: Json
      }
      library_execute_operation: {
        Args: { p_action: string; p_payload: Json }
        Returns: Json
      }
      library_live_version_performance: {
        Args: { p_brand_id: string; p_performance_window?: string }
        Returns: {
          asset_id: string
          score: number
          version_id: string
        }[]
      }
      library_register_goal_artifact_version: {
        Args: { p_payload: Json }
        Returns: Json
      }
      library_register_goal_markdown_version: {
        Args: { p_payload: Json }
        Returns: Json
      }
      match_assets_by_text: {
        Args: {
          filter_asset_ids?: string[]
          filter_brand_id: string
          filter_collection_id?: string
          filter_exclude_asset_ids?: string[]
          filter_exclude_tags?: string[]
          filter_kind?: string
          filter_review_status?: string
          filter_source?: string
          filter_tags?: string[]
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          description: string
          id: string
          similarity: number
          tags: string[]
          title: string
        }[]
      }
      match_similar_assets: {
        Args: {
          exclude_asset_id?: string
          filter_asset_ids?: string[]
          filter_brand_id: string
          filter_collection_id?: string
          filter_exclude_asset_ids?: string[]
          filter_exclude_tags?: string[]
          filter_kind?: string
          filter_review_status?: string
          filter_source?: string
          filter_tags?: string[]
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          description: string
          id: string
          similarity: number
          tags: string[]
          title: string
        }[]
      }
      reap_expired_service_url_ingest_jobs: { Args: never; Returns: number }
      search_assets_ranked: {
        Args: {
          filter_asset_ids?: string[]
          filter_brand_id: string
          filter_collection_id?: string
          filter_exclude_asset_ids?: string[]
          filter_exclude_tags?: string[]
          filter_kind?: string
          filter_review_status?: string
          filter_source?: string
          filter_tags?: string[]
          match_count: number
          q: string
        }
        Returns: {
          description: string
          id: string
          similarity: number
          tags: string[]
          title: string
        }[]
      }
      storage_object_brand_id: { Args: { p_name: string }; Returns: string }
      transition_asset_review_guarded: {
        Args: {
          p_actor: string
          p_asset_id: string
          p_brand_id: string
          p_expected_current_status: string
          p_idempotency_key: string
          p_note: string
          p_to_status: string
        }
        Returns: Json
      }
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
          initiator: string
          initiator_agent: string | null
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
          initiator?: string
          initiator_agent?: string | null
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
          initiator?: string
          initiator_agent?: string | null
          request_payload?: Json
          run_id?: string
          session_id?: string
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      organic_agent_turn_metrics: {
        Row: {
          aborted: boolean
          brand_id: string
          created_at: string
          duration_ms: number | null
          finish_reason: string | null
          id: string
          input_tokens: number | null
          lane: string | null
          outcome: string
          output_tokens: number | null
          reasoning_tokens: number | null
          run_id: string | null
          session_id: string
          steps: number
          tool_calls: number
          tool_errors: number
          total_tokens: number | null
          ttft_ms: number | null
          user_id: string
        }
        Insert: {
          aborted?: boolean
          brand_id: string
          created_at?: string
          duration_ms?: number | null
          finish_reason?: string | null
          id?: string
          input_tokens?: number | null
          lane?: string | null
          outcome: string
          output_tokens?: number | null
          reasoning_tokens?: number | null
          run_id?: string | null
          session_id: string
          steps?: number
          tool_calls?: number
          tool_errors?: number
          total_tokens?: number | null
          ttft_ms?: number | null
          user_id: string
        }
        Update: {
          aborted?: boolean
          brand_id?: string
          created_at?: string
          duration_ms?: number | null
          finish_reason?: string | null
          id?: string
          input_tokens?: number | null
          lane?: string | null
          outcome?: string
          output_tokens?: number | null
          reasoning_tokens?: number | null
          run_id?: string | null
          session_id?: string
          steps?: number
          tool_calls?: number
          tool_errors?: number
          total_tokens?: number | null
          ttft_ms?: number | null
          user_id?: string
        }
        Relationships: []
      }
      organic_calendar_drafts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          brand_id: string
          client_key: string | null
          content_json: Json | null
          content_plan_id: string | null
          created_at: string
          id: string
          instagram_post_id: string | null
          media_stage: string
          platform: string | null
          platform_account_id: string
          platform_post_id: string | null
          position: Json | null
          published_at: string | null
          run_id: string | null
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
          client_key?: string | null
          content_json?: Json | null
          content_plan_id?: string | null
          created_at?: string
          id?: string
          instagram_post_id?: string | null
          media_stage?: string
          platform?: string | null
          platform_account_id: string
          platform_post_id?: string | null
          position?: Json | null
          published_at?: string | null
          run_id?: string | null
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
          client_key?: string | null
          content_json?: Json | null
          content_plan_id?: string | null
          created_at?: string
          id?: string
          instagram_post_id?: string | null
          media_stage?: string
          platform?: string | null
          platform_account_id?: string
          platform_post_id?: string | null
          position?: Json | null
          published_at?: string | null
          run_id?: string | null
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
          caller_run_id: string | null
          caller_session_id: string | null
          chat_channel_id: string | null
          chat_platform: string | null
          chat_platform_user_id: string | null
          chat_workspace_id: string | null
          created_at: string
          cross_call_id: string | null
          id: number
          initiator: string
          initiator_agent: string | null
          last_message_at: string | null
          last_message_preview: string | null
          last_message_role: string | null
          preview: string | null
          session_id: string
          tags: string[]
          timezone: string
          title: string | null
          updated_at: string
          user_email: string | null
          user_id: string
          week_start: string | null
        }
        Insert: {
          brand_id: string
          caller_run_id?: string | null
          caller_session_id?: string | null
          chat_channel_id?: string | null
          chat_platform?: string | null
          chat_platform_user_id?: string | null
          chat_workspace_id?: string | null
          created_at?: string
          cross_call_id?: string | null
          id?: never
          initiator?: string
          initiator_agent?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_role?: string | null
          preview?: string | null
          session_id: string
          tags?: string[]
          timezone?: string
          title?: string | null
          updated_at?: string
          user_email?: string | null
          user_id: string
          week_start?: string | null
        }
        Update: {
          brand_id?: string
          caller_run_id?: string | null
          caller_session_id?: string | null
          chat_channel_id?: string | null
          chat_platform?: string | null
          chat_platform_user_id?: string | null
          chat_workspace_id?: string | null
          created_at?: string
          cross_call_id?: string | null
          id?: never
          initiator?: string
          initiator_agent?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_role?: string | null
          preview?: string | null
          session_id?: string
          tags?: string[]
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
          ig_user_id: string | null
          instagram_post_id: string | null
          media_urls: Json | null
          platform: string
          platform_account_id: string
          platform_post_id: string | null
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
          ig_user_id?: string | null
          instagram_post_id?: string | null
          media_urls?: Json | null
          platform?: string
          platform_account_id: string
          platform_post_id?: string | null
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
          ig_user_id?: string | null
          instagram_post_id?: string | null
          media_urls?: Json | null
          platform?: string
          platform_account_id?: string
          platform_post_id?: string | null
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
            columns: ["platform_post_id"]
            isOneToOne: false
            referencedRelation: "organic_published_posts"
            referencedColumns: ["platform_post_id"]
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
          ig_user_id: string | null
          insights_last_synced_at: string | null
          instagram_post_id: string | null
          media_urls: Json | null
          permalink: string | null
          platform: string
          platform_account_id: string
          platform_post_id: string
          post_type: string
          published_at: string
        }
        Insert: {
          brand_id: string
          caption?: string | null
          content_snapshot?: Json | null
          created_at?: string
          draft_id?: string | null
          ig_user_id?: string | null
          insights_last_synced_at?: string | null
          instagram_post_id?: string | null
          media_urls?: Json | null
          permalink?: string | null
          platform?: string
          platform_account_id: string
          platform_post_id: string
          post_type: string
          published_at: string
        }
        Update: {
          brand_id?: string
          caption?: string | null
          content_snapshot?: Json | null
          created_at?: string
          draft_id?: string | null
          ig_user_id?: string | null
          insights_last_synced_at?: string | null
          instagram_post_id?: string | null
          media_urls?: Json | null
          permalink?: string | null
          platform?: string
          platform_account_id?: string
          platform_post_id?: string
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
      planner_canvas_compositions: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          draft_id: string
          error: string | null
          id: string
          is_current: boolean
          publish_node_id: string
          result_asset_id: string | null
          revision: number
          room_id: string
          source_fingerprint: string
          status: string
          timeline_node_id: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          draft_id: string
          error?: string | null
          id?: string
          is_current?: boolean
          publish_node_id: string
          result_asset_id?: string | null
          revision: number
          room_id: string
          source_fingerprint: string
          status?: string
          timeline_node_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          draft_id?: string
          error?: string | null
          id?: string
          is_current?: boolean
          publish_node_id?: string
          result_asset_id?: string | null
          revision?: number
          room_id?: string
          source_fingerprint?: string
          status?: string
          timeline_node_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planner_canvas_compositions_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "organic_calendar_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_generation_jobs: {
        Row: {
          account_id: string | null
          attempts: number
          brand_id: string
          cancel_requested: boolean
          claimed_at: string | null
          client_key: string | null
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
          min_worker_generation: number
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
          client_key?: string | null
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
          min_worker_generation?: number
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
          client_key?: string | null
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
          min_worker_generation?: number
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
        Relationships: [
          {
            foreignKeyName: "post_generation_jobs_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "organic_calendar_drafts"
            referencedColumns: ["id"]
          },
        ]
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
          client_key: string | null
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
          min_worker_generation: number
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
        Args: {
          p_lease_ttl_sec: number
          p_worker_generation?: number
          p_worker_id: string
        }
        Returns: {
          account_id: string | null
          attempts: number
          brand_id: string
          cancel_requested: boolean
          claimed_at: string | null
          client_key: string | null
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
          min_worker_generation: number
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
          p_client_key?: string
          p_creative_brief?: Json
          p_guidance_prompt: string
          p_job_type?: string
          p_min_worker_generation?: number
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
          client_key: string | null
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
          min_worker_generation: number
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
              client_key: string | null
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
              min_worker_generation: number
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
              client_key: string | null
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
              min_worker_generation: number
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
      start_inline_post_generation_job: {
        Args: {
          p_account_id: string
          p_brand_id: string
          p_job_type: string
          p_payload: Json
          p_platform: string
          p_scheduled_at: string
          p_session_id: string
          p_user_id: string
          p_worker_id: string
        }
        Returns: string
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
      ad_breakdown_daily: {
        Row: {
          action_values: Json
          actions: Json
          ad_account_id: string
          ad_id: string
          adset_id: string | null
          as_of: string
          attribution_setting: string | null
          brand_id: string
          breakdown_kind: string
          breakdown_value: string
          clicks: number
          date: string
          impressions: number
          link_clicks: number
          observed_at: string
          spend: number
          video_3s: number | null
          video_p25: number | null
          video_p50: number | null
          video_p75: number | null
          video_thruplays: number | null
        }
        Insert: {
          action_values?: Json
          actions?: Json
          ad_account_id: string
          ad_id: string
          adset_id?: string | null
          as_of: string
          attribution_setting?: string | null
          brand_id: string
          breakdown_kind: string
          breakdown_value: string
          clicks?: number
          date: string
          impressions?: number
          link_clicks?: number
          observed_at?: string
          spend?: number
          video_3s?: number | null
          video_p25?: number | null
          video_p50?: number | null
          video_p75?: number | null
          video_thruplays?: number | null
        }
        Update: {
          action_values?: Json
          actions?: Json
          ad_account_id?: string
          ad_id?: string
          adset_id?: string | null
          as_of?: string
          attribution_setting?: string | null
          brand_id?: string
          breakdown_kind?: string
          breakdown_value?: string
          clicks?: number
          date?: string
          impressions?: number
          link_clicks?: number
          observed_at?: string
          spend?: number
          video_3s?: number | null
          video_p25?: number | null
          video_p50?: number | null
          video_p75?: number | null
          video_thruplays?: number | null
        }
        Relationships: []
      }
      ad_creatives: {
        Row: {
          ad_account_id: string
          analysis_model: string | null
          analyzed_at: string | null
          angle_id: string | null
          angle_label: string | null
          angle_scope: string | null
          angle_vocab_version: number
          body: string | null
          brand_id: string
          concept_id: string | null
          content_hash: string
          created_at: string
          creative_id: string
          cta_type: string | null
          embedding_image: string | null
          format: string | null
          id: string
          image_url: string | null
          label_source: string | null
          labels: Json | null
          match_status: string
          matched_at: string | null
          media_bytes_hash: string | null
          opening_frame_type: string | null
          permalink_url: string | null
          poster_url: string | null
          proof_type: string | null
          status: string
          taxonomy_version: number
          thumbnail_url: string | null
          title: string | null
          transcript: string | null
          value_prop_type: string | null
          video_id: string | null
        }
        Insert: {
          ad_account_id: string
          analysis_model?: string | null
          analyzed_at?: string | null
          angle_id?: string | null
          angle_label?: string | null
          angle_scope?: string | null
          angle_vocab_version?: number
          body?: string | null
          brand_id: string
          concept_id?: string | null
          content_hash: string
          created_at?: string
          creative_id: string
          cta_type?: string | null
          embedding_image?: string | null
          format?: string | null
          id?: string
          image_url?: string | null
          label_source?: string | null
          labels?: Json | null
          match_status?: string
          matched_at?: string | null
          media_bytes_hash?: string | null
          opening_frame_type?: string | null
          permalink_url?: string | null
          poster_url?: string | null
          proof_type?: string | null
          status?: string
          taxonomy_version?: number
          thumbnail_url?: string | null
          title?: string | null
          transcript?: string | null
          value_prop_type?: string | null
          video_id?: string | null
        }
        Update: {
          ad_account_id?: string
          analysis_model?: string | null
          analyzed_at?: string | null
          angle_id?: string | null
          angle_label?: string | null
          angle_scope?: string | null
          angle_vocab_version?: number
          body?: string | null
          brand_id?: string
          concept_id?: string | null
          content_hash?: string
          created_at?: string
          creative_id?: string
          cta_type?: string | null
          embedding_image?: string | null
          format?: string | null
          id?: string
          image_url?: string | null
          label_source?: string | null
          labels?: Json | null
          match_status?: string
          matched_at?: string | null
          media_bytes_hash?: string | null
          opening_frame_type?: string | null
          permalink_url?: string | null
          poster_url?: string | null
          proof_type?: string | null
          status?: string
          taxonomy_version?: number
          thumbnail_url?: string | null
          title?: string | null
          transcript?: string | null
          value_prop_type?: string | null
          video_id?: string | null
        }
        Relationships: []
      }
      ads: {
        Row: {
          ad_account_id: string
          ad_id: string
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          brand_id: string
          campaign_id: string | null
          campaign_name: string | null
          creative_row_id: string | null
          destination_type: string | null
          first_seen_at: string
          funnel_stage_conflict: boolean
          funnel_stage_declared: string | null
          funnel_stage_effective: string | null
          last_synced_at: string | null
          objective: string | null
          optimization_goal: string | null
          status: string | null
          verdict: string | null
          verdict_at: string | null
          verdict_flags: string[] | null
          verdict_reason: string | null
          windows: Json
        }
        Insert: {
          ad_account_id: string
          ad_id: string
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          brand_id: string
          campaign_id?: string | null
          campaign_name?: string | null
          creative_row_id?: string | null
          destination_type?: string | null
          first_seen_at?: string
          funnel_stage_conflict?: boolean
          funnel_stage_declared?: string | null
          funnel_stage_effective?: string | null
          last_synced_at?: string | null
          objective?: string | null
          optimization_goal?: string | null
          status?: string | null
          verdict?: string | null
          verdict_at?: string | null
          verdict_flags?: string[] | null
          verdict_reason?: string | null
          windows?: Json
        }
        Update: {
          ad_account_id?: string
          ad_id?: string
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          brand_id?: string
          campaign_id?: string | null
          campaign_name?: string | null
          creative_row_id?: string | null
          destination_type?: string | null
          first_seen_at?: string
          funnel_stage_conflict?: boolean
          funnel_stage_declared?: string | null
          funnel_stage_effective?: string | null
          last_synced_at?: string | null
          objective?: string | null
          optimization_goal?: string | null
          status?: string | null
          verdict?: string | null
          verdict_at?: string | null
          verdict_flags?: string[] | null
          verdict_reason?: string | null
          windows?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ads_creative_row_id_fkey"
            columns: ["creative_row_id"]
            isOneToOne: false
            referencedRelation: "ad_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      adset_targeting_snapshots: {
        Row: {
          ad_account_id: string
          adset_id: string
          age_max: number | null
          age_min: number | null
          audience_cell_node_id: string
          audience_group_version_id: string | null
          bid_strategy: string | null
          billing_event: string | null
          brand_id: string
          content_hash: string
          created_at: string
          custom_audience_ids: string[]
          device_platforms: string[] | null
          excluded_custom_audience_ids: string[]
          genders: number[] | null
          geo_node_ids: string[]
          id: string
          observed_at: string
          optimization_goal: string | null
          placements: string[] | null
          publisher_platforms: string[] | null
          referenced_node_ids: string[]
          source: string
          targeting_spec: Json
        }
        Insert: {
          ad_account_id: string
          adset_id: string
          age_max?: number | null
          age_min?: number | null
          audience_cell_node_id: string
          audience_group_version_id?: string | null
          bid_strategy?: string | null
          billing_event?: string | null
          brand_id: string
          content_hash: string
          created_at?: string
          custom_audience_ids?: string[]
          device_platforms?: string[] | null
          excluded_custom_audience_ids?: string[]
          genders?: number[] | null
          geo_node_ids?: string[]
          id?: string
          observed_at?: string
          optimization_goal?: string | null
          placements?: string[] | null
          publisher_platforms?: string[] | null
          referenced_node_ids?: string[]
          source?: string
          targeting_spec: Json
        }
        Update: {
          ad_account_id?: string
          adset_id?: string
          age_max?: number | null
          age_min?: number | null
          audience_cell_node_id?: string
          audience_group_version_id?: string | null
          bid_strategy?: string | null
          billing_event?: string | null
          brand_id?: string
          content_hash?: string
          created_at?: string
          custom_audience_ids?: string[]
          device_platforms?: string[] | null
          excluded_custom_audience_ids?: string[]
          genders?: number[] | null
          geo_node_ids?: string[]
          id?: string
          observed_at?: string
          optimization_goal?: string | null
          placements?: string[] | null
          publisher_platforms?: string[] | null
          referenced_node_ids?: string[]
          source?: string
          targeting_spec?: Json
        }
        Relationships: []
      }
      creative_label_jobs: {
        Row: {
          attempts: number
          brand_id: string
          claimed_at: string | null
          completed_at: string | null
          enqueued_at: string
          error: Json | null
          heartbeat_at: string | null
          job_id: string
          origin_env: string | null
          payload: Json
          status: Database["paid_media"]["Enums"]["creative_label_job_status"]
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
          origin_env?: string | null
          payload?: Json
          status?: Database["paid_media"]["Enums"]["creative_label_job_status"]
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
          origin_env?: string | null
          payload?: Json
          status?: Database["paid_media"]["Enums"]["creative_label_job_status"]
          trigger?: string
          worker_id?: string | null
        }
        Relationships: []
      }
      creative_reports: {
        Row: {
          brand_id: string
          error: Json | null
          refreshed_at: string | null
          report: Json | null
          status: string
        }
        Insert: {
          brand_id: string
          error?: Json | null
          refreshed_at?: string | null
          report?: Json | null
          status?: string
        }
        Update: {
          brand_id?: string
          error?: Json | null
          refreshed_at?: string | null
          report?: Json | null
          status?: string
        }
        Relationships: []
      }
      paid_daily_spend: {
        Row: {
          account_id: string
          brand_id: string
          budget: number | null
          campaign_id: string | null
          clicks: number | null
          currency: string | null
          date: string
          id: string
          impressions: number | null
          ingested_at: string
          metadata: Json
          platform: string
          spend: number
          updated_at: string
        }
        Insert: {
          account_id: string
          brand_id: string
          budget?: number | null
          campaign_id?: string | null
          clicks?: number | null
          currency?: string | null
          date: string
          id?: string
          impressions?: number | null
          ingested_at?: string
          metadata?: Json
          platform: string
          spend?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          brand_id?: string
          budget?: number | null
          campaign_id?: string | null
          clicks?: number | null
          currency?: string | null
          date?: string
          id?: string
          impressions?: number | null
          ingested_at?: string
          metadata?: Json
          platform?: string
          spend?: number
          updated_at?: string
        }
        Relationships: []
      }
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
          origin_workspace_id: string | null
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
          origin_workspace_id?: string | null
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
          origin_workspace_id?: string | null
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
      _assert_brand: { Args: { p_brand_id: string }; Returns: undefined }
      _kpi_count: {
        Args: {
          p_actions: Json
          p_clicks: number
          p_impressions: number
          p_kpi: string
          p_link_clicks: number
          p_thruplays: number
        }
        Returns: number
      }
      _purchase_count: { Args: { p_actions: Json }; Returns: number }
      claim_next_creative_label_job: {
        Args: { p_env?: string; p_lease_ttl_sec: number; p_worker_id: string }
        Returns: {
          attempts: number
          brand_id: string
          claimed_at: string | null
          completed_at: string | null
          enqueued_at: string
          error: Json | null
          heartbeat_at: string | null
          job_id: string
          origin_env: string | null
          payload: Json
          status: Database["paid_media"]["Enums"]["creative_label_job_status"]
          trigger: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "creative_label_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_creative_label_job_owned: {
        Args: {
          p_error?: Json
          p_job_id: string
          p_status: Database["paid_media"]["Enums"]["creative_label_job_status"]
          p_worker_id: string
        }
        Returns: boolean
      }
      enqueue_creative_label_job: {
        Args: { p_brand_id: string; p_payload: Json; p_trigger: string }
        Returns: string
      }
      heartbeat_creative_label_job: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: boolean
      }
      kpi_conversion_key: { Args: { p_kpi: string }; Returns: string }
      kpi_for_goal: {
        Args: { p_fallback: string; p_goal: string }
        Returns: string
      }
    }
    Enums: {
      creative_label_job_status: "queued" | "running" | "completed" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  plugin_mcp: {
    Tables: {
      audit_cache: {
        Row: {
          account_id: string
          audit_dimensions: string[]
          audited_at: string
          brand_id: string
          content_hash: string
          expires_at: string
          result: Json
          source: string
        }
        Insert: {
          account_id: string
          audit_dimensions?: string[]
          audited_at?: string
          brand_id: string
          content_hash: string
          expires_at?: string
          result: Json
          source?: string
        }
        Update: {
          account_id?: string
          audit_dimensions?: string[]
          audited_at?: string
          brand_id?: string
          content_hash?: string
          expires_at?: string
          result?: Json
          source?: string
        }
        Relationships: []
      }
      client_registrations: {
        Row: {
          authorized_at: string
          brand_id: string | null
          client_id: string
          client_name: string | null
          id: string
          last_seen_at: string | null
          revoked_at: string | null
          scope: string | null
          status: string
          user_id: string
        }
        Insert: {
          authorized_at?: string
          brand_id?: string | null
          client_id: string
          client_name?: string | null
          id?: string
          last_seen_at?: string | null
          revoked_at?: string | null
          scope?: string | null
          status?: string
          user_id: string
        }
        Update: {
          authorized_at?: string
          brand_id?: string | null
          client_id?: string
          client_name?: string | null
          id?: string
          last_seen_at?: string | null
          revoked_at?: string | null
          scope?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      connect_links: {
        Row: {
          brand_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          link_id: string
          mcp_session_id: string | null
          platform: string
          result_integration_id: string | null
          return_to: string
          signed_param: string
          user_id: string
        }
        Insert: {
          brand_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          link_id: string
          mcp_session_id?: string | null
          platform: string
          result_integration_id?: string | null
          return_to?: string
          signed_param: string
          user_id: string
        }
        Update: {
          brand_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          link_id?: string
          mcp_session_id?: string | null
          platform?: string
          result_integration_id?: string | null
          return_to?: string
          signed_param?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connect_links_mcp_session_id_fkey"
            columns: ["mcp_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      idempotency: {
        Row: {
          brand_id: string
          created_at: string
          expires_at: string
          key: string
          result: Json
          tool: string
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          expires_at?: string
          key: string
          result: Json
          tool: string
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          expires_at?: string
          key?: string
          result?: Json
          tool?: string
          user_id?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          brand_id: string
          completed_at: string | null
          enqueued_at: string
          error: Json | null
          expires_at: string
          job_id: string
          kind: string | null
          params: Json | null
          params_hash: string
          progress: number
          progress_events: Json
          result: Json | null
          started_at: string | null
          status: Database["plugin_mcp"]["Enums"]["job_status"]
          tool: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_id: string
          completed_at?: string | null
          enqueued_at?: string
          error?: Json | null
          expires_at?: string
          job_id: string
          kind?: string | null
          params?: Json | null
          params_hash: string
          progress?: number
          progress_events?: Json
          result?: Json | null
          started_at?: string | null
          status?: Database["plugin_mcp"]["Enums"]["job_status"]
          tool: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          completed_at?: string | null
          enqueued_at?: string
          error?: Json | null
          expires_at?: string
          job_id?: string
          kind?: string | null
          params?: Json | null
          params_hash?: string
          progress?: number
          progress_events?: Json
          result?: Json | null
          started_at?: string | null
          status?: Database["plugin_mcp"]["Enums"]["job_status"]
          tool?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      oauth_clients: {
        Row: {
          client_id: string
          client_name: string | null
          created_at: string
          redirect_uris: string[]
        }
        Insert: {
          client_id: string
          client_name?: string | null
          created_at?: string
          redirect_uris: string[]
        }
        Update: {
          client_id?: string
          client_name?: string | null
          created_at?: string
          redirect_uris?: string[]
        }
        Relationships: []
      }
      oauth_refresh_tokens: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string
          supabase_refresh_token: string
          token_hash: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at: string
          supabase_refresh_token: string
          token_hash: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string
          supabase_refresh_token?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_refresh_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      sessions: {
        Row: {
          brand_id: string | null
          client_metadata: Json
          closed_at: string | null
          created_at: string
          last_seen_at: string
          session_id: string
          transport: Database["plugin_mcp"]["Enums"]["transport_kind"]
          user_id: string
        }
        Insert: {
          brand_id?: string | null
          client_metadata?: Json
          closed_at?: string | null
          created_at?: string
          last_seen_at?: string
          session_id: string
          transport: Database["plugin_mcp"]["Enums"]["transport_kind"]
          user_id: string
        }
        Update: {
          brand_id?: string | null
          client_metadata?: Json
          closed_at?: string | null
          created_at?: string
          last_seen_at?: string
          session_id?: string
          transport?: Database["plugin_mcp"]["Enums"]["transport_kind"]
          user_id?: string
        }
        Relationships: []
      }
      tool_events: {
        Row: {
          action: string | null
          brand_id: string | null
          bytes_in: number | null
          bytes_out: number | null
          cache_hit: boolean | null
          client_id: string | null
          client_name: string | null
          client_profile: string | null
          created_at: string
          dimensions: Json
          duration_ms: number | null
          email: string | null
          error_code: string | null
          event_id: string
          event_kind: string
          event_name: string
          id: number
          method: string | null
          mount_path: string | null
          params_hash: string | null
          request_id: string | null
          result_status: string
          session_id: string | null
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool: string | null
          transport: string | null
          user_id: string
        }
        Insert: {
          action?: string | null
          brand_id?: string | null
          bytes_in?: number | null
          bytes_out?: number | null
          cache_hit?: boolean | null
          client_id?: string | null
          client_name?: string | null
          client_profile?: string | null
          created_at?: string
          dimensions?: Json
          duration_ms?: number | null
          email?: string | null
          error_code?: string | null
          event_id?: string
          event_kind?: string
          event_name?: string
          id?: never
          method?: string | null
          mount_path?: string | null
          params_hash?: string | null
          request_id?: string | null
          result_status?: string
          session_id?: string | null
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool?: string | null
          transport?: string | null
          user_id: string
        }
        Update: {
          action?: string | null
          brand_id?: string | null
          bytes_in?: number | null
          bytes_out?: number | null
          cache_hit?: boolean | null
          client_id?: string | null
          client_name?: string | null
          client_profile?: string | null
          created_at?: string
          dimensions?: Json
          duration_ms?: number | null
          email?: string | null
          error_code?: string | null
          event_id?: string
          event_kind?: string
          event_name?: string
          id?: never
          method?: string | null
          mount_path?: string | null
          params_hash?: string | null
          request_id?: string | null
          result_status?: string
          session_id?: string | null
          status?: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool?: string | null
          transport?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tool_events_2026_05: {
        Row: {
          action: string | null
          brand_id: string | null
          bytes_in: number | null
          bytes_out: number | null
          cache_hit: boolean | null
          client_id: string | null
          client_name: string | null
          client_profile: string | null
          created_at: string
          dimensions: Json
          duration_ms: number | null
          email: string | null
          error_code: string | null
          event_id: string
          event_kind: string
          event_name: string
          id: number
          method: string | null
          mount_path: string | null
          params_hash: string | null
          request_id: string | null
          result_status: string
          session_id: string | null
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool: string | null
          transport: string | null
          user_id: string
        }
        Insert: {
          action?: string | null
          brand_id?: string | null
          bytes_in?: number | null
          bytes_out?: number | null
          cache_hit?: boolean | null
          client_id?: string | null
          client_name?: string | null
          client_profile?: string | null
          created_at?: string
          dimensions?: Json
          duration_ms?: number | null
          email?: string | null
          error_code?: string | null
          event_id?: string
          event_kind?: string
          event_name?: string
          id: number
          method?: string | null
          mount_path?: string | null
          params_hash?: string | null
          request_id?: string | null
          result_status?: string
          session_id?: string | null
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool?: string | null
          transport?: string | null
          user_id: string
        }
        Update: {
          action?: string | null
          brand_id?: string | null
          bytes_in?: number | null
          bytes_out?: number | null
          cache_hit?: boolean | null
          client_id?: string | null
          client_name?: string | null
          client_profile?: string | null
          created_at?: string
          dimensions?: Json
          duration_ms?: number | null
          email?: string | null
          error_code?: string | null
          event_id?: string
          event_kind?: string
          event_name?: string
          id?: number
          method?: string | null
          mount_path?: string | null
          params_hash?: string | null
          request_id?: string | null
          result_status?: string
          session_id?: string | null
          status?: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool?: string | null
          transport?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tool_events_2026_06: {
        Row: {
          action: string | null
          brand_id: string | null
          bytes_in: number | null
          bytes_out: number | null
          cache_hit: boolean | null
          client_id: string | null
          client_name: string | null
          client_profile: string | null
          created_at: string
          dimensions: Json
          duration_ms: number | null
          email: string | null
          error_code: string | null
          event_id: string
          event_kind: string
          event_name: string
          id: number
          method: string | null
          mount_path: string | null
          params_hash: string | null
          request_id: string | null
          result_status: string
          session_id: string | null
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool: string | null
          transport: string | null
          user_id: string
        }
        Insert: {
          action?: string | null
          brand_id?: string | null
          bytes_in?: number | null
          bytes_out?: number | null
          cache_hit?: boolean | null
          client_id?: string | null
          client_name?: string | null
          client_profile?: string | null
          created_at?: string
          dimensions?: Json
          duration_ms?: number | null
          email?: string | null
          error_code?: string | null
          event_id?: string
          event_kind?: string
          event_name?: string
          id: number
          method?: string | null
          mount_path?: string | null
          params_hash?: string | null
          request_id?: string | null
          result_status?: string
          session_id?: string | null
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool?: string | null
          transport?: string | null
          user_id: string
        }
        Update: {
          action?: string | null
          brand_id?: string | null
          bytes_in?: number | null
          bytes_out?: number | null
          cache_hit?: boolean | null
          client_id?: string | null
          client_name?: string | null
          client_profile?: string | null
          created_at?: string
          dimensions?: Json
          duration_ms?: number | null
          email?: string | null
          error_code?: string | null
          event_id?: string
          event_kind?: string
          event_name?: string
          id?: number
          method?: string | null
          mount_path?: string | null
          params_hash?: string | null
          request_id?: string | null
          result_status?: string
          session_id?: string | null
          status?: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool?: string | null
          transport?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tool_events_2026_07: {
        Row: {
          action: string | null
          brand_id: string | null
          bytes_in: number | null
          bytes_out: number | null
          cache_hit: boolean | null
          client_id: string | null
          client_name: string | null
          client_profile: string | null
          created_at: string
          dimensions: Json
          duration_ms: number | null
          email: string | null
          error_code: string | null
          event_id: string
          event_kind: string
          event_name: string
          id: number
          method: string | null
          mount_path: string | null
          params_hash: string | null
          request_id: string | null
          result_status: string
          session_id: string | null
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool: string | null
          transport: string | null
          user_id: string
        }
        Insert: {
          action?: string | null
          brand_id?: string | null
          bytes_in?: number | null
          bytes_out?: number | null
          cache_hit?: boolean | null
          client_id?: string | null
          client_name?: string | null
          client_profile?: string | null
          created_at?: string
          dimensions?: Json
          duration_ms?: number | null
          email?: string | null
          error_code?: string | null
          event_id?: string
          event_kind?: string
          event_name?: string
          id: number
          method?: string | null
          mount_path?: string | null
          params_hash?: string | null
          request_id?: string | null
          result_status?: string
          session_id?: string | null
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool?: string | null
          transport?: string | null
          user_id: string
        }
        Update: {
          action?: string | null
          brand_id?: string | null
          bytes_in?: number | null
          bytes_out?: number | null
          cache_hit?: boolean | null
          client_id?: string | null
          client_name?: string | null
          client_profile?: string | null
          created_at?: string
          dimensions?: Json
          duration_ms?: number | null
          email?: string | null
          error_code?: string | null
          event_id?: string
          event_kind?: string
          event_name?: string
          id?: number
          method?: string | null
          mount_path?: string | null
          params_hash?: string | null
          request_id?: string | null
          result_status?: string
          session_id?: string | null
          status?: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool?: string | null
          transport?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tool_events_2026_08: {
        Row: {
          action: string | null
          brand_id: string | null
          bytes_in: number | null
          bytes_out: number | null
          cache_hit: boolean | null
          client_id: string | null
          client_name: string | null
          client_profile: string | null
          created_at: string
          dimensions: Json
          duration_ms: number | null
          email: string | null
          error_code: string | null
          event_id: string
          event_kind: string
          event_name: string
          id: number
          method: string | null
          mount_path: string | null
          params_hash: string | null
          request_id: string | null
          result_status: string
          session_id: string | null
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool: string | null
          transport: string | null
          user_id: string
        }
        Insert: {
          action?: string | null
          brand_id?: string | null
          bytes_in?: number | null
          bytes_out?: number | null
          cache_hit?: boolean | null
          client_id?: string | null
          client_name?: string | null
          client_profile?: string | null
          created_at?: string
          dimensions?: Json
          duration_ms?: number | null
          email?: string | null
          error_code?: string | null
          event_id?: string
          event_kind?: string
          event_name?: string
          id: number
          method?: string | null
          mount_path?: string | null
          params_hash?: string | null
          request_id?: string | null
          result_status?: string
          session_id?: string | null
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool?: string | null
          transport?: string | null
          user_id: string
        }
        Update: {
          action?: string | null
          brand_id?: string | null
          bytes_in?: number | null
          bytes_out?: number | null
          cache_hit?: boolean | null
          client_id?: string | null
          client_name?: string | null
          client_profile?: string | null
          created_at?: string
          dimensions?: Json
          duration_ms?: number | null
          email?: string | null
          error_code?: string | null
          event_id?: string
          event_kind?: string
          event_name?: string
          id?: number
          method?: string | null
          mount_path?: string | null
          params_hash?: string | null
          request_id?: string | null
          result_status?: string
          session_id?: string | null
          status?: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool?: string | null
          transport?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tool_events_2026_09: {
        Row: {
          action: string | null
          brand_id: string | null
          bytes_in: number | null
          bytes_out: number | null
          cache_hit: boolean | null
          client_id: string | null
          client_name: string | null
          client_profile: string | null
          created_at: string
          dimensions: Json
          duration_ms: number | null
          email: string | null
          error_code: string | null
          event_id: string
          event_kind: string
          event_name: string
          id: number
          method: string | null
          mount_path: string | null
          params_hash: string | null
          request_id: string | null
          result_status: string
          session_id: string | null
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool: string | null
          transport: string | null
          user_id: string
        }
        Insert: {
          action?: string | null
          brand_id?: string | null
          bytes_in?: number | null
          bytes_out?: number | null
          cache_hit?: boolean | null
          client_id?: string | null
          client_name?: string | null
          client_profile?: string | null
          created_at?: string
          dimensions?: Json
          duration_ms?: number | null
          email?: string | null
          error_code?: string | null
          event_id?: string
          event_kind?: string
          event_name?: string
          id: number
          method?: string | null
          mount_path?: string | null
          params_hash?: string | null
          request_id?: string | null
          result_status?: string
          session_id?: string | null
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool?: string | null
          transport?: string | null
          user_id: string
        }
        Update: {
          action?: string | null
          brand_id?: string | null
          bytes_in?: number | null
          bytes_out?: number | null
          cache_hit?: boolean | null
          client_id?: string | null
          client_name?: string | null
          client_profile?: string | null
          created_at?: string
          dimensions?: Json
          duration_ms?: number | null
          email?: string | null
          error_code?: string | null
          event_id?: string
          event_kind?: string
          event_name?: string
          id?: number
          method?: string | null
          mount_path?: string | null
          params_hash?: string | null
          request_id?: string | null
          result_status?: string
          session_id?: string | null
          status?: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool?: string | null
          transport?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tool_events_2026_10: {
        Row: {
          action: string | null
          brand_id: string | null
          bytes_in: number | null
          bytes_out: number | null
          cache_hit: boolean | null
          client_id: string | null
          client_name: string | null
          client_profile: string | null
          created_at: string
          dimensions: Json
          duration_ms: number | null
          email: string | null
          error_code: string | null
          event_id: string
          event_kind: string
          event_name: string
          id: number
          method: string | null
          mount_path: string | null
          params_hash: string | null
          request_id: string | null
          result_status: string
          session_id: string | null
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool: string | null
          transport: string | null
          user_id: string
        }
        Insert: {
          action?: string | null
          brand_id?: string | null
          bytes_in?: number | null
          bytes_out?: number | null
          cache_hit?: boolean | null
          client_id?: string | null
          client_name?: string | null
          client_profile?: string | null
          created_at?: string
          dimensions?: Json
          duration_ms?: number | null
          email?: string | null
          error_code?: string | null
          event_id?: string
          event_kind?: string
          event_name?: string
          id: number
          method?: string | null
          mount_path?: string | null
          params_hash?: string | null
          request_id?: string | null
          result_status?: string
          session_id?: string | null
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool?: string | null
          transport?: string | null
          user_id: string
        }
        Update: {
          action?: string | null
          brand_id?: string | null
          bytes_in?: number | null
          bytes_out?: number | null
          cache_hit?: boolean | null
          client_id?: string | null
          client_name?: string | null
          client_profile?: string | null
          created_at?: string
          dimensions?: Json
          duration_ms?: number | null
          email?: string | null
          error_code?: string | null
          event_id?: string
          event_kind?: string
          event_name?: string
          id?: number
          method?: string | null
          mount_path?: string | null
          params_hash?: string | null
          request_id?: string | null
          result_status?: string
          session_id?: string | null
          status?: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool?: string | null
          transport?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tool_operations: {
        Row: {
          attempt: number
          brand_id: string
          claimed_at: string
          expires_at: string
          operation_id: string
          receipt: Json | null
          reconciliation: Json | null
          request_hash: string
          status: string
          tool: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt?: number
          brand_id: string
          claimed_at?: string
          expires_at?: string
          operation_id: string
          receipt?: Json | null
          reconciliation?: Json | null
          request_hash: string
          status?: string
          tool: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt?: number
          brand_id?: string
          claimed_at?: string
          expires_at?: string
          operation_id?: string
          receipt?: Json | null
          reconciliation?: Json | null
          request_hash?: string
          status?: string
          tool?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      upload_intents: {
        Row: {
          asset_refs: Json
          brand_id: string
          created_at: string
          expires_at: string
          id: string
          max_files: number
          mcp_session_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_refs?: Json
          brand_id: string
          created_at?: string
          expires_at?: string
          id?: string
          max_files?: number
          mcp_session_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_refs?: Json
          brand_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          max_files?: number
          mcp_session_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_intents_mcp_session_id_fkey"
            columns: ["mcp_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          last_brand_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          last_brand_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          last_brand_id?: string | null
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
      append_job_event: {
        Args: { p_event: Json; p_job_id: string }
        Returns: undefined
      }
      approve_calendar_plan: {
        Args: {
          p_brand_id: string
          p_operation_id: string
          p_placements: Json
          p_plan_id: string
          p_request_hash: string
          p_user_id?: string
        }
        Returns: {
          outcome: string
          receipt: Json
        }[]
      }
      bind_session_brand: {
        Args: { p_brand_id: string; p_session_id: string; p_user_id: string }
        Returns: undefined
      }
      claim_idempotency: {
        Args: {
          p_brand_id: string
          p_key: string
          p_result?: Json
          p_tool: string
          p_user_id?: string
        }
        Returns: {
          created_at: string
          result: Json
          was_new: boolean
        }[]
      }
      claim_next_job: { Args: { p_tools?: string[] }; Returns: Json }
      claim_operation: {
        Args: {
          p_brand_id: string
          p_operation_id: string
          p_request_hash: string
          p_stale_after_seconds?: number
          p_tool: string
          p_user_id?: string
        }
        Returns: {
          attempt: number
          outcome: string
          reason: string
          receipt: Json
          reconciliation: Json
          status: string
        }[]
      }
      complete_idempotency: {
        Args: {
          p_brand_id: string
          p_key: string
          p_result: Json
          p_tool: string
          p_user_id?: string
        }
        Returns: undefined
      }
      complete_job: {
        Args: {
          p_error?: Json
          p_job_id: string
          p_result?: Json
          p_status: Database["plugin_mcp"]["Enums"]["job_status"]
        }
        Returns: undefined
      }
      complete_operation: {
        Args: {
          p_brand_id: string
          p_operation_id: string
          p_receipt: Json
          p_tool: string
          p_user_id?: string
        }
        Returns: undefined
      }
      complete_upload_intent: {
        Args: {
          p_asset_refs: Json
          p_upload_intent_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      compute_capabilities: {
        Args: { p_account_type: string; p_platform: string }
        Returns: string[]
      }
      consume_connect_link: {
        Args: { p_integration_id: string; p_link_id: string }
        Returns: Json
      }
      create_brand_stub: {
        Args: {
          p_brand_name: string
          p_user_id: string
          p_website_url?: string
        }
        Returns: string
      }
      create_next_event_partition: { Args: never; Returns: string }
      delete_mcp_bench_events: {
        Args: { p_session_id: string }
        Returns: number
      }
      enqueue_job: {
        Args: {
          p_brand_id: string
          p_job_id?: string
          p_params?: Json
          p_params_hash: string
          p_tool: string
          p_user_id?: string
        }
        Returns: string
      }
      ensure_event_partitions: {
        Args: { p_months_ahead?: number }
        Returns: string[]
      }
      fail_operation: {
        Args: {
          p_brand_id: string
          p_operation_id: string
          p_reconciliation?: Json
          p_status: string
          p_tool: string
          p_user_id?: string
        }
        Returns: undefined
      }
      get_job: { Args: { p_job_id: string; p_user_id?: string }; Returns: Json }
      get_operation: {
        Args: {
          p_brand_id: string
          p_operation_id: string
          p_tool: string
          p_user_id?: string
        }
        Returns: Json
      }
      get_session: {
        Args: { p_session_id: string }
        Returns: {
          brand_id: string
          user_id: string
        }[]
      }
      get_session_brand: {
        Args: { p_session_id: string; p_user_id?: string }
        Returns: string
      }
      get_upload_intent: {
        Args: { p_upload_intent_id: string; p_user_id?: string }
        Returns: Json
      }
      get_user_last_brand: { Args: { p_user_id?: string }; Returns: string }
      is_safe_event_dimensions: {
        Args: { p_dimensions: Json }
        Returns: boolean
      }
      issue_connect_link: {
        Args: {
          p_brand_id: string
          p_mcp_session_id: string
          p_platform: string
          p_signed_param: string
          p_user_id?: string
        }
        Returns: {
          expires_at: string
          link_id: string
        }[]
      }
      issue_upload_intent: {
        Args: {
          p_brand_id: string
          p_max_files?: number
          p_mcp_session_id?: string
          p_user_id?: string
        }
        Returns: Json
      }
      list_brand_accounts: {
        Args: {
          p_brand_id: string
          p_cursor?: string
          p_limit?: number
          p_platform?: string
          p_search?: string
          p_user_id?: string
        }
        Returns: {
          account_id: string
          account_type: string
          avatar_url: string
          cache_age_seconds: number
          cached_at: string
          capabilities: string[]
          display_name: string
          follower_count: number
          handle: string
          next_cursor: string
          platform: string
        }[]
      }
      list_brand_ad_accounts: {
        Args: { p_brand_id: string; p_user_id?: string }
        Returns: {
          account_id: string
          currency: string
          name: string
          platform: string
          status: string
        }[]
      }
      list_brand_integrations: {
        Args: { p_brand_id: string; p_user_id?: string }
        Returns: {
          account_count: number
          cache_age_seconds: number
          cached_at: string
          integration_id: string
          linked_at: string
          needs_reauth: boolean
          platform: string
          status: string
        }[]
      }
      list_brands_integration_status: {
        Args: { p_brand_ids: string[]; p_user_id: string }
        Returns: {
          account_count: number
          brand_id: string
          has_active_integration: boolean
        }[]
      }
      list_client_registrations: {
        Args: { p_user_id?: string }
        Returns: {
          authorized_at: string
          brand_id: string
          client_id: string
          client_name: string
          id: string
          last_seen_at: string
          revoked_at: string
          scope: string
          status: string
        }[]
      }
      list_tool_events: {
        Args: {
          p_before?: string
          p_client_id?: string
          p_limit?: number
          p_status?: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          p_user_id?: string
        }
        Returns: {
          brand_id: string
          client_id: string
          client_name: string
          created_at: string
          duration_ms: number
          email: string
          error_code: string
          id: number
          session_id: string
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool: string
        }[]
      }
      list_user_mcp_events: {
        Args: {
          p_before?: string
          p_before_id?: number
          p_client_id?: string
          p_limit?: number
          p_status?: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          p_tool?: string
          p_user_id: string
        }
        Returns: {
          action: string
          brand_id: string
          bytes_in: number
          bytes_out: number
          cache_hit: boolean
          client_id: string
          client_name: string
          client_profile: string
          created_at: string
          dimensions: Json
          duration_ms: number
          email: string
          error_code: string
          event_id: string
          event_kind: string
          event_name: string
          id: number
          request_id: string
          result_status: string
          session_id: string
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool: string
          transport: string
        }[]
      }
      log_tool_event: {
        Args: {
          p_brand_id: string
          p_bytes_out?: number
          p_cache_hit: boolean
          p_client_id?: string
          p_client_name?: string
          p_duration_ms: number
          p_email?: string
          p_error_code?: string
          p_params_hash: string
          p_session_id: string
          p_status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          p_tool: string
          p_user_id: string
        }
        Returns: undefined
      }
      mark_client_seen: {
        Args: { p_client_id: string; p_user_id?: string }
        Returns: undefined
      }
      mcp_event_store_health: { Args: never; Returns: Json }
      planner_apply_draft_patches: {
        Args: {
          p_atomic?: boolean
          p_brand_id: string
          p_items: Json
          p_op: string
          p_operation_id: string
          p_request_hash: string
          p_user_id?: string
        }
        Returns: {
          outcome: string
          receipt: Json
        }[]
      }
      planner_copy_drafts: {
        Args: {
          p_atomic?: boolean
          p_brand_id: string
          p_items: Json
          p_operation_id: string
          p_request_hash: string
          p_user_id?: string
        }
        Returns: {
          outcome: string
          receipt: Json
        }[]
      }
      prune_event_partitions: {
        Args: { p_retention_days?: number }
        Returns: string[]
      }
      query_mcp_events: {
        Args: {
          p_action?: string
          p_before?: string
          p_before_id?: number
          p_brand_id?: string
          p_client_id?: string
          p_client_profile?: string
          p_dimensions?: Json
          p_email?: string
          p_error_code?: string
          p_event_id?: string
          p_event_kind?: string
          p_event_name?: string
          p_limit?: number
          p_request_id?: string
          p_result_status?: string
          p_session_id?: string
          p_since?: string
          p_status?: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          p_tool?: string
          p_transport?: string
          p_until?: string
          p_user_id?: string
        }
        Returns: {
          action: string | null
          brand_id: string | null
          bytes_in: number | null
          bytes_out: number | null
          cache_hit: boolean | null
          client_id: string | null
          client_name: string | null
          client_profile: string | null
          created_at: string
          dimensions: Json
          duration_ms: number | null
          email: string | null
          error_code: string | null
          event_id: string
          event_kind: string
          event_name: string
          id: number
          method: string | null
          mount_path: string | null
          params_hash: string | null
          request_id: string | null
          result_status: string
          session_id: string | null
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool: string | null
          transport: string | null
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tool_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      record_mcp_event: {
        Args: {
          p_action: string
          p_brand_id: string
          p_bytes_in: number
          p_bytes_out: number
          p_cache_hit: boolean
          p_client_id: string
          p_client_profile: string
          p_dimensions: Json
          p_duration_ms: number
          p_email: string
          p_error_code: string
          p_event_kind: string
          p_event_name: string
          p_method: string
          p_mount_path: string
          p_params_hash: string
          p_request_id: string
          p_result_status: string
          p_session_id: string
          p_status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          p_tool: string
          p_transport: string
          p_user_id: string
        }
        Returns: string
      }
      record_session: {
        Args: { p_session_id: string; p_user_id?: string }
        Returns: undefined
      }
      register_client: {
        Args: {
          p_brand_id?: string
          p_client_id: string
          p_client_name?: string
          p_scope?: string
          p_user_id?: string
        }
        Returns: Json
      }
      revoke_client: {
        Args: { p_registration_id: string; p_user_id?: string }
        Returns: Json
      }
      set_user_last_brand: {
        Args: { p_brand_id: string; p_user_id?: string }
        Returns: undefined
      }
      start_job: { Args: { p_job_id: string }; Returns: undefined }
      summarize_mcp_events: {
        Args: { p_since?: string; p_until?: string }
        Returns: {
          event_count: number
          newest_at: string
          p50_duration_ms: number
          p95_duration_ms: number
          status: Database["plugin_mcp"]["Enums"]["tool_event_status"]
          tool: string
          transport: string
        }[]
      }
      update_job_progress: {
        Args: { p_job_id: string; p_progress: number }
        Returns: undefined
      }
      verify_brand_access: {
        Args: { p_brand_id: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      job_status: "pending" | "running" | "completed" | "failed" | "cancelled"
      tool_event_status:
        | "ok"
        | "error"
        | "denied"
        | "rate_limited"
        | "cancelled"
      transport_kind: "http_stream" | "stdio"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_cross_calls: {
        Row: {
          brand_id: string
          call_id: string
          callee_agent: string
          callee_run_id: string | null
          callee_session_id: string | null
          caller_agent: string
          caller_run_id: string | null
          caller_session_id: string | null
          caller_tool_call_id: string | null
          chain: Json
          completed_at: string | null
          created_at: string
          hop_count: number
          query: string
          result_preview: string | null
          status: string
          updated_at: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          brand_id: string
          call_id?: string
          callee_agent: string
          callee_run_id?: string | null
          callee_session_id?: string | null
          caller_agent: string
          caller_run_id?: string | null
          caller_session_id?: string | null
          caller_tool_call_id?: string | null
          chain?: Json
          completed_at?: string | null
          created_at?: string
          hop_count?: number
          query: string
          result_preview?: string | null
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          brand_id?: string
          call_id?: string
          callee_agent?: string
          callee_run_id?: string | null
          callee_session_id?: string | null
          caller_agent?: string
          caller_run_id?: string | null
          caller_session_id?: string | null
          caller_tool_call_id?: string | null
          chain?: Json
          completed_at?: string | null
          created_at?: string
          hop_count?: number
          query?: string
          result_preview?: string | null
          status?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
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
      whats_new: {
        Row: {
          body: string
          created_at: string
          date: string
          id: string
          tag: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          date: string
          id: string
          tag: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          date?: string
          id?: string
          tag?: string
          title?: string
        }
        Relationships: []
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
      competitor_spy_get_angle_map: {
        Args: { p_brand_id: string; p_window_days?: number }
        Returns: Json
      }
      competitor_spy_match_snapshot_neighbors: {
        Args: {
          p_image_threshold?: number
          p_limit?: number
          p_snapshot_id: string
          p_text_threshold?: number
        }
        Returns: {
          method: string
          neighbor_id: string
          similarity: number
          variant_family_id: string
        }[]
      }
      continuum_action_stream: {
        Args: { p_brand_id: string; p_from: string; p_to: string }
        Returns: {
          action: string
          actor_id: string
          actor_kind: string
          asset_id: string
          occurred_at: string
          outcome: string
          producer_id: string
          producer_kind: string
          replaced_target_id: string
          source: string
          target_id: string
          target_kind: string
        }[]
      }
      decrypt_token: { Args: { token_to_decrypt: string }; Returns: string }
      find_overlapping_brands: {
        Args: never
        Returns: {
          brand_a: string
          brand_b: string
          members_only_in_a: string[]
          members_only_in_b: string[]
          name_a: string
          name_b: string
          portfolios_a: number
          portfolios_b: number
          same_name: boolean
          shared_accounts: string[]
        }[]
      }
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
      match_brand_design_sections: {
        Args: {
          filter_brand_id: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          section: string
          section_id: string
          similarity: number
          summary: string
          title: string
        }[]
      }
      match_brand_document_chunks: {
        Args: {
          filter_brand_id: string
          filter_categories?: string[]
          filter_scope_key?: string
          include_archived?: boolean
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          category: string
          chunk_index: number
          content: string
          document_id: string
          document_name: string
          similarity: number
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
      match_brand_guideline_tags: {
        Args: {
          filter_brand_id: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          description: string
          guideline_id: string
          label: string
          section: string
          similarity: number
          tag_id: string
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
      media_delete_asset_version_insight: {
        Args: { p_brand_id: string; p_insight_key: string }
        Returns: undefined
      }
      media_get_asset_performance: {
        Args: { p_asset_id: string; p_brand_id: string; p_window?: string }
        Returns: Json
      }
      media_get_asset_usage: {
        Args: { p_asset_id: string; p_brand_id: string }
        Returns: Json
      }
      media_get_asset_version_insight: {
        Args: { p_brand_id: string; p_insight_key: string }
        Returns: string
      }
      media_record_asset_deployment: {
        Args: {
          p_ad_id?: string
          p_asset_id: string
          p_brand_id: string
          p_confidence?: number
          p_created_by?: string
          p_creative_row_id?: string
          p_link_method: string
          p_platform?: string
          p_platform_post_id?: string
          p_producer_id?: string
          p_producer_kind?: string
          p_surface: string
          p_version_number?: number
        }
        Returns: string
      }
      media_upsert_asset_version_insight: {
        Args: {
          p_asset_id: string
          p_brand_id: string
          p_grounded_on: Json
          p_insight: string
          p_insight_key: string
          p_model: string
          p_source: string
          p_version_number: number
        }
        Returns: undefined
      }
      optimizer_action_count: { Args: { p_since?: string }; Returns: number }
      optimizer_append_logs: { Args: { p_rows: Json }; Returns: number }
      optimizer_archive_portfolio: {
        Args: { p_portfolio_id: string }
        Returns: undefined
      }
      optimizer_backfill_adset_names: {
        Args: { p_names: Json; p_portfolio_id: string }
        Returns: number
      }
      optimizer_claim_due_portfolios: {
        Args: { p_limit?: number }
        Returns: {
          ad_account_id: string
          apply_mode: string
          brand_id: string
          budget_source: string
          config: Json
          cpa_target: number
          daily_total: number
          id: string
          level: string
          lookback_window: string
          mode: string
          objective: string
          period_budget: number
          period_end: string
          period_start: string
        }[]
      }
      optimizer_claim_next_creative_swap_job: {
        Args: { p_lease_ttl_sec?: number; p_worker_id: string }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "creative_swap_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      optimizer_complete_creative_swap_job_owned: {
        Args: {
          p_asset_id?: string
          p_error?: Json
          p_job_id: string
          p_result?: Json
          p_status: string
          p_worker_id: string
        }
        Returns: boolean
      }
      optimizer_confirm_ad_status: {
        Args: {
          p_ad_id: string
          p_authorized_by?: string
          p_authorized_kind?: string
          p_cycle_ts: string
          p_justification?: string
          p_meta_receipt?: Json
          p_mode?: string
          p_ok: boolean
          p_portfolio_id: string
          p_prior_status?: string
          p_recommendation_id?: string
        }
        Returns: undefined
      }
      optimizer_confirm_adset_status: {
        Args: {
          p_adset_id: string
          p_audit_id?: string
          p_authorized_by?: string
          p_authorized_kind?: string
          p_cycle_ts: string
          p_justification?: string
          p_meta_receipt?: Json
          p_mode?: string
          p_ok: boolean
          p_portfolio_id: string
          p_prior_status?: string
          p_recommendation_id?: string
          p_reverts_audit_id?: string
        }
        Returns: undefined
      }
      optimizer_confirm_apply: {
        Args: {
          p_adset_id: string
          p_audit_id?: string
          p_authorized_by?: string
          p_authorized_kind?: string
          p_cycle_ts: string
          p_justification?: string
          p_meta_receipt?: Json
          p_mode?: string
          p_ok: boolean
          p_portfolio_id: string
          p_prior_minor?: number
          p_recommendation_id?: string
          p_reverts_audit_id?: string
        }
        Returns: undefined
      }
      optimizer_confirm_convert: {
        Args: {
          p_authorized_by?: string
          p_campaign_id: string
          p_cycle_ts: string
          p_meta_receipt?: Json
          p_ok: boolean
        }
        Returns: undefined
      }
      optimizer_create_portfolio: {
        Args: { p_ad_account_id: string; p_brand_id: string; p_config: Json }
        Returns: string
      }
      optimizer_delete_bench_portfolio: {
        Args: { p_portfolio_id: string }
        Returns: boolean
      }
      optimizer_delete_recommendation_insight: {
        Args: { p_brand_id: string; p_insight_key: string }
        Returns: undefined
      }
      optimizer_enqueue_creative_swap_job: {
        Args: { p_job: Json }
        Returns: string
      }
      optimizer_enroll_adset: {
        Args: { p_adsets: Json; p_portfolio_id: string }
        Returns: Json
      }
      optimizer_expire_stale_recommendations: {
        Args: { p_days?: number }
        Returns: number
      }
      optimizer_fulfill_renewal_task: {
        Args: { p_asset_id: string; p_task_id: string }
        Returns: undefined
      }
      optimizer_get_angle_matrix: {
        Args: { p_portfolio_id: string; p_window?: string }
        Returns: Json
      }
      optimizer_get_apply_audit: {
        Args: { p_audit_id: string }
        Returns: {
          ad_id: string
          adset_id: string
          authorized_kind: string
          created_at: string
          portfolio_id: string
          prior_minor: number
          prior_status: string
          scope: string
          target_minor: number
          target_status: string
        }[]
      }
      optimizer_get_approved_apply_items: {
        Args: { p_run_id: string }
        Returns: {
          adset_id: string
          apply_requested_by: string
          change_abs: number
          change_pct: number
          current_budget: number
          final_budget: number
          reason: string
        }[]
      }
      optimizer_get_approved_pause_recs: {
        Args: { p_portfolio_id: string }
        Returns: {
          adset_id: string
          reason: string
          rec_id: string
        }[]
      }
      optimizer_get_cpa_series: {
        Args: { p_limit?: number; p_portfolio_id: string }
        Returns: Json
      }
      optimizer_get_creative_swap_jobs: {
        Args: { p_brand_id: string; p_limit?: number; p_status?: string }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "creative_swap_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      optimizer_get_enrolled_adsets: {
        Args: { p_portfolio_id: string }
        Returns: string[]
      }
      optimizer_get_portfolio_performance: {
        Args: { p_limit?: number; p_portfolio_id: string }
        Returns: Json
      }
      optimizer_get_portfolio_recommendations: {
        Args: { p_limit?: number; p_portfolio_id: string }
        Returns: {
          ad_id: string
          adset_id: string
          created_at: string
          decided_via: string
          id: string
          kind: string
          reason: string
          rule_id: string
          run_id: string
          severity: string
          status: string
          trigger: string
        }[]
      }
      optimizer_get_prior_composites: {
        Args: { p_portfolio_id: string }
        Returns: Json
      }
      optimizer_get_recommendation_insight: {
        Args: { p_brand_id: string; p_insight_key: string }
        Returns: string
      }
      optimizer_get_rule_evaluations: {
        Args: { p_limit?: number; p_portfolio_id: string; p_run_id?: string }
        Returns: {
          adset_id: string
          created_at: string
          deduped: boolean
          error: string
          facts: Json
          id: number
          matched: boolean
          portfolio_id: string
          rule_id: string
          run_id: string
        }[]
      }
      optimizer_get_rule_grant_audits: {
        Args: { p_portfolio_id: string }
        Returns: {
          action: string
          actor: string
          created_at: string
          id: number
          portfolio_id: string
          rule_id: string
        }[]
      }
      optimizer_get_rules: {
        Args: { p_portfolio_id: string }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "rules"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      optimizer_get_timeline_events: {
        Args: { p_limit?: number; p_portfolio_id: string }
        Returns: Json
      }
      optimizer_grant_approve_recommendation: {
        Args: { p_rec_id: string; p_rule_id: string }
        Returns: boolean
      }
      optimizer_heartbeat_creative_swap_job: {
        Args: {
          p_job_id: string
          p_lease_ttl_sec?: number
          p_worker_id: string
        }
        Returns: boolean
      }
      optimizer_list_account_enrollments: {
        Args: { p_ad_account_id?: string; p_brand_id: string }
        Returns: {
          adset_id: string
          can_release: boolean
          portfolio_id: string
          portfolio_name: string
          same_brand: boolean
        }[]
      }
      optimizer_list_actions: {
        Args: { p_before?: string; p_brand_id: string; p_limit?: number }
        Returns: {
          actor_id: string
          actor_kind: string
          after: Json
          before: Json
          entity_id: string
          family: string
          id: string
          justification: string
          op: string
          portfolio_id: string
          portfolio_name: string
          receipt: Json
          reversible: boolean
          revert_of: string
          reverted_by: string
          run_id: string
          ts: string
        }[]
      }
      optimizer_list_archived_portfolios: {
        Args: { p_brand_id: string }
        Returns: Json
      }
      optimizer_list_logs: {
        Args: { p_before?: string; p_brand_id: string; p_limit?: number }
        Returns: {
          event: string
          fields: Json
          id: number
          level: string
          portfolio_id: string
          portfolio_name: string
          ts: string
        }[]
      }
      optimizer_list_portfolio_adsets: {
        Args: { p_portfolio_id: string }
        Returns: {
          active: boolean
          adset_id: string
          adset_name: string
          last_seen_at: string
          missing_since: string
        }[]
      }
      optimizer_list_portfolios: { Args: { p_brand_id: string }; Returns: Json }
      optimizer_list_renewal_tasks: {
        Args: { p_brand_id: string; p_status?: string }
        Returns: Json
      }
      optimizer_load_portfolio: {
        Args: { p_portfolio_id: string }
        Returns: {
          ad_account_id: string
          apply_mode: string
          brand_id: string
          budget_source: string
          config: Json
          cpa_target: number
          daily_total: number
          id: string
          level: string
          lookback_window: string
          mode: string
          objective: string
          period_budget: number
          period_end: string
          period_start: string
        }[]
      }
      optimizer_mark_apply_results: {
        Args: { p_results: Json; p_run_id: string }
        Returns: number
      }
      optimizer_mark_roster_presence: {
        Args: {
          p_portfolio_id: string
          p_seen_at: string
          p_seen_ids: string[]
        }
        Returns: Json
      }
      optimizer_move_portfolios: {
        Args: {
          p_allow_untokened?: boolean
          p_from_brand: string
          p_to_brand: string
        }
        Returns: Json
      }
      optimizer_reconcile_cycle_items: {
        Args: { p_run_id: string }
        Returns: number
      }
      optimizer_record_cycle: {
        Args: {
          p_cycle_ts: string
          p_portfolio_id: string
          p_result: Json
          p_triggered_by?: string
        }
        Returns: string
      }
      optimizer_record_rule_evaluations: {
        Args: { p_portfolio_id: string; p_rows: Json; p_run_id: string }
        Returns: number
      }
      optimizer_refresh_decision_outcomes: {
        Args: { p_portfolio_id: string }
        Returns: number
      }
      optimizer_request_apply_item: {
        Args: { p_adset_id: string; p_run_id: string }
        Returns: undefined
      }
      optimizer_request_apply_items: {
        Args: { p_adset_ids: string[]; p_run_id: string }
        Returns: number
      }
      optimizer_reserve_ad_status: {
        Args: {
          p_ad_id: string
          p_cycle_ts: string
          p_portfolio_id: string
          p_run_id: string
          p_target_status: string
        }
        Returns: boolean
      }
      optimizer_reserve_adset_status: {
        Args: {
          p_adset_id: string
          p_cycle_ts: string
          p_portfolio_id: string
          p_run_id: string
          p_target_status: string
        }
        Returns: boolean
      }
      optimizer_reserve_apply: {
        Args: {
          p_adset_id: string
          p_cycle_ts: string
          p_portfolio_id: string
          p_run_id: string
          p_target_minor: number
        }
        Returns: boolean
      }
      optimizer_reserve_convert: {
        Args: {
          p_ad_account_id: string
          p_brand_id: string
          p_campaign_id: string
          p_cycle_ts: string
          p_requested_by: string
          p_target: Json
        }
        Returns: boolean
      }
      optimizer_set_autopilot_paused: {
        Args: { p_paused: boolean; p_portfolio_id: string; p_reason?: string }
        Returns: Json
      }
      optimizer_set_recommendation_status: {
        Args: { p_rec_id: string; p_route?: string; p_status: string }
        Returns: undefined
      }
      optimizer_set_recommendation_statuses: {
        Args: { p_rec_ids: string[]; p_status: string }
        Returns: number
      }
      optimizer_set_renewal_task_status: {
        Args: { p_status: string; p_task_id: string }
        Returns: undefined
      }
      optimizer_set_rule: {
        Args: { p_actor?: string; p_patch: Json; p_rule_id: string }
        Returns: undefined
      }
      optimizer_unenroll_adset: {
        Args: { p_adset_id: string; p_portfolio_id: string }
        Returns: undefined
      }
      optimizer_update_portfolio: {
        Args: { p_patch: Json; p_portfolio_id: string }
        Returns: Json
      }
      optimizer_upsert_recommendation_insight: {
        Args: {
          p_adset_id: string
          p_brand_id: string
          p_insight: string
          p_insight_key: string
          p_kind: string
          p_model: string
          p_reason: string
          p_severity: string
          p_source: string
          p_trigger: string
        }
        Returns: undefined
      }
      optimizer_upsert_rules: {
        Args: { p_portfolio_id: string; p_rules: Json }
        Returns: number
      }
      optimizer_upsert_snapshots: {
        Args: { p_cycle_ts: string; p_portfolio_id: string; p_snapshots: Json }
        Returns: number
      }
      paid_media_get_ad_angles: {
        Args: { p_adset_ids?: string[]; p_brand_id: string }
        Returns: Json
      }
      paid_media_get_ad_daily_trends: {
        Args: {
          p_adset_id: string
          p_brand_id: string
          p_cutoff: string
          p_days?: number
        }
        Returns: Json
      }
      paid_media_get_adset_angles: {
        Args: { p_adset_ids: string[]; p_brand_id: string }
        Returns: Json
      }
      paid_media_get_adset_creative_standing: {
        Args: { p_brand_id: string; p_window?: string }
        Returns: Json
      }
      paid_media_get_adset_creative_winrates: {
        Args: { p_brand_id: string; p_dimension?: string; p_window?: string }
        Returns: Json
      }
      paid_media_get_asset_ad_attribution: {
        Args: {
          p_asset_id: string
          p_brand_id: string
          p_cutoff: string
          p_window: string
        }
        Returns: Json
      }
      paid_media_get_creative_vector_signals: {
        Args: { p_brand_id: string; p_window?: string }
        Returns: Json
      }
      paid_media_get_creative_winrates: {
        Args: { p_brand_id: string; p_dimension?: string; p_window?: string }
        Returns: Json
      }
      paid_media_upsert_ad_breakdown_daily: {
        Args: { p_portfolio_id: string; p_rows: Json }
        Returns: number
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
      resolve_meta_context_for_ad_account: {
        Args: { p_ad_account_id: string; p_brand_id: string }
        Returns: {
          access_token: string
          ad_account_id: string
          integration_id: string
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
  agent_workspace: {
    Enums: {},
  },
  brand_integrations: {
    Enums: {},
  },
  brand_profiles: {
    Enums: {
      automation_run_status: ["queued", "running", "completed", "failed"],
      brand_book_job_status: ["queued", "running", "completed", "failed"],
      brand_book_status: ["assembling", "ready", "error"],
      brand_deep_job_status: ["queued", "running", "completed", "failed"],
      brand_guideline_job_status: ["queued", "running", "completed", "failed"],
      brand_intelligence_job_status: [
        "queued",
        "running",
        "completed",
        "failed",
      ],
      brand_report_job_status: ["queued", "running", "completed", "failed"],
      creative_strategy_job_status: [
        "queued",
        "running",
        "completed",
        "failed",
      ],
      creative_strategy_status: ["assembling", "ready", "error", "empty"],
    },
  },
  brand_trends: {
    Enums: {},
  },
  DCO_Campaigns: {
    Enums: {},
  },
  external_connections: {
    Enums: {},
  },
  integrations: {
    Enums: {},
  },
  jaina: {
    Enums: {},
  },
  media: {
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
    Enums: {
      creative_label_job_status: ["queued", "running", "completed", "failed"],
    },
  },
  plugin_mcp: {
    Enums: {
      job_status: ["pending", "running", "completed", "failed", "cancelled"],
      tool_event_status: ["ok", "error", "denied", "rate_limited", "cancelled"],
      transport_kind: ["http_stream", "stdio"],
    },
  },
  public: {
    Enums: {
      report_status: ["in-progress", "active", "inactive", "deleted"],
      scheduled_report_status: ["active", "paused", "failed", "cancelled"],
    },
  },
} as const
