import { splitMarkdownLines } from "./markdown";

export type MarkdownTaskMarker = " " | "x" | "X" | "-";
export type WritableMarkdownTaskMarker = " " | "x" | "-";

export interface TextReplacement {
	value: string;
	cursor: number;
}

export interface ParsedMarkdownTaskLine {
	indent: string;
	listMarker: string;
	listWhitespace: string;
	marker: MarkdownTaskMarker;
	bodySpacing: string;
	body: string;
	markerStart: number;
	markerEnd: number;
}

export interface IndexedMarkdownTaskLine extends ParsedMarkdownTaskLine {
	index: number;
	lineIndex: number;
	line: string;
}

const TASK_LINE_REGEX = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)\[([ xX-])\]([ \t]*)(.*)$/;

export function parseMarkdownTaskLine(line: string): ParsedMarkdownTaskLine | null {
	const match = line.match(TASK_LINE_REGEX);
	if (match === null || !isMarkdownTaskMarker(match[4])) {
		return null;
	}
	const indent = match[1];
	const listMarker = match[2];
	const listWhitespace = match[3];
	const markerStart = indent.length + listMarker.length + listWhitespace.length;
	return {
		indent,
		listMarker,
		listWhitespace,
		marker: match[4],
		bodySpacing: match[5],
		body: match[6],
		markerStart,
		markerEnd: markerStart + 3,
	};
}

export function getMarkdownTaskLines(content: string): IndexedMarkdownTaskLine[] {
	const lines = splitMarkdownLines(content);
	const tasks: IndexedMarkdownTaskLine[] = [];
	let fence: CodeFenceMarker | null = null;
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const line = lines[lineIndex];
		const fenceMarker = getCodeFenceMarker(line);
		if (fenceMarker !== null) {
			if (fence === null) {
				fence = fenceMarker;
			} else if (isClosingCodeFence(fence, fenceMarker)) {
				fence = null;
			}
			continue;
		}
		if (fence !== null) {
			continue;
		}
		const task = parseMarkdownTaskLine(line);
		if (task === null) {
			continue;
		}
		tasks.push({
			...task,
			index: tasks.length,
			lineIndex,
			line,
		});
	}
	return tasks;
}

export function getMarkdownTaskLineByIndex(content: string, taskIndex: number): IndexedMarkdownTaskLine | null {
	if (!Number.isInteger(taskIndex) || taskIndex < 0) {
		return null;
	}
	return getMarkdownTaskLines(content)[taskIndex] ?? null;
}

export function replaceMarkdownTaskMarkerByIndex(
	content: string,
	taskIndex: number,
	marker: WritableMarkdownTaskMarker,
): string | null {
	const task = getMarkdownTaskLineByIndex(content, taskIndex);
	return task === null ? null : replaceMarkdownTaskMarker(content, task, marker);
}

