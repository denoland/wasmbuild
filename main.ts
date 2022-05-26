#!/usr/bin/env -S deno run --unstable --allow-run --allow-read --allow-write --allow-env
// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.

import * as colors from "https://deno.land/std@0.140.0/fmt/colors.ts";
import { emptyDir } from "https://deno.land/std@0.140.0/fs/empty_dir.ts";
import { parse as parseFlags } from "https://deno.land/std@0.140.0/flags/mod.ts";
import { getCargoWorkspace } from "./manifest.ts";
import { generate_bindgen } from "./lib/wasmbuild.generated.js";

await Deno.permissions.request({ name: "env" });
await Deno.permissions.request({ name: "run" });
await Deno.permissions.request({ name: "read" });
await Deno.permissions.request({ name: "write" });

const flags = parseFlags(Deno.args);

const home = Deno.env.get("HOME");
const profile = flags.debug ? "debug" : "release";
const root = Deno.cwd();
const workspace = await getCargoWorkspace(root);
const specifiedCrateName: string | undefined = flags.p ?? flags.project;
const crate = workspace.getWasmCrate(specifiedCrateName);
const expectedWasmBindgenVersion = "0.2.80";

if (crate.wasmBindgenVersion !== expectedWasmBindgenVersion) {
  throw new Error(
    `The crate '${crate.name}' must have a dependency on wasm-bindgen `
    + `${crate.wasmBindgenVersion} (found `
    + `${crate.wasmBindgenVersion ?? "<WASM-BINDGEN NOT FOUND>"})`
  );
}

console.log(
  `${colors.bold(colors.green("Building"))} ${crate.name} web assembly...`,
);

const copyrightHeader = `// Copyright 2018-${
  new Date().getFullYear()
} the Deno authors. All rights reserved. MIT license.`;

const cargoBuildCmd = [
  "cargo",
  "build",
  "-p",
  crate.name,
  ...Deno.args,
  "--target",
  "wasm32-unknown-unknown",
];

if (profile === "release") {
  cargoBuildCmd.push("--release");
}

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

console.log(`  ${colors.bold(colors.gray("Running wasm-bindgen..."))}`);
const wasmBytes = await Deno.readFile(
  `./target/wasm32-unknown-unknown/${profile}/${crate.libName}.wasm`,
);
const bindgenOutput = await generate_bindgen(crate.libName, wasmBytes) as {
  js: string;
  wasm_bytes: number[];
};
const wasmDest = `./lib/${crate.libName}_bg.wasm`;
const snippetsDest = "./lib/snippets";

await Deno.mkdir("lib", { recursive: true });
// todo: snippets
await Deno.mkdir(snippetsDest, { recursive: true });
await Deno.writeFile(wasmDest, new Uint8Array(bindgenOutput.wasm_bytes));

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

const generatedJs = bindgenOutput.js;
const bindingJs = `${copyrightHeader}
// @generated file from build script, do not edit
// deno-lint-ignore-file
${generatedJs.replace(/^let\swasmCode\s.+/ms, loader)}
/* for testing and debugging */
export const _wasm = wasm;
export const _wasmInstance = wasmInstance;
`;
const libDenoJs = `./lib/${crate.libName}.generated.js`;
console.log(`  write ${colors.yellow(libDenoJs)}`);
await Deno.writeTextFile(libDenoJs, bindingJs);

const denoFmtCmd = [
  "deno",
  "fmt",
  "--quiet",
  `./lib/${crate.libName}.generated.js`,
];
console.log(`  ${colors.bold(colors.gray(denoFmtCmd.join(" ")))}`);
const denoFmtCmdStatus = Deno.run({ cmd: denoFmtCmd }).status();
if (!(await denoFmtCmdStatus).success) {
  console.error("deno fmt command failed");
  Deno.exit(1);
}

console.log(
  `${colors.bold(colors.green("Finished"))} ${crate.name} web assembly.`,
);
