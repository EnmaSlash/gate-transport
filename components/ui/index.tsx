import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, forwardRef } from "react";

/* ============================================================
   CARD — with optional hover lift, accent header
   ============================================================ */

export function Card({
  title,
  accent,
  hover,
  children,
  className = "",
}: {
  title?: string;
  accent?: boolean;
  hover?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-[var(--border-default)]
                  bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-sm)]
                  ${hover ? "transition-all duration-200 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5" : ""}
                  ${className}`}
    >
      {title && (
        <h3 className={`text-[13px] font-semibold uppercase tracking-wider mb-4
          ${accent ? "text-[var(--brand-600)]" : "text-[var(--text-tertiary)]"}`}>
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

/* ============================================================
   BADGE — status color variants
   ============================================================ */

type BadgeVariant = "gray" | "blue" | "violet" | "amber" | "green" | "red" | "brand";

const BADGE_STYLES: Record<BadgeVariant, string> = {
  gray:   "bg-[var(--status-gray-bg)] text-[var(--status-gray-text)] border-[var(--status-gray-border)]",
  blue:   "bg-[var(--status-blue-bg)] text-[var(--status-blue-text)] border-[var(--status-blue-border)]",
  violet: "bg-[var(--status-violet-bg)] text-[var(--status-violet-text)] border-[var(--status-violet-border)]",
  amber:  "bg-[var(--status-amber-bg)] text-[var(--status-amber-text)] border-[var(--status-amber-border)]",
  green:  "bg-[var(--status-green-bg)] text-[var(--status-green-text)] border-[var(--status-green-border)]",
  red:    "bg-[var(--status-red-bg)] text-[var(--status-red-text)] border-[var(--status-red-border)]",
  brand:  "bg-[var(--brand-50)] text-[var(--brand-700)] border-[var(--brand-200)]",
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  DRAFT:              "gray",
  ASSIGNED:           "gray",
  ACCEPTED:           "blue",
  PICKUP_CONFIRMED:   "violet",
  DELIVERY_SUBMITTED: "amber",
  RELEASABLE:         "green",
  RELEASED:           "green",
  DISPUTED:           "red",
  CANCELLED:          "gray",
  held:               "amber",
  releasable:         "green",
  released:           "green",
};

export function Badge({
  children,
  variant = "gray",
  className = "",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold
                  uppercase tracking-wider leading-none ${BADGE_STYLES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANT[status] ?? "gray";
  const label = status.replace(/_/g, " ");
  return <Badge variant={variant}>{label}</Badge>;
}

/* ============================================================
   BUTTON — indigo primary, proper shadows
   ============================================================ */

type BtnVariant = "primary" | "secondary" | "danger" | "success" | "ghost";

const BTN_STYLES: Record<BtnVariant, string> = {
  primary:
    `bg-[var(--accent)] text-white shadow-[var(--shadow-brand)]
     hover:bg-[var(--accent-hover)] hover:shadow-lg
     disabled:bg-[var(--bg-subtle)] disabled:text-[var(--text-tertiary)] disabled:shadow-none`,
  secondary:
    `bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-default)]
     shadow-[var(--shadow-xs)] hover:bg-[var(--bg-muted)] hover:border-[var(--brand-200)]
     disabled:text-[var(--text-tertiary)] disabled:shadow-none`,
  danger:
    `bg-[var(--status-red-bg)] text-[var(--status-red-text)] border border-[var(--status-red-border)]
     hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed`,
  success:
    `bg-[var(--status-green-bg)] text-[var(--status-green-text)] border border-[var(--status-green-border)]
     hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed`,
  ghost:
    `bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]
     disabled:text-[var(--text-tertiary)]`,
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = {
    sm: "px-3 py-1.5 text-[13px]",
    md: "px-5 py-2.5 text-[14px]",
    lg: "px-6 py-3 text-[15px]",
  }[size];

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold
                  rounded-[var(--radius-md)] transition-all duration-150
                  focus-visible:outline-2 focus-visible:outline-[var(--brand-500)] focus-visible:outline-offset-2
                  disabled:cursor-not-allowed active:scale-[0.97]
                  ${sizeClass} ${BTN_STYLES[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* ============================================================
   FIELD (Label + Input wrapper)
   ============================================================ */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-[var(--text-primary)] mb-1.5">
        {label}
      </label>
      {hint && (
        <p className="text-[12px] text-[var(--text-tertiary)] mb-1.5">{hint}</p>
      )}
      {children}
    </div>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} className={`input ${className}`} {...props} />;
});

/* ============================================================
   ROW (label-value pair)
   ============================================================ */

export function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: any;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-[13px] text-[var(--text-tertiary)]">{label}</span>
      <span
        className={`text-[14px] font-medium text-[var(--text-primary)] ${
          mono ? "font-mono text-[13px]" : ""
        }`}
      >
        {String(value ?? "—")}
      </span>
    </div>
  );
}

/* ============================================================
   ALERT — with left color strip + icon
   ============================================================ */

type AlertVariant = "info" | "success" | "warning" | "error";

const ALERT_CONFIG: Record<AlertVariant, { bg: string; border: string; text: string; strip: string; icon: string }> = {
  info: {
    bg: "bg-[var(--status-blue-bg)]",
    border: "border-[var(--status-blue-border)]",
    text: "text-[var(--status-blue-text)]",
    strip: "bg-[var(--status-blue-text)]",
    icon: "M12 16v-4m0-4h.01M22 12a10 10 0 11-20 0 10 10 0 0120 0z",
  },
  success: {
    bg: "bg-[var(--status-green-bg)]",
    border: "border-[var(--status-green-border)]",
    text: "text-[var(--status-green-text)]",
    strip: "bg-[var(--status-green-text)]",
    icon: "M9 12l2 2 4-4m6 2a10 10 0 11-20 0 10 10 0 0120 0z",
  },
  warning: {
    bg: "bg-[var(--status-amber-bg)]",
    border: "border-[var(--status-amber-border)]",
    text: "text-[var(--status-amber-text)]",
    strip: "bg-[var(--status-amber-text)]",
    icon: "M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  },
  error: {
    bg: "bg-[var(--status-red-bg)]",
    border: "border-[var(--status-red-border)]",
    text: "text-[var(--status-red-text)]",
    strip: "bg-[var(--status-red-text)]",
    icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a10 10 0 11-20 0 10 10 0 0120 0z",
  },
};

export function Alert({
  variant = "info",
  children,
  className = "",
}: {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}) {
  const c = ALERT_CONFIG[variant];
  return (
    <div
      className={`relative rounded-[var(--radius-md)] border ${c.bg} ${c.border}
                  pl-5 pr-4 py-3 flex items-start gap-3 overflow-hidden ${className}`}
    >
      {/* Left accent strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${c.strip} rounded-l-[var(--radius-md)]`} />
      <svg className={`shrink-0 mt-0.5 ${c.text}`} width="16" height="16" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={c.icon} />
      </svg>
      <div className={`text-[14px] font-medium ${c.text} leading-snug`}>
        {children}
      </div>
    </div>
  );
}

