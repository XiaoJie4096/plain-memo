import { normalizeMarkdownLineEndings } from "../utils/markdown";

export type ComposerInlineNode =
	| { type: "text"; value: string }
	| { type: "tag"; value: string; source: string }
	| { type: "image"; value: string; source: string }
	| { type: "raw"; value: string };

export type ComposerBlock =
	| { type: "paragraph"; inlines: ComposerInlineNode[] }
	| { type: "list"; ordered: boolean; items: ComposerListItem[] }
	| { type: "raw"; value: string };

export interface ComposerListItem {
	indent: string;
	checked: " " | "x" | "X" | "-" | null;
	inlines: ComposerInlineNode[];
}

export interface ComposerMarkdownDocument {
	blocks: ComposerBlock[];
	trailingNewline: boolean;
}

const TASK_ITEM_REGEX = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX-])\]|\[\]|【】)\s*(.*)$/;
const BARE_TASK_ITEM_REGEX = /^(\s*)(?:\[([ xX-])\]|\[\]|【】)\s+(.*)$/;
const LIST_ITEM_REGEX = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const INLINE_REGEX = /(!(?:\[([^\]]*)\]\([^)]*\)|\[\[([^\]]+)\]\]))|(^|[\s([{])#([^\s#\]]+)/g;

export function parseComposerMarkdown(value: string): ComposerMarkdownDocument {
	const normalized = normalizeMarkdownLineEndings(value);
	const lines = normalized.split("\n");
	const trailingNewline = normalized.endsWith("\n");
	if (trailingNewline) {
		lines.pop();
	}
	const blocks: ComposerBlock[] = [];
	let index = 0;
	while (index < lines.length) {
		const line = lines[index] ?? "";
		const firstTask = matchTaskLine(line);
		const firstList = line.match(LIST_ITEM_REGEX);
		if (firstTask !== null || firstList !== null) {
			const ordered = (firstTask?.marker ?? firstList?.[2] ?? "").match(/^\d/)! !== null;
			const items: ComposerListItem[] = [];
			while (index < lines.length) {
				const current = lines[index] ?? "";
				const task = matchTaskLine(current);
				const list = current.match(LIST_ITEM_REGEX);
				const marker = task?.marker ?? list?.[2] ?? "";
				if (task === null && list === null || (marker.match(/^\d/) !== null) !== ordered) {
					break;
				}
				items.push({
					indent: task?.indent ?? list?.[1] ?? "",
					checked: task?.checked ?? null,
					inlines: parseComposerInline(task?.content ?? list?.[3] ?? ""),
				});
				index += 1;
			}
			blocks.push({ type: "list", ordered, items });
			continue;
		}
		if (isSupportedParagraphLine(line)) {
			const paragraphLines = [line];
			index += 1;
			while (index < lines.length) {
				const nextLine = lines[index] ?? "";
				if (matchTaskLine(nextLine) !== null || nextLine.match(LIST_ITEM_REGEX) !== null || !isSupportedParagraphLine(nextLine)) {
					break;
				}
				paragraphLines.push(nextLine);
				index += 1;
			}
			blocks.push({ type: "paragraph", inlines: parseComposerInline(paragraphLines.join("\n")) });
		} else {
			blocks.push({ type: "raw", value: line });
			index += 1;
		}
	}
	return { blocks, trailingNewline };
}

function matchTaskLine(line: string): { indent: string; marker: string; checked: ComposerListItem["checked"]; content: string } | null {
	const marked = line.match(TASK_ITEM_REGEX);
	if (marked !== null) {
		return {
			indent: marked[1] ?? "",
			marker: marked[2] ?? "",
			checked: (marked[3] as ComposerListItem["checked"] | undefined) ?? " ",
			content: marked[4] ?? "",
		};
	}
	const bare = line.match(BARE_TASK_ITEM_REGEX);
	if (bare === null) return null;
	return {
		indent: bare[1] ?? "",
		marker: "-",
		checked: (bare[2] as ComposerListItem["checked"] | undefined) ?? " ",
		content: bare[3] ?? "",
	};
}

export function serializeComposerMarkdown(document: ComposerMarkdownDocument): string {
	const blocks: string[] = [];
	for (const block of document.blocks) {
		if (block.type === "raw") {
			blocks.push(block.value);
			continue;
		}
		if (block.type === "paragraph") {
			blocks.push(serializeComposerInline(block.inlines));
			continue;
		}
		const lines: string[] = [];
		for (const [index, item] of block.items.entries()) {
			const marker = block.ordered ? `${index + 1}.` : "-";
			const task = item.checked === null ? "" : `[${item.checked}] `;
			lines.push(`${item.indent}${marker} ${task}${serializeComposerInline(item.inlines)}`);
		}
		blocks.push(lines.join("\n"));
	}
	const result = blocks.reduce((value, block, index) => {
		if (index === 0) return block;
		const previous = blocks[index - 1] ?? "";
		// Adjacent non-empty paragraph blocks represent separate paragraphs in the editor.
		// Empty blocks already carry the blank line, so adding another one would double it.
		const separator = previous.length > 0 && block.length > 0 && isParagraphBlock(document.blocks[index - 1]) && isParagraphBlock(document.blocks[index])
			? "\n\n"
			: "\n";
		return `${value}${separator}${block}`;
	}, "");
	return document.trailingNewline && result.length > 0 ? `${result}\n` : result;
}

function isParagraphBlock(block: ComposerBlock | undefined): boolean {
	return block?.type === "paragraph";
}

export function parseComposerInline(value: string): ComposerInlineNode[] {
	const nodes: ComposerInlineNode[] = [];
	let cursor = 0;
	INLINE_REGEX.lastIndex = 0;
	let match = INLINE_REGEX.exec(value);
	while (match !== null) {
		const tagPrefix = match[4] ?? "";
		const start = match.index + (match[1] === undefined ? tagPrefix.length : 0);
		if (start > cursor) {
			nodes.push({ type: "text", value: value.slice(cursor, start) });
		}
		if (match[1] !== undefined) {
			nodes.push({ type: "image", value: match[2] ?? match[3] ?? "", source: match[1] });
			cursor = start + match[1].length;
		} else {
			const source = `#${match[5]}`;
			nodes.push({ type: "tag", value: match[5], source });
			cursor = start + source.length;
		}
		match = INLINE_REGEX.exec(value);
	}
	if (cursor < value.length) {
		nodes.push({ type: "text", value: value.slice(cursor) });
	}
	return nodes.length > 0 ? nodes : [{ type: "text", value: "" }];
}

export function serializeComposerInline(nodes: readonly ComposerInlineNode[]): string {
	return nodes.map((node) => node.type === "text" || node.type === "raw" ? node.value : node.source).join("");
}

function isSupportedParagraphLine(line: string): boolean {
	return !/^(?:#{1,6}\s|>|```|~~~|\|)/.test(line.trim());
}
