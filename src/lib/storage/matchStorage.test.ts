import { beforeEach, describe, expect, it } from "vitest";
import { createMatchSetup } from "@/domain/match";
import {
  activateMatch,
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

    // A different setup never inherits the previous one's id.
    activateMatch(first, "match-1");
    const second = { ...createMatchSetup("team-1"), id: "setup-other" };
    saveMatchSetupDraft(second);
    expect(getStoredMatchSetup()?.serverMatchId).toBeNull();
    endMatch(second);
    expect(getStoredMatchSetup()?.serverMatchId).toBeNull();
  });
});
