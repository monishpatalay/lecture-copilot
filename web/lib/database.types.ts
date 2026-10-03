
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "courses": {
                  Row: {
                    "created_at": string,"id": string,"instructor_id": string | null,"is_public": boolean,"title": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"instructor_id"?: string | null,"is_public"?: boolean,"title": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"instructor_id"?: string | null,"is_public"?: boolean,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"lectures": {
                  Row: {
                    "course_id": string,"created_at": string,"duration_s": number | null,"error": string | null,"id": string,"locked_at": string | null,"number": number,"progress": number,"raw_key": string | null,"stage": string | null,"status": string,"title": string,"video_key": string | null
                  }
                  Insert: {
                    "course_id": string,"created_at"?: string,"duration_s"?: number | null,"error"?: string | null,"id"?: string,"locked_at"?: string | null,"number": number,"progress"?: number,"raw_key"?: string | null,"stage"?: string | null,"status"?: string,"title": string,"video_key"?: string | null
                  }
                  Update: {
                    "course_id"?: string,"created_at"?: string,"duration_s"?: number | null,"error"?: string | null,"id"?: string,"locked_at"?: string | null,"number"?: number,"progress"?: number,"raw_key"?: string | null,"stage"?: string | null,"status"?: string,"title"?: string,"video_key"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lectures_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "display_name": string | null,"id": string,"role": string
                  }
                  Insert: {
                    "display_name"?: string | null,"id": string,"role"?: string
                  }
                  Update: {
                    "display_name"?: string | null,"id"?: string,"role"?: string
                  }
                  Relationships: [
                    
                  ]
                },"questions": {
                  Row: {
                    "answer": string | null,"cited_segment_ids": (string)[],"course_id": string,"covered": boolean | null,"created_at": string,"id": string,"latency_ms": number | null,"model": string | null,"text": string,"user_hash": string | null
                  }
                  Insert: {
                    "answer"?: string | null,"cited_segment_ids"?: (string)[],"course_id": string,"covered"?: boolean | null,"created_at"?: string,"id"?: string,"latency_ms"?: number | null,"model"?: string | null,"text": string,"user_hash"?: string | null
                  }
                  Update: {
                    "answer"?: string | null,"cited_segment_ids"?: (string)[],"course_id"?: string,"covered"?: boolean | null,"created_at"?: string,"id"?: string,"latency_ms"?: number | null,"model"?: string | null,"text"?: string,"user_hash"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "questions_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                },"segments": {
                  Row: {
                    "embedding": string,"end_s": number,"id": string,"lecture_id": string,"slide_text": string | null,"start_s": number,"transcript": string,"tsv": unknown
                  }
                  Insert: {
                    "embedding": string,"end_s": number,"id"?: string,"lecture_id": string,"slide_text"?: string | null,"start_s": number,"transcript": string,"tsv"?: never
                  }
                  Update: {
                    "embedding"?: string,"end_s"?: number,"id"?: string,"lecture_id"?: string,"slide_text"?: string | null,"start_s"?: number,"transcript"?: string,"tsv"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "segments_lecture_id_fkey"
      columns: ["lecture_id"]
isOneToOne: false
      referencedRelation: "lectures"
      referencedColumns: ["id"]
    }
                  ]
                },"slides": {
                  Row: {
                    "id": string,"image_key": string,"lecture_id": string,"t_s": number,"text": string | null
                  }
                  Insert: {
                    "id"?: string,"image_key": string,"lecture_id": string,"t_s": number,"text"?: string | null
                  }
                  Update: {
                    "id"?: string,"image_key"?: string,"lecture_id"?: string,"t_s"?: number,"text"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "slides_lecture_id_fkey"
      columns: ["lecture_id"]
isOneToOne: false
      referencedRelation: "lectures"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "is_instructor":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"match_segments":
{ Args: { "k"?: number,"p_course_id": string,"p_lecture_id"?: string,"query_embedding": string,"query_text": string }; Returns: {
              "end_s": number,"id": string,"lecture_id": string,"lecture_number": number,"score": number,"similarity": number,"slide_text": string,"start_s": number,"transcript": string
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const

