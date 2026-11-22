import { markdownLanguage } from "@codemirror/lang-markdown";
import { splitMarkdownLines } from "../utils/markdown";

interface MarkdownFence {
	character: string;
	length: number;
}

interface MemoCardRenderSource {
	markdown: string;
	syntheticBreaks: ReadonlySet<number>;
}

/** Prepares card Markdown while tracking boundaries absent from the source. */
export function prepareMemoCardMarkdown(value: string): MemoCardRenderSource {
	const lines = splitMarkdownLines(value);
	const fencedLines = new Set<number>();
	let fence: MarkdownFence | null = null;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		if (fence !== null) {
			fencedLines.add(index);
			if (isClosingFence(line, fence)) {
				fence = null;
			}
			continue;
		}

		const openingFence = getOpeningFence(line);
		if (openingFence !== null) {
			fence = openingFence;
			fencedLines.add(index);
			continue;
		}
		lines[index] = normalizeOrderedMarker(line);
	}
	return splitProseParagraphs(addTaskListBoundaries(lines, fencedLines));
}

/** Presents an unmarked newline in top-level prose as a compact paragraph break. */
function splitProseParagraphs(source: MemoCardRenderSource): MemoCardRenderSource {
	const { markdown } = source;
	if (!markdown.includes("\n")) {
		return source;
	}
	const root = markdownLanguage.parser.parse(markdown).topNode;
	const breaks = new Set<number>();
	for (let paragraph = root.firstChild; paragraph !== null; paragraph = paragraph.nextSibling) {
		if (paragraph.name !== "Paragraph") {
			continue;
		}
		const text = markdown.slice(paragraph.from, paragraph.to);
		// Lezer does not tokenize Obsidian display math and comments as their own blocks.
		if (/^[ \t]*(?:\$\$|%%)/m.test(text)) {
			continue;
		}
		const lines = text.split("\n");
		let lineEnd = paragraph.from;
		let inline = paragraph.firstChild;
		for (let index = 0; index < lines.length - 1; index += 1) {
			const line = lines[index];
			lineEnd += line.length;
			while (inline !== null && inline.to <= lineEnd) {
				inline = inline.nextSibling;
			}
			const insideInline = inline !== null && inline.from <= lineEnd;
			if (!insideInline && isPlainParagraphLine(line) && isPlainParagraphLine(lines[index + 1]) && !hasMarkdownHardBreak(line)) {
				breaks.add(lineEnd);
			}
			lineEnd += 1;
		}
	}
	if (breaks.size === 0) {
		return source;
	}

	const output: string[] = [];
	const syntheticBreaks = new Set<number>();
	let offset = 0;
	let addedBreaks = 0;
	for (const line of markdown.split("\n")) {
		output.push(line);
		offset += line.length;
		if (breaks.has(offset)) {
			output.push("");
			addedBreaks += 1;
			syntheticBreaks.add(offset + addedBreaks);
		} else if (source.syntheticBreaks.has(offset)) {
			syntheticBreaks.add(offset + addedBreaks);
		}
		offset += 1;
	}
	return { markdown: output.join("\n"), syntheticBreaks };
}

function normalizeOrderedMarker(line: string): string {
	return line.replace(/^(\s*\d+)。(?=\s|$)/, "$1.");
}

/** Prevents CommonMark lazy continuation from absorbing the paragraph after a task list. */
function addTaskListBoundaries(lines: string[], fencedLines: ReadonlySet<number>): MemoCardRenderSource {
	const result: string[] = [];
	const syntheticBreaks = new Set<number>();
	let offset = 0;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const previousLine = lines[index - 1] ?? "";
		if (
			index > 0
			&& !fencedLines.has(index)
			&& !fencedLines.has(index - 1)
			&& isTaskListLine(previousLine)
			&& line.trim().length > 0
			&& !isMarkdownListItemLine(line)
			&& result[result.length - 1] !== ""
		) {
			result.push("");
			syntheticBreaks.add(offset);
			offset += 1;
		}
		result.push(line);
		offset += line.length + 1;
	}
	return { markdown: result.join("\n"), syntheticBreaks };
}

function isTaskListLine(line: string): boolean {
	return /^\s*(?:[-*+]|\d+[.)。])\s+\[[ xX-]\](?:\s|$)/.test(line);
}

function isMarkdownListItemLine(line: string): boolean {
	return /^\s*(?:[-*+]|\d+[.)。])(?:\s|$)/.test(line);
}

