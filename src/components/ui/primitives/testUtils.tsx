import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import no from "../../../../messages/no.json";
import en from "../../../../messages/en.json";

// Test-only: renders a primitive with the real messages (Norwegian first).
export function renderWithIntl(ui: ReactElement, locale: "no" | "en" = "no") {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={locale === "no" ? no : en}>
      {children}
    </NextIntlClientProvider>
  );
  return render(ui, { wrapper });
}
