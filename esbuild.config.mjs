import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "module";

const isProduction = process.argv[2] === "production";
const nodeExternals = builtinModules.flatMap((moduleName) => [
	moduleName,
	`node:${moduleName}`,
]);

const thirdPartyNotice = `/*
 * PlainMemo includes CodeMirror 6, Lezer, and related dependencies.
 * Copyright (C) 2016-2024 by Marijn Haverbeke and others.
 * Licensed under the MIT License. Complete notices are in
 * THIRD_PARTY_NOTICES.md in the PlainMemo source repository.
 *
 * MIT License
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */`;

const context = await esbuild.context({
	banner: {
		js: thirdPartyNotice,
	},
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		...nodeExternals,
	],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: isProduction ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	minify: isProduction,
});

if (isProduction) {
	await context.rebuild();
	await context.dispose();
} else {
	await context.watch();
}
