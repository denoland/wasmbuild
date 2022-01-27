#!/usr/bin/env -S deno run --unstable --allow-run --allow-read --allow-write --allow-env
// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.

import * as colors from "https://deno.land/std@0.117.0/fmt/colors.ts";
import { copy } from "https://deno.land/std@0.117.0/fs/copy.ts";
import { emptyDir } from "https://deno.land/std@0.117.0/fs/empty_dir.ts";
import * as path from "https://deno.land/std@0.117.0/path/mod.ts";
import { getCrateName } from "./manifest.ts";

await Deno.permissions.request({ name: "env" });
await Deno.permissions.request({ name: "run" });
await Deno.permissions.request({ name: "read" });
await Deno.permissions.request({ name: "write" });

const home = Deno.env.get("HOME");
const profile = Deno.args.includes("--release") ? "release" : "debug";
const root = Deno.cwd();
const crateName = await getCrateName();

console.log(
  `${colors.bold(colors.green("Building"))} ${crateName} web assembly...`,
);

const copyrightHeader = `// Copyright 2018-${
  new Date().getFullYear()
} the Deno authors. All rights reserved. MIT license.`;

if (new URL(import.meta.url).protocol === "file:") {
  Deno.chdir(root);
} else {
  console.error("The build script can only be run from a local file system");
  Deno.exit(1);
}

const cargoFmtCmd = ["cargo", "fmt"];
console.log(`  ${colors.bold(colors.gray(cargoFmtCmd.join(" ")))}`);
const cargoFmtCmdStatus = Deno.run({ cmd: cargoFmtCmd }).status();
if (!(await cargoFmtCmdStatus).success) {
  console.error(`cargo fmt failed`);
  Deno.exit(1);
}

let cargoBuildCmd = [
  "cargo",
  "build",
  ...Deno.args,
  "--no-default-features",
  "--target",
  "wasm32-unknown-unknown",
];

const RUSTFLAGS = Deno.env.get("RUSTFLAGS") ||
  "" + `--remap-path-prefix=${root}=. --remap-path-prefix=${home}=~`;
console.log(`  ${colors.bold(colors.gray(cargoBuildCmd.join(" ")))}`);
const cargoBuildReleaseCmdStatus = Deno.run({
  cmd: cargoBuildCmd,
  env: {
    "SOURCE_DATE_EPOCH": "1600000000",
    "TZ": "UTC",
    "LC_ALL": "C",
    RUSTFLAGS,
  },
}).status();
if (!(await cargoBuildReleaseCmdStatus).success) {
  console.error(`cargo build failed`);
  Deno.exit(1);
}

await emptyDir("./target/wasm32-bindgen-deno-js");

const wasmBindGenCmd = [
  "wasm-bindgen",
  `./target/wasm32-unknown-unknown/${profile}/${crateName}.wasm`,
  "--target",
  "deno",
  "--weak-refs",
  "--out-dir",
  "./target/wasm32-bindgen-deno-js",
];
console.log(`  ${colors.bold(colors.gray(wasmBindGenCmd.join(" ")))}`);
const wasmBindgenCmdStatus = Deno.run({ cmd: wasmBindGenCmd }).status();
if (!(await wasmBindgenCmdStatus).success) {
  console.error(`wasm-bindgen failed`);
  Deno.exit(1);
}

console.log(
  `${colors.bold(colors.green("Copying"))} lib wasm...`,
);

const wasmDest = `./lib/${crateName}_bg.wasm`;
await Deno.mkdir("lib", { recursive: true });
await Deno.copyFile(
  `./target/wasm32-bindgen-deno-js/${crateName}_bg.wasm`,
  wasmDest,
);
console.log(`  copy ${colors.yellow(wasmDest)}`);

const snippetsDest = "./lib/snippets";
await emptyDir(snippetsDest);
console.log(`  delete ${colors.yellow(snippetsDest)}`);
// For when, there are no snippets
await emptyDir("./target/wasm32-bindgen-deno-js/snippets");
await copy("./target/wasm32-bindgen-deno-js/snippets", snippetsDest, {
  overwrite: true,
});
console.log(`  copy ${colors.yellow(snippetsDest)}`);

console.log(
  `${colors.bold(colors.green("Generating"))} lib JS bindings...`,
);

const loader = `let wasmInstantiatePromise;
switch (wasm_url.protocol) {
  case "file:": {
    if ("permissions" in Deno) Deno.permissions.request({ name: "read", path: wasm_url });
    const wasmCode = await Deno.readFile(wasm_url);
    wasmInstantiatePromise = WebAssembly.instantiate(wasmCode, imports);
    break;
  }
  case "https:":
  case "http:": {
    if ("permissions" in Deno) Deno.permissions.request({ name: "net", host: wasm_url.host });
    const wasmResponse = await fetch(wasm_url);
    if (wasmResponse.headers.get("content-type")?.toLowerCase().startsWith("application/wasm")) {
      wasmInstantiatePromise = WebAssembly.instantiateStreaming(wasmResponse, imports);
    } else {
      wasmInstantiatePromise = WebAssembly.instantiate(await wasmResponse.arrayBuffer(), imports);
    }
    break;
  }
  default:
    throw new Error(\`Unsupported protocol: \${wasm_url.protocol}\`);
}
const wasmInstance = (await wasmInstantiatePromise).instance;
const wasm = wasmInstance.exports;
`;

const generatedJs = await Deno.readTextFile(
  `./target/wasm32-bindgen-deno-js/${crateName}.js`,
);
const bindingJs = `${copyrightHeader}
// @generated file from build script, do not edit
// deno-lint-ignore-file
${generatedJs.replace(/^let\swasmCode\s.+/ms, loader)}
/* for testing and debugging */
export const _wasm = wasm;
export const _wasmInstance = wasmInstance;
`;
const libDenoJs = `./lib/${crateName}.generated.js`;
console.log(`  write ${colors.yellow(libDenoJs)}`);
await Deno.writeTextFile(libDenoJs, bindingJs);

const denoFmtCmd = [
  "deno",
  "fmt",
  "--quiet",
  `./lib/${crateName}.generated.js`,
];
console.log(`  ${colors.bold(colors.gray(denoFmtCmd.join(" ")))}`);
const denoFmtCmdStatus = Deno.run({ cmd: denoFmtCmd }).status();
if (!(await denoFmtCmdStatus).success) {
  console.error("deno fmt command failed");
  Deno.exit(1);
}

console.log(
  `${colors.bold(colors.green("Finished"))} ${crateName} web assembly.`,
);
