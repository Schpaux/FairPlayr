import { beforeEach, describe, expect, it } from "vitest";
import { createMatchSetup } from "@/domain/match";
import {
  activateMatch,
  discardMatchSetupDraft,
  endMatch,
  getStoredMatchSetup,
  saveMatchSetupDraft,
  updateMatchConfig,
} from "@/lib/storage/matchStorage";

const MATCH_SETUP_KEY = "fairplayr.matchSetup.v1";

describe("matchStorage server match id", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reads setups stored before the field existed as unknown, not local-only", () => {
    const config = createMatchSetup("team-1");
    window.localStorage.setItem(
      MATCH_SETUP_KEY,
      JSON.stringify({ version: 2, config, status: "active" })
    );

    const stored = getStoredMatchSetup();
    expect(stored?.status).toBe("active");
    expect(stored?.serverMatchId).toBeUndefined();

    // Edits keep it unknown instead of asserting it is local-only.
    updateMatchConfig({ ...config, reportEnabled: true });
    expect(getStoredMatchSetup()?.serverMatchId).toBeUndefined();
  });

  it("stores no server id for a guest/local-only start", () => {
    activateMatch(createMatchSetup("team-1"));

    expect(getStoredMatchSetup()?.serverMatchId).toBeNull();
  });

  it("keeps the server id through edits and the end of the same setup", () => {
    const config = createMatchSetup("team-1");
    activateMatch(config, "match-1");

    updateMatchConfig({ ...config, reportEnabled: true });
    expect(getStoredMatchSetup()?.serverMatchId).toBe("match-1");

    saveMatchSetupDraft(config);
    expect(getStoredMatchSetup()?.serverMatchId).toBe("match-1");

    endMatch(config);
    expect(getStoredMatchSetup()).toMatchObject({ status: "ended", serverMatchId: "match-1" });
  });

  it("never carries an old server id over to a new match", () => {
    const first = createMatchSetup("team-1");
    activateMatch(first, "match-1");

    // Same setup restarted for another server match.
    activateMatch(first, "match-2");
    expect(getStoredMatchSetup()?.serverMatchId).toBe("match-2");

    // Same setup restarted as a local-only match.
    activateMatch(first);
    expect(getStoredMatchSetup()?.serverMatchId).toBeNull();

    // A different setup never inherits the previous one's id (drafts are
    // only written once the previous match has ended).
    activateMatch(first, "match-1");
    endMatch(first);
    const second = { ...createMatchSetup("team-1"), id: "setup-other" };
    saveMatchSetupDraft(second);
    expect(getStoredMatchSetup()?.serverMatchId).toBeNull();
    endMatch(second);
    expect(getStoredMatchSetup()?.serverMatchId).toBeNull();
  });
});

// FP-MS2.1-A1 (MS-10): a started match owns the stored setup until the match
// lifecycle ends it. Setup editors must not demote it to a draft.
describe("matchStorage active match protection", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("refuses to save a draft over an active match", () => {
    const running = createMatchSetup("team-1");
    activateMatch(running, "match-1");
    const before = window.localStorage.getItem(MATCH_SETUP_KEY);

    expect(saveMatchSetupDraft(running)).toBe(false);
    expect(saveMatchSetupDraft(createMatchSetup("team-2"))).toBe(false);

    expect(window.localStorage.getItem(MATCH_SETUP_KEY)).toBe(before);
    expect(getStoredMatchSetup()).toMatchObject({ status: "active", serverMatchId: "match-1" });
  });

  it("refuses config edits while the match is active", () => {
    const running = createMatchSetup("team-1");
    activateMatch(running);
    const before = window.localStorage.getItem(MATCH_SETUP_KEY);

    expect(updateMatchConfig({ ...running, selectedPlayerIds: [] })).toBe(false);
    expect(window.localStorage.getItem(MATCH_SETUP_KEY)).toBe(before);
  });

  it("saves drafts normally with no match or after the match ended", () => {
    const first = createMatchSetup("team-1");
    expect(saveMatchSetupDraft(first)).toBe(true);
    expect(getStoredMatchSetup()?.status).toBe("draft");

    activateMatch(first);
    endMatch(first);

    const next = createMatchSetup("team-1");
    expect(saveMatchSetupDraft(next)).toBe(true);
    expect(getStoredMatchSetup()).toMatchObject({ status: "draft", config: { id: next.id } });
  });
});

// FP-MS2.1-A3: "Start new from team defaults" discards only an unfinished draft.
describe("matchStorage discardMatchSetupDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("removes a draft", () => {
    saveMatchSetupDraft(createMatchSetup("team-1"));

    expect(discardMatchSetupDraft()).toBe(true);
    expect(getStoredMatchSetup()).toBeNull();
  });

  it("refuses while a match is active and leaves it untouched", () => {
    activateMatch(createMatchSetup("team-1"), "match-1");
    const before = window.localStorage.getItem(MATCH_SETUP_KEY);

    expect(discardMatchSetupDraft()).toBe(false);
    expect(window.localStorage.getItem(MATCH_SETUP_KEY)).toBe(before);
  });

  it("leaves an ended match as it is", () => {
    const ended = createMatchSetup("team-1");
    activateMatch(ended, "match-1");
    endMatch(ended);
    const before = window.localStorage.getItem(MATCH_SETUP_KEY);

    expect(discardMatchSetupDraft()).toBe(true);
    expect(window.localStorage.getItem(MATCH_SETUP_KEY)).toBe(before);
  });
});
