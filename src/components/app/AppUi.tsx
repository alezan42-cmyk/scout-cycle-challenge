import type { ComponentType, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bloc titré de l'app (titre discret au-dessus, contenu en dessous). */
export function AppSection({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2.5", className)}>
      {(title || action) && (
        <div className="flex items-baseline justify-between gap-3 px-1">
          {title && <h2 className="app-section-title text-foreground">{title}</h2>}
          {action && <div className="shrink-0 whitespace-nowrap">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Carte blanche, coins arrondis, ombre légère. */
export function AppCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border/50 bg-card shadow-[0_1px_3px_rgb(0_0_0/0.05)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Liste groupée (lignes séparées par un trait fin), comme les réglages d'un téléphone. */
export function AppList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <AppCard className={cn("divide-y divide-border/60 overflow-hidden", className)}>
      {children}
    </AppCard>
  );
}

type RowIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

export function AppListRow({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  value,
  to,
  onClick,
  chevron = true,
  danger,
}: {
  icon?: RowIcon;
  iconClassName?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  to?: string;
  onClick?: () => void;
  chevron?: boolean;
  danger?: boolean;
}) {
  const body = (
    <>
      {Icon && (
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary",
            danger && "bg-destructive/10 text-destructive",
            iconClassName,
          )}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[16px] font-semibold text-foreground",
            danger && "text-destructive",
          )}
        >
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
      {value !== undefined && (
        <span className="shrink-0 text-[15px] font-semibold tabular-nums text-foreground">
          {value}
        </span>
      )}
      {chevron && (to || onClick) && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
      )}
    </>
  );
  const cls =
    "flex min-h-[60px] w-full items-center gap-3.5 px-4 py-2.5 text-left transition-colors active:bg-muted/70";
  if (to)
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}

/** Choix exclusif compact (2 à 4 options), façon iOS. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("grid gap-1 rounded-2xl bg-muted p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-2 text-[14px] font-semibold transition-all",
            value === o.value
              ? "bg-card text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
              : "text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Petites pastilles de filtre défilables horizontalement. */
export function ChipRow<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
}) {
  return (
    <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px] font-semibold transition-colors",
            value === o.value
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-card text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Message vide ou de chargement, centré et discret. */
export function AppEmpty({
  icon: Icon,
  title,
  text,
  children,
}: {
  icon?: RowIcon;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <AppCard className="px-6 py-10 text-center">
      {Icon && (
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <p className="text-[16px] font-semibold text-foreground">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-xs text-[14px] text-muted-foreground">{text}</p>}
      {children && <div className="mt-4">{children}</div>}
    </AppCard>
  );
}

/** Onglets texte légers (période), soulignés. */
export function TextTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
}) {
  return (
    <div role="tablist" className="flex gap-6 border-b border-border/60 px-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "-mb-px border-b-2 pb-2.5 pt-1 text-[15px] font-semibold transition-colors",
            value === o.value
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
