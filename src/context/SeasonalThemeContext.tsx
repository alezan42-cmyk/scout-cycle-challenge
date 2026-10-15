import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import {
  ANIMATIONS_OFF_STORAGE_KEY,
  SEASONAL_THEME_STORAGE_KEY,
  THEME_PREVIEW_STORAGE_KEY,
  isSeasonalThemeId,
  parseStaffBirthdays,
  parseThemeCalendar,
  themeForDate,
  type StaffBirthday,
  type ThemeCalendar,
  type SeasonalThemeId,
  type ThemeIntensity,
  type ThemeMode,
} from "@/lib/seasonalTheme";

export interface ThemeSettings {
  /** Thème choisi en mode manuel */
  theme: SeasonalThemeId;
  mode: ThemeMode;
  intensity: ThemeIntensity;
  /** Photo d'accueil par thème (URL publique) */
  backgrounds: Partial<Record<SeasonalThemeId, string>>;
  /** Calendrier annuel personnalisé, défini par les admins. */
  calendar: ThemeCalendar | null;
  /** Anniversaires récurrents du staff, définis par les admins. */
  staffBirthdays: StaffBirthday[];
}

interface SeasonalThemeContextValue {
  /** Thème réellement affiché (aperçu > calendrier auto > choix manuel) */
  theme: SeasonalThemeId;
  settings: ThemeSettings;
  /** Animations visibles (intensité « festif » et pas coupées sur cet appareil) */
  animated: boolean;
  /** Photo d'accueil du thème affiché, sinon celle du thème standard */
  background: string | null;
  preview: SeasonalThemeId | null;
  setPreview: (theme: SeasonalThemeId | null) => void;
  animationsOff: boolean;
  setAnimationsOff: (off: boolean) => void;
  /** Réservé aux admins : la base refuse l'écriture aux autres (RLS). */
  setTheme: (theme: SeasonalThemeId) => Promise<void>;
  saveSetting: (key: string, value: string | null) => Promise<void>;
  refresh: () => Promise<void>;
}

// Le client exporté est une union (vrai client | client local de secours) : on le type une fois ici.
const supabase = supabaseClient as unknown as SupabaseClient;

const DEFAULT_SETTINGS: ThemeSettings = {
  theme: "default",
  mode: "manuel",
  intensity: "festif",
  backgrounds: {},
  calendar: null,
  staffBirthdays: [],
};

const SeasonalThemeContext = createContext<SeasonalThemeContextValue>({
  theme: "default",
  settings: DEFAULT_SETTINGS,
  animated: false,
  background: null,
  preview: null,
  setPreview: () => {},
  animationsOff: false,
  setAnimationsOff: () => {},
  setTheme: async () => {},
  saveSetting: async () => {},
  refresh: async () => {},
});

export function useSeasonalTheme() {
  return useContext(SeasonalThemeContext);
}

