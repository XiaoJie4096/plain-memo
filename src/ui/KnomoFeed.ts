import { setIcon } from "obsidian";

import { KNOMO_ALL_NOTES_ICON, KNOMO_RANDOM_REUNION_ICON, KNOMO_TIME_BUOY_ICON } from "../icons";
import { getKnomoLocale, t } from "../i18n";
import type { CardFlowHeader } from "./KnomoCardFlowPresenter";
import type { ShuffleDayStats } from "../utils/shuffleDay";

type LoadMoreAction = "load-more" | "load-more-mobile-search" | "load-more-time-buoy-cards";

interface RenderLoadMoreButtonOptions {
	remainingCount: number;
	action: LoadMoreAction;
	extraClass?: string;
	sentinel?: boolean;
}

export interface FeedQuickActionsOptions {
	pinnedCount: number;
	pinsCollapsed: boolean;
	randomActive: boolean;
	timeBuoyActive: boolean;
	timeBuoyEnabled: boolean;
}

/** Renders the persistent feed controls shared by desktop and mobile layouts. */
export function renderKnomoFeedQuickActions(
	container: HTMLElement,
	options: FeedQuickActionsOptions,
): HTMLElement {
	const actions = container.createDiv({ cls: "plain-memo-feed-quick-actions" });
	const hasPinnedMemos = options.pinnedCount > 0;
	renderFeedQuickAction(
		actions,
		options.randomActive ? KNOMO_ALL_NOTES_ICON : KNOMO_RANDOM_REUNION_ICON,
		options.randomActive ? t("feed.backHome") : t("feed.random"),
		"open-random-reunion",
		options.randomActive,
	);
	if (options.timeBuoyEnabled) {
		renderFeedQuickAction(
			actions,
			options.timeBuoyActive ? KNOMO_ALL_NOTES_ICON : KNOMO_TIME_BUOY_ICON,
			options.timeBuoyActive ? t("feed.backHome") : t("feed.timeBuoy"),
			"open-time-buoy",
			options.timeBuoyActive,
		);
	}
	renderFeedQuickAction(
		actions,
		hasPinnedMemos ? (options.pinsCollapsed ? "chevron-left" : "chevron-down") : null,
		hasPinnedMemos
			? (options.pinsCollapsed ? t("feed.pins.expand") : t("feed.pins.collapse"))
			: t("feed.pins.none"),
		"toggle-pinned-section",
		hasPinnedMemos && !options.pinsCollapsed,
		true,
		!hasPinnedMemos,
	);
	return actions;
}

export function renderKnomoListSummary(container: HTMLElement, text: string): HTMLElement {
	return container.createDiv({
		cls: "plain-memo-list-summary",
		text,
	});
}

export function renderKnomoRandomReunionToolbar(container: HTMLElement, count: number): HTMLElement {
	const toolbar = container.createDiv({ cls: "plain-memo-list-toolbar" });
	renderKnomoListSummary(toolbar, t("list.randomSummary", { count }));
	toolbar.createEl("button", {
		cls: "plain-memo-inline-button",
		text: t("list.randomRefresh"),
		attr: {
			type: "button",
			"data-action": "refresh-random-reunion",
		},
	});
	return toolbar;
}

export function renderKnomoShuffleDayHeader(
	container: HTMLElement,
	selectedDate: string,
	stats: ShuffleDayStats,
): HTMLElement {
	const header = container.createDiv({ cls: "plain-memo-shuffle-day-header" });
	header.createDiv({ cls: "plain-memo-shuffle-day-date", text: formatShuffleDayDateTitle(selectedDate) });
	const summary = formatShuffleDaySummary(stats);
	if (summary.length > 0) {
		header.createDiv({ cls: "plain-memo-shuffle-day-summary", text: summary });
	}
	return header;
}

export function renderKnomoCardFlowHeaders(container: HTMLElement, headers: CardFlowHeader[]): HTMLElement[] {
	return headers.map((header) => {
		if (header.type === "random-toolbar") {
			return renderKnomoRandomReunionToolbar(container, header.count);
		}
		if (header.type === "shuffle-day") {
			return renderKnomoShuffleDayHeader(container, header.selectedDate, header.stats);
		}
		return renderKnomoListSummary(container, header.text);
	});
}

