import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Palette,
  Trash2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { useSeasonalTheme } from "@/context/SeasonalThemeContext";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import {
  SEASONAL_THEMES,
  defaultThemeCalendar,
  EDITABLE_CALENDAR_THEMES,
  themeForDate,
  themeMeta,
  type ThemeCalendar,
  type ThemeDateRange,
  type SeasonalThemeId,
  type ThemeIntensity,
  type ThemeMode,
} from "@/lib/seasonalTheme";
import { cn } from "@/lib/utils";
import { isTroopStaffPatrol } from "@/lib/categories";
import type { Patrol, Profile } from "@/lib/database";

const supabase = supabaseClient as unknown as SupabaseClient;
const BUCKET = "backgrounds";
const ANNUAL_DATE = /^\d{2}-\d{2}$/;
function annualDateInput(value: string, year: number, end?: boolean, start?: string) {
  const wraps = !!end && !!start && value < start;
  const inputYear = value === "02-29" ? 2028 : year + (wraps ? 1 : 0);
  return `${inputYear}-${value}`;
}

function fromAnnualDateInput(value: string) {
  return value.length >= 10 ? value.slice(5, 10) : "";
}

function annualDateLabel(value: string) {
  return ANNUAL_DATE.test(value) ? `${value.slice(3, 5)}/${value.slice(0, 2)}` : "—";
}

function profileBirthdayValue(profile: Profile) {
  if (!profile.birth_day || !profile.birth_month) return "";
  return `${String(profile.birth_month).padStart(2, "0")}-${String(profile.birth_day).padStart(2, "0")}`;
}

/** Réduit la photo (2000 px de large max, JPEG) pour que l'accueil reste rapide. */
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image illisible"))),
      "image/jpeg",
      0.82,
    ),
  );
}

/** Chemin du fichier dans le bucket à partir de son URL publique. */
function pathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length).split("?")[0] ?? "") : null;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string; hint: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-xl border-2 p-3 text-left transition disabled:opacity-60",
            value === o.value
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50",
          )}
        >
          <div className="text-sm font-bold text-foreground">{o.label}</div>
          <div className="text-[11px] leading-snug text-muted-foreground sm:text-xs">{o.hint}</div>
        </button>
      ))}
    </div>
  );
}

