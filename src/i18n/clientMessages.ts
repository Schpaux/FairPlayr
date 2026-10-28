import type { AbstractIntlMessages } from "next-intl";

/**
 * The messages the website sends to the browser (WEB-01 phase 0). Its text
 * is rendered by Server Components (`getTranslations`), so the client gets
 * none: the app's namespaces (~48 kB) stay out of the website's HTML. When a
 * client island needs text (the video facade WEB-01j, the demo WEB-01k), add
 * its own namespace here, for example `"marketing.video"`, and update the
 * test in the same patch.
 */
export const WEBSITE_CLIENT_NAMESPACES: readonly string[] = [];

/**
 * The given namespaces of `messages`, nested as in the file. A dotted name
 * (`"marketing.video"`) picks a sub-namespace. Throws on a namespace that
 * does not exist, so a typo fails the build instead of a missing text.
 */
export function pickMessages(messages: AbstractIntlMessages, namespaces: readonly string[]): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const namespace of namespaces) {
    const keys = namespace.split(".");
    const last = keys.pop()!;
    let source: AbstractIntlMessages = messages;
    let target = picked;
    for (const key of keys) {
      const nextSource = source[key];
      if (typeof nextSource !== "object") throw new Error(`Unknown message namespace: ${namespace}`);
      source = nextSource;
      const nextTarget = target[key] ?? {};
      if (typeof nextTarget !== "object") throw new Error(`Unknown message namespace: ${namespace}`);
      target = target[key] = nextTarget;
    }
    if (!(last in source)) throw new Error(`Unknown message namespace: ${namespace}`);
    target[last] = source[last];
  }
  return picked;
}
