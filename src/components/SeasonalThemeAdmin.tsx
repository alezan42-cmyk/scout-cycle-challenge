import { useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Palette,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { useSeasonalTheme } from "@/context/SeasonalThemeContext";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import {
  SEASONAL_THEMES,
  themeForDate,
  themeMeta,
  type SeasonalThemeId,
  type ThemeIntensity,
  type ThemeMode,
} from "@/lib/seasonalTheme";
import { cn } from "@/lib/utils";

const supabase = supabaseClient as unknown as SupabaseClient;
const BUCKET = "backgrounds";

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
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
export function SeasonalThemeAdmin() {
  const { settings, preview, setPreview, saveSetting } = useSeasonalTheme();
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState<SeasonalThemeId | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<SeasonalThemeId>("default");

  const todayTheme = themeForDate(new Date());
  const siteTheme = settings.mode === "auto" ? todayTheme : settings.theme;
  const calendarThemes = SEASONAL_THEMES.filter(
    (theme) => theme.id !== "foot" && theme.id !== "tennis",
  );
  const eventThemes = SEASONAL_THEMES.filter(
    (theme) => theme.id === "foot" || theme.id === "tennis",
  );

  const save = async (key: string, value: string | null, success: string) => {
    setSaving(key);
    try {
      await saveSetting(key, value);
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d'enregistrer");
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
      toast.error(e instanceof Error ? e.message : "Impossible de changer le thème");
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

        <div className="mt-5 rounded-xl border bg-muted/20 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Thème affiché sur le site
              </p>
              <p className="mt-1 font-display text-base font-bold text-foreground">
                {themeMeta(siteTheme).emoji} {themeMeta(siteTheme).label}
              </p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              {settings.mode === "auto" ? "Automatique" : "Manuel"}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-background p-3">
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
                    hint: `Suit le calendrier. Aujourd'hui : ${themeMeta(todayTheme).emoji} ${themeMeta(todayTheme).label}`,
                  },
                  {
                    value: "manuel",
                    label: "Manuel",
                    hint: "Garde le thème choisi, même si le calendrier change",
                  },
                ]}
              />
            </div>
            <div className="rounded-lg bg-background p-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Animations
              </div>
              <Segmented<ThemeIntensity>
                value={settings.intensity}
                disabled={saving !== null}
                onChange={(v) =>
                  save("theme_intensity", v, v === "festif" ? "Mode festif" : "Mode discret")
                }
                options={[
                  { value: "festif", label: "Animé", hint: "Décorations et animations visibles" },
                  {
                    value: "discret",
                    label: "Calme",
                    hint: "Garde les couleurs, sans animations",
                  },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="mt-7 space-y-6">
          <div>
            <div className="mb-3">
              <h3 className="font-display text-base font-bold text-foreground">
                Thèmes du calendrier
              </h3>
              <p className="text-xs text-muted-foreground">
                Sélectionne un thème pour le prévisualiser ou l&apos;activer sur le site.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {calendarThemes.map((t) => {
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
                    <div className="mt-2 font-display text-sm font-bold text-foreground">
                      {t.label}
                    </div>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">
                      {t.description}
                    </p>
                    <p className="mt-2 text-xs leading-snug text-muted-foreground">
                      <CalendarClock className="mr-1 inline h-3 w-3" />
                      {t.period}
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
                        {saving === "theme" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Activer"
                        )}
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
          </div>

          <div className="border-t pt-5">
            <div className="mb-3">
              <h3 className="font-display text-base font-bold text-foreground">
                Événements ponctuels
              </h3>
              <p className="text-xs text-muted-foreground">
                Ces thèmes ne sont jamais choisis automatiquement par le calendrier.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {eventThemes.map((t) => {
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
                      <span className="text-2xl leading-none">{t.emoji}</span>
                      {isSite && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                          <Check className="h-3 w-3" /> En ligne
                        </span>
                      )}
                    </div>
                    <div className="mt-2 font-display text-sm font-bold text-foreground">
                      {t.label}
                    </div>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">
                      {t.description}
                    </p>
                    <p className="mt-2 text-xs leading-snug text-muted-foreground">
                      <CalendarClock className="mr-1 inline h-3 w-3" /> {t.period}
                    </p>
                    <div className="mt-3 flex gap-1.5">
                      {t.swatch.map((color) => (
                        <span
                          key={color}
                          className="h-5 w-5 rounded-full border border-black/10"
                          style={{ backgroundColor: color }}
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
                        {saving === "theme" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Activer"
                        )}
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
          </div>
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
            <h2 className="font-display text-lg font-bold text-foreground">Fonds d&apos;écran</h2>
            <p className="text-xs text-muted-foreground">
              Photo de l&apos;accueil, sous le voile aux couleurs du thème. Sans photo propre, un
              thème utilise celle du thème Standard, sinon la photo d&apos;origine. Les photos sont
              publiques : pas de visage de scout reconnaissable sans accord.
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
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SEASONAL_THEMES.map((t) => {
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
          })}
        </div>
      </div>
    </div>
  );
}
