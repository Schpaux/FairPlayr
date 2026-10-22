/**
 * Text fields on the sign-in and sign-up pages (UI-AUTH-01): 48px tall,
 * 16px text (no iOS focus zoom), 10px radius (DESIGN.md §4), a `control-line`
 * border (at least 3:1, it identifies the field) on `surface`, and the `focus`
 * ring. Tokens only.
 */
export const authInputClassName =
  "h-12 w-full rounded-[10px] border border-fp-control-line bg-fp-surface px-4 text-base font-medium text-fp-ink placeholder:text-fp-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fp-focus focus-visible:border-transparent aria-[invalid=true]:border-fp-danger-text transition-colors";
