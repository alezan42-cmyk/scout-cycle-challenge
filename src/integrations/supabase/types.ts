export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string;
          elevation_m: number | null;
          group_ride_id: string | null;
          id: string;
          km: number;
          note: string | null;
          proof_path: string | null;
          ride_date: string;
          status: Database["public"]["Enums"]["activity_status"];
          strava_link: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          elevation_m?: number | null;
          group_ride_id?: string | null;
          id?: string;
          km: number;
          note?: string | null;
          proof_path?: string | null;
          ride_date?: string;
          status?: Database["public"]["Enums"]["activity_status"];
          strava_link?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          elevation_m?: number | null;
          group_ride_id?: string | null;
          id?: string;
          km?: number;
          note?: string | null;
          proof_path?: string | null;
          ride_date?: string;
          status?: Database["public"]["Enums"]["activity_status"];
          strava_link?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activities_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      group_ride_members: {
        Row: {
          added_at: string;
          group_id: string;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          group_id: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          group_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "group_ride_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "group_rides";
            referencedColumns: ["id"];
          },
        ];
      };
      group_rides: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          ride_date: string;
          sport: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          id?: string;
          ride_date: string;
          sport?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          ride_date?: string;
          sport?: string;
        };
        Relationships: [];
      };
      patrols: {
        Row: {
          category: Database["public"]["Enums"]["patrol_category"];
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          category: Database["public"]["Enums"]["patrol_category"];
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          category?: Database["public"]["Enums"]["patrol_category"];
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          birth_day: number | null;
          birth_month: number | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          onboarded: boolean;
          patrol_id: string | null;
          phone: string | null;
          quali: string | null;
          scout_year: number | null;
          strava_url: string | null;
          totem: string | null;
        };
        Insert: {
          birth_day?: number | null;
          birth_month?: number | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          onboarded?: boolean;
          patrol_id?: string | null;
          phone?: string | null;
          quali?: string | null;
          scout_year?: number | null;
          strava_url?: string | null;
          totem?: string | null;
        };
        Update: {
          birth_day?: number | null;
          birth_month?: number | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          onboarded?: boolean;
          patrol_id?: string | null;
          phone?: string | null;
          quali?: string | null;
          scout_year?: number | null;
          strava_url?: string | null;
          totem?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_patrol_id_fkey";
            columns: ["patrol_id"];
            isOneToOne: false;
            referencedRelation: "patrols";
            referencedColumns: ["id"];
          },
        ];
      };
      site_settings: {
        Row: {
          key: string;
          updated_at: string;
          value: string;
        };
        Insert: {
          key: string;
          updated_at?: string;
          value: string;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: string;
        };
        Relationships: [];
      };
      weekly_badges: {
        Row: {
          awarded_date: string;
          badge_title: string;
          category: string | null;
          created_at: string | null;
          id: string;
          km: number | null;
          user_id: string;
          week_start: string | null;
        };
        Insert: {
          awarded_date?: string;
          badge_title: string;
          category?: string | null;
          created_at?: string | null;
          id?: string;
          km?: number | null;
          user_id: string;
          week_start?: string | null;
        };
        Update: {
          awarded_date?: string;
          badge_title?: string;
          category?: string | null;
          created_at?: string | null;
          id?: string;
          km?: number | null;
          user_id?: string;
          week_start?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      activities_public: {
        Row: {
          created_at: string | null;
          elevation_m: number | null;
          group_ride_id: string | null;
          id: string | null;
          km: number | null;
          note: string | null;
          ride_date: string | null;
          status: Database["public"]["Enums"]["activity_status"] | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      profiles_public: {
        Row: {
          created_at: string | null;
          full_name: string | null;
          id: string | null;
          is_admin: boolean | null;
          patrol_id: string | null;
          quali: string | null;
          scout_year: number | null;
          strava_url: string | null;
          totem: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_patrol_id_fkey";
            columns: ["patrol_id"];
            isOneToOne: false;
            referencedRelation: "patrols";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      upcoming_birthdays: {
        Args: { _days?: number };
        Returns: {
          user_id: string;
          display_name: string;
          patrol_name: string | null;
          birth_day: number;
          birth_month: number;
          days_until: number;
        }[];
      };
      admin_set_password: {
        Args: { _user_id: string; _password: string };
        Returns: undefined;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      leaderboard: {
        Args: { _from: string; _to: string };
        Returns: {
          category: Database["public"]["Enums"]["patrol_category"];
          display_name: string;
          km: number;
          patrol_id: string;
          patrol_name: string;
          user_id: string;
        }[];
      };
      set_admin_by_email: {
        Args: { _email: string; _make_admin: boolean };
        Returns: undefined;
      };
    };
    Enums: {
      activity_status: "pending" | "approved" | "rejected";
      app_role: "admin" | "user";
      patrol_category: "homme" | "femme" | "staff";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      activity_status: ["pending", "approved", "rejected"],
      app_role: ["admin", "user"],
      patrol_category: ["homme", "femme", "staff"],
    },
  },
} as const;
