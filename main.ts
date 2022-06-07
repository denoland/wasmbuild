#!/usr/bin/env -S deno run --unstable --allow-run --allow-read --allow-write --allow-env
// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.

import * as colors from "https://deno.land/std@0.142.0/fmt/colors.ts";
import * as base64 from "https://deno.land/std@0.142.0/encoding/base64.ts";
import { emptyDir } from "https://deno.land/std@0.142.0/fs/empty_dir.ts";
import { parse as parseFlags } from "https://deno.land/std@0.142.0/flags/mod.ts";
import * as path from "https://deno.land/std@0.142.0/path/mod.ts";
import { writeAll } from "https://deno.land/std@0.142.0/streams/conversion.ts";
import { getCargoWorkspace } from "./manifest.ts";
import { generate_bindgen } from "./lib/wasmbuild.generated.js";

interface BindgenOutput {
  js: string;
  snippets: { [name: string]: string[] };
  localModules: { [name: string]: string };
  wasmBytes: number[];
}

await Deno.permissions.request({ name: "env" });
await Deno.permissions.request({ name: "run" });
await Deno.permissions.request({ name: "read" });
await Deno.permissions.request({ name: "write" });

const flags = parseFlags(Deno.args);
const cargoFlags = [];

if (flags["default-features"] === false) {
  cargoFlags.push("--no-default-features");
}
if (flags["features"]) {
  cargoFlags.push(`--features`);
  cargoFlags.push(flags["features"]);
}
if (flags["all-features"]) {
  cargoFlags.push("--all-features");
}

const home = Deno.env.get("HOME");
const profile = flags.debug ? "debug" : "release";
const root = Deno.cwd();
const workspace = await getCargoWorkspace(root, cargoFlags);
const specifiedCrateName: string | undefined = flags.p ?? flags.project;
const isSync: boolean = flags.sync ?? false;
const outDir = flags.out ?? "./lib";
const crate = workspace.getWasmCrate(specifiedCrateName);
const expectedWasmBindgenVersion = "0.2.80";

if (crate.wasmBindgenVersion !== expectedWasmBindgenVersion) {
  throw new Error(
    `The crate '${crate.name}' must have a dependency on wasm-bindgen ` +
      `${expectedWasmBindgenVersion} (found ` +
      `${crate.wasmBindgenVersion ?? "<WASM-BINDGEN NOT FOUND>"})`,
  );
}

console.log(
  `${
    colors.bold(colors.green("Ensuring"))
  } wasm32-unknown-unknown target installed...`,
);

