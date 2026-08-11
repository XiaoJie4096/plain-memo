export interface MemoFrontmatterParts {
	frontmatter: string;
	body: string;
}

const LEADING_FRONTMATTER_PATTERN = /^(?:\uFEFF)?---[ \t]*\n[\s\S]*?\n(?:---|\.\.\.)[ \t]*(?:\n|$)/;

export function splitLeadingMemoFrontmatter(content: string): MemoFrontmatterParts {
	const match = content.match(LEADING_FRONTMATTER_PATTERN);
	if (match === null) {
		return { frontmatter: "", body: content };
	}
	return {
		frontmatter: match[0],
		body: content.slice(match[0].length),
	};
}

export function getMemoVisibleContent(content: string): string {
	return splitLeadingMemoFrontmatter(content).body;
}

export function restoreMemoFrontmatter(originalContent: string, editedBody: string): string {
	return `${splitLeadingMemoFrontmatter(originalContent).frontmatter}${editedBody}`;
}

/** Estimates wrapped source lines without measuring rendered card layout. */
export function getMemoCollapseLineWeight(content: string, lineCapacity = 50): number {
	const lines = getMemoVisibleContent(content)
		.replace(/\r\n?/g, "\n")
		.split("\n");
	let weight = 0;
	let inBlankRun = false;
	for (const line of lines) {
		if (line.trim().length === 0) {
			if (!inBlankRun) weight += 0.33;
			inBlankRun = true;
			continue;
		}
		weight += Math.ceil(getMemoLineCharacterWidth(line) / lineCapacity);
		inBlankRun = false;
	}
	return weight;
}

function getMemoLineCharacterWidth(line: string): number {
	let width = 0;
	for (const character of line) {
		width += /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(character) ? 2 : 1;
	}
	return width;
}
