import type { ReactNode } from "react";

// Root layout — intentionally minimal.
// The [locale] layout provides <html> and <body> with locale-aware lang attribute.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