export function renderKnomoLoadMoreButton(container: HTMLElement, options: RenderLoadMoreButtonOptions): HTMLButtonElement {
	const attr: Record<string, string> = {
		type: "button",
		"data-action": options.action,
	};
	if (options.sentinel === true) {
		attr["data-load-more-sentinel"] = "true";
	}
	const cls = options.extraClass === undefined
		? "plain-memo-load-more"
		: `plain-memo-load-more ${options.extraClass}`;
	return container.createEl("button", {
		cls,
		text: t("list.loadMore", { count: options.remainingCount }),
		attr,
	});
}

export function renderKnomoEmptyState(container: HTMLElement, title = t("empty.generic"), description = ""): HTMLElement {
	const emptyState = container.createDiv({ cls: "plain-memo-empty-state" });
	emptyState.createDiv({ cls: "plain-memo-empty-title", text: title });
	if (description.length > 0) {
		emptyState.createDiv({ cls: "plain-memo-empty-description", text: description });
	}
	return emptyState;
}

/** Renders one stateful action in the persistent feed control row. */
function renderFeedQuickAction(
	container: HTMLElement,
	icon: string | null,
	label: string,
	action: string,
	active: boolean,
	iconAfterLabel = false,
	disabled = false,
): HTMLButtonElement {
	const button = container.createEl("button", {
		cls: active ? "plain-memo-feed-quick-action is-active" : "plain-memo-feed-quick-action",
		attr: {
			type: "button",
			"data-action": action,
			"aria-pressed": active ? "true" : "false",
			...(disabled ? { disabled: "", "aria-disabled": "true" } : {}),
		},
	});
	if (icon !== null && !iconAfterLabel) {
		setIcon(button.createSpan({ cls: "plain-memo-button-icon" }), icon);
	}
	button.createSpan({ cls: "plain-memo-button-label", text: label });
	if (icon !== null && iconAfterLabel) {
		setIcon(button.createSpan({ cls: "plain-memo-button-icon" }), icon);
	}
	return button;
}

function formatShuffleDayDateTitle(selectedDate: string): string {
	const date = parseDateKey(selectedDate);
	if (date === null) {
		return selectedDate;
	}
	const locale = getKnomoLocale();
	const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
	const separator = t("filterSummary.separator");
	if (locale === "zh-CN") {
		return `${selectedDate}${separator}${weekday}`;
	}
	const dateText = new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(date);
	return `${dateText}${separator}${weekday}`;
}

function formatShuffleDaySummary(stats: ShuffleDayStats): string {
	const parts = [
		stats.memoCount > 0 ? formatShuffleDayCount(stats.memoCount, "memo") : null,
		stats.wordCount > 0 ? formatShuffleDayCount(stats.wordCount, "word") : null,
		stats.tagCount > 0 ? formatShuffleDayCount(stats.tagCount, "tag") : null,
		stats.imageCount > 0 ? formatShuffleDayCount(stats.imageCount, "image") : null,
		stats.linkCount > 0 ? formatShuffleDayCount(stats.linkCount, "link") : null,
	].filter((part): part is string => part !== null);
	return parts.join(t("filterSummary.separator"));
}

function formatShuffleDayCount(count: number, metric: "memo" | "word" | "tag" | "image" | "link"): string {
	const keys = {
		memo: ["shuffleDay.summary.memoOne", "shuffleDay.summary.memoOther"],
		word: ["shuffleDay.summary.wordOne", "shuffleDay.summary.wordOther"],
		tag: ["shuffleDay.summary.tagOne", "shuffleDay.summary.tagOther"],
		image: ["shuffleDay.summary.imageOne", "shuffleDay.summary.imageOther"],
		link: ["shuffleDay.summary.linkOne", "shuffleDay.summary.linkOther"],
	} as const;
	const key = count === 1 ? keys[metric][0] : keys[metric][1];
	return t(key, { count });
}

function parseDateKey(value: string): Date | null {
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (match === null) {
		return null;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return null;
	}
	return date;
}
