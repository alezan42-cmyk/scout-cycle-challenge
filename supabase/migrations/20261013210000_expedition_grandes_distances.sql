-- =====================================================================
-- Expédition : nouvelles étapes « grandes distances » pour motiver la troupe
-- (Tour de France, Compostelle, Muraille de Chine, tour du monde…).
-- Les étapes déjà créées par le staff ne sont pas modifiées (on conflict do nothing).
-- Les colonnes x / y ne servent plus : la carte place les étapes elle-même.
-- =====================================================================

-- Colonnes déjà présentes en production (utile pour la base de test locale)
alter table public.expedition_waypoints
  add column if not exists subtitle text not null default '',
  add column if not exists target_km integer not null default 0,
  add column if not exists description text not null default '',
  add column if not exists badge_name text not null default '',
  add column if not exists badge_emoji text not null default '',
  add column if not exists x integer not null default 0,
  add column if not exists y integer not null default 0;

insert into public.expedition_waypoints
  (id, name, subtitle, target_km, description, badge_name, badge_emoji, x, y)
values
  ('kandersteg', 'Kandersteg', 'Le centre scout international, en Suisse', 700,
   'Environ 700 km séparent Moustier de Kandersteg, au pied des Alpes suisses : le chalet où des scouts du monde entier se retrouvent depuis 1923.',
   'Montagnard', '🏔️', 0, 0),
  ('jamboree-2027', 'Jamboree mondial 2027', 'Gdańsk, Pologne', 1300,
   'Environ 1 300 km jusqu''à l''île de Sobieszewo, à Gdańsk, où se tiendra le 26e Jamboree scout mondial (30 juillet – 8 août 2027).',
   'Jamboree', '🌍', 0, 0),
  ('rome', 'Rome', 'Tous les chemins y mènent', 1550,
   'Environ 1 550 km de route pour rejoindre la Ville éternelle. Tous les chemins mènent à Rome… à condition de pédaler !',
   'Légionnaire', '🏛️', 0, 0),
  ('compostelle', 'Saint-Jacques-de-Compostelle', 'Au bout du chemin des pèlerins', 2000,
   'Environ 2 000 km jusqu''à Compostelle, en Galice : la destination des pèlerins depuis le Moyen Âge.',
   'Pèlerin', '🐚', 0, 0),
  ('cap-nord', 'Cap Nord', 'Le bout de l''Europe, en Norvège', 3100,
   'Environ 3 100 km de route vers le nord pour atteindre le Cap Nord, où le soleil ne se couche pas en été.',
   'Viking', '🧭', 0, 0),
  ('tour-de-france', 'Tour de France', 'Les 21 étapes de l''édition 2026', 3333,
   '3 333 km : la distance totale du Tour de France 2026, de Barcelone à Paris. Les pros la font en trois semaines… et la troupe ?',
   'Maillot jaune', '💛', 0, 0),
  ('amazone', 'L''Amazone', 'Le plus grand fleuve du monde', 6400,
   'Environ 6 400 km : la longueur de l''Amazone, de la cordillère des Andes à l''océan Atlantique.',
   'Explorateur', '🌳', 0, 0),
  ('diametre-terre', 'Traverser la Terre', 'Son diamètre, d''un pôle à l''autre', 12742,
   '12 742 km : le diamètre de la Terre. Si on pouvait creuser un tunnel tout droit, la troupe ressortirait de l''autre côté de la planète !',
   'Foreur', '🌋', 0, 0),
  ('muraille-chine', 'Grande Muraille de Chine', 'Toutes ses sections mises bout à bout', 21196,
   '21 196 km : la longueur totale de la Grande Muraille de Chine, toutes sections comprises.',
   'Bâtisseur', '🐉', 0, 0),
  ('tour-du-monde', 'Le tour du monde', 'Une fois autour de l''équateur', 40075,
   '40 075 km : la circonférence de la Terre à l''équateur. Le défi ultime de la troupe !',
   'Globe-trotteur', '🌐', 0, 0)
on conflict (id) do nothing;
