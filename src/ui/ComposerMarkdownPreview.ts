import { Component, MarkdownRenderer } from "obsidian";
import type { App } from "obsidian";

import { prepareMemoCardMarkdown } from "./MemoCardMarkdown";

interface ComposerMarkdownPreviewOptions {
	app: App;
	getWindow: () => Window;
}

/** Keeps one debounced Markdown rendering surface aligned with the active edit. */
export class ComposerMarkdownPreview {
	private container: HTMLElement | null = null;
	private component: Component | null = null;
	private timerId: number | null = null;
	private requestId = 0;

	constructor(private readonly options: ComposerMarkdownPreviewOptions) {}

	/** Attaches the renderer to the composer element created by the current view render. */
	attach(container: HTMLElement): void {
		if (this.container === container) return;
		this.clear();
		this.container = container;
	}

	/** Shows a fresh preview for edits and clears it for new-note or quote modes. */
	update(content: string, sourcePath: string, visible: boolean): void {
		const container = this.container;
		if (container === null) return;
		container.toggleClass("is-visible", visible);
		if (!visible) {
			this.cancelScheduledRender();
			this.releaseComponent();
			container.empty();
			return;
		}
		this.cancelScheduledRender();
		const requestId = this.requestId + 1;
		this.requestId = requestId;
		this.timerId = this.options.getWindow().setTimeout(() => {
			this.timerId = null;
			void this.render(content, sourcePath, requestId);
		}, 90);
	}

	/** Releases DOM work and Markdown child components when the view closes or rerenders. */
	dispose(): void {
		this.clear();
		this.container = null;
	}

	/** Renders off-DOM and adopts only the newest completed request. */
	private async render(content: string, sourcePath: string, requestId: number): Promise<void> {
		const container = this.container;
		if (container === null || requestId !== this.requestId) return;
		const target = container.ownerDocument.createElement("div");
		const component = new Component();
		component.load();
		try {
			await MarkdownRenderer.render(
				this.options.app,
				prepareMemoCardMarkdown(content),
				target,
				sourcePath,
				component,
			);
			if (container !== this.container || requestId !== this.requestId) return;
			this.releaseComponent();
			container.empty();
			while (target.firstChild !== null) container.appendChild(target.firstChild);
			this.component = component;
		} finally {
			if (this.component !== component) component.unload();
		}
	}

	/** Cancels pending work and releases the currently adopted Markdown component. */
	private clear(): void {
		this.cancelScheduledRender();
		this.requestId += 1;
		this.releaseComponent();
		this.container?.empty();
		this.container?.removeClass("is-visible");
	}

	/** Cancels a queued render before it starts. */
	private cancelScheduledRender(): void {
		if (this.timerId === null) return;
		this.options.getWindow().clearTimeout(this.timerId);
		this.timerId = null;
	}

	/** Unloads the active Markdown component exactly once. */
	private releaseComponent(): void {
		this.component?.unload();
		this.component = null;
	}
}