function isPlainParagraphLine(line: string): boolean {
	if (line.trim().length === 0 || /^(?: {4}|\t)/.test(line)) {
		return false;
	}
	const content = line.replace(/^ {0,3}/, "");
	if (
		/^(?:#{1,6}(?:\s|$)|>|(?:[-+*]|\d+[.)。])(?:\s|$)|\$\$(?:\s|$)|%%|<)/.test(content)
		|| /^(?:\[[^\]]+\]|\[\^[^\]]+\]):/.test(content)
		|| /^(?:\^[-A-Za-z0-9_]+)\s*$/.test(content)
		|| /^(?:([-*_])(?:\s*\1){2,}|={3,})\s*$/.test(content)
		|| content.includes("|")
	) {
		return false;
	}
	return true;
}

/** Leaves Markdown hard breaks and explicit HTML line breaks within their paragraph. */
function hasMarkdownHardBreak(line: string): boolean {
	if (/[ \t]{2,}$/.test(line) || /<br\s*\/?>\s*$/i.test(line)) {
		return true;
	}
	let backslashCount = 0;
	for (let index = line.length - 1; index >= 0 && line.charAt(index) === "\\"; index -= 1) {
		backslashCount += 1;
	}
	return backslashCount % 2 === 1;
}

function getOpeningFence(line: string): MarkdownFence | null {
	const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
	if (match === null) {
		return null;
	}
	return {
		character: match[1].charAt(0),
		length: match[1].length,
	};
}

function isClosingFence(line: string, fence: MarkdownFence): boolean {
	let index = 0;
	while (index < line.length && index < 4 && line.charAt(index) === " ") {
		index += 1;
	}
	if (index > 3) {
		return false;
	}
	let markerLength = 0;
	while (line.charAt(index + markerLength) === fence.character) {
		markerLength += 1;
	}
	return markerLength >= fence.length && line.slice(index + markerLength).trim().length === 0;
}

const renderedBlockTags: Readonly<Record<string, string>> = {
	Paragraph: "P", Task: "P", BulletList: "UL", OrderedList: "OL", ListItem: "LI",
	Blockquote: "BLOCKQUOTE", FencedCode: "PRE", CodeBlock: "PRE", Table: "TABLE", HorizontalRule: "HR",
	ATXHeading1: "H1", ATXHeading2: "H2", ATXHeading3: "H3", ATXHeading4: "H4", ATXHeading5: "H5", ATXHeading6: "H6",
	SetextHeading1: "H1", SetextHeading2: "H2",
};

/** Applies source spacing to Markdown blocks without touching their rendered children. */
export function applyMemoCardBlockSpacing(container: HTMLElement, source: MemoCardRenderSource): void {
	const { markdown, syntheticBreaks } = source;
	if (!markdown.includes("\n")) {
		return;
	}
	const root = markdownLanguage.parser.parse(markdown).topNode;
	visit(container, root, true);

	/** Matches direct children so nested lists never consume a gap from another level. */
	function visit(parent: Element, node: typeof root, topLevel = false): void {
		const children = Array.from(parent.children);
		let childIndex = 0;
		let previous = null;
		for (let block = node.firstChild; block !== null; block = block.nextSibling) {
			const tag = renderedBlockTags[block.name];
			if (tag === undefined) {
				previous = block;
				continue;
			}
			const child = children[childIndex];
			if (child?.tagName !== tag) {
				// Tight lists render their first paragraph as text, with no <p> element.
				if (tag === "P" && node.name === "ListItem" && previous === null) {
					previous = block;
					continue;
				}
				// Renderer extensions may replace a Markdown block with different DOM.
				// Stop at the mismatch instead of applying gaps to the wrong blocks.
				break;
			}
			childIndex += 1;
			const followsParagraph = topLevel && previous?.name === "Paragraph";
			const betweenParagraphs = followsParagraph && block.name === "Paragraph";
			if (previous !== null && hasSourceBlankLine(markdown, previous.to, block.from, syntheticBreaks)) {
				child.classList.add("plain-memo-card-blank-before");
			} else if (followsParagraph && (betweenParagraphs || tag === "UL" || tag === "OL")) {
				child.classList.add("plain-memo-card-after-paragraph");
			}
			if (tag === "UL" || tag === "OL" || tag === "LI" || tag === "BLOCKQUOTE") {
				visit(child, block);
			}
			previous = block;
		}
	}
}

/** Checks for a real blank row between two Markdown blocks. */
function hasSourceBlankLine(markdown: string, from: number, to: number, syntheticBreaks: ReadonlySet<number>): boolean {
	let lineBreak = markdown.indexOf("\n", from);
	while (lineBreak >= 0 && lineBreak < to) {
		const nextBreak = markdown.indexOf("\n", lineBreak + 1);
		if (nextBreak < 0 || nextBreak >= to) {
			return false;
		}
		if (!syntheticBreaks.has(nextBreak) && markdown.slice(lineBreak + 1, nextBreak).trim().length === 0) {
			return true;
		}
		lineBreak = nextBreak;
	}
	return false;
}