/* ============================================================
   DIVIDER
   ============================================================ */

export function Divider({ className = "" }: { className?: string }) {
  return <div className={`border-t border-[var(--border-default)] ${className}`} />;
}

/* ============================================================
   SECTION HEADER (title + optional description)
   ============================================================ */

export function SectionHeader({
  title,
  description,
  actions,
  className = "",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between mb-4 ${className}`}>
      <div>
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
        {description && (
          <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">{description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}

/* ============================================================
   PROGRESS BAR (label + "x/y" + visual bar)
   ============================================================ */

export function ProgressBar({
  label,
  current,
  total,
  className = "",
}: {
  label: string;
  current: number;
  total: number;
  className?: string;
}) {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  const done = current >= total && total > 0;

  return (
    <div className={`${className}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] font-medium text-[var(--text-secondary)]">{label}</span>
        <span className={`text-[13px] font-bold tabular-nums ${
          done ? "text-[var(--status-green-text)]" : "text-[var(--text-primary)]"
        }`}>
          {current}/{total}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            done
              ? "bg-[var(--status-green-text)]"
              : pct > 0
                ? "bg-[var(--brand-500)]"
                : "bg-transparent"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ============================================================
   NEXT-STEP BANNER (prominent action callout)
   ============================================================ */

export function NextStepBanner({
  icon,
  title,
  description,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-[var(--radius-lg)] bg-gradient-to-r from-[var(--brand-600)] to-[var(--brand-500)]
                     p-5 text-white shadow-[var(--shadow-brand)] ${className}`}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className="w-10 h-10 rounded-[var(--radius-md)] bg-white/15 flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
        <div>
          <p className="text-[15px] font-bold leading-snug">{title}</p>
          {description && (
            <p className="text-[13px] text-white/80 mt-1 leading-snug">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PAGE LAYOUT
   ============================================================ */

export function PageContainer({
  children,
  size = "md",
  className = "",
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const maxW = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" }[size];
  return (
    <div className={`${maxW} mx-auto px-5 py-8 page-enter ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: string;
  back?: { label: string; onClick: () => void };
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-[var(--text-primary)]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[14px] text-[var(--text-tertiary)] mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {back && (
          <button
            onClick={back.onClick}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-secondary)]
                       hover:text-[var(--brand-600)] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {back.label}
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}
