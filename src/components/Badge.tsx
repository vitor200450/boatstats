import { ReactNode } from "react";

type BadgeVariant = "neutral" | "accent" | "success" | "warning";

type BadgeProps = {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  dotColorClassName?: string;
  className?: string;
};

const variantClasses: Record<BadgeVariant, string> = {
  neutral: "border-zinc-700 bg-zinc-900 text-zinc-300",
  accent: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  warning: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
};

const sizeClasses = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-[11px]",
};

export function Badge({
  children,
  variant = "neutral",
  size = "sm",
  dotColorClassName,
  className,
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border font-medium ${sizeClasses[size]} ${variantClasses[variant]} ${className || ""}`}
    >
      {dotColorClassName && (
        <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${dotColorClassName}`} />
      )}
      {children}
    </span>
  );
}
