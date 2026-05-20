"use client";

import { useTabTitleBadge } from "@/lib/useTabTitleBadge";

/**
 * Invisible component that mounts the title-badge side effect. Returns null
 * because all of its work is in document.title manipulation. Mounted once
 * globally in Providers.tsx.
 */
export function TabTitleBadge() {
  useTabTitleBadge();
  return null;
}