export function getMarkdownTaskEnterPatch(value: string, start: number, end: number): TextReplacement | null {
	if (start !== end) {
		return null;
	}
	const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
	if (isOffsetInsideFencedCode(value, lineStart)) {
		return null;
	}
	const lineEnd = value.indexOf("\n", lineStart);
	const fullLineEnd = lineEnd === -1 ? value.length : lineEnd;
	const fullTask = parseMarkdownTaskLine(value.slice(lineStart, fullLineEnd));
	// After a task is rendered at the end of a paragraph, the editor keeps a
	// trailing empty paragraph for the caret. Enter is then reported one line
	// after the task, so inspect the immediately preceding line as well.
	if (fullTask === null && lineStart === value.length && start > 0) {
		const previousLineEnd = lineStart - 1;
		const previousLineStart = value.lastIndexOf("\n", Math.max(0, previousLineEnd - 1)) + 1;
		const previousTask = parseMarkdownTaskLine(value.slice(previousLineStart, previousLineEnd));
		if (previousTask !== null && isEmptyTask(previousTask)) {
			const remainder = preserveEmptyTaskRemainder(value, previousLineStart, previousLineEnd);
			const nextValue = `${value.slice(0, previousLineStart)}${previousTask.indent}${remainder}`;
			return {
				value: nextValue,
				cursor: getEmptyTaskExitCursor(nextValue, previousLineStart, previousTask.indent.length),
			};
		}
	}
	// The rendered checkbox is non-editable, so Chromium can report a caret
	// inside the marker rather than after its trailing space. Use the complete
	// line to recognize and remove an empty task in that case.
	if (fullTask !== null && isEmptyTask(fullTask)
		// A replacement decoration may map the caret to the start of the
		// hidden task marker. Any position on an empty task row means "exit".
		&& start >= lineStart && start <= fullLineEnd) {
		const remainder = preserveEmptyTaskRemainder(value, lineStart, fullLineEnd);
		const nextValue = `${value.slice(0, lineStart)}${fullTask.indent}${remainder}`;
		return {
			value: nextValue,
			cursor: getEmptyTaskExitCursor(nextValue, lineStart, fullTask.indent.length),
		};
	}
	const line = value.slice(lineStart, start);
	const task = parseMarkdownTaskLine(line);
	if (task === null) {
		return null;
	}
	if (isEmptyTask(task)) {
		const remainder = preserveEmptyTaskRemainder(value, lineStart, fullLineEnd);
		const nextValue = `${value.slice(0, lineStart)}${task.indent}${remainder}`;
		return {
			value: nextValue,
			cursor: getEmptyTaskExitCursor(nextValue, lineStart, task.indent.length),
		};
	}
	const insert = `\n${task.indent}${getNextTaskListMarker(task)} [ ] `;
	const cursor = start + insert.length;
	return {
		value: `${value.slice(0, start)}${insert}${value.slice(end)}`,
		cursor,
	};
}

function replaceMarkdownTaskMarker(
	content: string,
	task: IndexedMarkdownTaskLine,
	marker: WritableMarkdownTaskMarker,
): string | null {
	const lines = splitMarkdownLines(content);
	const line = lines[task.lineIndex];
	if (line === undefined) {
		return null;
	}
	lines[task.lineIndex] = `${line.slice(0, task.markerStart)}[${marker}]${line.slice(task.markerEnd)}`;
	return lines.join("\n");
}

function isMarkdownTaskMarker(value: string): value is MarkdownTaskMarker {
	return value === " " || value === "x" || value === "X" || value === "-";
}

function isEmptyTask(task: ParsedMarkdownTaskLine): boolean {
	return task.body.trim().length === 0;
}

function preserveEmptyTaskRemainder(value: string, lineStart: number, lineEnd: number): string {
	// The task row already owns the newline before `lineStart`. When it is the
	// final row, adding another newline would move the caret to a new row rather
	// than leaving it where the task marker was cancelled.
	return value.slice(lineEnd);
}

function getEmptyTaskExitCursor(value: string, lineStart: number, indentLength: number): number {
	return lineStart + indentLength;
}

function getNextTaskListMarker(task: ParsedMarkdownTaskLine): string {
	const ordered = task.listMarker.match(/^(\d+)[.)]$/);
	if (ordered === null) {
		return task.listMarker;
	}
	return `${Number(ordered[1]) + 1}.`;
}

function isOffsetInsideFencedCode(content: string, offset: number): boolean {
	const lines = splitMarkdownLines(content.slice(0, offset));
	let fence: CodeFenceMarker | null = null;
	for (const line of lines.slice(0, -1)) {
		const marker = getCodeFenceMarker(line);
		if (marker === null) {
			continue;
		}
		if (fence === null) {
			fence = marker;
		} else if (isClosingCodeFence(fence, marker)) {
			fence = null;
		}
	}
	return fence !== null;
}

interface CodeFenceMarker {
	char: "`" | "~";
	length: number;
}

function getCodeFenceMarker(line: string): CodeFenceMarker | null {
	const match = line.match(/^(?: {0,3})(`{3,}|~{3,})/);
	if (match === null) {
		return null;
	}
	const marker = match[1];
	return {
		char: marker.charAt(0) as "`" | "~",
		length: marker.length,
	};
}

function isClosingCodeFence(opening: CodeFenceMarker, candidate: CodeFenceMarker): boolean {
	return candidate.char === opening.char && candidate.length >= opening.length;
}
