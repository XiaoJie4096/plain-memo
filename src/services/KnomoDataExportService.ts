import { normalizePath, TFile } from "obsidian";
import type { App } from "obsidian";

import { PLAIN_MEMO_DATA_FOLDER, PLAIN_MEMO_FOLDER, PLAIN_MEMO_PICTURE_FOLDER } from "../constants";
import { t } from "../i18n";
import { isPlainMemoFileName, parseMemoFilenameTimestamp } from "../utils/fileMemoName";
import { ensureFolder } from "../utils/vault";

const FALLBACK_EXPORT_FOLDER = "plainmemo-export-to-knomo";
export interface KnomoDataExportResult {
	memoCount: number;
	dayCount: number;
	zipName: string;
	path: string;
}

interface ExportMemo {
	file: TFile;
	createdAt: Date;
	}

interface ZipEntry {
	name: string;
	data: Uint8Array;
}

/** Exports standalone PlainMemo files as Knomo-compatible Daily Notes in a ZIP archive. */
export class KnomoDataExportService {
	constructor(private readonly app: App, private readonly getScanFolders: () => readonly string[]) {}

	hasExportableMemos(): boolean {
		return this.getExportMemos().length > 0;
	}

	async export(): Promise<KnomoDataExportResult> {
		const files = this.getExportMemos();
		if (files.length === 0) throw new Error(t("settings.file.knomoExportNothing"));
		const zipName = `${localizedExportFolderName()}-${formatExportTimestamp(new Date())}.zip`;
		const dailyFiles = new Map<string, string[]>();
		for (const item of files) {
			const dateKey = formatDateKey(item.createdAt);
			const lines = dailyFiles.get(dateKey) ?? [];
			lines.push(formatKnomoMemo(item.createdAt, await this.app.vault.cachedRead(item.file)));
			dailyFiles.set(dateKey, lines);
		}
		const entries: ZipEntry[] = [...dailyFiles.entries()]
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([date, lines]) => ({ name: `${date}.md`, data: encodeUtf8(`${lines.join("\n\n")}\n`) }));
		const bytes = createZipArchive(entries);
		const instructionsName = t("settings.file.knomoExportInstructionsFile");
		const instructions = encodeUtf8(t("settings.file.knomoExportInstructions"));
		const folder = localizedExportFolderName();
		await ensureFolder(this.app, folder);
		const path = normalizePath(`${folder}/${zipName}`);
		const instructionsPath = normalizePath(`${folder}/${instructionsName}`);
		await this.app.vault.adapter.writeBinary(path, new Uint8Array(bytes).buffer);
		await this.app.vault.adapter.write(instructionsPath, t("settings.file.knomoExportInstructions"));
		return { memoCount: files.length, dayCount: dailyFiles.size, zipName, path };
	}

	private getExportMemos(): ExportMemo[] {
		const folders = this.getScanFolders().map((folder) => folder.trim()).filter(Boolean);
		return this.app.vault.getMarkdownFiles()
			.filter((file) => isPlainMemoFileName(file.name))
			.filter((file) => folders.some((folder) => file.path === folder || file.path.startsWith(`${folder}/`)))
			.filter((file) => !isInternalPlainMemoPath(file.path))
			.map((file) => ({ file, createdAt: parseMemoFilenameTimestamp(file.name) }))
			.filter((item): item is ExportMemo => item.createdAt !== null)
			.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.file.path.localeCompare(right.file.path));
	}
}

export function formatKnomoMemo(createdAt: Date, content: string): string {
	const lines = content.replace(/\r\n?/g, "\n").split("\n");
	const time = `${String(createdAt.getHours()).padStart(2, "0")}:${String(createdAt.getMinutes()).padStart(2, "0")}:00`;
	const first = lines.shift() ?? "";
	return `- ${time}${first.length > 0 ? ` ${first}` : ""}${lines.length > 0 ? `\n${lines.map((line) => `\t${line}`).join("\n")}` : ""}`;
}

export function createZipArchive(entries: readonly ZipEntry[]): Uint8Array {
	const localParts: Uint8Array[] = [];
	const centralParts: Uint8Array[] = [];
	let offset = 0;
	for (const entry of entries) {
		const name = encodeUtf8(entry.name);
		const crc = crc32(entry.data);
		const local = new Uint8Array(30 + name.length + entry.data.length);
		const view = new DataView(local.buffer);
		view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true); view.setUint16(8, 0, true);
		view.setUint32(14, crc, true); view.setUint32(18, entry.data.length, true); view.setUint32(22, entry.data.length, true);
		view.setUint16(26, name.length, true); view.setUint16(28, 0, true); local.set(name, 30); local.set(entry.data, 30 + name.length);
		localParts.push(local);
		const central = new Uint8Array(46 + name.length); const centralView = new DataView(central.buffer);
		centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true); centralView.setUint16(8, 0x0800, true); centralView.setUint32(16, crc, true);
		centralView.setUint32(20, entry.data.length, true); centralView.setUint32(24, entry.data.length, true); centralView.setUint16(28, name.length, true);
		centralView.setUint32(42, offset, true); central.set(name, 46); centralParts.push(central); offset += local.length;
	}
	const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
	const result = new Uint8Array(offset + centralSize + 22); let position = 0;
	for (const part of localParts) { result.set(part, position); position += part.length; }
	const centralOffset = position;
	for (const part of centralParts) { result.set(part, position); position += part.length; }
	const end = new DataView(result.buffer, position, 22); end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, centralSize, true); end.setUint32(16, centralOffset, true);
	return result;
}

function isInternalPlainMemoPath(path: string): boolean {
	return path === PLAIN_MEMO_FOLDER || path.startsWith(`${PLAIN_MEMO_DATA_FOLDER}/`) || path.startsWith(`${PLAIN_MEMO_PICTURE_FOLDER}/`)
		|| path.includes("/_knomo-trash/") || path.startsWith(`${FALLBACK_EXPORT_FOLDER}/`);
}

function localizedExportFolderName(): string { return t("settings.file.knomoExportFolder"); }
function formatDateKey(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function formatExportTimestamp(date: Date): string { return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`; }
function encodeUtf8(value: string): Uint8Array { return new TextEncoder().encode(value); }

function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) !== 0 ? 0xedb88320 : 0); }
	return (crc ^ 0xffffffff) >>> 0;
}
