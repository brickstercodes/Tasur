/**
 * WHY: Generated TypeScript types for the Tasur Supabase schema.
 *
 * Supabase's generated types are the single source of truth for DB shape — using them
 * as a generic on every Supabase client call means TypeScript catches column name
 * typos and type mismatches at compile time, not at runtime. Regenerate after
 * any schema change: `supabase gen types typescript --linked > src/types/database.ts`
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.4';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      chat_messages: {
        Row: {
          concept_id: string | null;
          content: string;
          created_at: string;
          id: string;
          message_type: string | null;
          role: Database['public']['Enums']['chat_role_enum'];
          session_id: string;
        };
        Insert: {
          concept_id?: string | null;
          content: string;
          created_at?: string;
          id?: string;
          message_type?: string | null;
          role: Database['public']['Enums']['chat_role_enum'];
          session_id: string;
        };
        Update: {
          concept_id?: string | null;
          content?: string;
          created_at?: string;
          id?: string;
          message_type?: string | null;
          role?: Database['public']['Enums']['chat_role_enum'];
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_messages_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_messages_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'study_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      concept_relationships: {
        Row: {
          from_concept_id: string;
          id: string;
          relationship_type: string;
          session_id: string;
          to_concept_id: string;
        };
        Insert: {
          from_concept_id: string;
          id?: string;
          relationship_type: string;
          session_id: string;
          to_concept_id: string;
        };
        Update: {
          from_concept_id?: string;
          id?: string;
          relationship_type?: string;
          session_id?: string;
          to_concept_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'concept_relationships_from_concept_id_fkey';
            columns: ['from_concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'concept_relationships_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'study_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'concept_relationships_to_concept_id_fkey';
            columns: ['to_concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
        ];
      };
      concepts: {
        Row: {
          complexity: Database['public']['Enums']['complexity_enum'] | null;
          content: string | null;
          id: string;
          keywords: string[] | null;
          metadata: Json | null;
          name: string;
          session_id: string;
        };
        Insert: {
          complexity?: Database['public']['Enums']['complexity_enum'] | null;
          content?: string | null;
          id: string;
          keywords?: string[] | null;
          metadata?: Json | null;
          name: string;
          session_id: string;
        };
        Update: {
          complexity?: Database['public']['Enums']['complexity_enum'] | null;
          content?: string | null;
          id?: string;
          keywords?: string[] | null;
          metadata?: Json | null;
          name?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'concepts_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'study_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      documents: {
        Row: {
          file_path: string;
          file_type: Database['public']['Enums']['file_type_enum'];
          id: string;
          parsed_structure: Json | null;
          raw_text: string | null;
          session_id: string;
          uploaded_at: string;
          web_augmentations: Json | null;
        };
        Insert: {
          file_path: string;
          file_type: Database['public']['Enums']['file_type_enum'];
          id?: string;
          parsed_structure?: Json | null;
          raw_text?: string | null;
          session_id: string;
          uploaded_at?: string;
          web_augmentations?: Json | null;
        };
        Update: {
          file_path?: string;
          file_type?: Database['public']['Enums']['file_type_enum'];
          id?: string;
          parsed_structure?: Json | null;
          raw_text?: string | null;
          session_id?: string;
          uploaded_at?: string;
          web_augmentations?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'documents_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'study_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      flashcards: {
        Row: {
          back: string;
          card_type: Database['public']['Enums']['card_type_enum'];
          concept_id: string;
          created_at: string;
          difficulty: Database['public']['Enums']['difficulty_enum'];
          front: string;
          hints: string[] | null;
          id: string;
          session_id: string;
          sr_state: Json | null;
        };
        Insert: {
          back: string;
          card_type?: Database['public']['Enums']['card_type_enum'];
          concept_id: string;
          created_at?: string;
          difficulty?: Database['public']['Enums']['difficulty_enum'];
          front: string;
          hints?: string[] | null;
          id?: string;
          session_id: string;
          sr_state?: Json | null;
        };
        Update: {
          back?: string;
          card_type?: Database['public']['Enums']['card_type_enum'];
          concept_id?: string;
          created_at?: string;
          difficulty?: Database['public']['Enums']['difficulty_enum'];
          front?: string;
          hints?: string[] | null;
          id?: string;
          session_id?: string;
          sr_state?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'flashcards_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'flashcards_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'study_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      mindmaps: {
        Row: {
          created_at: string;
          id: string;
          mindmap_data: Json;
          session_id: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mindmap_data: Json;
          session_id: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          mindmap_data?: Json;
          session_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'mindmaps_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'study_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      study_sessions: {
        Row: {
          created_at: string;
          id: string;
          last_active_at: string;
          learning_mode: Database['public']['Enums']['learning_mode_enum'];
          status: Database['public']['Enums']['session_status_enum'];
          subject_domain: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_active_at?: string;
          learning_mode?: Database['public']['Enums']['learning_mode_enum'];
          status?: Database['public']['Enums']['session_status_enum'];
          subject_domain?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_active_at?: string;
          learning_mode?: Database['public']['Enums']['learning_mode_enum'];
          status?: Database['public']['Enums']['session_status_enum'];
          subject_domain?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'study_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      understanding_state: {
        Row: {
          assessment_history: Json | null;
          concept_id: string;
          confidence_score: number;
          effective_modalities: string[] | null;
          exposure_count: number;
          id: string;
          last_assessed_at: string | null;
          session_id: string;
          user_id: string;
        };
        Insert: {
          assessment_history?: Json | null;
          concept_id: string;
          confidence_score?: number;
          effective_modalities?: string[] | null;
          exposure_count?: number;
          id?: string;
          last_assessed_at?: string | null;
          session_id: string;
          user_id: string;
        };
        Update: {
          assessment_history?: Json | null;
          concept_id?: string;
          confidence_score?: number;
          effective_modalities?: string[] | null;
          exposure_count?: number;
          id?: string;
          last_assessed_at?: string | null;
          session_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'understanding_state_concept_id_fkey';
            columns: ['concept_id'];
            isOneToOne: false;
            referencedRelation: 'concepts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'understanding_state_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'study_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'understanding_state_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          learning_preferences: Json | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          learning_preferences?: Json | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          learning_preferences?: Json | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      card_type_enum: 'recall' | 'application' | 'explain' | 'compare';
      chat_role_enum: 'user' | 'assistant' | 'system';
      complexity_enum: 'foundational' | 'intermediate' | 'advanced';
      difficulty_enum: 'easy' | 'intermediate' | 'hard';
      file_type_enum: 'pdf' | 'docx' | 'txt' | 'image';
      learning_mode_enum: 'fast' | 'steady';
      session_status_enum: 'active' | 'paused' | 'completed';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

// ── Supabase utility generics (same as supabase gen types output) ─────────────

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends { Row: infer R }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends { Insert: infer I }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends { Update: infer U }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export const Constants = {
  graphql_public: { Enums: {} },
  public: {
    Enums: {
      card_type_enum: ['recall', 'application', 'explain', 'compare'],
      chat_role_enum: ['user', 'assistant', 'system'],
      complexity_enum: ['foundational', 'intermediate', 'advanced'],
      difficulty_enum: ['easy', 'intermediate', 'hard'],
      file_type_enum: ['pdf', 'docx', 'txt', 'image'],
      learning_mode_enum: ['fast', 'steady'],
      session_status_enum: ['active', 'paused', 'completed'],
    },
  },
} as const;

// ── Convenience row types ─────────────────────────────────────────────────────

export type UserRow = Database['public']['Tables']['users']['Row'];
export type StudySessionRow = Database['public']['Tables']['study_sessions']['Row'];
export type DocumentRow = Database['public']['Tables']['documents']['Row'];
export type ConceptRow = Database['public']['Tables']['concepts']['Row'];
export type ConceptRelationshipRow = Database['public']['Tables']['concept_relationships']['Row'];
export type UnderstandingStateRow = Database['public']['Tables']['understanding_state']['Row'];
export type FlashcardRow = Database['public']['Tables']['flashcards']['Row'];
export type MindmapRow = Database['public']['Tables']['mindmaps']['Row'];
export type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];

// ── SM-2 state shape (used in flashcards.sr_state JSONB) ─────────────────────

export interface SM2State {
  interval: number; // days until next review
  ease_factor: number; // EF, starts at 2.5
  repetitions: number; // successful reviews in a row
  next_review: string; // ISO timestamp
}

// ── Assessment history entry (used in understanding_state.assessment_history) ─

export interface AssessmentEntry {
  timestamp: string;
  score: number; // 0.0–1.0
  method: string; // 'micro_assessment' | 'flashcard' | 'teach_back'
}
