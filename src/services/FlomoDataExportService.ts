import { normalizePath, TFile } from "obsidian";
import type { App } from "obsidian";

import { PLAIN_MEMO_DATA_FOLDER, PLAIN_MEMO_FOLDER, PLAIN_MEMO_PICTURE_FOLDER } from "../constants";
import { t } from "../i18n";
import { isPlainMemoFileName, parseMemoFilenameTimestamp } from "../utils/fileMemoName";
import { parseMarkdownImages } from "../utils/markdownImages";
import { ensureFolder } from "../utils/vault";

const FALLBACK_EXPORT_FOLDER = "plainmemo-export-to-flomo";
const IMAGE_EXTENSION_PATTERN = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i;

export interface FlomoDataExportResult {
	memoCount: number;
	omittedImageCount: number;
	path: string;
}

interface ExportMemo {
	file: TFile;
	createdAt: Date;
}

/** Exports standalone PlainMemo files as a Flomo-compatible CSV file. */
export class FlomoDataExportService {
	constructor(private readonly app: App, private readonly getScanFolders: () => readonly string[]) {}

	/** Checks whether the configured scan folders contain exportable PlainMemo files. */
	hasExportableMemos(): boolean {
		return this.getExportMemos().length > 0;
	}

	/** Writes the CSV and its external import instructions to the localized Vault-root folder. */
	async export(): Promise<FlomoDataExportResult> {
		const files = this.getExportMemos();
		if (files.length === 0) throw new Error(t("settings.file.flomoExportNothing"));
		const rows: Array<{ content: string; createdAt: Date }> = [];
		let omittedImageCount = 0;
		for (const item of files) {
			const source = await this.app.vault.cachedRead(item.file);
			const result = removeFlomoUnsupportedImages(source);
			rows.push({ content: result.content, createdAt: item.createdAt });
			omittedImageCount += result.omittedImageCount;
		}
		const folder = localizedExportFolderName();
		const fileName = `${folder}-${formatExportTimestamp(new Date())}.csv`;
		const path = normalizePath(`${folder}/${fileName}`);
		await ensureFolder(this.app, folder);
		await this.app.vault.adapter.write(path, createFlomoCsv(rows));
		await this.app.vault.adapter.write(
			normalizePath(`${folder}/${t("settings.file.flomoExportInstructionsFile")}`),
			t("settings.file.flomoExportInstructions"),
		);
		return { memoCount: files.length, omittedImageCount, path };
	}

	/** Finds timestamped PlainMemo Markdown files inside the configured scan folders. */
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

/** Creates a UTF-8-with-BOM CSV matching Flomo's import template columns. */
export function createFlomoCsv(rows: readonly { content: string; createdAt: Date }[]): string {
	return `\uFEFFcontent,created_at\n${rows.map((row) => `${escapeCsvValue(row.content)},${escapeCsvValue(formatFlomoTimestamp(row.createdAt))}`).join("\n")}\n`;
}

/** Removes image embeds that Flomo's CSV import template cannot carry. */
export function removeFlomoUnsupportedImages(content: string): { content: string; omittedImageCount: number } {
	const images = parseMarkdownImages(content).filter((image) => image.syntax === "markdown_image" || IMAGE_EXTENSION_PATTERN.test(image.path));
	if (images.length === 0) return { content, omittedImageCount: 0 };
	let result = "";
	let position = 0;
	for (const image of images) {
		result += content.slice(position, image.start);
		position = image.end;
	}
	return { content: result + content.slice(position), omittedImageCount: images.length };
}

/** Escapes one field according to RFC 4180 CSV quoting rules. */
function escapeCsvValue(value: string): string {
	const normalized = value.replace(/\r\n?/g, "\n");
	return /[",\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
}

/** Excludes PlainMemo internals and this export folder from the export source. */
function isInternalPlainMemoPath(path: string): boolean {
	return path === PLAIN_MEMO_FOLDER || path.startsWith(`${PLAIN_MEMO_DATA_FOLDER}/`) || path.startsWith(`${PLAIN_MEMO_PICTURE_FOLDER}/`)
		|| path.includes("/_knomo-trash/") || path.startsWith(`${FALLBACK_EXPORT_FOLDER}/`);
}

/** Uses the language-specific fixed export folder name. */
function localizedExportFolderName(): string { return t("settings.file.flomoExportFolder"); }

/** Formats a local memo timestamp for Flomo's CSV import column. */
function formatFlomoTimestamp(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:00`;
}

/** Builds a stable timestamp suffix for the generated CSV filename. */
function formatExportTimestamp(date: Date): string {
	return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
}