const rustupAddWasm = Deno.run({
  cmd: ["rustup", "target", "add", "wasm32-unknown-unknown"],
}).status();
if (!(await rustupAddWasm).success) {
  console.error(`adding wasm32-unknown-unknown target failed`);
  Deno.exit(1);
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
  "--lib",
  "-p",
  crate.name,
  "--target",
  "wasm32-unknown-unknown",
  ...cargoFlags,
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
const originalWasmBytes = await Deno.readFile(
  `./target/wasm32-unknown-unknown/${profile}/${crate.libName}.wasm`,
);
const bindgenOutput = await generate_bindgen(
  crate.libName,
  originalWasmBytes,
) as BindgenOutput;

await createSnippets(bindgenOutput);

if (!isSync) {
  const wasmDest = path.join(outDir, `${crate.libName}_bg.wasm`);
  await Deno.writeFile(wasmDest, new Uint8Array(bindgenOutput.wasmBytes));
}

console.log(
  `${colors.bold(colors.green("Generating"))} lib JS bindings...`,
);

const bindingJs = await getBindingJsText(bindgenOutput);
const libDenoJs = path.join(outDir, `${crate.libName}.generated.js`);
console.log(`  write ${colors.yellow(libDenoJs)}`);
await Deno.writeTextFile(libDenoJs, bindingJs);

console.log(
  `${colors.bold(colors.green("Finished"))} ${crate.name} web assembly.`,
);

async function getBindingJsText(bindgenOutput: BindgenOutput) {
  const bindingJs = `${copyrightHeader}
// @generated file from build script, do not edit
// deno-lint-ignore-file
let wasm;
${
    bindgenOutput.js.replace(
      /\blet\swasmCode\s.+/ms,
      getLoaderText(bindgenOutput),
    )
  }
`;
  const denoFmtCmdArgs = [
    "deno",
    "fmt",
    "--quiet",
    "--ext",
    "js",
    "-",
  ];
  console.log(`  ${colors.bold(colors.gray(denoFmtCmdArgs.join(" ")))}`);
  const denoFmtCmd = Deno.run({
    cmd: denoFmtCmdArgs,
    stdin: "piped",
    stdout: "piped",
  });
  await writeAll(denoFmtCmd.stdin, new TextEncoder().encode(bindingJs));
  denoFmtCmd.stdin.close();
  const [output, status] = await Promise.all([
    denoFmtCmd.output(),
    denoFmtCmd.status(),
  ]);
  if (!status.success) {
    console.error("deno fmt command failed");
    Deno.exit(1);
  }
  return new TextDecoder().decode(output);
}

function getLoaderText(bindgenOutput: BindgenOutput) {
  if (isSync) {
    return getSyncLoaderText(bindgenOutput);
  } else {
    return getAsyncLoaderText(bindgenOutput);
  }
}

function getSyncLoaderText(bindgenOutput: BindgenOutput) {
  const exportNames = getExportNames(bindgenOutput);
  return `
/** Instantiates an instance of the Wasm module returning its functions.
 * @remarks It is safe to call this multiple times and once successfully
 * loaded it will always return a reference to the same object.
 */
export function instantiate() {
  return instantiateWithInstanceSync().exports;
}

let instanceWithExports;

/** Instantiates an instance of the Wasm module along with its exports.
 * @remarks It is safe to call this multiple times and once successfully
 * loaded it will always return a reference to the same object.
 * @returns {{
 *   instance: WebAssembly.Instance;
 *   exports: { ${exportNames.map((n) => `${n}: typeof ${n}`).join("; ")} }
 * }}
 */
export function instantiateWithInstanceSync() {
  if (instanceWithExports == null) {
    const instance = instantiateInstance();
    wasm = instance.exports;
    cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
    cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    instanceWithExports = {
      instance,
      exports: { ${exportNames.join(", ")} },
    };
  }
  return instanceWithExports;
}

/** Gets if the Wasm module has been instantiated. */
export function isInstantiated() {
  return instanceWithExports != null;
}

function instantiateInstance() {
  const wasmBytes = base64decode("\\\n${
    base64.encode(new Uint8Array(bindgenOutput.wasmBytes))
      .replace(/.{78}/g, "$&\\\n")
  }\\\n");
  const wasmModule = new WebAssembly.Module(wasmBytes);
  return new WebAssembly.Instance(wasmModule, imports);
}

function base64decode(b64) {
  const binString = atob(b64);
  const size = binString.length;
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return bytes;
}
  `;
}

function getAsyncLoaderText(bindgenOutput: BindgenOutput) {
  const exportNames = getExportNames(bindgenOutput);
  return `
/** Instantiates an instance of the Wasm module returning its functions.
 * @remarks It is safe to call this multiple times and once successfully
 * loaded it will always return a reference to the same object.
 */
export async function instantiate() {
  return (await instantiateWithInstance()).exports;
}

let instanceWithExports;
let lastLoadPromise;

/** Instantiates an instance of the Wasm module along with its exports.
 * @remarks It is safe to call this multiple times and once successfully
 * loaded it will always return a reference to the same object.
 * @returns {Promise<{
 *   instance: WebAssembly.Instance;
 *   exports: { ${exportNames.map((n) => `${n}: typeof ${n}`).join("; ")} }
 * }>}
 */
export function instantiateWithInstance() {
  if (instanceWithExports != null) {
    return Promise.resolve(instanceWithExports);
  }
  if (lastLoadPromise == null) {
    lastLoadPromise = (async () => {
      try {
        const instance = (await instantiateModule()).instance;
        wasm = instance.exports;
        cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
        cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
        instanceWithExports = {
          instance,
          exports: { ${exportNames.join(", ")} },
        };
        return instanceWithExports;
      } finally {
        lastLoadPromise = null;
      }
    })();
  }
  return lastLoadPromise;
}

/** Gets if the Wasm module has been instantiated. */
export function isInstantiated() {
  return instanceWithExports != null;
}

async function instantiateModule() {
  switch (wasm_url.protocol) {
    case "file:": {
      if ("permissions" in Deno) Deno.permissions.request({ name: "read", path: wasm_url });
      const wasmCode = await Deno.readFile(wasm_url);
      return WebAssembly.instantiate(wasmCode, imports);
    }
    case "https:":
    case "http:": {
      if ("permissions" in Deno) Deno.permissions.request({ name: "net", host: wasm_url.host });
      const wasmResponse = await fetch(wasm_url);
      if (wasmResponse.headers.get("content-type")?.toLowerCase().startsWith("application/wasm")) {
        return WebAssembly.instantiateStreaming(wasmResponse, imports);
      } else {
        return WebAssembly.instantiate(await wasmResponse.arrayBuffer(), imports);
      }
    }
    default:
      throw new Error(\`Unsupported protocol: \${wasm_url.protocol}\`);
  }
}
  `;
}

function getExportNames(bindgenOutput: BindgenOutput) {
  return Array.from(bindgenOutput.js.matchAll(
    /export (function|class) ([^({]+)[({]/g,
  )).map((m) => m[2]);
}

async function createSnippets(bindgenOutput: BindgenOutput) {
  const localModules = Object.entries(bindgenOutput.localModules);
  const snippets = Object.entries(bindgenOutput.snippets);

  if (localModules.length === 0 && snippets.length === 0) {
    return; // don't create the snippets directory
  }

  const snippetsDest = path.join(outDir, "snippets");
  await Deno.mkdir(snippetsDest, { recursive: true });

  for (const [name, text] of localModules) {
    const filePath = path.join(snippetsDest, name);
    const dirPath = path.dirname(filePath);
    await Deno.mkdir(dirPath, { recursive: true });
    await Deno.writeTextFile(filePath, text);
  }

  for (const [identifier, list] of snippets) {
    if (list.length === 0) {
      continue;
    }
    const dirPath = path.join(snippetsDest, identifier);
    await Deno.mkdir(dirPath, { recursive: true });
    for (const [i, text] of list.entries()) {
      const name = `inline${i}.js`;
      const filePath = path.join(dirPath, name);
      await Deno.writeTextFile(filePath, text);
    }
  }
}
