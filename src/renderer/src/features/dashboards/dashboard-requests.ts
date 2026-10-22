import type { QueueDelivery, QueueSnapshot } from "@openbot/contracts/ipc";
import { createEffect, createStore, untrack } from "solid-js";
import { createScopeGuard } from "../../scope-lifetime";
import { dashboardsPort } from "./dashboards-port";

interface DashboardRequest {
  agentId: string;
  receiptId: string;
  delivery?: QueueDelivery | undefined;
}

const ACTIVE_DELIVERY_STATUSES = new Set<QueueDelivery["status"]>(["queued", "starting", "running"]);

/** Tracks only accepted dashboard messages, for the lifetime of their host provider. */
export function createDashboardRequests(dependencies: {
  serverId: () => string;
  queues: () => Record<string, QueueSnapshot>;
  queueSnapshotRequests: Map<string, number>;
  onError: (error: unknown) => void;
}) {
  const current = createScopeGuard();
  const serverId = untrack(dependencies.serverId);
  const [requests, setRequests] = createStore<Record<string, DashboardRequest>>({});
  const seenSnapshots = new Map<string, QueueSnapshot | undefined>();
  const registrations = new Map<string, number>();

  function reconcile(queue: QueueSnapshot, authoritative = false) {
    setRequests((draft) => {
      for (const [key, request] of Object.entries(draft)) {
        if (request.agentId !== queue.agentId) continue;
        const delivery = queue.deliveries.find(
          (entry) => entry.id === request.receiptId || entry.messageId === request.receiptId,
        );
        if (!delivery && !request.delivery && !authoritative) continue;
        if (!delivery || !ACTIVE_DELIVERY_STATUSES.has(delivery.status)) delete draft[key];
        else request.delivery = delivery;
      }
    });
    seenSnapshots.set(queue.agentId, queue);
  }

  async function readQueue(agentId: string): Promise<{ snapshot: QueueSnapshot; authoritative: boolean } | null> {
    const registration = registrations.get(agentId) ?? 0;
    const version = dependencies.queueSnapshotRequests.get(agentId) ?? 0;
    const before = untrack(() => dependencies.queues()[agentId]);
    const queue = await dashboardsPort().agent.listQueue(agentId, serverId);
    if (!current() || registration !== (registrations.get(agentId) ?? 0)) return null;
    if (version === (dependencies.queueSnapshotRequests.get(agentId) ?? 0))
      return { snapshot: queue, authoritative: true };
    // A live event can supersede this read. A started queue read has no new snapshot yet;
    // in that case its eventual snapshot, rather than the old one, reconciles the request.
    const latest = untrack(() => dependencies.queues()[agentId]);
    return latest && latest !== before ? { snapshot: latest, authoritative: false } : null;
  }

  createEffect(
    () => dependencies.queues(),
    (queues) => {
      const agentIds = untrack(() => new Set(Object.values(requests).map((request) => request.agentId)));
      for (const agentId of agentIds) {
        const queue = queues[agentId];
        if (queue && queue !== seenSnapshots.get(agentId)) reconcile(queue);
      }
    },
  );

  function trackRequest(agentId: string, receiptId: string) {
    if (!current()) return;
    if (untrack(() => requests[receiptId])) return;
    registrations.set(agentId, (registrations.get(agentId) ?? 0) + 1);
    // Existing snapshots can predate this accepted message. Only a later snapshot or a fresh
    // authoritative read may remove it; an unrelated agent's queue event cannot do so.
    seenSnapshots.set(
      agentId,
      untrack(() => dependencies.queues()[agentId]),
    );
    setRequests((draft) => {
      draft[receiptId] = { agentId, receiptId };
    });
    void readQueue(agentId).then(
      (queue) => {
        if (current() && queue) reconcile(queue.snapshot, queue.authoritative);
      },
      (error: unknown) => {
        if (current()) dependencies.onError(error);
      },
    );
  }

  async function stopRequest(agentId: string): Promise<void> {
    try {
      const queue = await readQueue(agentId);
      if (!current()) return;
      if (queue) reconcile(queue.snapshot, queue.authoritative);
      const owned = untrack(() => Object.values(requests).filter((request) => request.agentId === agentId));
      const interrupted = new Set<string>();
      for (const request of owned) {
        const delivery = request.delivery;
        if (!delivery || !ACTIVE_DELIVERY_STATUSES.has(delivery.status)) continue;
        if (delivery.turnId) {
          if (interrupted.has(delivery.turnId)) continue;
          await dashboardsPort().agent.interrupt({ agentId, turnId: delivery.turnId }, serverId);
          interrupted.add(delivery.turnId);
        } else {
          await dashboardsPort().agent.cancelQueuedMessage({ agentId, deliveryId: delivery.id }, serverId);
        }
        if (!current()) return;
      }
      const after = await readQueue(agentId);
      if (current() && after) reconcile(after.snapshot, after.authoritative);
    } catch (error) {
      if (current()) dependencies.onError(error);
    }
  }

  return {
    trackRequest,
    stopRequest,
    generatingAgentIds: () => Array.from(new Set(Object.values(requests).map((request) => request.agentId))),
  };
}
