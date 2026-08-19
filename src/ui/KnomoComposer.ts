import { setIcon } from "obsidian";

import { KNOMO_TIME_BUOY_ICON } from "../icons";
import { t } from "../i18n";

export interface KnomoComposerElements {
	composerEl: HTMLElement;
	inputEl: HTMLTextAreaElement;
	composerInputLabelId: string;
	richEditorHostEl: HTMLElement;
	referencePreviewEl: HTMLElement;
	composerBarEl: HTMLElement;
	toolsEl: HTMLElement;
	timeBuoyButtonEl: HTMLButtonElement | null;
	timeBuoyMonthStatusEl: HTMLElement | null;
	cancelEditButtonEl: HTMLButtonElement;
	statusEl: HTMLElement;
	sendButtonEl: HTMLButtonElement;
}

interface RenderKnomoComposerOptions {
	dailyEnabled: boolean;
	timeBuoyEnabled?: boolean;
	timeBuoyPickerId?: string;
	draftContent: string;
	createHiddenText: (container: HTMLElement, name: string, text: string) => string;
	createIconButton: (
		container: HTMLElement,
		icon: string,
		ariaLabel: string,
		cls: string,
		action: string,
		showTooltip?: boolean,
	) => HTMLButtonElement;
}

interface RenderReferencePreviewOptions {
	setTooltipIfDesktopOnly: (element: HTMLElement) => void;
}

export function renderKnomoComposer(container: HTMLElement, options: RenderKnomoComposerOptions): KnomoComposerElements {
	const composerEl = container.createDiv({ cls: "plain-memo-composer" });
	const inputArea = composerEl.createDiv({ cls: "plain-memo-composer-input-area" });
	const composerInputLabelId = options.createHiddenText(inputArea, "composer-input-label", t("composer.inputLabel"));
	const inputEl = inputArea.createEl("textarea", {
		cls: "plain-memo-composer-input",
		attr: {
			placeholder: t("composer.placeholder"),
			"aria-labelledby": composerInputLabelId,
		},
	});
	inputEl.disabled = !options.dailyEnabled;
	inputEl.value = options.draftContent;
	const richEditorHostEl = inputArea.createDiv({ cls: "plain-memo-rich-editor-host" });

	const referencePreviewEl = inputArea.createDiv({ cls: "plain-memo-reference-preview" });
	const composerBarEl = inputArea.createDiv({ cls: "plain-memo-composer-bar" });
	const toolsEl = composerBarEl.createDiv({ cls: "plain-memo-tool-group" });
	options.createIconButton(toolsEl, "hash", t("composer.insertTag"), "plain-memo-tool-button", "insert-tag", false);
	options.createIconButton(toolsEl, "link", t("composer.insertWikiLink"), "plain-memo-tool-button", "insert-wiki-link", false);
	options.createIconButton(toolsEl, "image", t("composer.insertImage"), "plain-memo-tool-button", "insert-image", false);
	const timeBuoyButtonEl = options.timeBuoyEnabled === true
		? options.createIconButton(toolsEl, KNOMO_TIME_BUOY_ICON, t("composer.addTimeBuoy"), "plain-memo-tool-button", "insert-time-buoy", true)
		: null;
	if (timeBuoyButtonEl !== null) {
		timeBuoyButtonEl.disabled = !options.dailyEnabled;
		timeBuoyButtonEl.setAttrs({
			"aria-haspopup": "dialog",
			"aria-expanded": "false",
			"aria-controls": options.timeBuoyPickerId ?? "plain-memo-time-buoy-picker",
		});
	}
	const timeBuoyMonthStatusEl = options.timeBuoyEnabled === true
		? composerEl.createDiv({
			cls: "plain-memo-visually-hidden",
			attr: {
				role: "status",
				"aria-live": "polite",
				"aria-atomic": "true",
			},
		})
		: null;
	options.createIconButton(toolsEl, "list", t("composer.insertList"), "plain-memo-tool-button", "insert-list", false);
	options.createIconButton(toolsEl, "list-ordered", t("composer.insertNumberedList"), "plain-memo-tool-button", "insert-numbered-list", false);
	options.createIconButton(toolsEl, "square-check", t("composer.insertTaskList"), "plain-memo-tool-button", "insert-task-list", false);

	const actions = composerBarEl.createDiv({ cls: "plain-memo-composer-actions" });
	const cancelEditButtonEl = actions.createEl("button", {
		cls: "plain-memo-cancel-edit-button",
		text: t("composer.cancelEdit"),
		attr: {
			type: "button",
			"data-action": "cancel-edit",
			hidden: "",
		},
	});
	const statusEl = composerEl.createDiv({
		cls: options.dailyEnabled ? "plain-memo-status" : "plain-memo-status is-error",
	});
	const sendButtonEl = actions.createEl("button", {
		cls: "plain-memo-send-button",
		attr: {
			type: "button",
			"aria-label": t("composer.send"),
			"data-action": "save-input",
		},
	});
	setIcon(sendButtonEl, "send");

	return {
		composerEl,
		inputEl,
		composerInputLabelId,
		richEditorHostEl,
		referencePreviewEl,
		composerBarEl,
		toolsEl,
		timeBuoyButtonEl,
		timeBuoyMonthStatusEl,
		cancelEditButtonEl,
		statusEl,
		sendButtonEl,
	};
}

export function renderComposerReferencePreview(
	container: HTMLElement,
	quoteMarkdownText: string | null,
	options: RenderReferencePreviewOptions,
): void {
	if (quoteMarkdownText === null) {
		container.empty();
		container.removeClass("is-visible");
		return;
	}
	container.empty();
	const previewText = container.createDiv({
		cls: "plain-memo-reference-preview-text",
	});
	previewText.createSpan({ cls: "plain-memo-reference-label", text: t("reference.label") });
	previewText.createSpan({
		cls: "plain-memo-reference-content",
		text: quoteMarkdownText.replace(/^> ?/gm, ""),
	});
	const clearButton = container.createEl("button", {
		cls: "plain-memo-reference-clear",
		attr: {
			type: "button",
			"aria-label": t("reference.clear"),
			"data-action": "clear-reference",
		},
	});
	options.setTooltipIfDesktopOnly(clearButton);
	setIcon(clearButton, "x");
	container.addClass("is-visible");
}
