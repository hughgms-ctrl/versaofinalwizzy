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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target_email: string | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_email?: string | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_email?: string | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["admin_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_view_sessions: {
        Row: {
          admin_user_id: string
          created_at: string
          expires_at: string
          id: string
          started_at: string
          workspace_id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          expires_at?: string
          id?: string
          started_at?: string
          workspace_id: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          started_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_view_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          messages: Json
          title: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_workspace_config: {
        Row: {
          api_key: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          model: string
          provider: string
          updated_at: string
          use_own_key: boolean
          workspace_id: string
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          model?: string
          provider?: string
          updated_at?: string
          use_own_key?: boolean
          workspace_id: string
        }
        Update: {
          api_key?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          model?: string
          provider?: string
          updated_at?: string
          use_own_key?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_workspace_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_emails: {
        Row: {
          blocked_by: string | null
          blocked_reason: string | null
          created_at: string
          email: string
          id: string
        }
        Insert: {
          blocked_by?: string | null
          blocked_reason?: string | null
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          blocked_by?: string | null
          blocked_reason?: string | null
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      briefings: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          data: string
          id: string
          investimento_trafego: number
          local: string
          participantes_pagantes: number
          precos: Json
          project_id: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          data: string
          id?: string
          investimento_trafego: number
          local: string
          participantes_pagantes: number
          precos: Json
          project_id: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          data?: string
          id?: string
          investimento_trafego?: number
          local?: string
          participantes_pagantes?: number
          precos?: Json
          project_id?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "briefings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "briefings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      company_info: {
        Row: {
          content: string
          created_at: string | null
          id: string
          mission: string | null
          section: string
          title: string
          updated_at: string | null
          values: string | null
          vision: string | null
          workspace_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          mission?: string | null
          section: string
          title: string
          updated_at?: string | null
          values?: string | null
          vision?: string | null
          workspace_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          mission?: string | null
          section?: string
          title?: string
          updated_at?: string | null
          values?: string | null
          vision?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_info_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      company_news: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          title: string
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          title: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          title?: string
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_news_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      debriefing_extras: {
        Row: {
          created_at: string
          created_by: string | null
          debriefing_id: string
          id: string
          nome: string
          tipo: string
          valor: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          debriefing_id: string
          id?: string
          nome: string
          tipo: string
          valor?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          debriefing_id?: string
          id?: string
          nome?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "debriefing_extras_debriefing_id_fkey"
            columns: ["debriefing_id"]
            isOneToOne: false
            referencedRelation: "debriefings"
            referencedColumns: ["id"]
          },
        ]
      }
      debriefing_vendedores: {
        Row: {
          created_at: string
          debriefing_id: string
          id: string
          ingressos_gratuitos: number | null
          leads_recebidos: number
          vendas_outras_estrategias: number | null
          vendas_realizadas: number
          vendedor_nome: string
        }
        Insert: {
          created_at?: string
          debriefing_id: string
          id?: string
          ingressos_gratuitos?: number | null
          leads_recebidos: number
          vendas_outras_estrategias?: number | null
          vendas_realizadas: number
          vendedor_nome: string
        }
        Update: {
          created_at?: string
          debriefing_id?: string
          id?: string
          ingressos_gratuitos?: number | null
          leads_recebidos?: number
          vendas_outras_estrategias?: number | null
          vendas_realizadas?: number
          vendedor_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "debriefing_vendedores_debriefing_id_fkey"
            columns: ["debriefing_id"]
            isOneToOne: false
            referencedRelation: "debriefings"
            referencedColumns: ["id"]
          },
        ]
      }
      debriefings: {
        Row: {
          briefing_id: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          investimento_trafego: number
          leads: number
          mentorias_vendidas: number
          observacoes: string | null
          participantes_outras_estrategias: number
          project_id: string
          retorno_vendas_ingressos: number
          total_participantes: number
          updated_at: string
          valor_outras_estrategias: number
          valor_vendas_mentorias: number
          vendas_ingressos: number
          workspace_id: string | null
        }
        Insert: {
          briefing_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          investimento_trafego: number
          leads: number
          mentorias_vendidas: number
          observacoes?: string | null
          participantes_outras_estrategias: number
          project_id: string
          retorno_vendas_ingressos: number
          total_participantes: number
          updated_at?: string
          valor_outras_estrategias: number
          valor_vendas_mentorias: number
          vendas_ingressos: number
          workspace_id?: string | null
        }
        Update: {
          briefing_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          investimento_trafego?: number
          leads?: number
          mentorias_vendidas?: number
          observacoes?: string | null
          participantes_outras_estrategias?: number
          project_id?: string
          retorno_vendas_ingressos?: number
          total_participantes?: number
          updated_at?: string
          valor_outras_estrategias?: number
          valor_vendas_mentorias?: number
          vendas_ingressos?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debriefings_briefing_id_fkey"
            columns: ["briefing_id"]
            isOneToOne: false
            referencedRelation: "briefings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debriefings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debriefings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      external_participants: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string
          updated_at?: string
          workspace_id?: string
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
      flows: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          edges: Json | null
          id: string
          name: string
          nodes: Json | null
          updated_at: string
          viewport: Json | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          edges?: Json | null
          id?: string
          name: string
          nodes?: Json | null
          updated_at?: string
          viewport?: Json | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          edges?: Json | null
          id?: string
          name?: string
          nodes?: Json | null
          updated_at?: string
          viewport?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      getting_started_sections: {
        Row: {
          content: string | null
          content_type: string
          created_at: string | null
          created_by: string | null
          id: string
          image_url: string | null
          section_order: number
          title: string
          updated_at: string | null
          video_url: string | null
          workspace_id: string
        }
        Insert: {
          content?: string | null
          content_type: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          image_url?: string | null
          section_order?: number
          title: string
          updated_at?: string | null
          video_url?: string | null
          workspace_id: string
        }
        Update: {
          content?: string | null
          content_type?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          image_url?: string | null
          section_order?: number
          title?: string
          updated_at?: string | null
          video_url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "getting_started_sections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_events: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          event_id: string | null
          id: string
          name: string
          quantity: number
          unit: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          name: string
          quantity?: number
          unit?: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          name?: string
          quantity?: number
          unit?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "inventory_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string | null
          id: string
          item_id: string
          notes: string | null
          quantity: number
          type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          id?: string
          item_id: string
          notes?: string | null
          quantity: number
          type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          quantity?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      note_folders: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          folder_order: number | null
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          folder_order?: number | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          folder_order?: number | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          folder_id: string | null
          id: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          folder_id?: string | null
          id?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          folder_id?: string | null
          id?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "note_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          link: string | null
          message: string
          read: boolean
          title: string
          type: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          link?: string | null
          message: string
          read?: boolean
          title: string
          type: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settings: {
        Row: {
          api_key_configured: boolean
          created_at: string
          id: string
          is_active: boolean
          provider: string
          settings: Json | null
          updated_at: string
          webhook_secret_configured: boolean
        }
        Insert: {
          api_key_configured?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          provider: string
          settings?: Json | null
          updated_at?: string
          webhook_secret_configured?: boolean
        }
        Update: {
          api_key_configured?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          provider?: string
          settings?: Json | null
          updated_at?: string
          webhook_secret_configured?: boolean
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
          area: string
          checklist?: string | null
          content: string
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
          created_at: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      project_invites: {
        Row: {
          accepted: boolean | null
          created_at: string | null
          email: string
          id: string
          invited_by: string
          project_id: string
          role: string
        }
        Insert: {
          accepted?: boolean | null
          created_at?: string | null
          email: string
          id?: string
          invited_by: string
          project_id: string
          role?: string
        }
        Update: {
          accepted?: boolean | null
          created_at?: string | null
          email?: string
          id?: string
          invited_by?: string
          project_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_invites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pwa_installations: {
        Row: {
          created_at: string
          device_info: string | null
          id: string
          installed_at: string | null
          last_install_reminder_at: string | null
          last_profile_reminder_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: string | null
          id?: string
          installed_at?: string | null
          last_install_reminder_at?: string | null
          last_profile_reminder_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: string | null
          id?: string
          installed_at?: string | null
          last_install_reminder_at?: string | null
          last_profile_reminder_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_tasks: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          position_id: string
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
          position_id: string
          priority?: string | null
          process_id?: string | null
          project_id?: string | null
          recurrence_config?: Json | null
          recurrence_type: string
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          position_id?: string
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
          position_id: string
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
          position_id: string
          recurrence_config?: Json | null
          recurrence_type: string
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
          position_id?: string
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
      sectors: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sectors_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          annual_discount_percentage: number | null
          annual_price_per_user: number | null
          annual_price_per_workspace: number | null
          billing_period: string
          created_at: string
          created_by: string | null
          description: string | null
          features: Json | null
          free_users_limit: number
          id: string
          is_active: boolean
          is_workspace_owner_free: boolean
          name: string
          price_per_user: number
          price_per_workspace: number
          updated_at: string
        }
        Insert: {
          annual_discount_percentage?: number | null
          annual_price_per_user?: number | null
          annual_price_per_workspace?: number | null
          billing_period?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          features?: Json | null
          free_users_limit?: number
          id?: string
          is_active?: boolean
          is_workspace_owner_free?: boolean
          name: string
          price_per_user?: number
          price_per_workspace?: number
          updated_at?: string
        }
        Update: {
          annual_discount_percentage?: number | null
          annual_price_per_user?: number | null
          annual_price_per_workspace?: number | null
          billing_period?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          features?: Json | null
          free_users_limit?: number
          id?: string
          is_active?: boolean
          is_workspace_owner_free?: boolean
          name?: string
          price_per_user?: number
          price_per_workspace?: number
          updated_at?: string
        }
        Relationships: []
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
      task_activity_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_value: string | null
          old_value: string | null
          task_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
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
      user_account_management: {
        Row: {
          admin_notes: string | null
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          can_access_subscriptions: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["user_account_status"]
          subscription_panel_enabled_at: string | null
          subscription_panel_enabled_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          can_access_subscriptions?: boolean
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["user_account_status"]
          subscription_panel_enabled_at?: string | null
          subscription_panel_enabled_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          can_access_subscriptions?: boolean
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["user_account_status"]
          subscription_panel_enabled_at?: string | null
          subscription_panel_enabled_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_edit_analytics: boolean | null
          can_edit_briefings: boolean | null
          can_edit_culture: boolean | null
          can_edit_flows: boolean | null
          can_edit_inventory: boolean | null
          can_edit_notes: boolean | null
          can_edit_positions: boolean | null
          can_edit_processes: boolean | null
          can_edit_projects: boolean | null
          can_edit_tasks: boolean | null
          can_edit_vision: boolean | null
          can_view_ai: boolean | null
          can_view_analytics: boolean
          can_view_briefings: boolean
          can_view_culture: boolean
          can_view_flows: boolean | null
          can_view_inventory: boolean | null
          can_view_notes: boolean | null
          can_view_positions: boolean
          can_view_processes: boolean
          can_view_projects: boolean
          can_view_tasks: boolean
          can_view_vision: boolean
          can_view_workload: boolean | null
          created_at: string
          id: string
          projects_only_assigned: boolean | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          can_edit_analytics?: boolean | null
          can_edit_briefings?: boolean | null
          can_edit_culture?: boolean | null
          can_edit_flows?: boolean | null
          can_edit_inventory?: boolean | null
          can_edit_notes?: boolean | null
          can_edit_positions?: boolean | null
          can_edit_processes?: boolean | null
          can_edit_projects?: boolean | null
          can_edit_tasks?: boolean | null
          can_edit_vision?: boolean | null
          can_view_ai?: boolean | null
          can_view_analytics?: boolean
          can_view_briefings?: boolean
          can_view_culture?: boolean
          can_view_flows?: boolean | null
          can_view_inventory?: boolean | null
          can_view_notes?: boolean | null
          can_view_positions?: boolean
          can_view_processes?: boolean
          can_view_projects?: boolean
          can_view_tasks?: boolean
          can_view_vision?: boolean
          can_view_workload?: boolean | null
          created_at?: string
          id?: string
          projects_only_assigned?: boolean | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          can_edit_analytics?: boolean | null
          can_edit_briefings?: boolean | null
          can_edit_culture?: boolean | null
          can_edit_flows?: boolean | null
          can_edit_inventory?: boolean | null
          can_edit_notes?: boolean | null
          can_edit_positions?: boolean | null
          can_edit_processes?: boolean | null
          can_edit_projects?: boolean | null
          can_edit_tasks?: boolean | null
          can_edit_vision?: boolean | null
          can_view_ai?: boolean | null
          can_view_analytics?: boolean
          can_view_briefings?: boolean
          can_view_culture?: boolean
          can_view_flows?: boolean | null
          can_view_inventory?: boolean | null
          can_view_notes?: boolean | null
          can_view_positions?: boolean
          can_view_processes?: boolean
          can_view_projects?: boolean
          can_view_tasks?: boolean
          can_view_vision?: boolean
          can_view_workload?: boolean | null
          created_at?: string
          id?: string
          projects_only_assigned?: boolean | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      user_subscriptions: {
        Row: {
          canceled_at: string | null
          created_at: string
          current_amount: number
          current_period_end: string | null
          current_period_start: string | null
          discount_by: string | null
          discount_percentage: number | null
          discount_reason: string | null
          exempt_by: string | null
          exempt_reason: string | null
          id: string
          is_exempt: boolean
          payment_provider: string | null
          payment_provider_customer_id: string | null
          payment_provider_subscription_id: string | null
          plan_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string
          current_amount?: number
          current_period_end?: string | null
          current_period_start?: string | null
          discount_by?: string | null
          discount_percentage?: number | null
          discount_reason?: string | null
          exempt_by?: string | null
          exempt_reason?: string | null
          id?: string
          is_exempt?: boolean
          payment_provider?: string | null
          payment_provider_customer_id?: string | null
          payment_provider_subscription_id?: string | null
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          canceled_at?: string | null
          created_at?: string
          current_amount?: number
          current_period_end?: string | null
          current_period_start?: string | null
          discount_by?: string | null
          discount_percentage?: number | null
          discount_reason?: string | null
          exempt_by?: string | null
          exempt_reason?: string | null
          id?: string
          is_exempt?: boolean
          payment_provider?: string | null
          payment_provider_customer_id?: string | null
          payment_provider_subscription_id?: string | null
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_config: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          instance_subdomain: string
          instance_token: string
          is_active: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          instance_subdomain?: string
          instance_token?: string
          is_active?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          instance_subdomain?: string
          instance_token?: string
          is_active?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_notification_logs: {
        Row: {
          error_message: string | null
          id: string
          message_type: string
          participant_id: string | null
          sent_at: string
          status: string
          task_id: string | null
          workspace_id: string
        }
        Insert: {
          error_message?: string | null
          id?: string
          message_type: string
          participant_id?: string | null
          sent_at?: string
          status?: string
          task_id?: string | null
          workspace_id: string
        }
        Update: {
          error_message?: string | null
          id?: string
          message_type?: string
          participant_id?: string | null
          sent_at?: string
          status?: string
          task_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_notification_logs_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "external_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_notification_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_notification_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invites: {
        Row: {
          accepted: boolean | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          permissions: Json | null
          role: Database["public"]["Enums"]["workspace_role"]
          token: string
          workspace_id: string
        }
        Insert: {
          accepted?: boolean | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          permissions?: Json | null
          role?: Database["public"]["Enums"]["workspace_role"]
          token: string
          workspace_id: string
        }
        Update: {
          accepted?: boolean | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          permissions?: Json | null
          role?: Database["public"]["Enums"]["workspace_role"]
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_member_blocks: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          created_at: string
          id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          created_at?: string
          id?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          created_at?: string
          id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_member_blocks_workspace_id_fkey"
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
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
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
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_next_due_date: {
        Args: {
          _current_date: string
          _recurrence_config: Json
          _recurrence_type: string
        }
        Returns: string
      }
      can_access_workspace: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      cleanup_expired_admin_sessions: { Args: never; Returns: undefined }
      get_user_admin_stats: {
        Args: { _user_id: string }
        Returns: {
          total_users_in_workspaces: number
          workspaces_member: number
          workspaces_owned: number
        }[]
      }
      get_user_by_email: {
        Args: { _email: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      get_user_permissions: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: {
          can_view_analytics: boolean
          can_view_briefings: boolean
          can_view_culture: boolean
          can_view_positions: boolean
          can_view_processes: boolean
          can_view_projects: boolean
          can_view_tasks: boolean
          can_view_vision: boolean
        }[]
      }
      get_user_workspace_id: { Args: { _user_id: string }; Returns: string }
      has_admin_view_session: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_email_blocked: { Args: { _email: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      is_project_owner: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_user_blocked: { Args: { _user_id: string }; Returns: boolean }
      user_belongs_to_workspace: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      user_has_role: {
        Args: {
          _role: Database["public"]["Enums"]["workspace_role"]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      user_is_admin_or_gestor: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      user_is_any_admin: { Args: { _user_id: string }; Returns: boolean }
      user_workspace_ids: {
        Args: { _user_id: string }
        Returns: {
          workspace_id: string
        }[]
      }
    }
    Enums: {
      admin_role: "super_admin" | "admin" | "employee"
      subscription_status:
        | "active"
        | "trial"
        | "canceled"
        | "past_due"
        | "exempt"
      user_account_status: "active" | "blocked" | "deleted"
      workspace_role: "admin" | "gestor" | "membro"
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
      admin_role: ["super_admin", "admin", "employee"],
      subscription_status: [
        "active",
        "trial",
        "canceled",
        "past_due",
        "exempt",
      ],
      user_account_status: ["active", "blocked", "deleted"],
      workspace_role: ["admin", "gestor", "membro"],
    },
  },
} as const
