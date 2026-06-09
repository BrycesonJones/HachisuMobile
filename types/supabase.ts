export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      user_address_balances: {
        Row: {
          address_balance: number;
          address_id: string;
          created_at: string;
          id: string;
          transaction_hash_id: string | null;
          updated_at: string;
          user_id: string;
          username: string;
        };
        Insert: {
          address_balance?: number;
          address_id: string;
          created_at?: string;
          id?: string;
          transaction_hash_id?: string | null;
          updated_at?: string;
          user_id: string;
          username: string;
        };
        Update: {
          address_balance?: number;
          address_id?: string;
          created_at?: string;
          id?: string;
          transaction_hash_id?: string | null;
          updated_at?: string;
          user_id?: string;
          username?: string;
        };
        Relationships: [];
      };
      btcpay_store_provisioning_events: {
        Row: {
          btcpay_store_id: string | null;
          business_id: string | null;
          created_at: string;
          event_type: string;
          id: string;
          message: string | null;
          raw_error: Json | null;
          status: string;
          user_id: string;
        };
        Insert: {
          btcpay_store_id?: string | null;
          business_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          message?: string | null;
          raw_error?: Json | null;
          status: string;
          user_id: string;
        };
        Update: {
          btcpay_store_id?: string | null;
          business_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          message?: string | null;
          raw_error?: Json | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'btcpay_store_provisioning_events_business_id_fkey';
            columns: ['business_id'];
            isOneToOne: false;
            referencedRelation: 'user_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_profiles: {
        Row: {
          account_type: string;
          btcpay_store_id: string | null;
          btcpay_store_name: string | null;
          btcpay_user_id: string | null;
          business_address: string | null;
          business_country: string | null;
          business_description: string | null;
          business_name: string | null;
          business_website: string | null;
          country: string | null;
          created_at: string;
          display_name: string | null;
          email: string;
          expected_monthly_volume: string | null;
          full_name: string | null;
          id: string;
          lightning_provider: string | null;
          lightning_status: string;
          onboarding_completed: boolean;
          onboarding_status: string;
          onchain_provider: string | null;
          onchain_status: string;
          personal_address: string | null;
          phone: string | null;
          store_provisioning_status: string;
          updated_at: string;
          username: string | null;
          wallet_address: string | null;
          wallet_connected: boolean;
          wallet_status: string;
        };
        Insert: {
          account_type: string;
          btcpay_store_id?: string | null;
          btcpay_store_name?: string | null;
          btcpay_user_id?: string | null;
          business_address?: string | null;
          business_country?: string | null;
          business_description?: string | null;
          business_name?: string | null;
          business_website?: string | null;
          country?: string | null;
          created_at?: string;
          display_name?: string | null;
          email: string;
          expected_monthly_volume?: string | null;
          full_name?: string | null;
          id: string;
          lightning_provider?: string | null;
          lightning_status?: string;
          onboarding_completed?: boolean;
          onboarding_status?: string;
          onchain_provider?: string | null;
          onchain_status?: string;
          personal_address?: string | null;
          phone?: string | null;
          store_provisioning_status?: string;
          updated_at?: string;
          username?: string | null;
          wallet_address?: string | null;
          wallet_connected?: boolean;
          wallet_status?: string;
        };
        Update: {
          account_type?: string;
          btcpay_store_id?: string | null;
          btcpay_store_name?: string | null;
          btcpay_user_id?: string | null;
          business_address?: string | null;
          business_country?: string | null;
          business_description?: string | null;
          business_name?: string | null;
          business_website?: string | null;
          country?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string;
          expected_monthly_volume?: string | null;
          full_name?: string | null;
          id?: string;
          lightning_provider?: string | null;
          lightning_status?: string;
          onboarding_completed?: boolean;
          onboarding_status?: string;
          onchain_provider?: string | null;
          onchain_status?: string;
          personal_address?: string | null;
          phone?: string | null;
          store_provisioning_status?: string;
          updated_at?: string;
          username?: string | null;
          wallet_address?: string | null;
          wallet_connected?: boolean;
          wallet_status?: string;
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
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
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
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
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
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
