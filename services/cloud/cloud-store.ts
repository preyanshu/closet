import { WardrobeApiError } from "@/services/api/wardrobe-api";
import { supabase } from "@/services/supabase";

/**
 * The cloud is the only store, and it needs a connection. Reads load everything once
 * after sign-in; writes go through a small queue that batches them. If a save can't
 * reach the server it is dropped and the error is reported ("can't connect"), not
 * retried silently: the app never pretends something was saved when it wasn't.
 *
 * The queue holds only the latest version of each record, so ten quick edits to one
 * piece upload once.
 */

export type RecordKind = "item" | "outfit" | "wear_event" | "plan" | "feedback" | "preference";

export type CloudRecord = { kind: RecordKind; id: string; data: Record<string, unknown>; updated_at: string };

type PendingWrite =
  | { op: "put"; kind: RecordKind; id: string; build: () => Promise<Record<string, unknown>>; onSaved?: (data: Record<string, unknown>) => void }
  | { op: "delete"; kind: RecordKind; id: string; cleanup?: () => Promise<void> };

export type CloudStatus = { pending: number; saving: boolean; error?: string };

const BATCH = 50;

let userId: string | null = null;
const pending = new Map<string, PendingWrite>();
let flushing = false;
let lastError: string | undefined;
const listeners = new Set<(status: CloudStatus) => void>();

const keyOf = (kind: RecordKind, id: string) => `${kind}:${id}`;

function emit() {
  const status: CloudStatus = { pending: pending.size, saving: flushing, error: lastError };
  for (const listener of listeners) listener(status);
}

export function getCloudStatus(): CloudStatus {
  return { pending: pending.size, saving: flushing, error: lastError };
}

export function onCloudStatus(listener: (status: CloudStatus) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Who writes go to. Switching or clearing the user drops anything still queued for the previous one. */
export function setCloudUser(id: string | null) {
  if (userId === id) return;
  userId = id;
  pending.clear();
  lastError = undefined;
  emit();
}

/** Dismiss the "couldn't save" message. */
export function clearCloudError() {
  lastError = undefined;
  emit();
}

export function currentCloudUser(): string | null {
  return userId;
}

/** Save a record. `build` runs at send time (it may upload photos first); `onSaved` gets what was stored. */
export function putRecord(kind: RecordKind, id: string, build: () => Promise<Record<string, unknown>>, onSaved?: (data: Record<string, unknown>) => void) {
  if (!userId) return;
  pending.set(keyOf(kind, id), { op: "put", kind, id, build, onSaved });
  emit();
  void flush();
}

export function removeRecord(kind: RecordKind, id: string, cleanup?: () => Promise<void>) {
  if (!userId) return;
  pending.set(keyOf(kind, id), { op: "delete", kind, id, cleanup });
  emit();
  void flush();
}

/** Send anything still queued (e.g. when the app returns to the foreground). */
export function flushNow(): Promise<void> {
  return flush();
}

async function flush(): Promise<void> {
  if (flushing || !supabase || !userId || pending.size === 0) return;
  flushing = true;
  const owner = userId;
  emit();
  try {
    while (pending.size > 0 && userId === owner) {
      const batch = [...pending.entries()].slice(0, BATCH);
      const puts = batch.filter((entry): entry is [string, Extract<PendingWrite, { op: "put" }>] => entry[1].op === "put");
      const deletes = batch.filter((entry): entry is [string, Extract<PendingWrite, { op: "delete" }>] => entry[1].op === "delete");

      const rows: Array<{ user_id: string; kind: RecordKind; id: string; data: Record<string, unknown> }> = [];
      for (const [, write] of puts) rows.push({ user_id: owner, kind: write.kind, id: write.id, data: await write.build() });
      if (rows.length > 0) {
        const { error } = await supabase.from("records").upsert(rows, { onConflict: "user_id,kind,id" });
        if (error) throw new Error(error.message);
      }
      for (const [, write] of deletes) {
        const { error } = await supabase.from("records").delete().eq("user_id", owner).eq("kind", write.kind).eq("id", write.id);
        if (error) throw new Error(error.message);
        void write.cleanup?.().catch(() => undefined);
      }

      // Drop only what was sent, and only if it wasn't replaced by a newer edit while sending.
      puts.forEach(([key, write], index) => {
        if (pending.get(key) === write) pending.delete(key);
        write.onSaved?.(rows[index].data);
      });
      for (const [key, write] of deletes) if (pending.get(key) === write) pending.delete(key);
      emit();
    }
  } catch (cause) {
    // Can't reach the server: drop what was queued and say so. The screen shows the unsaved change
    // until it reloads, so the banner offers a reload to get back to what is really saved.
    pending.clear();
    lastError = "Can't connect to the server. Your last change wasn't saved.";
    if (typeof __DEV__ !== "undefined" && __DEV__) console.warn("[cloud] save failed:", cause);
  } finally {
    flushing = false;
    emit();
  }
}

/** Everything the signed-in user has stored. */
export async function fetchAllRecords(): Promise<CloudRecord[]> {
  if (!supabase || !userId) return [];
  const PAGE = 1000;
  const all: CloudRecord[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("records")
      .select("kind,id,data,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new WardrobeApiError("Couldn't load your closet. Check your connection and try again.", "unreachable", error.message);
    const page = (data ?? []) as CloudRecord[];
    all.push(...page);
    if (page.length < PAGE) return all;
  }
}