function readStorage(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(storage: "local" | "session", key: string, value: string | null) {
  try {
    const s = storage === "local" ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // stockage indisponible : pas grave
  }
}

function parseSettings(rows: { key: string; value: string }[]): ThemeSettings {
  const s: ThemeSettings = { ...DEFAULT_SETTINGS, backgrounds: {}, staffBirthdays: [] };
  for (const { key, value } of rows) {
    if (key === "theme" && isSeasonalThemeId(value)) s.theme = value;
    else if (key === "theme_mode" && (value === "auto" || value === "manuel")) s.mode = value;
    else if (key === "theme_intensity" && (value === "festif" || value === "discret"))
      s.intensity = value;
    else if (key === "theme_calendar") s.calendar = parseThemeCalendar(value);
    else if (key === "theme_staff_birthdays") s.staffBirthdays = parseStaffBirthdays(value);
    else if (key.startsWith("background:")) {
      const id = key.slice("background:".length);
      if (isSeasonalThemeId(id) && /^https:\/\//.test(value)) s.backgrounds[id] = value;
    }
  }
  return s;
}

export function SeasonalThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_SETTINGS);
  const [preview, setPreviewState] = useState<SeasonalThemeId | null>(null);
  const [animationsOff, setAnimationsOffState] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);

  // Valeurs mémorisées sur cet appareil (lues après le premier affichage)
  useEffect(() => {
    const cached = readStorage("local", SEASONAL_THEME_STORAGE_KEY);
    if (isSeasonalThemeId(cached))
      setSettings((s) => (loadedRef.current ? s : { ...s, theme: cached, mode: "manuel" }));
    const p = readStorage("session", THEME_PREVIEW_STORAGE_KEY);
    if (isSeasonalThemeId(p)) setPreviewState(p);
    setAnimationsOffState(readStorage("local", ANIMATIONS_OFF_STORAGE_KEY) === "1");
  }, []);
  // Le calendrier automatique se réévalue au changement de jour
  const [today, setToday] = useState(() => new Date().toDateString());

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from("site_settings").select("key, value");
    if (error || !data) return;
    loadedRef.current = true;
    setLoaded(true);
    setSettings(parseSettings(data as { key: string; value: string }[]));
  }, []);

  // Lecture initiale + mise à jour en direct + au retour sur l'onglet
  useEffect(() => {
    void refresh();

    const channel = supabase
      ?.channel?.("site_settings_theme")
      ?.on?.(
        "postgres_changes",
        { event: "*", schema: "public", table: "site_settings" },
        () => void refresh(),
      )
      ?.subscribe?.();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setToday(new Date().toDateString());
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => setToday(new Date().toDateString()), 30 * 60 * 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
      if (channel) void supabase.removeChannel?.(channel);
    };
  }, [refresh]);

  const siteTheme: SeasonalThemeId = useMemo(
    () =>
      settings.mode === "auto"
        ? themeForDate(new Date(today), settings.calendar, settings.staffBirthdays)
        : settings.theme,
    [settings.mode, settings.theme, settings.calendar, settings.staffBirthdays, today],
  );
  const theme = preview ?? siteTheme;

  useEffect(() => {
    if (theme === "default") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    // Le cache ne retient que le thème du site (pas l'aperçu), une fois lu en base
    if (loaded) writeStorage("local", SEASONAL_THEME_STORAGE_KEY, siteTheme);
  }, [theme, siteTheme, loaded]);

  const setPreview = useCallback((p: SeasonalThemeId | null) => {
    setPreviewState(p);
    writeStorage("session", THEME_PREVIEW_STORAGE_KEY, p);
  }, []);

  const setAnimationsOff = useCallback((off: boolean) => {
    setAnimationsOffState(off);
    writeStorage("local", ANIMATIONS_OFF_STORAGE_KEY, off ? "1" : null);
  }, []);

  const saveSetting = useCallback(
    async (key: string, value: string | null) => {
      const { error } =
        value === null
          ? await supabase.from("site_settings").delete().eq("key", key)
          : await supabase
              .from("site_settings")
              .upsert({ key, value, updated_at: new Date().toISOString() });
      if (error) throw error;
      await refresh();
    },
    [refresh],
  );

  const setTheme = useCallback(
    async (next: SeasonalThemeId) => {
      await saveSetting("theme", next);
    },
    [saveSetting],
  );

  const value = useMemo<SeasonalThemeContextValue>(
    () => ({
      theme,
      settings,
      animated: settings.intensity === "festif" && !animationsOff,
      background: settings.backgrounds[theme] ?? settings.backgrounds.default ?? null,
      preview,
      setPreview,
      animationsOff,
      setAnimationsOff,
      setTheme,
      saveSetting,
      refresh,
    }),
    [
      theme,
      settings,
      animationsOff,
      preview,
      setPreview,
      setAnimationsOff,
      setTheme,
      saveSetting,
      refresh,
    ],
  );
  return <SeasonalThemeContext.Provider value={value}>{children}</SeasonalThemeContext.Provider>;
}
