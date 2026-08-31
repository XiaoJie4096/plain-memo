import { PINNED_MEMOS_FOLDER } from "../constants";
import { hashText } from "../utils/hash";
import {
	buildPluginDataWithPinnedSectionCollapsed,
	extractPinnedSectionCollapsed,
} from "../utils/localPluginData";
import { isRecord } from "../utils/object";
import type { PluginDataStore } from "./PluginDataStore";
import type { VaultJsonStore } from "./VaultJsonStore";

const UNPINNED_MARKER_RETENTION_MS = 15 * 24 * 60 * 60 * 1_000;
const PENDING_REMOVAL_GRACE_MS = 24 * 60 * 60 * 1_000;

interface PinnedMemoRecord {
	path: string;
	pinnedAt: string;
	updatedAt: string;
	pinned: boolean;
	pendingRemovalAt?: string;
}

export interface PinnedMemoSnapshot {
	/** Paths that are currently pinned and count towards the configured limit. */
	paths: string[];
	/** Paths waiting for deletion confirmation and excluded from the limit. */
	pendingRemovalPaths: string[];
	collapsed: boolean;
}

/** Persists shared pin markers while keeping expansion state device-local. */
export class PinnedMemoService {
	private snapshot: PinnedMemoSnapshot = { paths: [], pendingRemovalPaths: [], collapsed: false };
	private mutationQueue: Promise<void> = Promise.resolve();

	constructor(
		private readonly vaultStore: VaultJsonStore,
		private readonly localStore: PluginDataStore,
		private readonly now: () => Date = () => new Date(),
		private readonly isPathPresent: (path: string) => boolean | Promise<boolean> = () => false,
	) {}

	/** Loads shared pin markers and local expansion state. */
	async load(): Promise<void> {
		await this.runExclusive(async () => { this.snapshot = await this.readSnapshot(); });
	}

	/** Reloads pin markers and reports whether visible shared state changed. */
	async reloadIfChanged(): Promise<boolean> {
		return this.runExclusive(async () => {
			const next = await this.readSnapshot();
			if (arePinnedMemoSnapshotsEqual(this.snapshot, next)) return false;
			this.snapshot = next;
			return true;
		});
	}

	/** Returns a defensive copy of current pin state. */
	getSnapshot(): PinnedMemoSnapshot {
		return {
			paths: [...this.snapshot.paths],
			pendingRemovalPaths: [...this.snapshot.pendingRemovalPaths],
			collapsed: this.snapshot.collapsed,
		};
	}

	/** Tests whether a memo path is currently pinned. */
	isPinned(path: string): boolean { return this.snapshot.paths.includes(path); }

	/** Tests whether a memo path is waiting for deletion confirmation. */
	isPendingRemoval(path: string): boolean { return this.snapshot.pendingRemovalPaths.includes(path); }

	/** Creates one shared marker for a memo unless the configured limit is reached. */
	async pin(path: string, limit: number): Promise<boolean> {
		return this.runExclusive(async () => {
			if (this.isPinned(path)) return true;
			if (this.isPendingRemoval(path)) {
				if (this.snapshot.paths.length >= limit) return false;
				await this.restorePathRecord(path);
				this.snapshot = await this.readSnapshot();
				return true;
			}
			if (this.snapshot.paths.length >= limit) return false;
			const markerPath = await this.allocateMarkerPath(path);
			const timestamp = this.now().toISOString();
			const record: PinnedMemoRecord = { path, pinnedAt: timestamp, updatedAt: timestamp, pinned: true };
			await this.vaultStore.write(markerPath, record);
			this.snapshot = await this.readSnapshot();
			return true;
		});
	}

	/** Writes an unpinned tombstone for every marker of one memo path. */
	async unpin(path: string): Promise<void> {
		await this.runExclusive(async () => {
			for (const markerPath of await this.vaultStore.list(PINNED_MEMOS_FOLDER)) {
				const record = parsePinnedMemoRecord(await this.vaultStore.read(markerPath));
				if (record?.path === path && record.pinned) {
					await this.vaultStore.write(markerPath, buildUnpinnedRecord(record, this.now()));
				}
			}
			this.snapshot = await this.readSnapshot();
		});
	}

	/** Marks a file as possibly removed without cancelling its pin immediately. */
	async markRemovalPending(path: string): Promise<void> {
		await this.runExclusive(async () => {
			for (const markerPath of await this.vaultStore.list(PINNED_MEMOS_FOLDER)) {
				const record = parsePinnedMemoRecord(await this.vaultStore.read(markerPath));
				if (record?.path !== path || !record.pinned || record.pendingRemovalAt !== undefined) continue;
				const timestamp = this.now().toISOString();
				await this.vaultStore.write(markerPath, {
					...record,
					updatedAt: timestamp,
					pendingRemovalAt: timestamp,
				});
			}
			this.snapshot = await this.readSnapshot();
		});
	}

