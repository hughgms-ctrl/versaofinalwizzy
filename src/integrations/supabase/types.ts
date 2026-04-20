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
      campaigns: {
        Row: {
          created_at: string
          end_time: string | null
          flow_id: string
          id: string
          is_active: boolean | null
          match_type: string
          name: string
          organization_id: string
          start_time: string | null
          trigger_count: number
          trigger_keyword: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          flow_id: string
          id?: string
          is_active?: boolean | null
          match_type?: string
          name: string
          organization_id: string
          start_time?: string | null
          trigger_count?: number
          trigger_keyword: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          end_time?: string | null
          flow_id?: string
          id?: string
          is_active?: boolean | null
          match_type?: string
          name?: string
          organization_id?: string
          start_time?: string | null
          trigger_count?: number
          trigger_keyword?: string
          updated_at?: string
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
          default_assignee_id: string | null
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
          default_assignee_id?: string | null
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
          default_assignee_id?: string | null
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
          contact_id: string
          conversation_status_id: string | null
          created_at: string
          department_id: string | null
          id: string
          intervened_at: string | null
          intervened_by: string | null
          last_message_at: string | null
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
          contact_id: string
          conversation_status_id?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          intervened_at?: string | null
          intervened_by?: string | null
          last_message_at?: string | null
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
          contact_id?: string
          conversation_status_id?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          intervened_at?: string | null
          intervened_by?: string | null
          last_message_at?: string | null
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
          name: string
          organization_id: string
          position: number | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          position?: number | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
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
          description: string | null
          field_config: Json | null
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
          description?: string | null
          field_config?: Json | null
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
          description?: string | null
          field_config?: Json | null
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
      document_templates: {
        Row: {
          auto_send_whatsapp: boolean | null
          category: string | null
          content: string
          created_at: string
          created_by: string | null
          default_signing_method: string | null
          description: string | null
          fields: Json
          folder_id: string | null
          id: string
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
          created_at?: string
          created_by?: string | null
          default_signing_method?: string | null
          description?: string | null
          fields?: Json
          folder_id?: string | null
          id?: string
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
          created_at?: string
          created_by?: string | null
          default_signing_method?: string | null
          description?: string | null
          fields?: Json
          folder_id?: string | null
          id?: string
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
          filled_data: Json
          id: string
          name: string
          organization_id: string
          pack_id: string | null
          pdf_url: string | null
          signing_method: string | null
          signing_status: string | null
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
          filled_data?: Json
          id?: string
          name: string
          organization_id: string
          pack_id?: string | null
          pdf_url?: string | null
          signing_method?: string | null
          signing_status?: string | null
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
          filled_data?: Json
          id?: string
          name?: string
          organization_id?: string
          pack_id?: string | null
          pdf_url?: string | null
          signing_method?: string | null
          signing_status?: string | null
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
          created_at: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          storage_limit_bytes: number | null
          storage_used_bytes: number | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          storage_limit_bytes?: number | null
          storage_used_bytes?: number | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          storage_limit_bytes?: number | null
          storage_used_bytes?: number | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_columns: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          order: number
          pipeline_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          order?: number
          pipeline_id: string
          updated_at?: string
        }
        Update: {
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
          contact_id: string | null
          content_type: string
          created_at: string
          created_by: string | null
          delay_between_contacts: number | null
          error_message: string | null
          execution_count: number | null
          flow_id: string | null
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
          contact_id?: string | null
          content_type: string
          created_at?: string
          created_by?: string | null
          delay_between_contacts?: number | null
          error_message?: string | null
          execution_count?: number | null
          flow_id?: string | null
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
          contact_id?: string | null
          content_type?: string
          created_at?: string
          created_by?: string | null
          delay_between_contacts?: number | null
          error_message?: string | null
          execution_count?: number | null
          flow_id?: string | null
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
          id: string
          metadata: Json | null
          otp_verified_at: string | null
          receipt_pdf_url: string | null
          selfie_url: string | null
          signature_id: string
          signed_at: string
          signer_device: string | null
          signer_ip: string | null
          signer_location: string | null
        }
        Insert: {
          created_at?: string
          document_hash: string
          id?: string
          metadata?: Json | null
          otp_verified_at?: string | null
          receipt_pdf_url?: string | null
          selfie_url?: string | null
          signature_id: string
          signed_at?: string
          signer_device?: string | null
          signer_ip?: string | null
          signer_location?: string | null
        }
        Update: {
          created_at?: string
          document_hash?: string
          id?: string
          metadata?: Json | null
          otp_verified_at?: string | null
          receipt_pdf_url?: string | null
          selfie_url?: string | null
          signature_id?: string
          signed_at?: string
          signer_device?: string | null
          signer_ip?: string | null
          signer_location?: string | null
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
          can_access_conversations: boolean
          can_access_dashboard: boolean
          can_access_flows: boolean
          can_access_operations: boolean
          can_access_pipeline: boolean
          can_access_reports: boolean
          can_access_scheduled: boolean
          can_access_settings: boolean
          can_access_team: boolean
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
          can_access_conversations?: boolean
          can_access_dashboard?: boolean
          can_access_flows?: boolean
          can_access_operations?: boolean
          can_access_pipeline?: boolean
          can_access_reports?: boolean
          can_access_scheduled?: boolean
          can_access_settings?: boolean
          can_access_team?: boolean
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
          can_access_conversations?: boolean
          can_access_dashboard?: boolean
          can_access_flows?: boolean
          can_access_operations?: boolean
          can_access_pipeline?: boolean
          can_access_reports?: boolean
          can_access_scheduled?: boolean
          can_access_settings?: boolean
          can_access_team?: boolean
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
          id: string
          is_active: boolean
          label: string | null
          organization_id: string
          phone_number: string | null
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
          id?: string
          is_active?: boolean
          label?: string | null
          organization_id: string
          phone_number?: string | null
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
          id?: string
          is_active?: boolean
          label?: string | null
          organization_id?: string
          phone_number?: string | null
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
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
      get_active_instance_id: { Args: { _org_id: string }; Returns: string }
      get_active_phone_number: { Args: { _org_id: string }; Returns: string }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
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
      user_has_workspace_access: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "supervisor" | "agent" | "platform_admin"
      conversation_status: "open" | "pending" | "resolved" | "archived"
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
      conversation_status: ["open", "pending", "resolved", "archived"],
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
