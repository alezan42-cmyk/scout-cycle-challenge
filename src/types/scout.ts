export interface Profile {
  id: string;
  email?: string;
  totem?: string;
  qualificatif?: string;
  role: 'scout' | 'admin' | 'staff';
  patrol_id?: string;
  scout_year?: number;
  strava_link?: string;
  is_scout_sportif?: boolean;
  scout_sportif_elected_at?: string | null;
  is_scout_honneur?: boolean;
  created_at?: string;
}

export interface AppSetting {
  key: string;
  value: any;
  updated_at?: string;
}