	/** Restores a pending pin when its file appears or changes again. */
	async restorePath(path: string): Promise<void> {
		await this.runExclusive(async () => {
			if (!this.isPendingRemoval(path)) return;
			await this.restorePathRecord(path);
			this.snapshot = await this.readSnapshot();
		});
	}

	/** Saves the local-only expansion state without touching shared pins. */
	async setCollapsed(collapsed: boolean): Promise<void> {
		await this.runExclusive(async () => {
			if (this.snapshot.collapsed === collapsed) return;
			await this.localStore.mutate((savedData) => ({
				nextData: buildPluginDataWithPinnedSectionCollapsed(savedData, collapsed),
				result: undefined,
			}));
			this.snapshot = { ...this.snapshot, collapsed };
		});
	}

	/** Updates the path recorded by a marker after a Vault rename. */
	async replacePath(oldPath: string, nextPath: string): Promise<void> {
		await this.runExclusive(async () => {
			for (const markerPath of await this.vaultStore.list(PINNED_MEMOS_FOLDER)) {
				const record = parsePinnedMemoRecord(await this.vaultStore.read(markerPath));
				if (record?.path !== oldPath) continue;
				const { pendingRemovalAt: _pendingRemovalAt, ...rest } = record;
				await this.vaultStore.write(markerPath, { ...rest, path: nextPath, updatedAt: this.now().toISOString() });
			}
			this.snapshot = await this.readSnapshot();
		});
	}

	/** Removes a marker immediately for an explicit permanent removal. */
	async removePath(path: string): Promise<void> { await this.unpin(path); }

	/** Checks whether a Vault path belongs to the shared pin state directory. */
	isStatePath(path: string): boolean {
		return path === PINNED_MEMOS_FOLDER || path.startsWith(`${PINNED_MEMOS_FOLDER}/`);
	}

	/** Reads all valid markers and the local expansion flag. */
	private async readSnapshot(): Promise<PinnedMemoSnapshot> {
		const records: PinnedMemoRecord[] = [];
		const now = this.now().getTime();
		for (const markerPath of await this.vaultStore.list(PINNED_MEMOS_FOLDER)) {
			const record = parsePinnedMemoRecord(await this.vaultStore.read(markerPath));
			if (record === null) continue;
			if (record.pendingRemovalAt !== undefined && await this.isPathPresent(record.path)) {
				const latest = await this.vaultStore.mutate(markerPath, async (savedData) => {
					const latestRecord = parsePinnedMemoRecord(savedData);
					if (
						latestRecord === null
						|| latestRecord.pendingRemovalAt === undefined
						|| !await this.isPathPresent(latestRecord.path)
					) {
						return { nextData: null, result: latestRecord };
					}
					const { pendingRemovalAt: _pendingRemovalAt, ...rest } = latestRecord;
					const nextRecord = { ...rest, updatedAt: this.now().toISOString() };
					return { nextData: nextRecord, result: nextRecord };
				});
				if (latest !== null) records.push(latest);
				continue;
			}
			if (isExpiredPendingRemoval(record, now)) {
				const timestamp = this.now();
				const latest = await this.vaultStore.mutate(markerPath, (savedData) => {
					const latestRecord = parsePinnedMemoRecord(savedData);
					if (latestRecord === null || !isExpiredPendingRemoval(latestRecord, now)) {
						return { nextData: null, result: latestRecord };
					}
					const nextRecord = buildUnpinnedRecord(latestRecord, timestamp);
					return { nextData: nextRecord, result: nextRecord };
				});
				if (latest !== null) records.push(latest);
				continue;
			}
			if (isExpiredUnpinnedMarker(record, now)) {
				const deleted = await this.vaultStore.deleteIf(markerPath, (latest) => {
					const latestRecord = parsePinnedMemoRecord(latest);
					return latestRecord !== null && isExpiredUnpinnedMarker(latestRecord, now);
				});
				if (!deleted) {
					const latestRecord = parsePinnedMemoRecord(await this.vaultStore.read(markerPath));
					if (latestRecord !== null) records.push(latestRecord);
				}
				continue;
			}
			records.push(record);
		}
		const latestByPath = new Map(records
			.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.path.localeCompare(right.path))
			.map((record) => [record.path, record]));
		const paths = [...latestByPath.values()]
			.filter((record) => record.pinned && record.pendingRemovalAt === undefined)
			.sort((left, right) => right.pinnedAt.localeCompare(left.pinnedAt) || left.path.localeCompare(right.path))
			.map((record) => record.path);
		const pendingRemovalPaths = [...latestByPath.values()]
			.filter((record) => record.pinned && record.pendingRemovalAt !== undefined)
			.sort((left, right) => right.pinnedAt.localeCompare(left.pinnedAt) || left.path.localeCompare(right.path))
			.map((record) => record.path);
		const localData = await this.localStore.read();
		return { paths, pendingRemovalPaths, collapsed: extractPinnedSectionCollapsed(localData) };
	}

	/** Clears pending-removal metadata without creating a duplicate marker. */
	private async restorePathRecord(path: string): Promise<void> {
		for (const markerPath of await this.vaultStore.list(PINNED_MEMOS_FOLDER)) {
			const record = parsePinnedMemoRecord(await this.vaultStore.read(markerPath));
			if (record?.path !== path || !record.pinned || record.pendingRemovalAt === undefined) continue;
			const { pendingRemovalAt: _pendingRemovalAt, ...rest } = record;
			await this.vaultStore.write(markerPath, { ...rest, updatedAt: this.now().toISOString() });
		}
	}

	/** Allocates a stable marker path while handling rare hash collisions. */
	private async allocateMarkerPath(path: string): Promise<string> {
		const stem = `${PINNED_MEMOS_FOLDER}/${hashText(path).replace("fnv1a-", "")}`;
		for (let suffix = 1; ; suffix += 1) {
			const candidate = `${stem}${suffix === 1 ? "" : `-${suffix}`}.json`;
			const existing = parsePinnedMemoRecord(await this.vaultStore.read(candidate));
			if (existing === null || existing.path === path) return candidate;
		}
	}

	/** Runs one pin-state mutation at a time so file events cannot overlap writes. */
	private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
		const previous = this.mutationQueue;
		let releaseQueue: () => void = () => undefined;
		this.mutationQueue = new Promise<void>((resolve) => { releaseQueue = resolve; });
		await previous;
		try {
			return await operation();
		} finally {
			releaseQueue();
		}
	}
}

