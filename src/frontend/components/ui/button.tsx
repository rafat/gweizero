"use client";

import { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({ className, variant = "primary", ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "bg-accent text-black hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80",
        variant === "secondary" &&
          "border border-line bg-surface-2 text-text hover:border-accent/40 hover:bg-surface",
        className
      )}
      {...props}
    />
  );
}