/** Onglet « Fêtes » du panneau admin : thèmes, calendrier et fonds d'écran. */
export function SeasonalThemeAdmin({
  profiles,
  patrols,
}: {
  profiles: Profile[];
  patrols: Patrol[];
}) {
  const { settings, preview, setPreview, saveSetting } = useSeasonalTheme();
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState<SeasonalThemeId | null>(null);
  const year = new Date().getFullYear();
  const [calendarDraft, setCalendarDraft] = useState<ThemeCalendar>(() =>
    defaultThemeCalendar(year),
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<SeasonalThemeId>("default");

  const calendarValue = JSON.stringify(settings.calendar);
  useEffect(() => {
    const saved = JSON.parse(calendarValue) as ThemeCalendar | null;
    setCalendarDraft(saved ?? defaultThemeCalendar(year));
  }, [calendarValue, year]);
  const troopStaffPatrolIds = new Set(
    patrols.filter(isTroopStaffPatrol).map((patrol) => patrol.id),
  );
  const troopStaff = profiles
    .filter((profile) => profile.patrol_id && troopStaffPatrolIds.has(profile.patrol_id))
    .filter((profile) => profileBirthdayValue(profile))
    .sort((a, b) => profileBirthdayValue(a).localeCompare(profileBirthdayValue(b)));

  const todayTheme = themeForDate(new Date(), settings.calendar, settings.staffBirthdays);
  const siteTheme = settings.mode === "auto" ? todayTheme : settings.theme;

  const save = async (key: string, value: string | null, success: string) => {
    setSaving(key);
    try {
      await saveSetting(key, value);
      toast.success(success);
    } catch (e) {
      const detail = e as { code?: string; message?: string };
      toast.error(
        detail.code === "23514"
          ? "La base Supabase n'accepte pas encore ce réglage. Applique la dernière migration Supabase."
          : (detail.message ?? (e instanceof Error ? e.message : "Impossible d'enregistrer")),
      );
    } finally {
      setSaving(null);
    }
  };

  const chooseTheme = async (id: SeasonalThemeId) => {
    if (settings.mode === "manuel" && id === settings.theme) return;
    setSaving("theme");
    try {
      await saveSetting("theme", id);
      if (settings.mode === "auto") await saveSetting("theme_mode", "manuel");
      toast.success(
        id === "default" ? "Thème standard activé" : `Thème « ${themeMeta(id).label} » activé`,
      );
    } catch (e) {
      const detail = e as { code?: string; message?: string };
      toast.error(
        detail.code === "23514"
          ? "La base Supabase n'accepte pas encore le thème Anniversaire. Applique la dernière migration Supabase."
          : (detail.message ?? (e instanceof Error ? e.message : "Impossible de changer le thème")),
      );
    } finally {
      setSaving(null);
    }
  };

  const pickFile = (id: SeasonalThemeId) => {
    uploadTarget.current = id;
    fileInput.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error("Choisis une photo JPG, PNG ou WebP");
      return;
    }
    const id = uploadTarget.current;
    setUploading(id);
    try {
      const blob = await compressImage(file);
      const path = `${id}_${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const old = settings.backgrounds[id];
      await saveSetting(`background:${id}`, data.publicUrl);
      const oldPath = old ? pathFromPublicUrl(old) : null;
      if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
      toast.success(`Fond d'écran « ${themeMeta(id).label} » mis en ligne`);
    } catch (err) {
      toast.error("Envoi impossible : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(null);
    }
  };

  const removeBackground = async (id: SeasonalThemeId) => {
    const url = settings.backgrounds[id];
    if (!url || !confirm(`Retirer le fond d'écran « ${themeMeta(id).label} » ?`)) return;
    setUploading(id);
    try {
      await saveSetting(`background:${id}`, null);
      const path = pathFromPublicUrl(url);
      if (path) await supabase.storage.from(BUCKET).remove([path]);
      toast.success("Fond d'écran retiré");
    } catch (err) {
      toast.error("Erreur : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(null);
    }
  };

  const updateRange = (
    id: SeasonalThemeId,
    index: number,
    field: keyof ThemeDateRange,
    value: string,
  ) => {
    setCalendarDraft((current) => {
      const ranges = [...(current[id] ?? [])];
      ranges[index] = {
        ...(ranges[index] ?? { start: "01-01", end: "01-01" }),
        [field]: fromAnnualDateInput(value),
      };
      return { ...current, [id]: ranges };
    });
  };

  const saveCalendar = async () => {
    const invalid = EDITABLE_CALENDAR_THEMES.some((id) =>
      (calendarDraft[id] ?? []).some(
        (range) => !ANNUAL_DATE.test(range.start) || !ANNUAL_DATE.test(range.end),
      ),
    );
    if (invalid) {
      toast.error("Choisis une date de début et de fin pour chaque période");
      return;
    }
    const complete = Object.fromEntries(
      EDITABLE_CALENDAR_THEMES.map((id) => [id, calendarDraft[id] ?? []]),
    ) as ThemeCalendar;
    await save("theme_calendar", JSON.stringify(complete), "Calendrier des fêtes enregistré");
  };

  return (
    <div className="space-y-6">
      {preview && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/10 p-3 text-sm">
          <span>
            <Eye className="mr-1 inline h-4 w-4" />
            Aperçu de <strong>{themeMeta(preview).label}</strong> sur ton écran uniquement — les
            autres voient toujours <strong>{themeMeta(siteTheme).label}</strong>.
          </span>
          <Button size="sm" variant="outline" onClick={() => setPreview(null)}>
            <EyeOff className="mr-1 h-4 w-4" /> Arrêter l&apos;aperçu
          </Button>
        </div>
      )}

      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-2 border-b pb-4">
          <Palette className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Thème du site</h2>
            <p className="text-xs text-muted-foreground">
              Couleurs, décorations et photo d&apos;accueil, pour tout le monde, en quelques
              secondes.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" /> Mode
            </div>
            <Segmented<ThemeMode>
              value={settings.mode}
              disabled={saving !== null}
              onChange={(v) =>
                save(
                  "theme_mode",
                  v,
                  v === "auto"
                    ? `Mode automatique : aujourd'hui « ${themeMeta(todayTheme).label} »`
                    : "Mode manuel activé",
                )
              }
              options={[
                {
                  value: "auto",
                  label: "Automatique",
                  hint: `Selon le calendrier — aujourd'hui : ${themeMeta(todayTheme).emoji} ${themeMeta(todayTheme).label}`,
                },
                {
                  value: "manuel",
                  label: "Manuel",
                  hint: "Le thème choisi ci-dessous reste affiché",
                },
              ]}
            />
          </div>

          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Intensité
            </div>
            <Segmented<ThemeIntensity>
              value={settings.intensity}
              disabled={saving !== null}
              onChange={(v) =>
                save("theme_intensity", v, v === "festif" ? "Mode festif" : "Mode discret")
              }
              options={[
                { value: "festif", label: "Festif", hint: "Couleurs, décor et animations" },
                {
                  value: "discret",
                  label: "Discret",
                  hint: "Couleurs et décor fixe, sans rien qui bouge",
                },
              ]}
            />
          </div>
        </div>

        <div className="mt-7 rounded-2xl border border-border/80 bg-background/70 p-4 sm:p-5">
          <div className="flex flex-col gap-4 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="font-display text-lg font-bold text-foreground">
                Fêtes &amp; événements
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Chaque carte rassemble le calendrier, la photo et les actions du thème
                correspondant. Les périodes configurées se répètent chaque année.
              </p>
            </div>
            <Button onClick={saveCalendar} disabled={saving !== null}>
              {saving === "theme_calendar" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Enregistrer les dates
            </Button>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onFile}
          />

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {SEASONAL_THEMES.map((theme) => {
              const isSite = theme.id === siteTheme;
              const isPreview = preview === theme.id;
              const hasCalendar = EDITABLE_CALENDAR_THEMES.some((id) => id === theme.id);
              const ranges = hasCalendar ? (calendarDraft[theme.id] ?? []) : [];
              const photo = settings.backgrounds[theme.id];
              const isUploading = uploading === theme.id;
              return (
                <article
                  key={theme.id}
                  className={cn(
                    "overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md",
                    isSite ? "border-primary/60 ring-1 ring-primary/20" : "border-border/80",
                  )}
                >
                  <div className="flex items-start justify-between gap-3 border-b border-border/70 bg-background/55 px-4 py-3.5 sm:px-5">
                    <div className="flex items-center gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-2xl">
                        {theme.emoji}
                      </span>
                      <div>
                        <h4 className="font-display font-bold text-foreground">{theme.label}</h4>
                        <p className="mt-0.5 text-xs text-muted-foreground">{theme.description}</p>
                      </div>
                    </div>
                    {isSite && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        <Check className="h-3.5 w-3.5" /> En ligne
                      </span>
                    )}
                  </div>

                  <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.7fr)]">
                    <div className="space-y-4">
                      <section>
                        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          <CalendarClock className="h-3.5 w-3.5" /> Calendrier
                        </div>
                        {hasCalendar ? (
                          <>
                            {ranges.length ? (
                              <div className="space-y-2">
                                {ranges.map((range, index) => (
                                  <div
                                    key={`${theme.id}-${index}`}
                                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] items-end gap-2 rounded-xl border border-border/70 bg-background p-2.5"
                                  >
                                    <label className="text-xs font-medium text-muted-foreground">
                                      Début
                                      <input
                                        type="date"
                                        value={annualDateInput(range.start, year)}
                                        onChange={(event) =>
                                          updateRange(theme.id, index, "start", event.target.value)
                                        }
                                        className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2 text-sm text-foreground"
                                      />
                                    </label>
                                    <label className="text-xs font-medium text-muted-foreground">
                                      Fin
                                      <input
                                        type="date"
                                        value={annualDateInput(range.end, year, true, range.start)}
                                        onChange={(event) =>
                                          updateRange(theme.id, index, "end", event.target.value)
                                        }
                                        className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2 text-sm text-foreground"
                                      />
                                    </label>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      aria-label={`Retirer une période ${theme.label}`}
                                      onClick={() =>
                                        setCalendarDraft((current) => ({
                                          ...current,
                                          [theme.id]: (current[theme.id] ?? []).filter(
                                            (_, i) => i !== index,
                                          ),
                                        }))
                                      }
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="rounded-xl border border-dashed border-border bg-background px-3 py-3 text-sm text-muted-foreground">
                                Aucune période configurée
                              </p>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2"
                              onClick={() =>
                                setCalendarDraft((current) => ({
                                  ...current,
                                  [theme.id]: [
                                    ...(current[theme.id] ?? []),
                                    { start: "01-01", end: "01-01" },
                                  ],
                                }))
                              }
                            >
                              <Plus className="mr-1.5 h-4 w-4" /> Ajouter une période
                            </Button>
                          </>
                        ) : theme.id === "anniversaire" ? (
                          <div className="rounded-xl border border-border/70 bg-background p-3">
                            <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
                              Dates reprises automatiquement des profils de la patrouille Staff
                              troupe ; elles reviennent chaque année.
                            </p>
                            {troopStaff.length ? (
                              <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                                {troopStaff.map((profile) => (
                                  <li
                                    key={profile.id}
                                    className="flex items-center justify-between gap-2 text-sm"
                                  >
                                    <span className="truncate text-foreground">
                                      {profile.totem || profile.full_name || "Membre du staff"}
                                    </span>
                                    <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
                                      {annualDateLabel(profileBirthdayValue(profile))}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Aucune date de profil configurée.
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="rounded-xl border border-border/70 bg-background px-3 py-3 text-sm text-muted-foreground">
                            Thème à activer manuellement le jour de l&apos;événement.
                          </p>
                        )}
                      </section>

                      <section>
                        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          <Palette className="h-3.5 w-3.5" /> Couleurs
                        </div>
                        <div className="flex items-center gap-2">
                          {theme.swatch.map((color) => (
                            <span
                              key={color}
                              className="h-5 w-5 rounded-full border border-black/10"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </section>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
                        {photo ? (
                          <img
                            src={photo}
                            alt={`Photo ${theme.label}`}
                            className="h-32 w-full object-cover sm:h-36"
                          />
                        ) : (
                          <div className="grid h-32 place-items-center text-sm text-muted-foreground sm:h-36">
                            Aucune photo de fond
                          </div>
                        )}
                        <div className="flex gap-2 p-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            disabled={uploading !== null}
                            onClick={() => pickFile(theme.id)}
                          >
                            {isUploading ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                              <ImagePlus className="mr-1.5 h-4 w-4" />
                            )}
                            {photo ? "Remplacer la photo" : "Ajouter une photo"}
                          </Button>
                          {photo && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Retirer la photo ${theme.label}`}
                              disabled={uploading !== null}
                              onClick={() => void removeBackground(theme.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="mt-auto flex gap-2">
                        <Button
                          className="flex-1"
                          variant={isSite && settings.mode === "manuel" ? "secondary" : "default"}
                          disabled={saving !== null || (isSite && settings.mode === "manuel")}
                          onClick={() => chooseTheme(theme.id)}
                        >
                          {saving === "theme" ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          {isSite && settings.mode === "manuel"
                            ? "Thème actif"
                            : "Activer ce thème"}
                        </Button>
                        <Button
                          variant="outline"
                          aria-label={`${isPreview ? "Arrêter l’aperçu" : "Prévisualiser"} ${theme.label}`}
                          onClick={() => setPreview(isPreview ? null : theme.id)}
                        >
                          {isPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {settings.mode === "auto" && (
            <p className="mt-4 text-xs text-muted-foreground">
              « Activer ce thème » passe en mode manuel. Le thème automatique continue à suivre le
              calendrier.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
