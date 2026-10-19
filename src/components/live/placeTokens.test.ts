import { describe, expect, it } from "vitest";
import { ALL_FORMATS, getFormationPresets } from "@/domain/match";
import { isKeeperSlot, placeTokens, tokenDensity } from "@/components/live/placeTokens";

describe("placeTokens", () => {
  it("spreads the lines of a formation evenly from top to bottom", () => {
    const slots = getFormationPresets("5v5")[0].slots; // 2-2 + keeper
    const placed = placeTokens(slots);

    expect(placed["5v5-4"].y).toBe(0); // forwards
    expect(placed["5v5-2"].y).toBe(50); // defenders
    expect(placed["5v5-1"].y).toBe(100); // keeper
  });

  it("limits each token's room to the gap to its nearest neighbour in the line", () => {
    const slots = getFormationPresets("5v5")[0].slots;
    const placed = placeTokens(slots);

    expect(placed["5v5-2"].room).toBe(36); // 32 ↔ 68
    expect(placed["5v5-1"].room).toBe(70); // alone in its line, capped
  });

  it("keeps every preset of every format inside the token box without two tokens on one spot", () => {
    for (const format of ALL_FORMATS) {
      for (const preset of getFormationPresets(format)) {
        const placed = Object.values(placeTokens(preset.slots));
        expect(placed).toHaveLength(preset.slots.length);

        for (const p of placed) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(100);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(100);
          expect(p.room).toBeGreaterThan(0);
        }

        const spots = new Set(placed.map((p) => `${p.x}:${p.y}`));
        expect(spots.size).toBe(placed.length);
      }
    }
  });
});

// FP-PITCH-01: setup and live both place tokens with placeTokens, so this is
// the one coordinate contract: y = 0 is the opponent's goal (top), y = 100 our
// own (bottom); x is never mirrored.
describe("pitch orientation", () => {
  it("puts the keeper at our own goal and keeps every player's side, in every preset", () => {
    for (const format of ALL_FORMATS) {
      for (const preset of getFormationPresets(format)) {
        const placed = placeTokens(preset.slots);
        const keeper = preset.slots[0];

        expect(placed[keeper.id].y, preset.id).toBe(100);
        for (const slot of preset.slots) {
          expect(placed[slot.id].x, `${preset.id} ${slot.id}`).toBe(slot.x);
          if (slot.id !== keeper.id) expect(placed[slot.id].y).toBeLessThan(100);
        }
      }
    }
  });

  it("keeps the formation's front-to-back order", () => {
    for (const format of ALL_FORMATS) {
      for (const preset of getFormationPresets(format)) {
        const placed = placeTokens(preset.slots);

        for (const a of preset.slots) {
          for (const b of preset.slots) {
            if (a.y < b.y) expect(placed[a.id].y, `${preset.id} ${a.id} above ${b.id}`).toBeLessThan(placed[b.id].y);
          }
        }
      }
    }
  });
});

describe("tokenDensity", () => {
  it("is roomy up to 5, regular for 7 and compact from 9 on the field", () => {
    expect(tokenDensity(3)).toBe("roomy");
    expect(tokenDensity(5)).toBe("roomy");
    expect(tokenDensity(7)).toBe("regular");
    expect(tokenDensity(9)).toBe("compact");
    expect(tokenDensity(11)).toBe("compact");
  });
});

describe("isKeeperSlot", () => {
  it("marks the first slot as keeper except in 3v3", () => {
    const sevens = getFormationPresets("7v7")[0].slots;
    expect(isKeeperSlot("7v7", sevens, sevens[0].id)).toBe(true);
    expect(isKeeperSlot("7v7", sevens, sevens[1].id)).toBe(false);

    const threes = getFormationPresets("3v3")[0].slots;
    expect(isKeeperSlot("3v3", threes, threes[0].id)).toBe(false);
  });
});
