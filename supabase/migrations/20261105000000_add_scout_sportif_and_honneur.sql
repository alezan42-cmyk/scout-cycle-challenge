-- Migration Supabase pour la gestion du Scout Sportif et du Scout d'Honneur

-- 1. Ajout des colonnes dans la table profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_scout_sportif BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS scout_sportif_elected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_scout_honneur BOOLEAN DEFAULT FALSE;

-- 2. Création de la table app_settings pour stocker la durée d'exclusion en mois (paramétrable via l'admin)
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activation de RLS sur app_settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour app_settings
CREATE POLICY "Permettre la lecture publique des app_settings" 
ON public.app_settings FOR SELECT 
USING (true);

CREATE POLICY "Permettre la modification aux admins sur app_settings" 
ON public.app_settings FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

-- Insertion de la valeur par défaut pour la durée d'exclusion du Scout Sportif (ex: 3 mois)
INSERT INTO public.app_settings (key, value)
VALUES ('scout_sportif_exclusion_months', '3'::jsonb)
ON CONFLICT (key) DO NOTHING;
