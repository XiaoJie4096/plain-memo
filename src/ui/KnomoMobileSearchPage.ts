import { setIcon } from "obsidian";

import { KNOMO_SEARCH_ICON } from "../icons";
import { t } from "../i18n";
import { renderSearchDateButton } from "./KnomoHeaderSearch";
import { SEARCH_DATE_OPTIONS } from "./viewNavigation";

interface RenderMobileSearchPageOptions {
	createHiddenText: (container: HTMLElement, name: string, text: string) => string;
}

export interface MobileSearchPageElements {
	pageEl: HTMLElement;
	inputEl: HTMLInputElement;
	closeButtonEl: HTMLButtonElement;
	quickListEl: HTMLElement;
	resultsEl: HTMLElement;
}

export function renderKnomoMobileSearchPage(
	container: HTMLElement,
	options: RenderMobileSearchPageOptions,
): MobileSearchPageElements {
	const pageEl = container.createDiv({
		cls: "plain-memo-mobile-search-page",
		attr: {
			"aria-hidden": "true",
			inert: "",
		},
	});
	pageEl.createDiv({ cls: "plain-memo-mobile-search-surface", attr: { "aria-hidden": "true" } });
	const header = pageEl.createDiv({ cls: "plain-memo-mobile-search-header" });
	const searchWrap = header.createDiv({ cls: "plain-memo-mobile-search-wrap" });
	setIcon(searchWrap.createSpan({ cls: "plain-memo-search-icon" }), KNOMO_SEARCH_ICON);
	const searchLabelId = options.createHiddenText(searchWrap, "mobile-search-label", t("search.label"));
	const inputEl = searchWrap.createEl("input", {
		cls: "plain-memo-search-input",
		attr: {
			type: "search",
			placeholder: t("search.label"),
			"aria-labelledby": searchLabelId,
		},
	});
	const closeButtonEl = header.createEl("button", {
		cls: "plain-memo-mobile-search-close",
		attr: {
			type: "button",
			"aria-label": t("search.close"),
			"data-action": "close-mobile-search",
		},
	});
	setIcon(closeButtonEl, "x");

	const contentEl = pageEl.createDiv({ cls: "plain-memo-mobile-search-content" });
	const quickSection = contentEl.createDiv({ cls: "plain-memo-mobile-search-quick" });
	quickSection.createDiv({ cls: "plain-memo-mobile-search-section-title", text: t("search.quick") });
	const quickListEl = quickSection.createDiv({ cls: "plain-memo-mobile-search-chip-list" });
	for (const option of SEARCH_DATE_OPTIONS) {
		renderSearchDateButton(quickListEl, option, "plain-memo-mobile-search-chip", option.mobileLabel ?? option.label);
	}
	const resultsEl = contentEl.createDiv({ cls: "plain-memo-mobile-search-results" });

	return {
		pageEl,
		inputEl,
		closeButtonEl,
		quickListEl,
		resultsEl,
	};
}
