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

function profileBirthdayInput(profile: Profile) {
  if (!profile.birth_day || !profile.birth_month) return "";
  return `2000-${String(profile.birth_month).padStart(2, "0")}-${String(profile.birth_day).padStart(2, "0")}`;
}

function idPeriod(id: SeasonalThemeId, calendar: ThemeCalendar) {
  if (id === "anniversaire") return "Dates configurées dans la section anniversaire";
  if (id === "foot" || id === "tennis") return "Manuel : le jour du match";
  const ranges = calendar[id] ?? [];
  return ranges.length
    ? ranges
        .map(({ start, end }) => `${annualDateLabel(start)} → ${annualDateLabel(end)}`)
        .join(" · ")
    : "Désactivé dans le calendrier";
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

/** Onglet « Fêtes » du panneau admin : thème, calendrier, intensité, fonds d'écran. */
export function SeasonalThemeAdmin({
  profiles,
  patrols,
  onRefresh,
}: {
  profiles: Profile[];
  patrols: Patrol[];
  onRefresh: () => void | Promise<void>;
}) {
  const { settings, preview, setPreview, saveSetting, refresh } = useSeasonalTheme();
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState<SeasonalThemeId | null>(null);
  const year = new Date().getFullYear();
  const [calendarDraft, setCalendarDraft] = useState<ThemeCalendar>(() =>
    defaultThemeCalendar(year),
  );
  const [updatingBirthdayId, setUpdatingBirthdayId] = useState<string | null>(null);
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
  const troopStaff = profiles.filter(
    (profile) => profile.patrol_id && troopStaffPatrolIds.has(profile.patrol_id),
  );

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

  const updateStaffBirthday = async (profile: Profile, value: string) => {
    const birthDay = value ? Number(value.slice(8, 10)) : null;
    const birthMonth = value ? Number(value.slice(5, 7)) : null;
    setUpdatingBirthdayId(profile.id);
    const { error } = await supabase
      .from("profiles")
      .update({ birth_day: birthDay, birth_month: birthMonth })
      .eq("id", profile.id);
    if (error) {
      toast.error(`Impossible d'enregistrer la date du profil : ${error.message}`);
    } else {
      toast.success("Date de profil enregistrée ; elle revient chaque année");
      await Promise.all([onRefresh(), refresh()]);
    }
    setUpdatingBirthdayId(null);
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

        <div className="mt-6 rounded-xl border border-border/80 bg-background/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-foreground">
                Dates du calendrier automatique
              </h3>
              <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
                Ces périodes reviennent chaque année. Pâques et Carnaval changent de date selon
                l&apos;année : pense à ajuster leurs périodes. Les fêtes qui se chevauchent suivent
                l&apos;ordre de priorité ci-dessous; les périodes supprimées ne seront plus
                activées.
              </p>
            </div>
            <Button size="sm" onClick={saveCalendar} disabled={saving !== null}>
              {saving === "theme_calendar" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Enregistrer les dates"
              )}
            </Button>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {EDITABLE_CALENDAR_THEMES.map((id) => {
              const theme = themeMeta(id);
              const ranges = calendarDraft[id] ?? [];
              const photo = settings.backgrounds[id];
              const isUploading = uploading === id;
              return (
                <article key={id} className="overflow-hidden rounded-xl border bg-card">
                  <div className="flex items-center justify-between gap-3 border-b bg-background/50 p-3">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <span className="text-xl">{theme.emoji}</span>
                      <span>{theme.label}</span>
                    </div>
                    {ranges.length === 0 && (
                      <span className="text-xs text-muted-foreground">Désactivé</span>
                    )}
                  </div>
                  <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.65fr)]">
                    <div>
                      <div className="space-y-2">
                        {ranges.map((range, index) => (
                          <div
                            key={`${id}-${index}`}
                            className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
                          >
                            <label className="text-[11px] font-medium text-muted-foreground">
                              Début
                              <input
                                type="date"
                                value={annualDateInput(range.start, year)}
                                onChange={(event) =>
                                  updateRange(id, index, "start", event.target.value)
                                }
                                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                              />
                            </label>
                            <label className="text-[11px] font-medium text-muted-foreground">
                              Fin
                              <input
                                type="date"
                                value={annualDateInput(range.end, year, true, range.start)}
                                onChange={(event) =>
                                  updateRange(id, index, "end", event.target.value)
                                }
                                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                              />
                            </label>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Retirer une période ${theme.label}`}
                              onClick={() =>
                                setCalendarDraft((current) => ({
                                  ...current,
                                  [id]: (current[id] ?? []).filter((_, i) => i !== index),
                                }))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() =>
                          setCalendarDraft((current) => ({
                            ...current,
                            [id]: [...(current[id] ?? []), { start: "01-01", end: "01-01" }],
                          }))
                        }
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter une période
                      </Button>
                    </div>
                    <div className="flex min-h-24 flex-col overflow-hidden rounded-lg border bg-background">
                      {photo ? (
                        <img
                          src={photo}
                          alt={`Photo ${theme.label}`}
                          className="h-24 w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-24 place-items-center text-xs text-muted-foreground">
                          Aucune photo
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5 p-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          disabled={uploading !== null}
                          onClick={() => pickFile(id)}
                        >
                          {isUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <ImagePlus className="mr-1 h-3.5 w-3.5" /> Photo
                            </>
                          )}
                        </Button>
                        {photo && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Retirer la photo ${theme.label}`}
                            disabled={uploading !== null}
                            onClick={() => void removeBackground(id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
            <article className="overflow-hidden rounded-xl border border-pink-200 bg-card dark:border-pink-900">
              <div className="flex items-center gap-2 border-b bg-pink-50/60 p-3 text-sm font-bold dark:bg-pink-950/20">
                <span className="text-xl">🎂</span> Anniversaire — Staff troupe
              </div>
              <div className="p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,0.65fr)]">
                  <div>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Les dates viennent des profils de la patrouille Staff troupe et reviennent
                      automatiquement chaque année. Modifie-les ici pour les enregistrer dans le
                      profil.
                    </p>
                    {troopStaff.length === 0 ? (
                      <p className="rounded-lg bg-background p-3 text-sm text-muted-foreground">
                        Aucun membre dans la patrouille Staff troupe.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {troopStaff.map((profile) => (
                          <label
                            key={profile.id}
                            className="flex items-center justify-between gap-3 rounded-lg border bg-background p-2 text-sm"
                          >
                            <span className="min-w-0 truncate font-medium">
                              {profile.totem ||
                                profile.full_name ||
                                profile.email ||
                                "Membre du staff"}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <input
                                type="date"
                                value={profileBirthdayInput(profile)}
                                disabled={updatingBirthdayId === profile.id}
                                onChange={(event) =>
                                  void updateStaffBirthday(profile, event.target.value)
                                }
                                className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                                aria-label={`Anniversaire de ${profile.totem || profile.full_name || "ce membre"}`}
                              />
                              {updatingBirthdayId === profile.id && (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col overflow-hidden rounded-lg border bg-background">
                    {settings.backgrounds.anniversaire ? (
                      <img
                        src={settings.backgrounds.anniversaire}
                        alt="Photo Anniversaire"
                        className="h-24 w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-24 place-items-center text-xs text-muted-foreground">
                        Aucune photo
                      </div>
                    )}
                    <div className="flex gap-1.5 p-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        disabled={uploading !== null}
                        onClick={() => pickFile("anniversaire")}
                      >
                        {uploading === "anniversaire" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <ImagePlus className="mr-1 h-3.5 w-3.5" /> Photo
                          </>
                        )}
                      </Button>
                      {settings.backgrounds.anniversaire && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Retirer la photo Anniversaire"
                          disabled={uploading !== null}
                          onClick={() => void removeBackground("anniversaire")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
          {SEASONAL_THEMES.map((t) => {
            const isSite = t.id === siteTheme;
            const isPreview = preview === t.id;
            return (
              <div
                key={t.id}
                className={cn(
                  "relative flex flex-col rounded-xl border-2 bg-background p-3 sm:p-4",
                  isSite ? "border-primary shadow-md" : "border-border",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl leading-none sm:text-3xl">{t.emoji}</span>
                  {isSite && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                      <Check className="h-3 w-3" /> En ligne
                    </span>
                  )}
                </div>
                <div className="mt-2 font-display text-sm font-bold text-foreground">{t.label}</div>
                <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
                  {t.description}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  <CalendarClock className="mr-1 inline h-3 w-3" />
                  {idPeriod(t.id, calendarDraft)}
                </p>
                <div className="mt-3 hidden gap-1.5 sm:flex">
                  {t.swatch.map((c) => (
                    <span
                      key={c}
                      className="h-5 w-5 rounded-full border border-black/10"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="mt-auto flex gap-2 pt-3">
                  <Button
                    size="sm"
                    className="flex-1"
                    variant={isSite && settings.mode === "manuel" ? "secondary" : "default"}
                    disabled={saving !== null || (isSite && settings.mode === "manuel")}
                    onClick={() => chooseTheme(t.id)}
                  >
                    {saving === "theme" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activer"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Aperçu ${t.label}`}
                    onClick={() => setPreview(isPreview ? null : t.id)}
                  >
                    {isPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {settings.mode === "auto" && (
          <p className="mt-3 text-xs text-muted-foreground">
            « Activer » repasse en mode manuel avec ce thème.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-2 border-b pb-4">
          <ImagePlus className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">
              Photos des thèmes manuels
            </h2>
            <p className="text-xs text-muted-foreground">
              Le Standard et les thèmes de match n&apos;ont pas de dates automatiques. Les photos
              des fêtes sont modifiables directement sur leur carte. Les photos sont publiques : pas
              de visage de scout reconnaissable sans accord.
            </p>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onFile}
        />
        <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
          {SEASONAL_THEMES.filter((theme) => ["default", "foot", "tennis"].includes(theme.id)).map(
            (t) => {
              const url = settings.backgrounds[t.id];
              const busy = uploading === t.id;
              return (
                <div key={t.id} className="overflow-hidden rounded-xl border bg-background">
                  <div className="relative h-20 bg-muted sm:h-28">
                    {url ? (
                      <>
                        <img src={url} alt="" className="h-full w-full object-cover opacity-70" />
                        <div
                          className="absolute inset-0 mix-blend-multiply"
                          style={{ backgroundColor: t.swatch[1], opacity: 0.35 }}
                        />
                      </>
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-muted-foreground">
                        Pas de photo
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-bold text-white">
                      {t.emoji} {t.label}
                    </span>
                  </div>
                  <div className="flex gap-2 p-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={uploading !== null}
                      onClick={() => pickFile(t.id)}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : url ? (
                        "Remplacer"
                      ) : (
                        "Envoyer"
                      )}
                    </Button>
                    {url && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Retirer le fond"
                        disabled={uploading !== null}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeBackground(t.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}
