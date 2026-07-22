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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activated_packages: {
        Row: {
          activated_at: string
          activated_by: string | null
          activated_version: number
          id: string
          metadata: Json
          organization_id: string
          package_id: string
        }
        Insert: {
          activated_at?: string
          activated_by?: string | null
          activated_version?: number
          id?: string
          metadata?: Json
          organization_id: string
          package_id: string
        }
        Update: {
          activated_at?: string
          activated_by?: string | null
          activated_version?: number
          id?: string
          metadata?: Json
          organization_id?: string
          package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activated_packages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activated_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "platform_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          performed_by?: string | null
        }
        Relationships: []
      }
      agent_execution_logs: {
        Row: {
          agent_id: string | null
          ai_response: string | null
          conversation_id: string
          created_at: string
          execution_time_ms: number | null
          id: string
          input_message: string
          master_prompt_id: string | null
          organization_id: string
          tools_executed: Json | null
        }
        Insert: {
          agent_id?: string | null
          ai_response?: string | null
          conversation_id: string
          created_at?: string
          execution_time_ms?: number | null
          id?: string
          input_message: string
          master_prompt_id?: string | null
          organization_id: string
          tools_executed?: Json | null
        }
        Update: {
          agent_id?: string | null
          ai_response?: string | null
          conversation_id?: string
          created_at?: string
          execution_time_ms?: number | null
          id?: string
          input_message?: string
          master_prompt_id?: string | null
          organization_id?: string
          tools_executed?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_execution_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_logs_master_prompt_id_fkey"
            columns: ["master_prompt_id"]
            isOneToOne: false
            referencedRelation: "master_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_execution_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_folders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_function_roles: {
        Row: {
          created_at: string
          id: string
          label: string
          order: number
          organization_id: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          order?: number
          organization_id: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          order?: number
          organization_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_function_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_qualification_rules: {
        Row: {
          agent_id: string | null
          created_at: string
          created_by: string | null
          criteria: string
          flow_id: string | null
          id: string
          is_active: boolean
          label: string
          node_id: string | null
          order: number
          organization_id: string
          requires_all: boolean
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          created_by?: string | null
          criteria: string
          flow_id?: string | null
          id?: string
          is_active?: boolean
          label: string
          node_id?: string | null
          order?: number
          organization_id: string
          requires_all?: boolean
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          created_by?: string | null
          criteria?: string
          flow_id?: string | null
          id?: string
          is_active?: boolean
          label?: string
          node_id?: string | null
          order?: number
          organization_id?: string
          requires_all?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_qualification_rules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_qualification_rules_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_qualification_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_training_rules: {
        Row: {
          agent_id: string | null
          created_at: string
          created_by: string | null
          flow_id: string | null
          id: string
          is_active: boolean
          master_prompt_id: string | null
          message_id: string | null
          node_id: string | null
          organization_id: string
          original_feedback: string | null
          original_message: string | null
          rule: string
          situation: string
          target_type: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          created_by?: string | null
          flow_id?: string | null
          id?: string
          is_active?: boolean
          master_prompt_id?: string | null
          message_id?: string | null
          node_id?: string | null
          organization_id: string
          original_feedback?: string | null
          original_message?: string | null
          rule: string
          situation: string
          target_type: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          created_by?: string | null
          flow_id?: string | null
          id?: string
          is_active?: boolean
          master_prompt_id?: string | null
          message_id?: string | null
          node_id?: string | null
          organization_id?: string
          original_feedback?: string | null
          original_message?: string | null
          rule?: string
          situation?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_training_rules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_training_rules_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_training_rules_master_prompt_id_fkey"
            columns: ["master_prompt_id"]
            isOneToOne: false
            referencedRelation: "master_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_training_rules_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_training_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          avatar_url: string | null
          created_at: string
          description: string | null
          flow_ids: string[] | null
          folder_id: string | null
          function_role: string | null
          id: string
          is_active: boolean
          knowledge_base: Json | null
          name: string
          organization_id: string
          persona: string | null
          pipeline_column_ids: string[] | null
          prompt_base: string | null
          tag_ids: string[] | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          flow_ids?: string[] | null
          folder_id?: string | null
          function_role?: string | null
          id?: string
          is_active?: boolean
          knowledge_base?: Json | null
          name: string
          organization_id: string
          persona?: string | null
          pipeline_column_ids?: string[] | null
          prompt_base?: string | null
          tag_ids?: string[] | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          flow_ids?: string[] | null
          folder_id?: string | null
          function_role?: string | null
          id?: string
          is_active?: boolean
          knowledge_base?: Json | null
          name?: string
          organization_id?: string
          persona?: string | null
          pipeline_column_ids?: string[] | null
          prompt_base?: string | null
          tag_ids?: string[] | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "agent_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          asaas_event_id: string | null
          created_at: string | null
          event_type: string
          id: string
          organization_id: string
          payload: Json | null
          processed_at: string | null
        }
        Insert: {
          asaas_event_id?: string | null
          created_at?: string | null
          event_type: string
          id?: string
          organization_id: string
          payload?: Json | null
          processed_at?: string | null
        }
        Update: {
          asaas_event_id?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          organization_id?: string
          payload?: Json | null
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_auth_identifiers: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          created_at: string
          email: string | null
          id: string
          phone: string | null
          reason: string | null
          source_organization_id: string | null
          source_user_id: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          reason?: string | null
          source_organization_id?: string | null
          source_user_id?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          reason?: string | null
          source_organization_id?: string | null
          source_user_id?: string | null
        }
        Relationships: []
      }
      blocked_fingerprints: {
        Row: {
          blocked_at: string | null
          created_at: string
          id: string
          ip_address: string | null
          reason: string | null
          user_agent_hash: string | null
        }
        Insert: {
          blocked_at?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          reason?: string | null
          user_agent_hash?: string | null
        }
        Update: {
          blocked_at?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          reason?: string | null
          user_agent_hash?: string | null
        }
        Relationships: []
      }
      calendar_bookings: {
        Row: {
          assigned_user_id: string | null
          client_email: string | null
          client_name: string | null
          client_phone: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          ends_at: string
          google_event_id: string | null
          id: string
          internal_summary: string | null
          meet_link: string | null
          organization_id: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          ends_at: string
          google_event_id?: string | null
          id?: string
          internal_summary?: string | null
          meet_link?: string | null
          organization_id: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          ends_at?: string
          google_event_id?: string | null
          id?: string
          internal_summary?: string | null
          meet_link?: string | null
          organization_id?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_bookings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_bookings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_configs: {
        Row: {
          availability_rules: Json
          booking_slug: string | null
          calendar_id: string | null
          created_at: string
          display_name: string | null
          google_access_token: string | null
          google_email: string | null
          google_refresh_token: string | null
          id: string
          is_connected: boolean
          meeting_duration_minutes: number
          organization_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          availability_rules?: Json
          booking_slug?: string | null
          calendar_id?: string | null
          created_at?: string
          display_name?: string | null
          google_access_token?: string | null
          google_email?: string | null
          google_refresh_token?: string | null
          id?: string
          is_connected?: boolean
          meeting_duration_minutes?: number
          organization_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          availability_rules?: Json
          booking_slug?: string | null
          calendar_id?: string | null
          created_at?: string
          display_name?: string | null
          google_access_token?: string | null
          google_email?: string | null
          google_refresh_token?: string | null
          id?: string
          is_connected?: boolean
          meeting_duration_minutes?: number
          organization_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          position: number
          updated_at: string
          workspace_id: string | null
          workspace_ids: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          workspace_id?: string | null
          workspace_ids?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          workspace_id?: string | null
          workspace_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "campaign_folders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "campaign_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_queue: {
        Row: {
          campaign_id: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string | null
          id: string
          message_content: string | null
          organization_id: string | null
          processed_at: string | null
          scheduled_for: string
          status: string
          variables: Json | null
        }
        Insert: {
          campaign_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          message_content?: string | null
          organization_id?: string | null
          processed_at?: string | null
          scheduled_for: string
          status?: string
          variables?: Json | null
        }
        Update: {
          campaign_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          message_content?: string | null
          organization_id?: string | null
          processed_at?: string | null
          scheduled_for?: string
          status?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_queue_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_webhook_logs: {
        Row: {
          campaign_id: string | null
          contacts_processed: number | null
          created_at: string | null
          error: string | null
          id: string
          organization_id: string | null
          payload: Json | null
          status: string
        }
        Insert: {
          campaign_id?: string | null
          contacts_processed?: number | null
          created_at?: string | null
          error?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json | null
          status?: string
        }
        Update: {
          campaign_id?: string | null
          contacts_processed?: number | null
          created_at?: string | null
          error?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_webhook_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_webhook_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          end_time: string | null
          flow_id: string
          folder_id: string | null
          id: string
          is_active: boolean | null
          match_type: string
          name: string
          organization_id: string
          position: number
          start_time: string | null
          trigger_count: number
          trigger_keyword: string
          updated_at: string
          webhook_token: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          flow_id: string
          folder_id?: string | null
          id?: string
          is_active?: boolean | null
          match_type?: string
          name: string
          organization_id: string
          position?: number
          start_time?: string | null
          trigger_count?: number
          trigger_keyword: string
          updated_at?: string
          webhook_token?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          end_time?: string | null
          flow_id?: string
          folder_id?: string | null
          id?: string
          is_active?: boolean | null
          match_type?: string
          name?: string
          organization_id?: string
          position?: number
          start_time?: string | null
          trigger_count?: number
          trigger_keyword?: string
          updated_at?: string
          webhook_token?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "campaign_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      carousel_models: {
        Row: {
          audience: string
          brand_color: string | null
          created_at: string
          id: string
          name: string
          niche: string
          objective: string
          organization_id: string
          people_in_images: string
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audience?: string
          brand_color?: string | null
          created_at?: string
          id?: string
          name: string
          niche: string
          objective?: string
          organization_id: string
          people_in_images?: string
          tone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audience?: string
          brand_color?: string | null
          created_at?: string
          id?: string
          name?: string
          niche?: string
          objective?: string
          organization_id?: string
          people_in_images?: string
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      carousel_slides: {
        Row: {
          accent_color: string | null
          bg_color: string | null
          body: string | null
          body_size: number | null
          carousel_id: string
          created_at: string
          font_family: string | null
          has_image: boolean
          id: string
          image_prompt: string | null
          image_theme: string | null
          image_url: string | null
          order: number
          overlay_intensity: number | null
          overlay_position: string | null
          text_align: string | null
          text_color: string | null
          text_position: string | null
          title: string | null
          title_bold: boolean | null
          title_size: number | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          bg_color?: string | null
          body?: string | null
          body_size?: number | null
          carousel_id: string
          created_at?: string
          font_family?: string | null
          has_image?: boolean
          id?: string
          image_prompt?: string | null
          image_theme?: string | null
          image_url?: string | null
          order: number
          overlay_intensity?: number | null
          overlay_position?: string | null
          text_align?: string | null
          text_color?: string | null
          text_position?: string | null
          title?: string | null
          title_bold?: boolean | null
          title_size?: number | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          bg_color?: string | null
          body?: string | null
          body_size?: number | null
          carousel_id?: string
          created_at?: string
          font_family?: string | null
          has_image?: boolean
          id?: string
          image_prompt?: string | null
          image_theme?: string | null
          image_url?: string | null
          order?: number
          overlay_intensity?: number | null
          overlay_position?: string | null
          text_align?: string | null
          text_color?: string | null
          text_position?: string | null
          title?: string | null
          title_bold?: boolean | null
          title_size?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carousel_slides_carousel_id_fkey"
            columns: ["carousel_id"]
            isOneToOne: false
            referencedRelation: "carousels"
            referencedColumns: ["id"]
          },
        ]
      }
      carousels: {
        Row: {
          audience: string | null
          brand_color: string | null
          created_at: string
          id: string
          image_style: string
          instagram_media_id: string | null
          model_id: string | null
          niche: string | null
          objective: string | null
          organization_id: string
          people_in_images: string | null
          prompt: string
          slide_count: number
          status: string
          tone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audience?: string | null
          brand_color?: string | null
          created_at?: string
          id?: string
          image_style?: string
          instagram_media_id?: string | null
          model_id?: string | null
          niche?: string | null
          objective?: string | null
          organization_id: string
          people_in_images?: string | null
          prompt: string
          slide_count: number
          status?: string
          tone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audience?: string | null
          brand_color?: string | null
          created_at?: string
          id?: string
          image_style?: string
          instagram_media_id?: string | null
          model_id?: string | null
          niche?: string | null
          objective?: string | null
          organization_id?: string
          people_in_images?: string | null
          prompt?: string
          slide_count?: number
          status?: string
          tone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carousels_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "carousel_models"
            referencedColumns: ["id"]
          },
        ]
      }
      case_activity_log: {
        Row: {
          action: string
          actor_id: string | null
          case_id: string
          created_at: string
          id: string
          organization_id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          case_id: string
          created_at?: string
          id?: string
          organization_id: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          case_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "case_activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_activity_log_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_activity_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          kind: string
          name: string
          organization_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          kind: string
          name: string
          organization_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          kind?: string
          name?: string
          organization_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_deadlines: {
        Row: {
          case_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string
          id: string
          is_fatal: boolean
          notify_days_before: number
          organization_id: string
          title: string
          updated_at: string
        }
        Insert: {
          case_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date: string
          id?: string
          is_fatal?: boolean
          notify_days_before?: number
          organization_id: string
          title: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string
          id?: string
          is_fatal?: boolean
          notify_days_before?: number
          organization_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_deadlines_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_deadlines_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_deadlines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_deadlines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_statuses: {
        Row: {
          category_id: string | null
          color: string
          created_at: string
          id: string
          is_closed: boolean
          is_default: boolean
          name: string
          order: number
          organization_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          category_id?: string | null
          color?: string
          created_at?: string
          id?: string
          is_closed?: boolean
          is_default?: boolean
          name: string
          order?: number
          organization_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          category_id?: string | null
          color?: string
          created_at?: string
          id?: string
          is_closed?: boolean
          is_default?: boolean
          name?: string
          order?: number
          organization_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_statuses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "case_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_statuses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_statuses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      case_task_notifications: {
        Row: {
          case_task_id: string | null
          created_at: string
          id: string
          notify_channel: string
          notify_days_before: number
          notify_on_create: boolean
          notify_on_overdue: boolean
          organization_id: string
          template_task_id: string | null
          updated_at: string
        }
        Insert: {
          case_task_id?: string | null
          created_at?: string
          id?: string
          notify_channel?: string
          notify_days_before?: number
          notify_on_create?: boolean
          notify_on_overdue?: boolean
          organization_id: string
          template_task_id?: string | null
          updated_at?: string
        }
        Update: {
          case_task_id?: string | null
          created_at?: string
          id?: string
          notify_channel?: string
          notify_days_before?: number
          notify_on_create?: boolean
          notify_on_overdue?: boolean
          organization_id?: string
          template_task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_task_notifications_case_task_id_fkey"
            columns: ["case_task_id"]
            isOneToOne: false
            referencedRelation: "case_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_task_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_task_notifications_template_task_id_fkey"
            columns: ["template_task_id"]
            isOneToOne: false
            referencedRelation: "case_template_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      case_tasks: {
        Row: {
          assignee_id: string | null
          case_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          is_mandatory: boolean
          order: number
          organization_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          case_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_mandatory?: boolean
          order?: number
          organization_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          case_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_mandatory?: boolean
          order?: number
          organization_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_template_tasks: {
        Row: {
          created_at: string
          days_to_due: number
          default_time: string | null
          description: string | null
          id: string
          is_mandatory: boolean
          order: number
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          days_to_due?: number
          default_time?: string | null
          description?: string | null
          id?: string
          is_mandatory?: boolean
          order?: number
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          days_to_due?: number
          default_time?: string | null
          description?: string | null
          id?: string
          is_mandatory?: boolean
          order?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "case_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      case_templates: {
        Row: {
          category_id: string | null
          created_at: string
          default_administrative_data: Json
          default_assignee_id: string | null
          default_judicial_data: Json
          default_status_id: string | null
          description: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          organization_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          default_administrative_data?: Json
          default_assignee_id?: string | null
          default_judicial_data?: Json
          default_status_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          kind: string
          name: string
          organization_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          default_administrative_data?: Json
          default_assignee_id?: string | null
          default_judicial_data?: Json
          default_status_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          organization_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "case_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_templates_default_assignee_id_fkey"
            columns: ["default_assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_templates_default_status_id_fkey"
            columns: ["default_status_id"]
            isOneToOne: false
            referencedRelation: "case_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      case_triggers: {
        Row: {
          column_id: string
          created_at: string
          default_assignee_id: string | null
          id: string
          is_active: boolean
          organization_id: string
          pipeline_id: string
          template_id: string
          updated_at: string
        }
        Insert: {
          column_id: string
          created_at?: string
          default_assignee_id?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          pipeline_id: string
          template_id: string
          updated_at?: string
        }
        Update: {
          column_id?: string
          created_at?: string
          default_assignee_id?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          pipeline_id?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_triggers_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "pipeline_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_triggers_default_assignee_id_fkey"
            columns: ["default_assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_triggers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_triggers_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_triggers_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "case_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          administrative_data: Json
          assignee_id: string | null
          category_id: string | null
          closed_at: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          judicial_data: Json
          kind: string
          metadata: Json
          opened_at: string
          organization_id: string
          priority: string
          status_id: string | null
          template_id: string | null
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          administrative_data?: Json
          assignee_id?: string | null
          category_id?: string | null
          closed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          judicial_data?: Json
          kind: string
          metadata?: Json
          opened_at?: string
          organization_id: string
          priority?: string
          status_id?: string | null
          template_id?: string | null
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          administrative_data?: Json
          assignee_id?: string | null
          category_id?: string | null
          closed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          judicial_data?: Json
          kind?: string
          metadata?: Json
          opened_at?: string
          organization_id?: string
          priority?: string
          status_id?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "case_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "case_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "case_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_files: {
        Row: {
          contact_id: string
          created_at: string
          created_by: string | null
          file_size: number | null
          file_type: string
          file_url: string
          folder_id: string | null
          id: string
          message_id: string | null
          name: string
          organization_id: string
          storage_path: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          created_by?: string | null
          file_size?: number | null
          file_type: string
          file_url: string
          folder_id?: string | null
          id?: string
          message_id?: string | null
          name: string
          organization_id: string
          storage_path?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          created_by?: string | null
          file_size?: number | null
          file_type?: string
          file_url?: string
          folder_id?: string | null
          id?: string
          message_id?: string | null
          name?: string
          organization_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_files_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "contact_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_files_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_folders: {
        Row: {
          contact_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_folders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_folders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_notes: {
        Row: {
          contact_id: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_presence: {
        Row: {
          contact_id: string
          expires_at: string
          id: string
          organization_id: string
          presence_type: string
          started_at: string
        }
        Insert: {
          contact_id: string
          expires_at?: string
          id?: string
          organization_id: string
          presence_type: string
          started_at?: string
        }
        Update: {
          contact_id?: string
          expires_at?: string
          id?: string
          organization_id?: string
          presence_type?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_presence_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_presence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          added_by: string | null
          added_by_type: string
          contact_id: string
          created_at: string
          id: string
          tag_id: string
        }
        Insert: {
          added_by?: string | null
          added_by_type?: string
          contact_id: string
          created_at?: string
          id?: string
          tag_id: string
        }
        Update: {
          added_by?: string | null
          added_by_type?: string
          contact_id?: string
          created_at?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          metadata: Json | null
          name: string | null
          organization_id: string
          phone: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          organization_id: string
          phone: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          organization_id?: string
          phone?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts_backup_20260701: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          id: string | null
          metadata: Json | null
          name: string | null
          organization_id: string | null
          phone: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          metadata?: Json | null
          name?: string | null
          organization_id?: string | null
          phone?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          metadata?: Json | null
          name?: string | null
          organization_id?: string | null
          phone?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      conversation_origin_audit: {
        Row: {
          captured_at: string
          captured_from: string
          connected_phone: string | null
          connected_phone_digits: string | null
          conversation_id: string
          id: string
          message_id: string | null
          metadata: Json
          organization_id: string
          provider: string | null
          provider_instance_id: string | null
          provider_instance_name: string | null
          whatsapp_instance_id: string | null
        }
        Insert: {
          captured_at?: string
          captured_from?: string
          connected_phone?: string | null
          connected_phone_digits?: string | null
          conversation_id: string
          id?: string
          message_id?: string | null
          metadata?: Json
          organization_id: string
          provider?: string | null
          provider_instance_id?: string | null
          provider_instance_name?: string | null
          whatsapp_instance_id?: string | null
        }
        Update: {
          captured_at?: string
          captured_from?: string
          connected_phone?: string | null
          connected_phone_digits?: string | null
          conversation_id?: string
          id?: string
          message_id?: string | null
          metadata?: Json
          organization_id?: string
          provider?: string | null
          provider_instance_id?: string | null
          provider_instance_name?: string | null
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_origin_audit_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_origin_audit_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_origin_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_origin_audit_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_pipeline_positions: {
        Row: {
          column_id: string
          conversation_id: string
          created_at: string
          id: string
          order: number
          pipeline_id: string
          updated_at: string
        }
        Insert: {
          column_id: string
          conversation_id: string
          created_at?: string
          id?: string
          order?: number
          pipeline_id: string
          updated_at?: string
        }
        Update: {
          column_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          order?: number
          pipeline_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_pipeline_positions_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "pipeline_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_pipeline_positions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_pipeline_positions_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_shares: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          note: string | null
          organization_id: string
          shared_by: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          note?: string | null
          organization_id: string
          shared_by?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          note?: string | null
          organization_id?: string
          shared_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_shares_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_shares_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_stage_history: {
        Row: {
          changed_by: string | null
          changed_by_type: string
          conversation_id: string
          created_at: string
          from_column_id: string | null
          id: string
          organization_id: string
          pipeline_id: string
          to_column_id: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_type?: string
          conversation_id: string
          created_at?: string
          from_column_id?: string | null
          id?: string
          organization_id: string
          pipeline_id: string
          to_column_id: string
        }
        Update: {
          changed_by?: string | null
          changed_by_type?: string
          conversation_id?: string
          created_at?: string
          from_column_id?: string | null
          id?: string
          organization_id?: string
          pipeline_id?: string
          to_column_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_stage_history_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_stage_history_from_column_id_fkey"
            columns: ["from_column_id"]
            isOneToOne: false
            referencedRelation: "pipeline_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_stage_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_stage_history_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_stage_history_to_column_id_fkey"
            columns: ["to_column_id"]
            isOneToOne: false
            referencedRelation: "pipeline_columns"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_statuses: {
        Row: {
          color: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          order: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          order?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          order?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_statuses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_agent_id: string | null
          assigned_to: string | null
          closed_at: string | null
          contact_id: string
          conversation_status_id: string | null
          created_at: string
          department_id: string | null
          hidden_by_disconnect: boolean
          id: string
          intervened_at: string | null
          intervened_by: string | null
          last_message_at: string | null
          last_message_direction: string | null
          last_synced_at: string | null
          lead_source_id: string | null
          metadata: Json | null
          oldest_synced_message_id: string | null
          organization_id: string
          service_mode: Database["public"]["Enums"]["service_mode"]
          source_phone: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          unread_count: number
          updated_at: string
          whatsapp_instance_id: string | null
          workspace_id: string | null
        }
        Insert: {
          ai_agent_id?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          contact_id: string
          conversation_status_id?: string | null
          created_at?: string
          department_id?: string | null
          hidden_by_disconnect?: boolean
          id?: string
          intervened_at?: string | null
          intervened_by?: string | null
          last_message_at?: string | null
          last_message_direction?: string | null
          last_synced_at?: string | null
          lead_source_id?: string | null
          metadata?: Json | null
          oldest_synced_message_id?: string | null
          organization_id: string
          service_mode?: Database["public"]["Enums"]["service_mode"]
          source_phone?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
          whatsapp_instance_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          ai_agent_id?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          contact_id?: string
          conversation_status_id?: string | null
          created_at?: string
          department_id?: string | null
          hidden_by_disconnect?: boolean
          id?: string
          intervened_at?: string | null
          intervened_by?: string | null
          last_message_at?: string | null
          last_message_direction?: string | null
          last_synced_at?: string | null
          lead_source_id?: string | null
          metadata?: Json | null
          oldest_synced_message_id?: string | null
          organization_id?: string
          service_mode?: Database["public"]["Enums"]["service_mode"]
          source_phone?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
          whatsapp_instance_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_ai_agent_id_fkey"
            columns: ["ai_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_conversation_status_id_fkey"
            columns: ["conversation_status_id"]
            isOneToOne: false
            referencedRelation: "conversation_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_intervened_by_fkey"
            columns: ["intervened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_source_id_fkey"
            columns: ["lead_source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_entries: {
        Row: {
          contact_id: string
          created_at: string
          custom_fields: Json
          id: string
          organization_id: string
          synced_to_uazapi: boolean
          uazapi_crm_id: string | null
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          custom_fields?: Json
          id?: string
          organization_id: string
          synced_to_uazapi?: boolean
          uazapi_crm_id?: string | null
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          custom_fields?: Json
          id?: string
          organization_id?: string
          synced_to_uazapi?: boolean
          uazapi_crm_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_entries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          color: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          order: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          order?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          order?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_folders: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          organization_id: string
          position: number | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          organization_id: string
          position?: number | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          organization_id?: string
          position?: number | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_packs: {
        Row: {
          auto_send_whatsapp: boolean | null
          created_at: string
          created_by: string | null
          default_signers: Json | null
          description: string | null
          field_config: Json | null
          filler_auth_methods: Json
          filler_field_mapping: Json
          filler_signs: boolean
          folder_id: string | null
          id: string
          name: string
          organization_id: string
          public_token: string | null
          template_ids: string[]
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          auto_send_whatsapp?: boolean | null
          created_at?: string
          created_by?: string | null
          default_signers?: Json | null
          description?: string | null
          field_config?: Json | null
          filler_auth_methods?: Json
          filler_field_mapping?: Json
          filler_signs?: boolean
          folder_id?: string | null
          id?: string
          name: string
          organization_id: string
          public_token?: string | null
          template_ids?: string[]
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          auto_send_whatsapp?: boolean | null
          created_at?: string
          created_by?: string | null
          default_signers?: Json | null
          description?: string | null
          field_config?: Json | null
          filler_auth_methods?: Json
          filler_field_mapping?: Json
          filler_signs?: boolean
          folder_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          public_token?: string | null
          template_ids?: string[]
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_packs_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_packs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_packs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signatures: {
        Row: {
          archived_at: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          external_id: string | null
          generated_document_id: string
          id: string
          metadata: Json | null
          organization_id: string
          sent_at: string | null
          signature_token: string | null
          signature_url: string | null
          signed_at: string | null
          signed_pdf_url: string | null
          signer_cpf: string | null
          signer_email: string | null
          signer_name: string | null
          signer_phone: string | null
          signing_method: string
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          external_id?: string | null
          generated_document_id: string
          id?: string
          metadata?: Json | null
          organization_id: string
          sent_at?: string | null
          signature_token?: string | null
          signature_url?: string | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          signer_cpf?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_phone?: string | null
          signing_method?: string
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          external_id?: string | null
          generated_document_id?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          sent_at?: string | null
          signature_token?: string | null
          signature_url?: string | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          signer_cpf?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_phone?: string | null
          signing_method?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_signatures_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signatures_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signatures_generated_document_id_fkey"
            columns: ["generated_document_id"]
            isOneToOne: false
            referencedRelation: "generated_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signatures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signers: {
        Row: {
          auth_methods: Json
          created_at: string
          created_by: string | null
          data_source: string
          field_mapping: Json
          generated_document_id: string
          id: string
          metadata: Json
          order: number
          organization_id: string
          pack_id: string | null
          sent_at: string | null
          signature_id: string | null
          signature_token: string | null
          signed_at: string | null
          signer_cpf: string | null
          signer_email: string | null
          signer_name: string
          signer_phone: string | null
          signer_role: string | null
          signing_method: string
          status: string
          updated_at: string
        }
        Insert: {
          auth_methods?: Json
          created_at?: string
          created_by?: string | null
          data_source?: string
          field_mapping?: Json
          generated_document_id: string
          id?: string
          metadata?: Json
          order?: number
          organization_id: string
          pack_id?: string | null
          sent_at?: string | null
          signature_id?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signer_cpf?: string | null
          signer_email?: string | null
          signer_name: string
          signer_phone?: string | null
          signer_role?: string | null
          signing_method?: string
          status?: string
          updated_at?: string
        }
        Update: {
          auth_methods?: Json
          created_at?: string
          created_by?: string | null
          data_source?: string
          field_mapping?: Json
          generated_document_id?: string
          id?: string
          metadata?: Json
          order?: number
          organization_id?: string
          pack_id?: string | null
          sent_at?: string | null
          signature_id?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signer_cpf?: string | null
          signer_email?: string | null
          signer_name?: string
          signer_phone?: string | null
          signer_role?: string | null
          signing_method?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_signers_generated_document_id_fkey"
            columns: ["generated_document_id"]
            isOneToOne: false
            referencedRelation: "generated_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signers_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "document_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signers_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "document_signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          auto_send_whatsapp: boolean | null
          category: string | null
          content: string
          content_html: string | null
          created_at: string
          created_by: string | null
          default_signers: Json | null
          default_signing_method: string | null
          description: string | null
          fields: Json
          filler_auth_methods: Json
          filler_field_mapping: Json
          filler_signs: boolean
          folder_id: string | null
          id: string
          logo_url: string | null
          name: string
          organization_id: string
          original_file_url: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          auto_send_whatsapp?: boolean | null
          category?: string | null
          content?: string
          content_html?: string | null
          created_at?: string
          created_by?: string | null
          default_signers?: Json | null
          default_signing_method?: string | null
          description?: string | null
          fields?: Json
          filler_auth_methods?: Json
          filler_field_mapping?: Json
          filler_signs?: boolean
          folder_id?: string | null
          id?: string
          logo_url?: string | null
          name: string
          organization_id: string
          original_file_url?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          auto_send_whatsapp?: boolean | null
          category?: string | null
          content?: string
          content_html?: string | null
          created_at?: string
          created_by?: string | null
          default_signers?: Json | null
          default_signing_method?: string | null
          description?: string | null
          fields?: Json
          filler_auth_methods?: Json
          filler_field_mapping?: Json
          filler_signs?: boolean
          folder_id?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          organization_id?: string
          original_file_url?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_backup_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          data_size_bytes: number | null
          error_message: string | null
          file_count: number | null
          id: string
          organization_id: string
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          data_size_bytes?: number | null
          error_message?: string | null
          file_count?: number | null
          id?: string
          organization_id: string
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          data_size_bytes?: number | null
          error_message?: string | null
          file_count?: number | null
          id?: string
          organization_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "drive_backup_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_configs: {
        Row: {
          backup_frequency: string
          backup_includes: Json
          created_at: string
          folder_id: string | null
          google_access_token: string | null
          google_email: string | null
          google_refresh_token: string | null
          id: string
          is_connected: boolean
          last_backup_at: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          backup_frequency?: string
          backup_includes?: Json
          created_at?: string
          folder_id?: string | null
          google_access_token?: string | null
          google_email?: string | null
          google_refresh_token?: string | null
          id?: string
          is_connected?: boolean
          last_backup_at?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          backup_frequency?: string
          backup_includes?: Json
          created_at?: string
          folder_id?: string | null
          google_access_token?: string | null
          google_email?: string | null
          google_refresh_token?: string | null
          id?: string
          is_connected?: boolean
          last_backup_at?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drive_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_flow_assignments: {
        Row: {
          created_at: string
          experiment_id: string
          id: string
          organization_id: string | null
          user_id: string | null
          variant_id: string
          visitor_id: string
        }
        Insert: {
          created_at?: string
          experiment_id: string
          id?: string
          organization_id?: string | null
          user_id?: string | null
          variant_id: string
          visitor_id: string
        }
        Update: {
          created_at?: string
          experiment_id?: string
          id?: string
          organization_id?: string | null
          user_id?: string | null
          variant_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_flow_assignments_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "entry_flow_experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_flow_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_flow_assignments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "entry_flow_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_flow_events: {
        Row: {
          created_at: string
          event_name: string
          experiment_id: string | null
          id: string
          metadata: Json
          organization_id: string | null
          user_id: string | null
          variant_id: string | null
          visitor_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          experiment_id?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          user_id?: string | null
          variant_id?: string | null
          visitor_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          experiment_id?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
          user_id?: string | null
          variant_id?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_flow_events_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "entry_flow_experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_flow_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_flow_events_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "entry_flow_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_flow_experiments: {
        Row: {
          audience: Json
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          name: string
          primary_metric: string
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          audience?: Json
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          name: string
          primary_metric?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          audience?: Json
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          name?: string
          primary_metric?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      entry_flow_variants: {
        Row: {
          config: Json
          created_at: string
          experiment_id: string
          flow_type: string
          id: string
          is_control: boolean
          name: string
          traffic_percent: number
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          experiment_id: string
          flow_type: string
          id?: string
          is_control?: boolean
          name: string
          traffic_percent?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          experiment_id?: string
          flow_type?: string
          id?: string
          is_control?: boolean
          name?: string
          traffic_percent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_flow_variants_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "entry_flow_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      external_participants: {
        Row: {
          company: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_participants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_executions: {
        Row: {
          completed_at: string | null
          conversation_id: string
          current_node_id: string | null
          error_message: string | null
          execution_log: Json | null
          flow_id: string
          id: string
          organization_id: string
          remarketing_step: number
          started_at: string
          status: string
          timeout_at: string | null
          variables: Json | null
        }
        Insert: {
          completed_at?: string | null
          conversation_id: string
          current_node_id?: string | null
          error_message?: string | null
          execution_log?: Json | null
          flow_id: string
          id?: string
          organization_id: string
          remarketing_step?: number
          started_at?: string
          status?: string
          timeout_at?: string | null
          variables?: Json | null
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string
          current_node_id?: string | null
          error_message?: string | null
          execution_log?: Json | null
          flow_id?: string
          id?: string
          organization_id?: string
          remarketing_step?: number
          started_at?: string
          status?: string
          timeout_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_executions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_executions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_executions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          position: number | null
          updated_at: string
          visible_in_chat: boolean | null
          workspace_id: string | null
          workspace_ids: string[] | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          position?: number | null
          updated_at?: string
          visible_in_chat?: boolean | null
          workspace_id?: string | null
          workspace_ids?: string[] | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          position?: number | null
          updated_at?: string
          visible_in_chat?: boolean | null
          workspace_id?: string | null
          workspace_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_folders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "flow_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_node_logs: {
        Row: {
          conversation_id: string | null
          created_at: string
          flow_execution_id: string | null
          id: string
          input_data: Json | null
          node_id: string
          node_name: string | null
          node_type: string | null
          organization_id: string | null
          output_data: Json | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          flow_execution_id?: string | null
          id?: string
          input_data?: Json | null
          node_id: string
          node_name?: string | null
          node_type?: string | null
          organization_id?: string | null
          output_data?: Json | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          flow_execution_id?: string | null
          id?: string
          input_data?: Json | null
          node_id?: string
          node_name?: string | null
          node_type?: string | null
          organization_id?: string | null
          output_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_node_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_node_logs_flow_execution_id_fkey"
            columns: ["flow_execution_id"]
            isOneToOne: false
            referencedRelation: "flow_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_node_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      flows: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          edges: Json
          folder_id: string | null
          id: string
          is_active: boolean
          is_master_active: boolean | null
          master_prompt: string | null
          name: string
          nodes: Json
          organization_id: string
          position: number | null
          trigger_config: Json | null
          trigger_type: string
          triggers_count: number
          updated_at: string
          variables: Json | null
          visible_in_chat: boolean | null
          workspace_id: string | null
          workspace_ids: string[] | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          edges?: Json
          folder_id?: string | null
          id?: string
          is_active?: boolean
          is_master_active?: boolean | null
          master_prompt?: string | null
          name: string
          nodes?: Json
          organization_id: string
          position?: number | null
          trigger_config?: Json | null
          trigger_type?: string
          triggers_count?: number
          updated_at?: string
          variables?: Json | null
          visible_in_chat?: boolean | null
          workspace_id?: string | null
          workspace_ids?: string[] | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          edges?: Json
          folder_id?: string | null
          id?: string
          is_active?: boolean
          is_master_active?: boolean | null
          master_prompt?: string | null
          name?: string
          nodes?: Json
          organization_id?: string
          position?: number | null
          trigger_config?: Json | null
          trigger_type?: string
          triggers_count?: number
          updated_at?: string
          variables?: Json | null
          visible_in_chat?: boolean | null
          workspace_id?: string | null
          workspace_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "flows_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "flow_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          move_column_id: string | null
          move_pipeline_id: string | null
          name: string
          organization_id: string
          quiet_end: string
          quiet_hours: boolean
          quiet_start: string
          steps: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          move_column_id?: string | null
          move_pipeline_id?: string | null
          name: string
          organization_id: string
          quiet_end?: string
          quiet_hours?: boolean
          quiet_start?: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          move_column_id?: string | null
          move_pipeline_id?: string | null
          name?: string
          organization_id?: string
          quiet_end?: string
          quiet_hours?: boolean
          quiet_start?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_documents: {
        Row: {
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          fill_mode: string
          filled_data: Json
          form_filled_at: string | null
          id: string
          is_filled: boolean
          name: string
          organization_id: string
          pack_id: string | null
          pdf_url: string | null
          public_fill_token: string | null
          signature_config: Json | null
          signed_at: string | null
          signed_pdf_url: string | null
          signing_method: string | null
          signing_status: string | null
          source_kind: string | null
          status: string
          submission_group: string | null
          submitted_by: Json | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          fill_mode?: string
          filled_data?: Json
          form_filled_at?: string | null
          id?: string
          is_filled?: boolean
          name: string
          organization_id: string
          pack_id?: string | null
          pdf_url?: string | null
          public_fill_token?: string | null
          signature_config?: Json | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          signing_method?: string | null
          signing_status?: string | null
          source_kind?: string | null
          status?: string
          submission_group?: string | null
          submitted_by?: Json | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          fill_mode?: string
          filled_data?: Json
          form_filled_at?: string | null
          id?: string
          is_filled?: boolean
          name?: string
          organization_id?: string
          pack_id?: string | null
          pdf_url?: string | null
          public_fill_token?: string | null
          signature_config?: Json | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          signing_method?: string | null
          signing_status?: string | null
          source_kind?: string | null
          status?: string
          submission_group?: string | null
          submitted_by?: Json | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "document_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_action_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          performed_by?: string | null
        }
        Relationships: []
      }
      governance_certifications: {
        Row: {
          created_at: string
          id: string
          issued_at: string
          revoke_reason: string | null
          revoked_at: string | null
          score: number
          security_score: number
          snapshot: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          issued_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          score: number
          security_score: number
          snapshot?: Json | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          issued_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          score?: number
          security_score?: number
          snapshot?: Json | null
          status?: string
        }
        Relationships: []
      }
      governance_checks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_blocker: boolean
          name: string
          notes: string | null
          phase: string
          status: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_blocker?: boolean
          name: string
          notes?: string | null
          phase: string
          status?: string
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_blocker?: boolean
          name?: string
          notes?: string | null
          phase?: string
          status?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      governance_prompt_versions: {
        Row: {
          changed_by: string | null
          content: string
          created_at: string
          id: string
          prompt_id: string
          reason: string | null
          version: number
        }
        Insert: {
          changed_by?: string | null
          content: string
          created_at?: string
          id?: string
          prompt_id: string
          reason?: string | null
          version?: number
        }
        Update: {
          changed_by?: string | null
          content?: string
          created_at?: string
          id?: string
          prompt_id?: string
          reason?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "governance_prompt_versions_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "governance_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_prompts: {
        Row: {
          category: string
          content: string
          created_at: string
          criticality: string
          description: string | null
          id: string
          is_generic: boolean | null
          name: string
          related_files: string[] | null
          related_functions: string[] | null
          related_tables: string[] | null
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          criticality?: string
          description?: string | null
          id?: string
          is_generic?: boolean | null
          name: string
          related_files?: string[] | null
          related_functions?: string[] | null
          related_tables?: string[] | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          criticality?: string
          description?: string | null
          id?: string
          is_generic?: boolean | null
          name?: string
          related_files?: string[] | null
          related_functions?: string[] | null
          related_tables?: string[] | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      governance_score_history: {
        Row: {
          backend_score: number
          continuity_score: number
          governance_dim_score: number
          help_score: number
          id: string
          recorded_at: string
          security_score: number
          total_score: number
          ux_score: number
        }
        Insert: {
          backend_score?: number
          continuity_score?: number
          governance_dim_score?: number
          help_score?: number
          id?: string
          recorded_at?: string
          security_score?: number
          total_score: number
          ux_score?: number
        }
        Update: {
          backend_score?: number
          continuity_score?: number
          governance_dim_score?: number
          help_score?: number
          id?: string
          recorded_at?: string
          security_score?: number
          total_score?: number
          ux_score?: number
        }
        Relationships: []
      }
      governance_snapshots: {
        Row: {
          created_at: string
          id: string
          is_certified: boolean | null
          risk_level: string | null
          score_backend: number | null
          score_continuity: number | null
          score_governance: number | null
          score_help: number | null
          score_security: number | null
          score_total: number
          score_ux: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_certified?: boolean | null
          risk_level?: string | null
          score_backend?: number | null
          score_continuity?: number | null
          score_governance?: number | null
          score_help?: number | null
          score_security?: number | null
          score_total?: number
          score_ux?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_certified?: boolean | null
          risk_level?: string | null
          score_backend?: number | null
          score_continuity?: number | null
          score_governance?: number | null
          score_help?: number | null
          score_security?: number | null
          score_total?: number
          score_ux?: number | null
        }
        Relationships: []
      }
      instagram_accounts: {
        Row: {
          connected_at: string | null
          created_at: string
          default_assignee_id: string | null
          default_conversation_status_id: string | null
          default_department_id: string | null
          disconnected_at: string | null
          facebook_page_id: string | null
          id: string
          ig_business_account_id: string | null
          ig_name: string | null
          ig_profile_pic_url: string | null
          ig_username: string | null
          is_active: boolean
          label: string | null
          long_lived_user_token: string | null
          organization_id: string
          page_access_token: string | null
          scopes: string[]
          status: Database["public"]["Enums"]["instagram_account_status"]
          token_expires_at: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          default_assignee_id?: string | null
          default_conversation_status_id?: string | null
          default_department_id?: string | null
          disconnected_at?: string | null
          facebook_page_id?: string | null
          id?: string
          ig_business_account_id?: string | null
          ig_name?: string | null
          ig_profile_pic_url?: string | null
          ig_username?: string | null
          is_active?: boolean
          label?: string | null
          long_lived_user_token?: string | null
          organization_id: string
          page_access_token?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["instagram_account_status"]
          token_expires_at?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          default_assignee_id?: string | null
          default_conversation_status_id?: string | null
          default_department_id?: string | null
          disconnected_at?: string | null
          facebook_page_id?: string | null
          id?: string
          ig_business_account_id?: string | null
          ig_name?: string | null
          ig_profile_pic_url?: string | null
          ig_username?: string | null
          is_active?: boolean
          label?: string | null
          long_lived_user_token?: string | null
          organization_id?: string
          page_access_token?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["instagram_account_status"]
          token_expires_at?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_accounts_default_conversation_status_id_fkey"
            columns: ["default_conversation_status_id"]
            isOneToOne: false
            referencedRelation: "conversation_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_accounts_default_department_id_fkey"
            columns: ["default_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_automation_rules: {
        Row: {
          actions: Json
          created_at: string
          id: string
          instagram_account_id: string
          is_active: boolean
          name: string
          organization_id: string
          rate_limit: Json
          trigger_config: Json
          trigger_type: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          actions?: Json
          created_at?: string
          id?: string
          instagram_account_id: string
          is_active?: boolean
          name: string
          organization_id: string
          rate_limit?: Json
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          actions?: Json
          created_at?: string
          id?: string
          instagram_account_id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          rate_limit?: Json
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_automation_rules_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_automation_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_automation_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_contact_tags: {
        Row: {
          added_by: string | null
          added_by_type: string
          created_at: string
          id: string
          instagram_contact_id: string
          tag_id: string
        }
        Insert: {
          added_by?: string | null
          added_by_type?: string
          created_at?: string
          id?: string
          instagram_contact_id: string
          tag_id: string
        }
        Update: {
          added_by?: string | null
          added_by_type?: string
          created_at?: string
          id?: string
          instagram_contact_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_contact_tags_instagram_contact_id_fkey"
            columns: ["instagram_contact_id"]
            isOneToOne: false
            referencedRelation: "instagram_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_contacts: {
        Row: {
          created_at: string
          id: string
          igsid: string
          instagram_account_id: string
          metadata: Json
          name: string | null
          organization_id: string
          profile_pic_url: string | null
          updated_at: string
          username: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          igsid: string
          instagram_account_id: string
          metadata?: Json
          name?: string | null
          organization_id: string
          profile_pic_url?: string | null
          updated_at?: string
          username?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          igsid?: string
          instagram_account_id?: string
          metadata?: Json
          name?: string | null
          organization_id?: string
          profile_pic_url?: string | null
          updated_at?: string
          username?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_contacts_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_conversations: {
        Row: {
          ai_agent_id: string | null
          assigned_to: string | null
          contact_id: string
          conversation_status_id: string | null
          created_at: string
          department_id: string | null
          id: string
          instagram_account_id: string
          last_message_at: string | null
          last_message_direction:
            | Database["public"]["Enums"]["message_direction"]
            | null
          metadata: Json
          organization_id: string
          status: Database["public"]["Enums"]["conversation_status"]
          unread_count: number
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          ai_agent_id?: string | null
          assigned_to?: string | null
          contact_id: string
          conversation_status_id?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          instagram_account_id: string
          last_message_at?: string | null
          last_message_direction?:
            | Database["public"]["Enums"]["message_direction"]
            | null
          metadata?: Json
          organization_id: string
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          ai_agent_id?: string | null
          assigned_to?: string | null
          contact_id?: string
          conversation_status_id?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          instagram_account_id?: string
          last_message_at?: string | null
          last_message_direction?:
            | Database["public"]["Enums"]["message_direction"]
            | null
          metadata?: Json
          organization_id?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_conversations_ai_agent_id_fkey"
            columns: ["ai_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "instagram_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_conversations_conversation_status_id_fkey"
            columns: ["conversation_status_id"]
            isOneToOne: false
            referencedRelation: "conversation_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_conversations_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          error_message: string | null
          failed_at: string | null
          id: string
          ig_message_id: string | null
          is_from_bot: boolean
          media_url: string | null
          metadata: Json
          read_at: string | null
          sent_by: string | null
          type: Database["public"]["Enums"]["instagram_message_type"]
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          failed_at?: string | null
          id?: string
          ig_message_id?: string | null
          is_from_bot?: boolean
          media_url?: string | null
          metadata?: Json
          read_at?: string | null
          sent_by?: string | null
          type?: Database["public"]["Enums"]["instagram_message_type"]
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          failed_at?: string | null
          id?: string
          ig_message_id?: string | null
          is_from_bot?: boolean
          media_url?: string | null
          metadata?: Json
          read_at?: string | null
          sent_by?: string | null
          type?: Database["public"]["Enums"]["instagram_message_type"]
        }
        Relationships: [
          {
            foreignKeyName: "instagram_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "instagram_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_pending_followups: {
        Row: {
          contact_id: string
          conversation_id: string | null
          created_at: string
          error: string | null
          followup_config: Json
          id: string
          organization_id: string
          processed_at: string | null
          resume_at: string
          rule_id: string
          status: string
          tracked_link_id: string | null
        }
        Insert: {
          contact_id: string
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          followup_config?: Json
          id?: string
          organization_id: string
          processed_at?: string | null
          resume_at: string
          rule_id: string
          status?: string
          tracked_link_id?: string | null
        }
        Update: {
          contact_id?: string
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          followup_config?: Json
          id?: string
          organization_id?: string
          processed_at?: string | null
          resume_at?: string
          rule_id?: string
          status?: string
          tracked_link_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_pending_followups_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "instagram_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_pending_followups_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "instagram_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_pending_followups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_pending_followups_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "instagram_automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_pending_followups_tracked_link_id_fkey"
            columns: ["tracked_link_id"]
            isOneToOne: false
            referencedRelation: "instagram_tracked_links"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_rule_executions: {
        Row: {
          contact_id: string | null
          created_at: string
          error: string | null
          id: string
          rule_id: string
          status: Database["public"]["Enums"]["instagram_execution_status"]
          steps: Json
          webhook_event_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          rule_id: string
          status: Database["public"]["Enums"]["instagram_execution_status"]
          steps?: Json
          webhook_event_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          rule_id?: string
          status?: Database["public"]["Enums"]["instagram_execution_status"]
          steps?: Json
          webhook_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_rule_executions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "instagram_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_rule_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "instagram_automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_rule_executions_webhook_event_id_fkey"
            columns: ["webhook_event_id"]
            isOneToOne: false
            referencedRelation: "instagram_webhook_events"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_tracked_links: {
        Row: {
          clicked_at: string | null
          contact_id: string | null
          created_at: string
          destination_url: string
          id: string
          organization_id: string
          rule_id: string | null
        }
        Insert: {
          clicked_at?: string | null
          contact_id?: string | null
          created_at?: string
          destination_url: string
          id?: string
          organization_id: string
          rule_id?: string | null
        }
        Update: {
          clicked_at?: string | null
          contact_id?: string | null
          created_at?: string
          destination_url?: string
          id?: string
          organization_id?: string
          rule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_tracked_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "instagram_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_tracked_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_tracked_links_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "instagram_automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          id: string
          instagram_account_id: string | null
          organization_id: string | null
          processed: boolean
          raw_payload: Json
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          instagram_account_id?: string | null
          organization_id?: string | null
          processed?: boolean
          raw_payload: Json
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          instagram_account_id?: string | null
          organization_id?: string | null
          processed?: boolean
          raw_payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "instagram_webhook_events_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_configs: {
        Row: {
          agents_model: string | null
          agents_provider: string | null
          ai_provider: string
          conversation_summary_model: string | null
          conversation_summary_provider: string | null
          created_at: string
          default_model: string
          flow_generation_model: string | null
          flow_generation_provider: string | null
          gemini_api_key: string | null
          id: string
          openai_api_key: string | null
          organization_id: string
          prompt_generation_model: string | null
          prompt_generation_provider: string | null
          transcription_model: string | null
          transcription_provider: string | null
          updated_at: string
        }
        Insert: {
          agents_model?: string | null
          agents_provider?: string | null
          ai_provider?: string
          conversation_summary_model?: string | null
          conversation_summary_provider?: string | null
          created_at?: string
          default_model?: string
          flow_generation_model?: string | null
          flow_generation_provider?: string | null
          gemini_api_key?: string | null
          id?: string
          openai_api_key?: string | null
          organization_id: string
          prompt_generation_model?: string | null
          prompt_generation_provider?: string | null
          transcription_model?: string | null
          transcription_provider?: string | null
          updated_at?: string
        }
        Update: {
          agents_model?: string | null
          agents_provider?: string | null
          ai_provider?: string
          conversation_summary_model?: string | null
          conversation_summary_provider?: string | null
          created_at?: string
          default_model?: string
          flow_generation_model?: string | null
          flow_generation_provider?: string | null
          gemini_api_key?: string | null
          id?: string
          openai_api_key?: string | null
          organization_id?: string
          prompt_generation_model?: string | null
          prompt_generation_provider?: string | null
          transcription_model?: string | null
          transcription_provider?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          color: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          order: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          order?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          order?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      master_prompts: {
        Row: {
          agent_rules: Json | null
          agent_sequence: Json | null
          content: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          niche: string
          organization_id: string
          trigger_keywords: Json | null
          trigger_tags: string[] | null
          trigger_type: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          agent_rules?: Json | null
          agent_sequence?: Json | null
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          niche?: string
          organization_id: string
          trigger_keywords?: Json | null
          trigger_tags?: string[] | null
          trigger_type?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          agent_rules?: Json | null
          agent_sequence?: Json | null
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          niche?: string
          organization_id?: string
          trigger_keywords?: Json | null
          trigger_tags?: string[] | null
          trigger_type?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "master_prompts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_prompts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      media_transcriptions: {
        Row: {
          created_at: string
          id: string
          media_type: string
          media_url: string
          message_id: string
          transcription: string
        }
        Insert: {
          created_at?: string
          id?: string
          media_type: string
          media_url: string
          message_id: string
          transcription: string
        }
        Update: {
          created_at?: string
          id?: string
          media_type?: string
          media_url?: string
          message_id?: string
          transcription?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_transcriptions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          content_tsv: unknown
          conversation_id: string
          created_at: string
          delivered_at: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          error_message: string | null
          failed_at: string | null
          id: string
          is_from_bot: boolean
          media_url: string | null
          metadata: Json | null
          read_at: string | null
          sent_by: string | null
          type: Database["public"]["Enums"]["message_type"]
          zapi_message_id: string | null
        }
        Insert: {
          content?: string | null
          content_tsv?: unknown
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          failed_at?: string | null
          id?: string
          is_from_bot?: boolean
          media_url?: string | null
          metadata?: Json | null
          read_at?: string | null
          sent_by?: string | null
          type?: Database["public"]["Enums"]["message_type"]
          zapi_message_id?: string | null
        }
        Update: {
          content?: string | null
          content_tsv?: unknown
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          failed_at?: string | null
          id?: string
          is_from_bot?: boolean
          media_url?: string | null
          metadata?: Json | null
          read_at?: string | null
          sent_by?: string | null
          type?: Database["public"]["Enums"]["message_type"]
          zapi_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_checkpoints: {
        Row: {
          criado_em: string | null
          tabela: string | null
          total: number | null
        }
        Insert: {
          criado_em?: string | null
          tabela?: string | null
          total?: number | null
        }
        Update: {
          criado_em?: string | null
          tabela?: string | null
          total?: number | null
        }
        Relationships: []
      }
      organization_knowledge: {
        Row: {
          about: string | null
          address: string | null
          company_name: string | null
          created_at: string
          custom_fields: Json
          differentials: string | null
          email: string | null
          faqs: Json
          hours: string | null
          organization_id: string
          payment_methods: string | null
          phone: string | null
          tone_of_voice: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          about?: string | null
          address?: string | null
          company_name?: string | null
          created_at?: string
          custom_fields?: Json
          differentials?: string | null
          email?: string | null
          faqs?: Json
          hours?: string | null
          organization_id: string
          payment_methods?: string | null
          phone?: string | null
          tone_of_voice?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          about?: string | null
          address?: string | null
          company_name?: string | null
          created_at?: string
          custom_fields?: Json
          differentials?: string | null
          email?: string | null
          faqs?: Json
          hours?: string | null
          organization_id?: string
          payment_methods?: string | null
          phone?: string | null
          tone_of_voice?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_knowledge_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_plans: {
        Row: {
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          billing_cycle: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          organization_id: string
          payment_status: string
          plan_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          billing_cycle?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id: string
          payment_status?: string
          plan_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          billing_cycle?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id?: string
          payment_status?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_plans_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "platform_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_usage: {
        Row: {
          ai_cost_usd: number | null
          ai_requests: number | null
          contacts_count: number | null
          created_at: string
          id: string
          messages_received: number | null
          messages_sent: number | null
          organization_id: string
          period: string
          storage_bytes: number | null
          updated_at: string
        }
        Insert: {
          ai_cost_usd?: number | null
          ai_requests?: number | null
          contacts_count?: number | null
          created_at?: string
          id?: string
          messages_received?: number | null
          messages_sent?: number | null
          organization_id: string
          period: string
          storage_bytes?: number | null
          updated_at?: string
        }
        Update: {
          ai_cost_usd?: number | null
          ai_requests?: number | null
          contacts_count?: number | null
          created_at?: string
          id?: string
          messages_received?: number | null
          messages_sent?: number | null
          organization_id?: string
          period?: string
          storage_bytes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          auto_close_hours: number
          created_at: string
          id: string
          logo_url: string | null
          name: string
          onboarded_at: string | null
          slug: string
          storage_limit_bytes: number | null
          storage_used_bytes: number | null
          timezone: string
          updated_at: string
        }
        Insert: {
          auto_close_hours?: number
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          onboarded_at?: string | null
          slug: string
          storage_limit_bytes?: number | null
          storage_used_bytes?: number | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          auto_close_hours?: number
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          onboarded_at?: string | null
          slug?: string
          storage_limit_bytes?: number | null
          storage_used_bytes?: number | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      pack_fixed_signers: {
        Row: {
          auth_methods: Json
          created_at: string
          id: string
          order: number
          organization_id: string
          pack_id: string
          signer_cpf: string | null
          signer_email: string | null
          signer_name: string
          signer_phone: string | null
          signer_role: string | null
          updated_at: string
        }
        Insert: {
          auth_methods?: Json
          created_at?: string
          id?: string
          order?: number
          organization_id: string
          pack_id: string
          signer_cpf?: string | null
          signer_email?: string | null
          signer_name: string
          signer_phone?: string | null
          signer_role?: string | null
          updated_at?: string
        }
        Update: {
          auth_methods?: Json
          created_at?: string
          id?: string
          order?: number
          organization_id?: string
          pack_id?: string
          signer_cpf?: string | null
          signer_email?: string | null
          signer_name?: string
          signer_phone?: string | null
          signer_role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pack_fixed_signers_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "document_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_checklist_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          items: Json
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_checklist_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_column_checklists: {
        Row: {
          column_id: string
          created_at: string
          id: string
          pipeline_id: string
          template_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          column_id: string
          created_at?: string
          id?: string
          pipeline_id: string
          template_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          column_id?: string
          created_at?: string
          id?: string
          pipeline_id?: string
          template_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_column_checklists_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "pipeline_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_column_checklists_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_column_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pipeline_checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_column_checklists_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_columns: {
        Row: {
          auto_add_tag_ids: string[]
          color: string
          created_at: string
          id: string
          name: string
          order: number
          pipeline_id: string
          updated_at: string
        }
        Insert: {
          auto_add_tag_ids?: string[]
          color?: string
          created_at?: string
          id?: string
          name: string
          order?: number
          pipeline_id: string
          updated_at?: string
        }
        Update: {
          auto_add_tag_ids?: string[]
          color?: string
          created_at?: string
          id?: string
          name?: string
          order?: number
          pipeline_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_columns_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          completion_column_id: string | null
          created_at: string
          default_assigned_to: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          next_pipeline_column_id: string | null
          next_pipeline_id: string | null
          organization_id: string
          show_unassigned: boolean
          updated_at: string
          workspace_ids: string[] | null
        }
        Insert: {
          completion_column_id?: string | null
          created_at?: string
          default_assigned_to?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          next_pipeline_column_id?: string | null
          next_pipeline_id?: string | null
          organization_id: string
          show_unassigned?: boolean
          updated_at?: string
          workspace_ids?: string[] | null
        }
        Update: {
          completion_column_id?: string | null
          created_at?: string
          default_assigned_to?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          next_pipeline_column_id?: string | null
          next_pipeline_id?: string | null
          organization_id?: string
          show_unassigned?: boolean
          updated_at?: string
          workspace_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_completion_column_id_fkey"
            columns: ["completion_column_id"]
            isOneToOne: false
            referencedRelation: "pipeline_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_next_pipeline_column_id_fkey"
            columns: ["next_pipeline_column_id"]
            isOneToOne: false
            referencedRelation: "pipeline_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_next_pipeline_id_fkey"
            columns: ["next_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_api_keys: {
        Row: {
          api_key_encrypted: string
          created_at: string
          current_month_cost: number | null
          id: string
          is_active: boolean
          monthly_budget: number | null
          provider: string
          updated_at: string
        }
        Insert: {
          api_key_encrypted: string
          created_at?: string
          current_month_cost?: number | null
          id?: string
          is_active?: boolean
          monthly_budget?: number | null
          provider: string
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string
          created_at?: string
          current_month_cost?: number | null
          id?: string
          is_active?: boolean
          monthly_budget?: number | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_job_runs: {
        Row: {
          job_key: string
          last_run_at: string
        }
        Insert: {
          job_key: string
          last_run_at?: string
        }
        Update: {
          job_key?: string
          last_run_at?: string
        }
        Relationships: []
      }
      platform_packages: {
        Row: {
          agents_template: Json
          allow_post_edit: boolean
          color: string | null
          created_at: string
          description: string | null
          flows_template: Json
          icon: string | null
          id: string
          is_clonable: boolean
          is_locked: boolean
          is_published: boolean
          kind: string
          master_prompt: string | null
          name: string
          parent_package_id: string | null
          pipeline_template: Json
          slug: string
          sort_order: number
          tags_template: Json
          updated_at: string
          version: number
        }
        Insert: {
          agents_template?: Json
          allow_post_edit?: boolean
          color?: string | null
          created_at?: string
          description?: string | null
          flows_template?: Json
          icon?: string | null
          id?: string
          is_clonable?: boolean
          is_locked?: boolean
          is_published?: boolean
          kind: string
          master_prompt?: string | null
          name: string
          parent_package_id?: string | null
          pipeline_template?: Json
          slug: string
          sort_order?: number
          tags_template?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          agents_template?: Json
          allow_post_edit?: boolean
          color?: string | null
          created_at?: string
          description?: string | null
          flows_template?: Json
          icon?: string | null
          id?: string
          is_clonable?: boolean
          is_locked?: boolean
          is_published?: boolean
          kind?: string
          master_prompt?: string | null
          name?: string
          parent_package_id?: string | null
          pipeline_template?: Json
          slug?: string
          sort_order?: number
          tags_template?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_packages_parent_package_id_fkey"
            columns: ["parent_package_id"]
            isOneToOne: false
            referencedRelation: "platform_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_plans: {
        Row: {
          ai_mode: string
          allowed_modules: Json | null
          created_at: string
          features: Json
          id: string
          is_active: boolean
          max_ai_requests_month: number | null
          max_conversations: number | null
          max_team_members: number
          name: string
          price_monthly: number
          price_yearly: number | null
          slug: string
          storage_limit_bytes: number
          updated_at: string
        }
        Insert: {
          ai_mode?: string
          allowed_modules?: Json | null
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          max_ai_requests_month?: number | null
          max_conversations?: number | null
          max_team_members?: number
          name: string
          price_monthly?: number
          price_yearly?: number | null
          slug: string
          storage_limit_bytes?: number
          updated_at?: string
        }
        Update: {
          ai_mode?: string
          allowed_modules?: Json | null
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          max_ai_requests_month?: number | null
          max_conversations?: number | null
          max_team_members?: number
          name?: string
          price_monthly?: number
          price_yearly?: number | null
          slug?: string
          storage_limit_bytes?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      positions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      process_documentation: {
        Row: {
          approver: string | null
          area: string
          checklist: string | null
          content: string
          created_at: string | null
          created_by: string | null
          frequency: string | null
          id: string
          materials: string | null
          objective: string | null
          observations: string | null
          responsible: string | null
          steps: string | null
          title: string
          tools: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          approver?: string | null
          area?: string
          checklist?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          frequency?: string | null
          id?: string
          materials?: string | null
          objective?: string | null
          observations?: string | null
          responsible?: string | null
          steps?: string | null
          title: string
          tools?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          approver?: string | null
          area?: string
          checklist?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          frequency?: string | null
          id?: string
          materials?: string | null
          objective?: string | null
          observations?: string | null
          responsible?: string | null
          steps?: string | null
          title?: string
          tools?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_documentation_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          organization_id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id?: string
          organization_id: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          organization_id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string | null
          id: string
          invited_by: string | null
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_templates: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived: boolean
          color: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          is_draft: boolean
          is_standalone_folder: boolean
          is_template: boolean
          name: string
          pending_notifications: boolean | null
          start_date: string | null
          status: string | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          archived?: boolean
          color?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_draft?: boolean
          is_standalone_folder?: boolean
          is_template?: boolean
          name: string
          pending_notifications?: boolean | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          archived?: boolean
          color?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_draft?: boolean
          is_standalone_folder?: boolean
          is_template?: boolean
          name?: string
          pending_notifications?: boolean | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          logic: Json | null
          options: Json | null
          position: number
          quiz_id: string
          required: boolean
          settings: Json | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          logic?: Json | null
          options?: Json | null
          position?: number
          quiz_id: string
          required?: boolean
          settings?: Json | null
          title?: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          logic?: Json | null
          options?: Json | null
          position?: number
          quiz_id?: string
          required?: boolean
          settings?: Json | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_submissions: {
        Row: {
          answers: Json
          completed_at: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          organization_id: string
          quiz_id: string
          respondent_email: string | null
          respondent_name: string | null
          respondent_phone: string | null
          whatsapp_triggered: boolean
        }
        Insert: {
          answers?: Json
          completed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          organization_id: string
          quiz_id: string
          respondent_email?: string | null
          respondent_name?: string | null
          respondent_phone?: string | null
          whatsapp_triggered?: boolean
        }
        Update: {
          answers?: Json
          completed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          quiz_id?: string
          respondent_email?: string | null
          respondent_name?: string | null
          respondent_phone?: string | null
          whatsapp_triggered?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "quiz_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_submissions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_submissions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          end_screen: Json | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          public_token: string | null
          settings: Json
          theme: Json
          updated_at: string
          welcome_screen: Json | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_screen?: Json | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          public_token?: string | null
          settings?: Json
          theme?: Json
          updated_at?: string
          welcome_screen?: Json | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_screen?: Json | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          public_token?: string | null
          settings?: Json
          theme?: Json
          updated_at?: string
          welcome_screen?: Json | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          identifier: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          identifier: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          identifier?: string
          window_start?: string
        }
        Relationships: []
      }
      recurring_tasks: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          position_id: string | null
          priority: string | null
          process_id: string | null
          project_id: string | null
          recurrence_config: Json | null
          recurrence_type: string
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          position_id?: string | null
          priority?: string | null
          process_id?: string | null
          project_id?: string | null
          recurrence_config?: Json | null
          recurrence_type?: string
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          position_id?: string | null
          priority?: string | null
          process_id?: string | null
          project_id?: string | null
          recurrence_config?: Json | null
          recurrence_type?: string
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_tasks_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_tasks_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "process_documentation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_task_subtasks: {
        Row: {
          completed: boolean | null
          created_at: string | null
          id: string
          routine_task_id: string
          subtask_order: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          id?: string
          routine_task_id: string
          subtask_order?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          id?: string
          routine_task_id?: string
          subtask_order?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routine_task_subtasks_routine_task_id_fkey"
            columns: ["routine_task_id"]
            isOneToOne: false
            referencedRelation: "routine_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string | null
          documentation: string | null
          id: string
          priority: string | null
          process_id: string | null
          project_id: string | null
          routine_id: string
          setor: string | null
          start_date: string | null
          status: string | null
          task_order: number
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          documentation?: string | null
          id?: string
          priority?: string | null
          process_id?: string | null
          project_id?: string | null
          routine_id: string
          setor?: string | null
          start_date?: string | null
          status?: string | null
          task_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          documentation?: string | null
          id?: string
          priority?: string | null
          process_id?: string | null
          project_id?: string | null
          routine_id?: string
          setor?: string | null
          start_date?: string | null
          status?: string | null
          task_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_tasks_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "process_documentation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_tasks_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          position_id: string | null
          recurrence_config: Json | null
          recurrence_type: string
          start_date: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          position_id?: string | null
          recurrence_config?: Json | null
          recurrence_type?: string
          start_date?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          position_id?: string | null
          recurrence_config?: Json | null
          recurrence_type?: string
          start_date?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routines_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routines_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_message_contacts: {
        Row: {
          contact_id: string
          created_at: string
          error_message: string | null
          id: string
          scheduled_message_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          scheduled_message_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          scheduled_message_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_message_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_message_contacts_scheduled_message_id_fkey"
            columns: ["scheduled_message_id"]
            isOneToOne: false
            referencedRelation: "scheduled_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          batch_current_target: number | null
          batch_pause_minutes: number | null
          batch_paused_until: string | null
          batch_sent_count: number | null
          batch_size_max: number | null
          contact_id: string | null
          content_type: string
          created_at: string
          created_by: string | null
          delay_between_contacts: number | null
          error_message: string | null
          execution_count: number | null
          flow_id: string | null
          group_jids: Json
          id: string
          last_executed_at: string | null
          media_type: string | null
          media_url: string | null
          message_content: string | null
          name: string | null
          next_execution_at: string | null
          organization_id: string
          recurrence_end_at: string | null
          recurrence_type: string | null
          scheduled_at: string
          status: string
          tag_id: string | null
          target_type: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          batch_current_target?: number | null
          batch_pause_minutes?: number | null
          batch_paused_until?: string | null
          batch_sent_count?: number | null
          batch_size_max?: number | null
          contact_id?: string | null
          content_type: string
          created_at?: string
          created_by?: string | null
          delay_between_contacts?: number | null
          error_message?: string | null
          execution_count?: number | null
          flow_id?: string | null
          group_jids?: Json
          id?: string
          last_executed_at?: string | null
          media_type?: string | null
          media_url?: string | null
          message_content?: string | null
          name?: string | null
          next_execution_at?: string | null
          organization_id: string
          recurrence_end_at?: string | null
          recurrence_type?: string | null
          scheduled_at: string
          status?: string
          tag_id?: string | null
          target_type: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          batch_current_target?: number | null
          batch_pause_minutes?: number | null
          batch_paused_until?: string | null
          batch_sent_count?: number | null
          batch_size_max?: number | null
          contact_id?: string | null
          content_type?: string
          created_at?: string
          created_by?: string | null
          delay_between_contacts?: number | null
          error_message?: string | null
          execution_count?: number | null
          flow_id?: string | null
          group_jids?: Json
          id?: string
          last_executed_at?: string | null
          media_type?: string | null
          media_url?: string | null
          message_content?: string | null
          name?: string | null
          next_execution_at?: string | null
          organization_id?: string
          recurrence_end_at?: string | null
          recurrence_type?: string | null
          scheduled_at?: string
          status?: string
          tag_id?: string | null
          target_type?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_evidence: {
        Row: {
          created_at: string
          document_hash: string
          geolocation: Json | null
          id: string
          metadata: Json | null
          original_pdf_url: string | null
          otp_verified_at: string | null
          receipt_pdf_url: string | null
          selfie_url: string | null
          signature_id: string
          signed_at: string
          signer_device: string | null
          signer_ip: string | null
          signer_location: string | null
          verification_code: string | null
        }
        Insert: {
          created_at?: string
          document_hash: string
          geolocation?: Json | null
          id?: string
          metadata?: Json | null
          original_pdf_url?: string | null
          otp_verified_at?: string | null
          receipt_pdf_url?: string | null
          selfie_url?: string | null
          signature_id: string
          signed_at?: string
          signer_device?: string | null
          signer_ip?: string | null
          signer_location?: string | null
          verification_code?: string | null
        }
        Update: {
          created_at?: string
          document_hash?: string
          geolocation?: Json | null
          id?: string
          metadata?: Json | null
          original_pdf_url?: string | null
          otp_verified_at?: string | null
          receipt_pdf_url?: string | null
          selfie_url?: string | null
          signature_id?: string
          signed_at?: string
          signer_device?: string | null
          signer_ip?: string | null
          signer_location?: string | null
          verification_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_evidence_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "document_signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_otp_codes: {
        Row: {
          attempts: number
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          phone: string | null
          signature_id: string
          verified: boolean | null
        }
        Insert: {
          attempts?: number
          code: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          phone?: string | null
          signature_id: string
          verified?: boolean | null
        }
        Update: {
          attempts?: number
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          phone?: string | null
          signature_id?: string
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_otp_codes_signature_id_fkey"
            columns: ["signature_id"]
            isOneToOne: false
            referencedRelation: "document_signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_notifications: {
        Row: {
          column_id: string
          created_at: string
          id: string
          is_active: boolean
          message_template: string | null
          notify_user_ids: string[]
          organization_id: string
          pipeline_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          column_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          message_template?: string | null
          notify_user_ids?: string[]
          organization_id: string
          pipeline_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          column_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          message_template?: string | null
          notify_user_ids?: string[]
          organization_id?: string
          pipeline_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_notifications_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "pipeline_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_notifications_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subtasks: {
        Row: {
          completed: boolean | null
          created_at: string | null
          id: string
          subtask_order: number | null
          task_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          id?: string
          subtask_order?: number | null
          task_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          id?: string
          subtask_order?: number | null
          task_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          name: string
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          name: string
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          name?: string
          task_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_external_assignees: {
        Row: {
          created_at: string
          id: string
          participant_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          participant_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          participant_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_external_assignees_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "external_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_external_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_processes: {
        Row: {
          created_at: string | null
          id: string
          process_id: string
          task_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          process_id: string
          task_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          process_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_processes_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "process_documentation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_processes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          approval_reviewer_id: string | null
          approval_status: string | null
          assigned_to: string | null
          completed_verified: boolean | null
          created_at: string | null
          description: string | null
          documentation: string | null
          due_date: string | null
          id: string
          priority: string | null
          process_id: string | null
          project_id: string | null
          recurring_task_id: string | null
          requires_approval: boolean | null
          routine_id: string | null
          setor: string | null
          start_date: string | null
          status: string | null
          task_order: number | null
          title: string
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          approval_reviewer_id?: string | null
          approval_status?: string | null
          assigned_to?: string | null
          completed_verified?: boolean | null
          created_at?: string | null
          description?: string | null
          documentation?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          process_id?: string | null
          project_id?: string | null
          recurring_task_id?: string | null
          requires_approval?: boolean | null
          routine_id?: string | null
          setor?: string | null
          start_date?: string | null
          status?: string | null
          task_order?: number | null
          title: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          approval_reviewer_id?: string | null
          approval_status?: string | null
          assigned_to?: string | null
          completed_verified?: boolean | null
          created_at?: string | null
          description?: string | null
          documentation?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          process_id?: string | null
          project_id?: string | null
          recurring_task_id?: string | null
          requires_approval?: boolean | null
          routine_id?: string | null
          setor?: string | null
          start_date?: string | null
          status?: string | null
          task_order?: number | null
          title?: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "process_documentation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_recurring_task_id_fkey"
            columns: ["recurring_task_id"]
            isOneToOne: false
            referencedRelation: "recurring_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      template_fixed_signers: {
        Row: {
          auth_methods: Json
          created_at: string
          id: string
          order: number
          organization_id: string
          signer_cpf: string | null
          signer_email: string | null
          signer_name: string
          signer_phone: string | null
          signer_role: string | null
          template_id: string
          updated_at: string
        }
        Insert: {
          auth_methods?: Json
          created_at?: string
          id?: string
          order?: number
          organization_id: string
          signer_cpf?: string | null
          signer_email?: string | null
          signer_name: string
          signer_phone?: string | null
          signer_role?: string | null
          template_id: string
          updated_at?: string
        }
        Update: {
          auth_methods?: Json
          created_at?: string
          id?: string
          order?: number
          organization_id?: string
          signer_cpf?: string | null
          signer_email?: string | null
          signer_name?: string
          signer_phone?: string | null
          signer_role?: string | null
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_fixed_signers_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_subtasks: {
        Row: {
          created_at: string
          id: string
          task_order: number | null
          template_task_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_order?: number | null
          template_task_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          task_order?: number | null
          template_task_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_subtasks_template_task_id_fkey"
            columns: ["template_task_id"]
            isOneToOne: false
            referencedRelation: "template_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      template_task_assignees: {
        Row: {
          created_at: string
          id: string
          template_task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          template_task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          template_task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_task_assignees_template_task_id_fkey"
            columns: ["template_task_id"]
            isOneToOne: false
            referencedRelation: "template_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      template_task_processes: {
        Row: {
          created_at: string
          id: string
          process_id: string
          template_task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          process_id: string
          template_task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          process_id?: string
          template_task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_task_processes_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "process_documentation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_task_processes_template_task_id_fkey"
            columns: ["template_task_id"]
            isOneToOne: false
            referencedRelation: "template_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      template_tasks: {
        Row: {
          created_at: string
          description: string | null
          documentation: string | null
          id: string
          priority: string | null
          process_id: string | null
          setor: string | null
          task_order: number | null
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          documentation?: string | null
          id?: string
          priority?: string | null
          process_id?: string | null
          setor?: string | null
          task_order?: number | null
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          documentation?: string | null
          id?: string
          priority?: string | null
          process_id?: string | null
          setor?: string | null
          task_order?: number | null
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_tasks_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "process_documentation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_fingerprints: {
        Row: {
          browser_data: Json | null
          created_at: string
          id: string
          ip_address: string | null
          location_data: Json | null
          organization_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          browser_data?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          location_data?: Json | null
          organization_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          browser_data?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          location_data?: Json | null
          organization_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_fingerprints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          allowed_pipeline_ids: string[] | null
          can_access_agents: boolean
          can_access_calendar: boolean
          can_access_campaigns: boolean
          can_access_contacts: boolean
          can_access_conversations: boolean
          can_access_dashboard: boolean
          can_access_flows: boolean
          can_access_groups: boolean
          can_access_integrations: boolean
          can_access_operations: boolean
          can_access_pipeline: boolean
          can_access_reports: boolean
          can_access_scheduled: boolean
          can_access_settings: boolean
          can_access_team: boolean
          can_access_tool_carousel: boolean
          can_access_tool_cnis: boolean
          can_access_tool_documents: boolean
          can_access_tool_quiz: boolean
          can_access_tool_widgets: boolean
          can_access_tool_wizzy_flow: boolean
          can_access_tools: boolean
          conversations_allowed_tags: string[] | null
          conversations_filter_type: string
          created_at: string
          hide_unassigned_pipeline_ids: string[] | null
          id: string
          organization_id: string
          pipeline_access_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_pipeline_ids?: string[] | null
          can_access_agents?: boolean
          can_access_calendar?: boolean
          can_access_campaigns?: boolean
          can_access_contacts?: boolean
          can_access_conversations?: boolean
          can_access_dashboard?: boolean
          can_access_flows?: boolean
          can_access_groups?: boolean
          can_access_integrations?: boolean
          can_access_operations?: boolean
          can_access_pipeline?: boolean
          can_access_reports?: boolean
          can_access_scheduled?: boolean
          can_access_settings?: boolean
          can_access_team?: boolean
          can_access_tool_carousel?: boolean
          can_access_tool_cnis?: boolean
          can_access_tool_documents?: boolean
          can_access_tool_quiz?: boolean
          can_access_tool_widgets?: boolean
          can_access_tool_wizzy_flow?: boolean
          can_access_tools?: boolean
          conversations_allowed_tags?: string[] | null
          conversations_filter_type?: string
          created_at?: string
          hide_unassigned_pipeline_ids?: string[] | null
          id?: string
          organization_id: string
          pipeline_access_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_pipeline_ids?: string[] | null
          can_access_agents?: boolean
          can_access_calendar?: boolean
          can_access_campaigns?: boolean
          can_access_contacts?: boolean
          can_access_conversations?: boolean
          can_access_dashboard?: boolean
          can_access_flows?: boolean
          can_access_groups?: boolean
          can_access_integrations?: boolean
          can_access_operations?: boolean
          can_access_pipeline?: boolean
          can_access_reports?: boolean
          can_access_scheduled?: boolean
          can_access_settings?: boolean
          can_access_team?: boolean
          can_access_tool_carousel?: boolean
          can_access_tool_cnis?: boolean
          can_access_tool_documents?: boolean
          can_access_tool_quiz?: boolean
          can_access_tool_widgets?: boolean
          can_access_tool_wizzy_flow?: boolean
          can_access_tools?: boolean
          conversations_allowed_tags?: string[] | null
          conversations_filter_type?: string
          created_at?: string
          hide_unassigned_pipeline_ids?: string[] | null
          id?: string
          organization_id?: string
          pipeline_access_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_positions: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          position_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          position_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          position_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_positions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_connection_logs: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          instance_id: string | null
          organization_id: string
          phone_number: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          instance_id?: string | null
          organization_id: string
          phone_number?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          instance_id?: string | null
          organization_id?: string
          phone_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connection_logs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connection_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_groups: {
        Row: {
          created_at: string
          description: string | null
          group_jid: string
          id: string
          is_admin: boolean
          last_synced_at: string | null
          name: string | null
          organization_id: string
          participant_count: number
          participants: Json
          picture_url: string | null
          raw: Json | null
          updated_at: string
          whatsapp_instance_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          group_jid: string
          id?: string
          is_admin?: boolean
          last_synced_at?: string | null
          name?: string | null
          organization_id: string
          participant_count?: number
          participants?: Json
          picture_url?: string | null
          raw?: Json | null
          updated_at?: string
          whatsapp_instance_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          group_jid?: string
          id?: string
          is_admin?: boolean
          last_synced_at?: string | null
          name?: string | null
          organization_id?: string
          participant_count?: number
          participants?: Json
          picture_url?: string | null
          raw?: Json | null
          updated_at?: string
          whatsapp_instance_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          block_calls: boolean
          connected_at: string | null
          created_at: string
          default_assignee_id: string | null
          default_assignee_type: string | null
          default_department_id: string | null
          default_status_id: string | null
          disconnected_at: string | null
          evolution_api_key: string | null
          evolution_instance_id: string | null
          evolution_instance_name: string | null
          id: string
          is_active: boolean
          label: string | null
          organization_id: string
          phone_number: string | null
          provider: string
          provider_settings: Json
          status: Database["public"]["Enums"]["whatsapp_instance_status"]
          updated_at: string
          zapi_instance_id: string | null
          zapi_token: string | null
        }
        Insert: {
          block_calls?: boolean
          connected_at?: string | null
          created_at?: string
          default_assignee_id?: string | null
          default_assignee_type?: string | null
          default_department_id?: string | null
          default_status_id?: string | null
          disconnected_at?: string | null
          evolution_api_key?: string | null
          evolution_instance_id?: string | null
          evolution_instance_name?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          organization_id: string
          phone_number?: string | null
          provider?: string
          provider_settings?: Json
          status?: Database["public"]["Enums"]["whatsapp_instance_status"]
          updated_at?: string
          zapi_instance_id?: string | null
          zapi_token?: string | null
        }
        Update: {
          block_calls?: boolean
          connected_at?: string | null
          created_at?: string
          default_assignee_id?: string | null
          default_assignee_type?: string | null
          default_department_id?: string | null
          default_status_id?: string | null
          disconnected_at?: string | null
          evolution_api_key?: string | null
          evolution_instance_id?: string | null
          evolution_instance_name?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          organization_id?: string
          phone_number?: string | null
          provider?: string
          provider_settings?: Json
          status?: Database["public"]["Enums"]["whatsapp_instance_status"]
          updated_at?: string
          zapi_instance_id?: string | null
          zapi_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_default_department_id_fkey"
            columns: ["default_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_default_status_id_fkey"
            columns: ["default_status_id"]
            isOneToOne: false
            referencedRelation: "conversation_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_custom_fields: {
        Row: {
          created_at: string
          field_label: string
          field_options: Json | null
          field_order: number
          field_placeholder: string | null
          field_type: string
          id: string
          is_required: boolean
          widget_id: string
        }
        Insert: {
          created_at?: string
          field_label: string
          field_options?: Json | null
          field_order?: number
          field_placeholder?: string | null
          field_type?: string
          id?: string
          is_required?: boolean
          widget_id: string
        }
        Update: {
          created_at?: string
          field_label?: string
          field_options?: Json | null
          field_order?: number
          field_placeholder?: string | null
          field_type?: string
          id?: string
          is_required?: boolean
          widget_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "widget_custom_fields_widget_id_fkey"
            columns: ["widget_id"]
            isOneToOne: false
            referencedRelation: "widgets"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "widget_folders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "widget_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "widget_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "widget_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_submissions: {
        Row: {
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          custom_fields_data: Json | null
          error_message: string | null
          id: string
          ip_address: string | null
          organization_id: string
          page_url: string | null
          processed_at: string | null
          referrer_url: string | null
          status: string
          submitted_cpf: string | null
          submitted_email: string | null
          submitted_name: string | null
          submitted_whatsapp: string
          user_agent: string | null
          widget_id: string
        }
        Insert: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          custom_fields_data?: Json | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          organization_id: string
          page_url?: string | null
          processed_at?: string | null
          referrer_url?: string | null
          status?: string
          submitted_cpf?: string | null
          submitted_email?: string | null
          submitted_name?: string | null
          submitted_whatsapp: string
          user_agent?: string | null
          widget_id: string
        }
        Update: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          custom_fields_data?: Json | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          organization_id?: string
          page_url?: string | null
          processed_at?: string | null
          referrer_url?: string | null
          status?: string
          submitted_cpf?: string | null
          submitted_email?: string | null
          submitted_name?: string | null
          submitted_whatsapp?: string
          user_agent?: string | null
          widget_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "widget_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "widget_submissions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "widget_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "widget_submissions_widget_id_fkey"
            columns: ["widget_id"]
            isOneToOne: false
            referencedRelation: "widgets"
            referencedColumns: ["id"]
          },
        ]
      }
      widgets: {
        Row: {
          auto_create_conversation: boolean
          button_border_radius: number
          button_color: string
          button_icon: string | null
          button_position: string
          button_size: string
          button_text: string
          button_text_color: string
          created_at: string
          created_by: string | null
          description: string | null
          field_cpf_enabled: boolean
          field_cpf_required: boolean
          field_email_enabled: boolean
          field_email_required: boolean
          field_name_enabled: boolean
          field_name_required: boolean
          field_whatsapp_enabled: boolean
          field_whatsapp_required: boolean
          flow_id: string | null
          folder_id: string | null
          form_accent_color: string
          form_background_color: string
          form_background_image: string | null
          form_logo_url: string | null
          form_subtitle: string | null
          form_text_color: string
          form_title: string
          id: string
          integration_type: string
          is_active: boolean
          message_template: string | null
          name: string
          organization_id: string
          pixel_code: string | null
          pixel_enabled: boolean
          pixel_event_name: string | null
          success_message: string
          success_redirect_url: string | null
          tag_ids: string[] | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          auto_create_conversation?: boolean
          button_border_radius?: number
          button_color?: string
          button_icon?: string | null
          button_position?: string
          button_size?: string
          button_text?: string
          button_text_color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          field_cpf_enabled?: boolean
          field_cpf_required?: boolean
          field_email_enabled?: boolean
          field_email_required?: boolean
          field_name_enabled?: boolean
          field_name_required?: boolean
          field_whatsapp_enabled?: boolean
          field_whatsapp_required?: boolean
          flow_id?: string | null
          folder_id?: string | null
          form_accent_color?: string
          form_background_color?: string
          form_background_image?: string | null
          form_logo_url?: string | null
          form_subtitle?: string | null
          form_text_color?: string
          form_title?: string
          id?: string
          integration_type?: string
          is_active?: boolean
          message_template?: string | null
          name: string
          organization_id: string
          pixel_code?: string | null
          pixel_enabled?: boolean
          pixel_event_name?: string | null
          success_message?: string
          success_redirect_url?: string | null
          tag_ids?: string[] | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          auto_create_conversation?: boolean
          button_border_radius?: number
          button_color?: string
          button_icon?: string | null
          button_position?: string
          button_size?: string
          button_text?: string
          button_text_color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          field_cpf_enabled?: boolean
          field_cpf_required?: boolean
          field_email_enabled?: boolean
          field_email_required?: boolean
          field_name_enabled?: boolean
          field_name_required?: boolean
          field_whatsapp_enabled?: boolean
          field_whatsapp_required?: boolean
          flow_id?: string | null
          folder_id?: string | null
          form_accent_color?: string
          form_background_color?: string
          form_background_image?: string | null
          form_logo_url?: string | null
          form_subtitle?: string | null
          form_text_color?: string
          form_title?: string
          id?: string
          integration_type?: string
          is_active?: boolean
          message_template?: string | null
          name?: string
          organization_id?: string
          pixel_code?: string | null
          pixel_enabled?: boolean
          pixel_event_name?: string | null
          success_message?: string
          success_redirect_url?: string | null
          tag_ids?: string[] | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "widgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "widgets_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "widgets_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "widget_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "widgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "widgets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wizzy_flow_user_permissions: {
        Row: {
          can_edit_analytics: boolean
          can_edit_briefings: boolean
          can_edit_culture: boolean
          can_edit_flows: boolean
          can_edit_inventory: boolean
          can_edit_notes: boolean
          can_edit_positions: boolean
          can_edit_processes: boolean
          can_edit_projects: boolean
          can_edit_tasks: boolean
          can_edit_vision: boolean
          can_view_ai: boolean
          can_view_analytics: boolean
          can_view_briefings: boolean
          can_view_culture: boolean
          can_view_flows: boolean
          can_view_inventory: boolean
          can_view_notes: boolean
          can_view_positions: boolean
          can_view_processes: boolean
          can_view_projects: boolean
          can_view_tasks: boolean
          can_view_vision: boolean
          can_view_workload: boolean
          created_at: string
          id: string
          projects_only_assigned: boolean
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          can_edit_analytics?: boolean
          can_edit_briefings?: boolean
          can_edit_culture?: boolean
          can_edit_flows?: boolean
          can_edit_inventory?: boolean
          can_edit_notes?: boolean
          can_edit_positions?: boolean
          can_edit_processes?: boolean
          can_edit_projects?: boolean
          can_edit_tasks?: boolean
          can_edit_vision?: boolean
          can_view_ai?: boolean
          can_view_analytics?: boolean
          can_view_briefings?: boolean
          can_view_culture?: boolean
          can_view_flows?: boolean
          can_view_inventory?: boolean
          can_view_notes?: boolean
          can_view_positions?: boolean
          can_view_processes?: boolean
          can_view_projects?: boolean
          can_view_tasks?: boolean
          can_view_vision?: boolean
          can_view_workload?: boolean
          created_at?: string
          id?: string
          projects_only_assigned?: boolean
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          can_edit_analytics?: boolean
          can_edit_briefings?: boolean
          can_edit_culture?: boolean
          can_edit_flows?: boolean
          can_edit_inventory?: boolean
          can_edit_notes?: boolean
          can_edit_positions?: boolean
          can_edit_processes?: boolean
          can_edit_projects?: boolean
          can_edit_tasks?: boolean
          can_edit_vision?: boolean
          can_view_ai?: boolean
          can_view_analytics?: boolean
          can_view_briefings?: boolean
          can_view_culture?: boolean
          can_view_flows?: boolean
          can_view_inventory?: boolean
          can_view_notes?: boolean
          can_view_positions?: boolean
          can_view_processes?: boolean
          can_view_projects?: boolean
          can_view_tasks?: boolean
          can_view_vision?: boolean
          can_view_workload?: boolean
          created_at?: string
          id?: string
          projects_only_assigned?: boolean
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wizzy_flow_user_permissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_agent_configs: {
        Row: {
          agent_ids: string[] | null
          ai_model: string | null
          ai_provider: string | null
          created_at: string
          id: string
          master_prompt_id: string | null
          organization_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agent_ids?: string[] | null
          ai_model?: string | null
          ai_provider?: string | null
          created_at?: string
          id?: string
          master_prompt_id?: string | null
          organization_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          agent_ids?: string[] | null
          ai_model?: string | null
          ai_provider?: string | null
          created_at?: string
          id?: string
          master_prompt_id?: string | null
          organization_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_agent_configs_master_prompt_id_fkey"
            columns: ["master_prompt_id"]
            isOneToOne: false
            referencedRelation: "master_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_agent_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_agent_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_funnel_configs: {
        Row: {
          column_ids: string[]
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          pipeline_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          column_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          pipeline_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          column_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          pipeline_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_funnel_configs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_funnel_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_funnel_configs_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_funnel_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_templates: {
        Row: {
          agents_template: Json
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          flows_template: Json
          icon: string | null
          id: string
          master_prompt: string | null
          name: string
          organization_id: string
          pipeline_template: Json
          source: string
          source_package_id: string | null
          tags_template: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agents_template?: Json
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          flows_template?: Json
          icon?: string | null
          id?: string
          master_prompt?: string | null
          name: string
          organization_id: string
          pipeline_template?: Json
          source?: string
          source_package_id?: string | null
          tags_template?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          agents_template?: Json
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          flows_template?: Json
          icon?: string | null
          id?: string
          master_prompt?: string | null
          name?: string
          organization_id?: string
          pipeline_template?: Json
          source?: string
          source_package_id?: string | null
          tags_template?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_templates_source_package_id_fkey"
            columns: ["source_package_id"]
            isOneToOne: false
            referencedRelation: "platform_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          color: string
          created_at: string
          default_operations_assignee_id: string | null
          description: string | null
          filter_tag_ids: string[] | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          default_operations_assignee_id?: string | null
          description?: string | null
          filter_tag_ids?: string[] | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          default_operations_assignee_id?: string | null
          description?: string | null
          filter_tag_ids?: string[] | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_default_operations_assignee_id_fkey"
            columns: ["default_operations_assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _wz_merge_conversation_pair: {
        Args: { _dst: string; _src: string }
        Returns: undefined
      }
      adopt_orphan_conversations_for_instance: {
        Args: { _instance_id: string }
        Returns: number
      }
      adopt_orphan_conversations_for_workspace: {
        Args: {
          _dry_run?: boolean
          _instance_id: string
          _workspace_id: string
        }
        Returns: number
      }
      check_rate_limit: {
        Args: {
          p_bucket: string
          p_identifier: string
          p_max_requests: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      check_suspicious_activity: {
        Args: never
        Returns: {
          created_at: string
          fingerprint_id: string
          ip_address: string
          organization_id: string
          organization_name: string
          reason: string
        }[]
      }
      create_case_from_template:
        | {
            Args: {
              _contact_id: string
              _conversation_id: string
              _created_by?: string
              _template_id: string
            }
            Returns: string
          }
        | {
            Args: {
              _contact_id: string
              _conversation_id: string
              _created_by?: string
              _override_assignee_id?: string
              _template_id: string
            }
            Returns: string
          }
      deactivate_org_instances: {
        Args: { _org_id: string }
        Returns: undefined
      }
      dedup_org_messages: {
        Args: { _organization_id: string }
        Returns: number
      }
      get_active_instance_id: { Args: { _org_id: string }; Returns: string }
      get_active_phone_number: { Args: { _org_id: string }; Returns: string }
      get_dashboard_metrics: {
        Args: {
          _org: string
          _since?: string
          _until?: string
          _workspace_id?: string
        }
        Returns: Json
      }
      get_pipeline_stage_distribution: {
        Args: { _pipeline_id: string }
        Returns: {
          color: string
          columnId: string
          name: string
          value: number
        }[]
      }
      get_team_performance: {
        Args: {
          _org: string
          _pipeline_id?: string
          _since?: string
          _until?: string
          _workspace_id?: string
        }
        Returns: {
          avatar_url: string
          conversationsHandled: number
          id: string
          name: string
        }[]
      }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      has_org_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_in_org: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_campaign_count: {
        Args: { campaign_id: string }
        Returns: undefined
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      merge_duplicate_contacts_safe: {
        Args: { _dry_run?: boolean }
        Returns: {
          contacts_removed: number
          conversations_merged: number
          groups_merged: number
          rows_repointed: number
        }[]
      }
      merge_duplicate_conversations: {
        Args: { _dry_run?: boolean }
        Returns: {
          conversations_removed: number
          groups_merged: number
          rows_repointed: number
        }[]
      }
      merge_orphans_into_number: {
        Args: { _dry_run?: boolean }
        Returns: {
          contacts_affected: number
          contacts_skipped_multi: number
          orphans_merged: number
        }[]
      }
      readopt_orphan_conversations: {
        Args: { _dry_run?: boolean }
        Returns: {
          merged: number
          readopted: number
          still_hidden: number
        }[]
      }
      record_conversation_origin_audit: {
        Args: {
          _captured_from?: string
          _connected_phone?: string
          _conversation_id: string
          _message_id?: string
          _metadata?: Json
          _organization_id: string
          _provider?: string
          _provider_instance_id?: string
          _provider_instance_name?: string
          _whatsapp_instance_id?: string
        }
        Returns: undefined
      }
      search_messages: {
        Args: { _org: string; _q: string }
        Returns: {
          conversation_id: string
          created_at: string
          rank: number
          snippet: string
        }[]
      }
      seed_operations_defaults: {
        Args: { _org_id: string }
        Returns: undefined
      }
      user_belongs_to_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      user_can_access_module: {
        Args: { _module: string; _user_id: string }
        Returns: boolean
      }
      user_can_manage_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_workspace_access: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      user_is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      user_org_role: {
        Args: { _org_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      whatsapp_phone_match_key: { Args: { raw_phone: string }; Returns: string }
    }
    Enums: {
      app_role: "owner" | "admin" | "supervisor" | "agent" | "platform_admin"
      conversation_status:
        | "open"
        | "pending"
        | "resolved"
        | "archived"
        | "closed"
      instagram_account_status:
        | "pending"
        | "connected"
        | "disconnected"
        | "error"
      instagram_execution_status: "success" | "error" | "skipped"
      instagram_message_type:
        | "text"
        | "image"
        | "video"
        | "audio"
        | "comment_reply"
        | "story_reply"
        | "story_mention"
      message_direction: "inbound" | "outbound"
      message_type:
        | "text"
        | "image"
        | "audio"
        | "video"
        | "document"
        | "sticker"
        | "location"
      service_mode: "ia" | "ativo" | "pendente" | "arquivado"
      whatsapp_instance_status:
        | "pending"
        | "connecting"
        | "connected"
        | "disconnected"
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
      app_role: ["owner", "admin", "supervisor", "agent", "platform_admin"],
      conversation_status: [
        "open",
        "pending",
        "resolved",
        "archived",
        "closed",
      ],
      instagram_account_status: [
        "pending",
        "connected",
        "disconnected",
        "error",
      ],
      instagram_execution_status: ["success", "error", "skipped"],
      instagram_message_type: [
        "text",
        "image",
        "video",
        "audio",
        "comment_reply",
        "story_reply",
        "story_mention",
      ],
      message_direction: ["inbound", "outbound"],
      message_type: [
        "text",
        "image",
        "audio",
        "video",
        "document",
        "sticker",
        "location",
      ],
      service_mode: ["ia", "ativo", "pendente", "arquivado"],
      whatsapp_instance_status: [
        "pending",
        "connecting",
        "connected",
        "disconnected",
      ],
    },
  },
} as const
