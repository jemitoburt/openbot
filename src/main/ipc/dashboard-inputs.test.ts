import { describe, expect, it } from "vitest";
import { parseDashboardList, parseDashboardRevision, parseDashboardWidgetEdit } from "./dashboard-inputs";

const base = { id: "dashboard-1", revision: 1 };
const item = { id: "item-1", text: "Oats", checked: false };
describe("dashboard archive IPC boundary", () => {
  it("accepts optional archive flags and revision-checked restore requests", () => {
    expect(parseDashboardList({})).toEqual({});
    expect(parseDashboardList({ agentId: "fitness", includeArchived: true })).toEqual({
      agentId: "fitness",
      includeArchived: true,
    });
    expect(parseDashboardList({ includeArchived: false })).toEqual({ includeArchived: false });
    expect(parseDashboardRevision(base)).toEqual(base);
  });
  it("rejects malformed archive flags and restore revisions", () => {
    for (const includeArchived of ["true", 1, null, [], {}])
      expect(() => parseDashboardList({ includeArchived })).toThrow();
    for (const input of [
      { ...base, id: "" },
      { ...base, revision: 0 },
      { ...base, revision: "1" },
    ])
      expect(() => parseDashboardRevision(input)).toThrow();
  });
});
describe("dashboard widget edit IPC boundary", () => {
  it("accepts only the data needed for a widget action", () => {
    for (const edit of [
      { type: "addChecklistItems", blockId: "shopping", items: [item] },
      { type: "addRecipeIngredients", recipeBlockId: "recipe", portions: 2 },
      { type: "addReport", routineId: "morning" },
    ])
      expect(parseDashboardWidgetEdit({ ...base, edit })).toEqual({ ...base, edit });
  });
  it("rejects malformed identifiers, revisions and edit variants", () => {
    for (const input of [
      { id: "", revision: 1, edit: { type: "addReport", routineId: "morning" } },
      { ...base, revision: 0, edit: { type: "addReport", routineId: "morning" } },
      { ...base, edit: { type: "addReport", routineId: "" } },
      { ...base, edit: { type: "addChecklistItems", blockId: "", items: [item] } },
      { ...base, edit: { type: "replaceBlock", blockId: "shopping", items: [item] } },
      { ...base, edit: { type: "addRecipeIngredients", recipeBlockId: "recipe", portions: Infinity } },
      { ...base, edit: { type: "addRecipeIngredients", recipeBlockId: "recipe", portions: 0 } },
      { ...base, edit: { type: "addRecipeIngredients", recipeBlockId: "recipe", portions: 1_001 } },
      { ...base, edit: { type: "addReport", routineId: "morning" }, blocks: [] },
      { ...base, edit: { type: "addReport", routineId: "morning", title: "Overwrite" } },
    ])
      expect(() => parseDashboardWidgetEdit(input)).toThrow();
  });
  it("rejects repeated IDs, extra item fields, and oversized UTF-8 edits", () => {
    for (const items of [
      [],
      [item, item],
      Array.from({ length: 201 }, (_, index) => ({ ...item, id: `item-${index}` })),
      [{ ...item, checked: "true" }],
      [{ ...item, text: "x".repeat(2_001) }],
      [{ ...item, callback: "run" }],
      Array.from({ length: 70 }, (_, index) => ({ ...item, id: `item-${index}`, text: "🧩".repeat(1_000) })),
    ])
      expect(() =>
        parseDashboardWidgetEdit({ ...base, edit: { type: "addChecklistItems", blockId: "shopping", items } }),
      ).toThrow();
  });
});
