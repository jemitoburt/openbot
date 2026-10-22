import type { DashboardDocument } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import {
  decodeDashboardChange,
  decodeDashboardFromMain,
  decodeDashboardReportFromMain,
  decodeDashboardSummariesFromMain,
  decodeNullablePluginState,
  decodePluginStateFromMain,
} from "./dashboard-decoding";

const document: DashboardDocument = {
  id: "dashboard-1",
  agentId: "agent-1",
  title: "Fitness",
  schemaVersion: 1,
  revision: 1,
  createdAt: "2026-10-22T06:00:00.000Z",
  updatedAt: "2026-10-22T06:00:00.000Z",
  archivedAt: null,
  blocks: [
    { id: "intro", type: "text", title: "Today", text: "Walk and stretch." },
    { id: "steps", type: "metric", title: "Steps", value: "8,000", description: "Daily target" },
    { id: "shopping", type: "checklist", title: "Shopping", items: [{ id: "oats", text: "Oats", checked: false }] },
    { id: "meals", type: "table", title: "Meals", columns: ["Meal", "Food"], rows: [["Breakfast", "Oats"]] },
    { id: "progress", type: "chart", title: "Progress", chartType: "line", points: [{ label: "Mon", value: 3 }] },
    {
      id: "training",
      type: "calendar",
      title: "Training",
      entries: [{ id: "run", title: "Run", startsAt: "2026-10-22T08:00:00.000Z" }],
    },
    {
      id: "recipe",
      type: "detail",
      title: "Recipe",
      content: { text: "Mix.", metrics: [{ label: "Time", value: "5 min" }], items: ["Oats"] },
    },
    { id: "news", type: "report", title: "Morning report", routineId: "routine-1" },
  ],
};

describe("dashboard preload boundary", () => {
  it("accepts structured blocks and an unavailable older host", () => {
    expect(decodeDashboardFromMain(document)).toEqual(document);
    const { blocks, ...summary } = document;
    void blocks;
    expect(decodeDashboardSummariesFromMain([document])).toEqual([summary]);
    expect(decodeNullablePluginState(null)).toBeNull();
    expect(decodePluginStateFromMain({ id: "dashboards", installed: false, version: 1 }).installed).toBe(false);
  });
  it("rejects malformed nested data, unsupported versions and duplicate identifiers", () => {
    for (const value of [
      { ...document, schemaVersion: 2 },
      { ...document, revision: 0 },
      { ...document, blocks: [{ ...document.blocks[0], type: "html", html: "<script>run()</script>" }] },
      { ...document, blocks: [document.blocks[0], document.blocks[0]] },
      {
        ...document,
        blocks: [{ id: "list", type: "checklist", title: "List", items: [{ id: "x", text: "X", checked: "true" }] }],
      },
      {
        ...document,
        blocks: [
          { id: "chart", type: "chart", title: "Chart", chartType: "line", points: [{ label: "X", value: Infinity }] },
        ],
      },
      { ...document, blocks: [{ id: "table", type: "table", title: "Table", columns: ["X"], rows: [["1", "2"]] }] },
      { ...document, blocks: [{ id: "report", type: "report", title: "Report", routineId: "" }] },
    ])
      expect(() => decodeDashboardFromMain(value)).toThrow();
    expect(() => decodeDashboardSummariesFromMain(Array.from({ length: 501 }, () => document))).toThrow();
  });
  it("accepts bounded redacted output above input limits", () => {
    const expanded = {
      ...document,
      title: "[redacted] ".repeat(100),
      blocks: [{ id: "redacted", type: "text", title: "Report", text: "[redacted] ".repeat(3_000) }],
    };
    expect(decodeDashboardFromMain(expanded)).toEqual(expanded);
    expect(decodeDashboardSummariesFromMain([expanded])[0]?.title).toEqual(expanded.title);
  });
  it("decodes a widget edit result without accepting malformed added items", () => {
    const edited = {
      ...document,
      revision: 2,
      blocks: [
        {
          id: "shopping",
          title: "Shopping",
          type: "checklist",
          items: [
            { id: "oats", text: "Oats", checked: false },
            { id: "milk", text: "Milk", checked: false, source: "chat" },
          ],
        },
      ],
    };
    expect(decodeDashboardFromMain(edited)).toEqual(edited);
    expect(() =>
      decodeDashboardFromMain({
        ...edited,
        blocks: [{ ...edited.blocks[0], items: [{ id: "milk", text: "Milk", checked: false, source: "network" }] }],
      }),
    ).toThrow();
  });
  it("checks scoped change events and saved report content", () => {
    expect(decodeDashboardChange({ serverId: "local", change: { kind: "installation" } })).toEqual({
      serverId: "local",
      change: { kind: "installation" },
    });
    expect(() => decodeDashboardChange({ serverId: "local", change: { kind: "dashboard", agentId: 1 } })).toThrow();
    const report = {
      routineId: "routine-1",
      status: "failed",
      available: true,
      text: "Last report",
      messageId: "message-1",
      updatedAt: document.updatedAt,
    };
    expect(decodeDashboardReportFromMain(report)).toEqual(report);
    expect(() => decodeDashboardReportFromMain({ ...report, text: { html: "unsafe" } })).toThrow();
    expect(() => decodeDashboardReportFromMain({ ...report, status: "unknown" })).toThrow();
  });
});
