import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { ALL_FORMATS, FORMAT_FIELD_COUNT } from "@/domain/match";
import type { MatchFormat } from "@/domain/match";
import { cn } from "@/lib/utils";

interface FormatSelectorProps {
  value: MatchFormat;
  onChange: (format: MatchFormat) => void;
  i18nNamespace?: "matchSetup.format" | "lineup.format";
}

export function FormatSelector({
  value,
  onChange,
  i18nNamespace = "matchSetup.format",
}: FormatSelectorProps) {
  const t = useTranslations(i18nNamespace);

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {ALL_FORMATS.map((format) => {
        const isSelected = format === value;
        const fieldCount = FORMAT_FIELD_COUNT[format];

        return (
          <motion.button
            key={format}
            onClick={() => onChange(format)}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.1 }}
            aria-pressed={isSelected}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border py-4 px-2 text-center transition duration-150 tap-target",
              isSelected
                ? "border-fp-lime bg-fp-lime text-fp-on-lime"
                : "border-fp-border bg-fp-surface-2 text-muted-foreground hover:border-fp-border hover:text-foreground"
            )}
          >
            <span className={cn("text-base font-bold leading-none tracking-tight", isSelected && "text-fp-on-lime")}>
              {format}
            </span>
            <span className="text-[10px] font-medium leading-none opacity-70">
              {t("fieldCount", { count: fieldCount })}
            </span>
            {isSelected && (
              <motion.span
                layoutId="format-dot"
                className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-fp-on-lime"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
