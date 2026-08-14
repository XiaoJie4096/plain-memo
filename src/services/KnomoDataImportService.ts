import { TFile, normalizePath } from "obsidian";
import type { App } from "obsidian";

import { PLAIN_MEMO_DATA_FOLDER, PLAIN_MEMO_FOLDER } from "../constants";
import { formatMemoFilenameTimestamp, toSafeMemoFileStem } from "../utils/fileMemoName";
import { hashMemoContent } from "../utils/hash";
import { ensureFolder } from "../utils/vault";

const IMPORT_STATE_PATH = `${PLAIN_MEMO_DATA_FOLDER}/knomo-import.json`;

export interface KnomoDataImportResult {
	created: number;
	skipped: number;
	changed: number;
	failed: string[];
	scannedFiles: number;
}

interface ImportState { sources: Record<string, { hash: string; targetPath: string }>; }
interface Candidate { sourceKey: string; content: string; createdAt: Date; }

/** Imports memo blocks from Knomo daily and monthly Markdown files into PlainMemo files. */
export class KnomoDataImportService {
	constructor(private readonly app: App, private readonly getTargetFolder: () => string = () => PLAIN_MEMO_FOLDER) {}

	async import(): Promise<KnomoDataImportResult> {
		const state = await this.readState();
		const targetFolder = this.getTargetFolder().trim() || PLAIN_MEMO_FOLDER;
		const existing = new Set<string>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!file.path.startsWith(`${targetFolder}/`)) continue;
			const content = await this.app.vault.cachedRead(file);
			const created = parseMemoFilenameDate(file.name);
			if (created !== null) existing.add(contentKey(content, created));
		}
		const result: KnomoDataImportResult = { created: 0, skipped: 0, changed: 0, failed: [], scannedFiles: 0 };
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (isPlainMemoPath(file.path) || !looksLikeKnomoPath(file.path)) continue;
			result.scannedFiles += 1;
			const raw = await this.app.vault.cachedRead(file);
			for (const candidate of parseCandidates(file, raw)) {
				const hash = hashMemoContent(candidate.content);
				const previous = state.sources[candidate.sourceKey];
				if (previous !== undefined) {
					if (previous.hash === hash) result.skipped += 1;
					else result.changed += 1;
					continue;
				}
				if (existing.has(contentKey(candidate.content, candidate.createdAt))) { result.skipped += 1; continue; }
				try {
					const folder = targetFolder;
					await ensureFolder(this.app, folder);
					const base = normalizePath(`${folder}/${toSafeMemoFileStem(firstLine(candidate.content), "Knomo")}_${formatMemoFilenameTimestamp(candidate.createdAt)}.md`);
					const path = await allocatePath(this.app, base);
					await this.app.vault.create(path, candidate.content);
					state.sources[candidate.sourceKey] = { hash, targetPath: path };
					existing.add(contentKey(candidate.content, candidate.createdAt));
					result.created += 1;
				} catch (error) { result.failed.push(`${candidate.sourceKey}: ${error instanceof Error ? error.message : String(error)}`); }
			}
		}
		await this.writeState(state);
		return result;
	}

	private async readState(): Promise<ImportState> {
		try { return JSON.parse(await this.app.vault.adapter.read(IMPORT_STATE_PATH)) as ImportState; }
		catch { return { sources: {} }; }
	}

	private async writeState(state: ImportState): Promise<void> {
		await ensureFolder(this.app, PLAIN_MEMO_DATA_FOLDER);
		await this.app.vault.adapter.write(IMPORT_STATE_PATH, `${JSON.stringify(state, null, "\t")}\n`);
	}
}

function parseCandidates(file: TFile, raw: string): Candidate[] {
	const lines = raw.replace(/\r\n?/g, "\n").split("\n");
	const candidates: Candidate[] = [];
	let date: Date | null = dateFromPath(file.path);
	for (let i = 0; i < lines.length; i += 1) {
		const heading = /^##\s+\[\[(\d{4}-\d{2}-\d{2})\]\]/.exec(lines[i] ?? "");
		if (heading) date = parseDate(heading[1]);
		const start = /^-\s+(\d{2}:\d{2}(?::\d{2})?)(?:\s+(.*))?$/.exec(lines[i] ?? "");
		if (!start || date === null) continue;
		const body = [start[2] ?? ""];
		let end = i;
		for (let j = i + 1; j < lines.length && isContinuationLine(lines[j] ?? ""); j += 1) {
			body.push(stripContinuationIndent(lines[j] ?? ""));
			end = j;
		}
		const createdAt = new Date(date); const time = start[1].split(":").map(Number);
		createdAt.setHours(time[0], time[1], time[2] ?? 0, 0);
			const content = stripTrailingBlockId(body.join("\n").trim());
		if (content) {
			const blockId = extractBlockId(body);
			candidates.push({ sourceKey: blockId === null ? `${file.path}:${i + 1}` : `${file.path}#^${blockId}`, content, createdAt });
		}
		i = end;
	}
	return candidates;
}

function looksLikeKnomoPath(path: string): boolean { return /(^|\/)(?:Knomo|Daily|Daily Notes)(?:\/|$)/i.test(path) || /\d{4}-\d{2}-\d{2}\.md$/i.test(path); }
function isPlainMemoPath(path: string): boolean { return path === PLAIN_MEMO_FOLDER || path.startsWith(`${PLAIN_MEMO_FOLDER}/`); }
function firstLine(content: string): string { return content.split("\n").find((line) => line.trim())?.trim() ?? "Knomo"; }
function parseDate(value: string): Date | null { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!m) return null; const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null; }
function dateFromPath(path: string): Date | null { const m = /(?:^|\/)(\d{4})-(\d{2})-(\d{2})\.md$/i.exec(path); return m ? parseDate(`${m[1]}-${m[2]}-${m[3]}`) : null; }
function parseMemoFilenameDate(name: string): Date | null { const m = /_(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?: \(\d+\))?\.md$/i.exec(name); return m ? new Date(2000 + Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) : null; }
function contentKey(content: string, createdAt: Date): string { return `${createdAt.toISOString().slice(0, 16)}:${hashMemoContent(content)}`; }
function extractBlockId(lines: readonly string[]): string | null {
		for (let index = lines.length - 1; index >= 0; index -= 1) {
			const match = /\s\^([A-Za-z0-9-]+)\s*$/.exec(lines[index] ?? "");
			if (match !== null) return match[1];
		}
		return null;
}
function isContinuationLine(line: string): boolean { return /^(?:\t| {2,}|>)/.test(line); }
function stripContinuationIndent(line: string): string { return line.startsWith("\t") ? line.slice(1) : line.replace(/^ {2}/, ""); }
function stripTrailingBlockId(content: string): string {
	return content.replace(/\s\^[A-Za-z0-9-]+\s*$/, "").trimEnd();
}
async function allocatePath(app: App, base: string): Promise<string> { if (app.vault.getAbstractFileByPath(base) === null) return base; const dot = base.lastIndexOf("."); const stem = base.slice(0, dot); for (let n = 2; ; n += 1) { const path = `${stem} (${n}).md`; if (app.vault.getAbstractFileByPath(path) === null) return path; } }
