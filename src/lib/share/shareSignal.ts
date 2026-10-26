"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/**
 * FEAT-SHARE-01: the public page listens for the «oppdatert» hint on the
 * share's private Realtime topic (migration 20261027090000). The message
 * carries no data; the page then reads the filtered public answer, which
 * alone decides access and content. No session is used or stored.
 *
 * `onConnected` runs on every (re)join, so the page reads fresh data after a
 * gap; `onDisconnected` when the channel is lost (the page then polls as
 * before). Never throws: without Realtime the page simply polls.
 */
export function subscribeToShareSignal(
  topic: string,
  handlers: { onSignal: () => void; onConnected: () => void; onDisconnected: () => void }
): () => void {
  let client: SupabaseClient | null = null;
  let closed = false;

  try {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  } catch {
    return () => {};
  }

  const channel = client.channel(topic, { config: { private: true } });
  channel.on("broadcast", { event: "updated" }, () => {
    if (!closed) handlers.onSignal();
  });

  void client.realtime
    .setAuth()
    .catch(() => {})
    .then(() => {
      if (closed) return;
      channel.subscribe((status) => {
        if (closed) return;
        if (status === "SUBSCRIBED") handlers.onConnected();
        else handlers.onDisconnected();
      });
    });

  return () => {
    closed = true;
    if (!client) return;
    void client.removeChannel(channel).catch(() => {});
    client.realtime.disconnect();
  };
}
