import { AuthProvider } from "@/components/providers/AuthProvider";
import { TeamWorkspaceProvider } from "@/components/providers/TeamWorkspaceProvider";
import { ActiveMatchProvider } from "@/components/providers/ActiveMatchProvider";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { ActiveMatchBanner } from "@/components/layout/ActiveMatchBanner";
import { NativeAppShell } from "@/components/layout/NativeAppShell";
import { AppShellErrorBoundary } from "@/components/layout/AppShellErrorBoundary";
import { PwaRoot } from "@/components/pwa/PwaRoot";

/**
 * The coach app's shell: session, team, active match, service worker, header
 * and bottom nav. Moved out of [locale]/layout.tsx unchanged (FEAT-SHARE-01),
 * so the public match page can render without any of it.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TeamWorkspaceProvider>
        <ActiveMatchProvider>
          <PwaRoot />
          <AppShellErrorBoundary>
            <NativeAppShell>
              <div className="relative flex min-h-dvh flex-col">
                <Header />
                <ActiveMatchBanner />
                {/* Clears the bottom nav (64px + safe area). */}
                <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</main>
                <BottomNav />
              </div>
            </NativeAppShell>
          </AppShellErrorBoundary>
        </ActiveMatchProvider>
      </TeamWorkspaceProvider>
    </AuthProvider>
  );
}
