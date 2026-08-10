import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_KNOMO_SETTINGS, normalizeSettings } from "../src/settings/normalizeSettings";

test("normalizes the current standalone memo settings", () => {
	const settings = normalizeSettings({
		sidebarSubtitle: "  Notes\nfor   today  ",
		memoFolders: [" Cards ", "Cards/child", "Archive", "Archive"],
		defaultMemoFolder: "Cards",
		memoCollapseLineThreshold: 3,
		pinnedMemoLimit: 99,
		trashRetentionDays: 0,
		timeBuoyEnabled: false,
		mobileCompactMode: "on",
		desktopSidebarWidth: 420,
		desktopSidebarCollapsed: true,
	});

	assert.equal(settings.sidebarSubtitle, "Notes for today");
	assert.deepEqual(settings.memoFolders, ["Archive", "Cards"]);
	assert.equal(settings.defaultMemoFolder, "Cards");
	assert.equal(settings.memoCollapseLineThreshold, 6);
	assert.equal(settings.pinnedMemoLimit, 20);
	assert.equal(settings.trashRetentionDays, 1);
	assert.equal(settings.timeBuoyEnabled, false);
	assert.equal(settings.mobileCompactMode, "on");
	assert.equal(settings.desktopSidebarWidth, 420);
	assert.equal(settings.desktopSidebarCollapsed, true);
});

test("uses current defaults for invalid or missing values", () => {
	const settings = normalizeSettings({
		memoCollapseLineThreshold: Number.NaN,
		pinnedMemoLimit: "invalid",
		mobileCompactMode: "invalid",
	});

	assert.deepEqual(settings.memoFolders, DEFAULT_KNOMO_SETTINGS.memoFolders);
	assert.equal(settings.sidebarSubtitle, DEFAULT_KNOMO_SETTINGS.sidebarSubtitle);
	assert.equal(settings.defaultMemoFolder, DEFAULT_KNOMO_SETTINGS.defaultMemoFolder);
	assert.equal(settings.memoCollapseLineThreshold, DEFAULT_KNOMO_SETTINGS.memoCollapseLineThreshold);
	assert.equal(settings.pinnedMemoLimit, DEFAULT_KNOMO_SETTINGS.pinnedMemoLimit);
	assert.equal(settings.trashRetentionDays, DEFAULT_KNOMO_SETTINGS.trashRetentionDays);
	assert.equal(settings.timeBuoyEnabled, true);
	assert.equal(settings.mobileCompactMode, "auto");
});

test("uses the default subtitle for blank values and limits custom text", () => {
	assert.equal(normalizeSettings({ sidebarSubtitle: " \n " }).sidebarSubtitle, DEFAULT_KNOMO_SETTINGS.sidebarSubtitle);
	assert.equal(normalizeSettings({ sidebarSubtitle: "x".repeat(100) }).sidebarSubtitle?.length, 80);
});

test("upgrades legacy default subtitles without replacing custom text", () => {
	assert.equal(normalizeSettings({ sidebarSubtitle: "当下念想，潺潺光阴" }).sidebarSubtitle, DEFAULT_KNOMO_SETTINGS.sidebarSubtitle);
	assert.equal(normalizeSettings({ sidebarSubtitle: "Fleeting thoughts, steady days" }).sidebarSubtitle, DEFAULT_KNOMO_SETTINGS.sidebarSubtitle);
	assert.equal(normalizeSettings({ sidebarSubtitle: "My own subtitle" }).sidebarSubtitle, "My own subtitle");
});

test("defaults the pinned memo limit to five", () => {
	assert.equal(DEFAULT_KNOMO_SETTINGS.pinnedMemoLimit, 5);
	assert.equal(normalizeSettings({}).pinnedMemoLimit, 5);
});

test("defaults the trash retention period to thirty days", () => {
	assert.equal(DEFAULT_KNOMO_SETTINGS.trashRetentionDays, 30);
	assert.equal(normalizeSettings({}).trashRetentionDays, 30);
});

test("adds the write folder to the scan roots and removes nested roots", () => {
	const settings = normalizeSettings({
		memoFolders: ["Archive/old", "Cards"],
		defaultMemoFolder: "Archive",
	});

	assert.deepEqual(settings.memoFolders, ["Archive", "Cards"]);
});
