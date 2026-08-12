import { normalizeTagKey } from "../utils/tags";

export interface NumericTagTextPart {
	type: "text" | "tag";
	value: string;
}

const NUMERIC_TAG_PATTERN = /(^|[\s([{])#(\d+)(?=$|[\s#\]])/g;
const SKIPPED_NUMERIC_TAG_ANCESTORS = "a, code, pre, script, style, textarea, .tag";

/** Splits plain text around numeric tags already recognized by PlainMemo metadata. */
export function splitRecognizedNumericTags(value: string, tags: readonly string[]): NumericTagTextPart[] {
	const recognized = new Map(
		tags
			.filter((tag) => /^\d+$/.test(tag))
			.map((tag) => [normalizeTagKey(tag), tag]),
	);
	if (recognized.size === 0) {
		return [{ type: "text", value }];
	}

	const parts: NumericTagTextPart[] = [];
	let cursor = 0;
	NUMERIC_TAG_PATTERN.lastIndex = 0;
	let match = NUMERIC_TAG_PATTERN.exec(value);
	while (match !== null) {
		const prefix = match[1] ?? "";
		const tag = match[2] ?? "";
		const tagStart = match.index + prefix.length;
		const displayTag = recognized.get(normalizeTagKey(tag));
		if (displayTag !== undefined) {
			pushTextPart(parts, value.slice(cursor, tagStart));
			parts.push({ type: "tag", value: displayTag });
			cursor = tagStart + tag.length + 1;
		}
		match = NUMERIC_TAG_PATTERN.exec(value);
	}
	pushTextPart(parts, value.slice(cursor));
	return parts.length > 0 ? parts : [{ type: "text", value }];
}

/** Converts numeric tag text left untouched by Obsidian into delegated tag links. */
export function renderRecognizedNumericTags(container: HTMLElement, tags: readonly string[]): void {
	if (!tags.some((tag) => /^\d+$/.test(tag))) {
		return;
	}
	const document = container.ownerDocument;
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
	const textNodes: Text[] = [];
	let node = walker.nextNode();
	while (node !== null) {
		const textNode = node as Text;
		const parent = textNode.parentElement;
		if (parent !== null && parent.closest(SKIPPED_NUMERIC_TAG_ANCESTORS) === null) {
			textNodes.push(textNode);
		}
		node = walker.nextNode();
	}

	for (const textNode of textNodes) {
		const parts = splitRecognizedNumericTags(textNode.data, tags);
		if (!parts.some((part) => part.type === "tag")) {
			continue;
		}
		const fragment = document.createDocumentFragment();
		for (const part of parts) {
			if (part.type === "text") {
				fragment.append(document.createTextNode(part.value));
				continue;
			}
			const tag = document.createElement("a");
			const tagKey = normalizeTagKey(part.value);
			tag.className = "tag";
			tag.textContent = `#${part.value}`;
			tag.setAttribute("href", `#${part.value}`);
			tag.setAttribute("data-tag", part.value);
			tag.setAttribute("data-tag-key", tagKey);
			fragment.append(tag);
		}
		textNode.replaceWith(fragment);
	}
}

function pushTextPart(parts: NumericTagTextPart[], value: string): void {
	if (value.length > 0) {
		parts.push({ type: "text", value });
	}
}
