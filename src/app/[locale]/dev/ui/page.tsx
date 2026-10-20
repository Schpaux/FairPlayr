import { notFound } from "next/navigation";

// Development-only gallery of the shared UI primitives (UI-FOUND-01). Used for
// screenshots and by e2e/ui-audit.spec.ts (STAB-06). Never served in production.
// The gallery is imported inside the development branch: NODE_ENV is inlined at
// build time, so a production build drops the import and ships no gallery code
// (a static import would still preload its client chunk on the 404 response).
export default async function UiGalleryPage() {
  if (process.env.NODE_ENV !== "production") {
    const { UiGallery } = await import("./UiGallery");
    return <UiGallery />;
  }

  notFound();
}
