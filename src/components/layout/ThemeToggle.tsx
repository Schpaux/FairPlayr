"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations("a11y");
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — render placeholder until client is ready
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="h-9 w-9 rounded-xl bg-fp-surface-2 animate-pulse" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative h-9 w-9 rounded-xl surface-2 border border-fp-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors tap-target"
      aria-label={isDark ? t("switchToLight") : t("switchToDark")}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={resolvedTheme}
          initial={{ opacity: 0, rotate: -30, scale: 0.8 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 30, scale: 0.8 }}
          transition={{ duration: 0.15 }}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
