"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

interface Labels {
  title: string;
  body: string;
  retry: string;
}

interface Props {
  children: ReactNode;
  labels: Labels;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary for the top-level app shell.
 *
 * Catches rendering errors that escape the route-level error.tsx handlers —
 * typically errors in layout-level providers or the shell itself. Renders a
 * minimal recovery screen rather than a blank or broken page.
 *
 * The boundary sits inside NextIntlClientProvider, so its words come from
 * `messages/*.json` like everything else (UI-I18N-01): the wrapper below reads
 * them while the shell is healthy and hands them to the class component.
 *
 * Class component — required by React's error boundary API.
 */
export function AppShellErrorBoundary({ children }: { children: ReactNode }) {
  const t = useTranslations("appShellError");
  return (
    <ShellErrorBoundary labels={{ title: t("title"), body: t("body"), retry: t("retry") }}>
      {children}
    </ShellErrorBoundary>
  );
}

class ShellErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    // notFound(), redirect() and friends are Next.js control flow, not crashes.
    // Rethrow them to the framework boundaries above the shell (STAB-09), as
    // Next's own error boundary does.
    unstable_rethrow(error);
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppShell] Unhandled render error:", error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background px-6 pt-safe pb-safe">
          <div className="flex flex-col items-center gap-6 text-center max-w-xs">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-fp-surface">
              <AlertTriangle className="h-9 w-9 text-fp-warn-text" />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-xl font-semibold text-foreground">
                {this.props.labels.title}
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {this.props.labels.body}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="tap-target inline-flex items-center justify-center rounded-full bg-fp-lime px-6 py-3 text-sm font-semibold text-fp-on-lime transition active:scale-95"
            >
              {this.props.labels.retry}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
