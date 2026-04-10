"use client";

import { User } from "lucide-react";
import { cn } from "@/lib/utils";

function getInitials(name: string | null, email: string | null, isGuest: boolean): string {
  if (isGuest) {
    return "G";
  }

  const source = (name?.trim() || email?.trim() || "U").replace(/\s+/g, " ");
  const parts = source.split(" ").filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export function UserAvatar({
  name,
  email,
  photoUrl,
  isGuest,
  className,
}: {
  name: string | null;
  email: string | null;
  photoUrl: string | null;
  isGuest: boolean;
  className?: string;
}) {
  const initials = getInitials(name, email, isGuest);

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name ?? email ?? "Profile"}
        className={cn("h-9 w-9 rounded-full border border-fp-border object-cover", className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-fp-border bg-fp-surface-2 text-xs font-semibold text-foreground",
        className
      )}
      aria-hidden
    >
      {initials || <User size={14} />}
    </span>
  );
}
