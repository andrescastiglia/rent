import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

export function Button({
  variant = "primary",
  busy = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`btn btn-${variant} ${className}`}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: Readonly<{
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}>) {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && (
          <p className="mb-2 text-xs font-semibold text-muted">{eyebrow}</p>
        )}
        <h1 className="break-words text-2xl font-semibold leading-tight text-foreground md:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export function Surface({
  className = "",
  children,
  ...props
}: Readonly<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div {...props} className={`ui-surface ${className}`}>
      {children}
    </div>
  );
}

export type FieldAttributes = {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};

export function FormField({
  id,
  label,
  help,
  error,
  children,
}: Readonly<{
  id: string;
  label: string;
  help?: string;
  error?: string;
  children: (attributes: FieldAttributes) => ReactNode;
}>) {
  const descriptionIds = [help && `${id}-help`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": descriptionIds || undefined,
      })}
      {help && (
        <p id={`${id}-help`} className="text-xs leading-relaxed text-muted">
          {help}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}
    </div>
  );
}

const badgeColors = {
  neutral: "bg-surface-muted text-muted",
  success:
    "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  danger: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
  info: "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
};

export function StatusBadge({
  children,
  tone = "neutral",
}: Readonly<{ children: ReactNode; tone?: keyof typeof badgeColors }>) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${badgeColors[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatePanel({
  title,
  description,
  action,
  busy = false,
  error = false,
}: Readonly<{
  title: string;
  description?: string;
  action?: ReactNode;
  busy?: boolean;
  error?: boolean;
}>) {
  const content = (
    <>
      {busy && (
        <Loader2
          className="h-6 w-6 animate-spin text-primary"
          aria-hidden="true"
        />
      )}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="max-w-lg text-sm text-muted">{description}</p>
      )}
      {action}
    </>
  );
  const className =
    "flex min-h-40 flex-col items-center justify-center gap-3 px-5 py-8 text-center";
  if (error)
    return (
      <div role="alert" className={className}>
        {content}
      </div>
    );
  return (
    <output aria-busy={busy || undefined} className={className}>
      {content}
    </output>
  );
}

export function FilterBar({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Surface className="grid min-w-0 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {children}
    </Surface>
  );
}