/** Tests whether an unpinned synchronization marker has exceeded its retention period. */
function isExpiredUnpinnedMarker(record: PinnedMemoRecord, now: number): boolean {
	if (record.pinned) return false;
	const updatedAt = Date.parse(record.updatedAt);
	return Number.isFinite(updatedAt) && now - updatedAt > UNPINNED_MARKER_RETENTION_MS;
}

/** Tests whether a pending removal has exceeded the one-day recovery window. */
function isExpiredPendingRemoval(record: PinnedMemoRecord, now: number): boolean {
	if (!record.pinned || record.pendingRemovalAt === undefined) return false;
	const pendingAt = Date.parse(record.pendingRemovalAt);
	return Number.isFinite(pendingAt) && now - pendingAt >= PENDING_REMOVAL_GRACE_MS;
}

/** Builds a tombstone while removing transient pending-removal metadata. */
function buildUnpinnedRecord(record: PinnedMemoRecord, now: Date): PinnedMemoRecord {
	const { pendingRemovalAt: _pendingRemovalAt, ...rest } = record;
	return { ...rest, updatedAt: now.toISOString(), pinned: false };
}

/** Parses and validates one marker file. */
function parsePinnedMemoRecord(value: unknown | null): PinnedMemoRecord | null {
	if (!isRecord(value) || typeof value.path !== "string" || value.path.length === 0 || typeof value.pinnedAt !== "string") return null;
	const pendingRemovalAt = typeof value.pendingRemovalAt === "string" && value.pendingRemovalAt.length > 0
		? value.pendingRemovalAt : undefined;
	return {
		path: value.path,
		pinnedAt: value.pinnedAt,
		updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : value.pinnedAt,
		pinned: value.pinned !== false,
		...(pendingRemovalAt !== undefined && value.pinned !== false ? { pendingRemovalAt } : {}),
	};
}

/** Compares shared paths, pending paths, and the local expansion flag. */
function arePinnedMemoSnapshotsEqual(left: PinnedMemoSnapshot, right: PinnedMemoSnapshot): boolean {
	return left.collapsed === right.collapsed
		&& left.paths.length === right.paths.length
		&& left.paths.every((path, index) => path === right.paths[index])
		&& left.pendingRemovalPaths.length === right.pendingRemovalPaths.length
		&& left.pendingRemovalPaths.every((path, index) => path === right.pendingRemovalPaths[index]);
}
