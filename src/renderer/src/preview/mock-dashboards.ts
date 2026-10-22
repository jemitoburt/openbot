import {
  type DashboardChange,
  type DashboardChecklistItem,
  type DashboardDocument,
  LOCAL_SERVER_ID,
  type OpenBotDesktopApi,
  type PluginState,
} from "@openbot/contracts/ipc";
import { sourceText } from "@openbot/i18n/source";
import { clone, type Listener, type MockRuntime } from "./mock-support";

export function createMockDashboards(
  { emit }: MockRuntime,
  routineName: (agentId: string, routineId: string) => string | undefined,
) {
  const states = new Map<string, PluginState>();
  const documents = new Map<string, DashboardDocument[]>();
  const listeners = new Set<Listener<{ serverId: string; change: DashboardChange }>>();
  function changed(serverId: string, change: DashboardChange) {
    emit(listeners, { serverId, change });
  }
  function requireInstalled(serverId: string) {
    if (!states.get(serverId)?.installed) throw new Error(sourceText("error.dashboard.unavailable"));
  }
  function read(id: string, serverId: string) {
    requireInstalled(serverId);
    const doc = documents.get(serverId)?.find((entry) => entry.id === id && !entry.archivedAt);
    if (!doc) throw new Error(sourceText("error.dashboard.notFound"));
    return doc;
  }
  function save(document: DashboardDocument, revision: number, serverId: string) {
    const current = read(document.id, serverId);
    if (current.revision !== revision) throw new Error(sourceText("error.dashboard.conflict"));
    const next = { ...document, revision: revision + 1, updatedAt: new Date().toISOString() };
    documents.set(
      serverId,
      (documents.get(serverId) ?? []).map((entry) => (entry.id === next.id ? next : entry)),
    );
    changed(serverId, { kind: "dashboard", agentId: next.agentId, dashboardId: next.id });
    return clone(next);
  }
  const plugins: Pick<OpenBotDesktopApi["plugins"], "state" | "setInstalled" | "onChanged"> = {
    state: async (serverId = LOCAL_SERVER_ID) =>
      clone(states.get(serverId) ?? { id: "dashboards", version: 1, installed: false }),
    setInstalled: async (installed, serverId = LOCAL_SERVER_ID) => {
      const state: PluginState = { id: "dashboards", version: 1, installed };
      states.set(serverId, state);
      changed(serverId, { kind: "installation" });
      return clone(state);
    },
    onChanged: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const dashboards: OpenBotDesktopApi["dashboards"] = {
    list: async (input, serverId = LOCAL_SERVER_ID) => {
      requireInstalled(serverId);
      return clone(
        (documents.get(serverId) ?? [])
          .filter((entry) => !entry.archivedAt && (!input.agentId || entry.agentId === input.agentId))
          .map((entry) => ({
            id: entry.id,
            agentId: entry.agentId,
            title: entry.title,
            schemaVersion: entry.schemaVersion,
            revision: entry.revision,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
            archivedAt: entry.archivedAt,
          })),
      );
    },
    read: async (id, serverId = LOCAL_SERVER_ID) => clone(read(id, serverId)),
    create: async (input, serverId = LOCAL_SERVER_ID) => {
      requireInstalled(serverId);
      const now = new Date().toISOString();
      const document: DashboardDocument = {
        ...clone(input),
        id: `dashboard-${crypto.randomUUID()}`,
        schemaVersion: 1,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      };
      documents.set(serverId, [document, ...(documents.get(serverId) ?? [])]);
      changed(serverId, { kind: "dashboard", agentId: document.agentId, dashboardId: document.id });
      return clone(document);
    },
    update: async (input, serverId = LOCAL_SERVER_ID) =>
      save({ ...read(input.id, serverId), title: input.title, blocks: clone(input.blocks) }, input.revision, serverId),
    editWidget: async (input, serverId = LOCAL_SERVER_ID) => {
      const document = read(input.id, serverId);
      if (document.revision !== input.revision) throw new Error(sourceText("error.dashboard.conflict"));
      const edit = input.edit;
      switch (edit.type) {
        case "addChecklistItems": {
          const target = document.blocks.find((block) => block.id === edit.blockId);
          if (target?.type !== "checklist") throw new Error(sourceText("error.dashboard.notFound"));
          if (target.allowAdd === false) throw new Error(sourceText("error.dashboard.forbidden"));
          if (edit.items.some((item) => target.items.some((existing) => existing.id === item.id)))
            throw new Error(sourceText("error.dashboard.conflict"));
          if (!edit.items.length || target.items.length + edit.items.length > 200)
            throw new Error(sourceText("error.dashboard.invalid"));
          return save(
            {
              ...document,
              blocks: document.blocks.map((block) =>
                block.id === target.id ? { ...target, items: [...target.items, ...clone(edit.items)] } : block,
              ),
            },
            input.revision,
            serverId,
          );
        }
        case "addRecipeIngredients": {
          const recipe = document.blocks.find((block) => block.id === edit.recipeBlockId);
          if (recipe?.type !== "rich" || !recipe.ingredients?.length)
            throw new Error(sourceText("error.dashboard.notFound"));
          const target = document.blocks.find((block) => block.id === recipe.targetChecklistId);
          if (target?.type !== "checklist" || target.items.length + recipe.ingredients.length > 200)
            throw new Error(sourceText("error.dashboard.invalid"));
          if (target.allowAdd === false) throw new Error(sourceText("error.dashboard.forbidden"));
          const items: DashboardChecklistItem[] = recipe.ingredients.map((ingredient) => ({
            id: crypto.randomUUID(),
            text: ingredient.label,
            checked: false,
            quantity: (ingredient.quantity * edit.portions) / (recipe.portions ?? 1),
            source: "recipe",
            ...(ingredient.unit ? { unit: ingredient.unit } : {}),
            ...(ingredient.category ? { category: ingredient.category } : {}),
          }));
          return save(
            {
              ...document,
              blocks: document.blocks.map((block) =>
                block.id === target.id ? { ...target, items: [...target.items, ...items] } : block,
              ),
            },
            input.revision,
            serverId,
          );
        }
        case "addReport": {
          const title = routineName(document.agentId, edit.routineId);
          if (!title) throw new Error(sourceText("error.dashboard.notFound"));
          if (document.blocks.some((block) => block.type === "report" && block.routineId === edit.routineId))
            return clone(document);
          if (document.blocks.length >= 64) throw new Error(sourceText("error.dashboard.limit"));
          return save(
            {
              ...document,
              blocks: [
                ...document.blocks,
                { id: `report-${crypto.randomUUID()}`, type: "report", title, routineId: edit.routineId },
              ],
            },
            input.revision,
            serverId,
          );
        }
      }
    },
    archive: async (input, serverId = LOCAL_SERVER_ID) =>
      save({ ...read(input.id, serverId), archivedAt: new Date().toISOString() }, input.revision, serverId),
    toggleItem: async (input, serverId = LOCAL_SERVER_ID) => {
      const document = read(input.id, serverId);
      const block = document.blocks.find((entry) => entry.id === input.blockId);
      if (block?.type !== "checklist" || !block.items.some((entry) => entry.id === input.itemId))
        throw new Error(sourceText("error.dashboard.notFound"));
      return save(
        {
          ...document,
          blocks: document.blocks.map((entry) =>
            entry.id === input.blockId && entry.type === "checklist"
              ? {
                  ...entry,
                  items: entry.items.map((item) =>
                    item.id === input.itemId ? { ...item, checked: input.checked } : item,
                  ),
                }
              : entry,
          ),
        },
        input.revision,
        serverId,
      );
    },
    report: async (input, serverId = LOCAL_SERVER_ID) => {
      const document = read(input.dashboardId, serverId);
      const block = document.blocks.find((entry) => entry.id === input.blockId);
      if (block?.type !== "report") throw new Error(sourceText("error.dashboard.notFound"));
      return {
        routineId: block.routineId,
        status: "idle",
        available: true,
        text: null,
        messageId: null,
        updatedAt: null,
      };
    },
    onChanged: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { plugins, dashboards };
}
