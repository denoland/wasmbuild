// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.

import { BuildCommand, CheckCommand } from "./args.ts";
import { base64, colors, path, Sha1 } from "./deps.ts";
import { getCargoWorkspace, WasmCrate } from "./manifest.ts";
import { verifyVersions } from "./versions.ts";
import { BindgenOutput, generateBindgen } from "./bindgen.ts";
import { pathExists } from "./helpers.ts";
export type { BindgenOutput } from "./bindgen.ts";

export interface PreBuildOutput {
  bindgen: BindgenOutput;
  bindingJsText: string;
  bindingJsPath: string;
  sourceHash: string;
  wasmFileName: string | undefined;
}

export async function runPreBuild(
  args: CheckCommand | BuildCommand,
): Promise<PreBuildOutput> {
  const home = Deno.env.get("HOME");
  const root = Deno.cwd();
  if (!await pathExists(path.join(root, "Cargo.toml"))) {
    console.error(
      "%cConsider running `deno task wasmbuild new` to get started",
      "color: yellow",
    );
    throw `Cargo.toml not found in ${root}`;
  }
  const workspace = await getCargoWorkspace(root, args.cargoFlags);
  const crate = workspace.getWasmCrate(args.project);

  verifyVersions(crate);

  console.log(
    `${
      colors.bold(colors.green("Ensuring"))
    } wasm32-unknown-unknown target installed...`,
  );

  const rustupAddWasm = new Deno.Command("rustup", {
    args: ["target", "add", "wasm32-unknown-unknown"],
  });
  const rustupAddWasmOutput = await rustupAddWasm.output();
  if (!rustupAddWasmOutput.success) {
    console.error(`adding wasm32-unknown-unknown target failed`);
    Deno.exit(1);
  }

  console.log(
    `${colors.bold(colors.green("Building"))} ${crate.name} WebAssembly...`,
  );

  const cargoBuildCmd = [
    "build",
    "--lib",
    "-p",
    crate.name,
    "--target",
    "wasm32-unknown-unknown",
    ...args.cargoFlags,
  ];

  if (args.profile === "release") {
    cargoBuildCmd.push("--release");
  }

  const RUSTFLAGS = Deno.env.get("RUSTFLAGS") ||
    "" + `--remap-path-prefix='${root}'=. --remap-path-prefix='${home}'=~`;
  console.log(`  ${colors.bold(colors.gray(cargoBuildCmd.join(" ")))}`);
  const cargoBuildReleaseCmdProcess = new Deno.Command("cargo", {
    args: cargoBuildCmd,
    env: {
      "SOURCE_DATE_EPOCH": "1600000000",
      "TZ": "UTC",
      "LC_ALL": "C",
      RUSTFLAGS,
    },
  }).spawn();
  const cargoBuildReleaseCmdOutput = await cargoBuildReleaseCmdProcess.status;
  if (!cargoBuildReleaseCmdOutput.success) {
    console.error(`cargo build failed`);
    Deno.exit(1);
  }

  console.log(`  ${colors.bold(colors.gray("Running wasm-bindgen..."))}`);
  const bindgenOutput = await generateBindgen(
    crate.libName,
    path.join(
      workspace.metadata.target_directory,
      `wasm32-unknown-unknown/${args.profile}/${crate.libName}.wasm`,
    ),
  );

  console.log(
    `${colors.bold(colors.green("Generating"))} lib JS bindings...`,
  );

  const bindingJsFileName =
    `${crate.libName}.generated.${args.bindingJsFileExt}`;
  const bindingJsPath = path.join(args.outDir, bindingJsFileName);

  const { bindingJsText, sourceHash } = await getBindingJsOutput(
    args,
    crate,
    bindgenOutput,
    bindingJsPath,
  );

  return {
    bindgen: bindgenOutput,
    bindingJsText,
    bindingJsPath,
    sourceHash,
    wasmFileName: args.loaderKind === "sync"
      ? undefined
      : getWasmFileNameFromCrate(crate),
  };
}

async function getBindingJsOutput(
  args: CheckCommand | BuildCommand,
  crate: WasmCrate,
  bindgenOutput: BindgenOutput,
  bindingJsPath: string,
) {
  const sourceHash = await getHash();
  const header = `// @generated file from wasmbuild -- do not edit
// deno-lint-ignore-file
// deno-fmt-ignore-file`;
  const genText = bindgenOutput.js.replace(
    /\bconst\swasm_url\s.+/ms,
    getLoaderText(args, crate, bindgenOutput, bindingJsPath),
  );
  const bodyText = await getFormattedText(`
// source-hash: ${sourceHash}
let wasm;
${genText.includes("let cachedInt32Memory0") ? "" : "let cachedInt32Memory0;"}
${genText.includes("let cachedUint8Memory0") ? "" : "let cachedUint8Memory0;"}
${genText}
`);

  return {
    bindingJsText: `${header}\n${bodyText}`,
    sourceHash,
  };

  async function getFormattedText(inputText: string) {
    const denoFmtCmdArgs = [
      "fmt",
      "--quiet",
      "--ext",
      "js",
      "-",
    ];
    console.log(`  ${colors.bold(colors.gray(denoFmtCmdArgs.join(" ")))}`);
    const denoFmtCmd = new Deno.Command(Deno.execPath(), {
      args: denoFmtCmdArgs,
      stdin: "piped",
      stdout: "piped",
    });
    const denoFmtChild = denoFmtCmd.spawn();
    const stdin = denoFmtChild.stdin.getWriter();
    await stdin.write(new TextEncoder().encode(inputText));
    await stdin.close();

    const output = await denoFmtChild.output();
    if (!output.success) {
      console.error("deno fmt command failed");
      Deno.exit(1);
    }
    return new TextDecoder().decode(output.stdout);
  }

  async function getHash() {
    // Create a hash of all the sources, snippets, and local modules
    // in order to tell when the output has changed.
    const hasher = new Sha1();
    const sourceHash = await crate.getSourcesHash();
    hasher.update(sourceHash);
    for (const [identifier, list] of Object.entries(bindgenOutput.snippets)) {
      hasher.update(identifier);
      for (const text of list) {
        hasher.update(text.replace(/\r?\n/g, "\n"));
      }
    }
    for (const [name, text] of Object.entries(bindgenOutput.localModules)) {
      hasher.update(name);
      hasher.update(text.replace(/\r?\n/g, "\n"));
    }
    return hasher.hex();
  }
}

function getLoaderText(
  args: CheckCommand | BuildCommand,
  crate: WasmCrate,
  bindgenOutput: BindgenOutput,
  bindingJsPath: string,
) {
  switch (args.loaderKind) {
    case "sync":
      return getSyncLoaderText(bindgenOutput);
    case "async":
      return getAsyncLoaderText(crate, bindgenOutput, false, bindingJsPath);
    case "async-with-cache":
      return getAsyncLoaderText(crate, bindgenOutput, true, bindingJsPath);
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
  return instantiateWithInstance().exports;
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
export function instantiateWithInstance() {
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

function parseRelativePath(from: string, to: string): string {
  const specifier = import.meta.resolve(to);
  console.log(import.meta.resolve(to));
  if (!specifier.startsWith("file:")) return specifier;

  from = path.join(Deno.cwd(), path.dirname(from));
  to = path.fromFileUrl(specifier);
  const result = path.relative(from, to);

  console.log(from);
  console.log(to);
  console.log(result);

  return import.meta.resolve(result);
}

function getAsyncLoaderText(
  crate: WasmCrate,
  bindgenOutput: BindgenOutput,
  useCache: boolean,
  bindingJsFileName: string,
) {
  const exportNames = getExportNames(bindgenOutput);
  const loaderUrl = parseRelativePath(bindingJsFileName, "../loader.ts");

  let loaderText = `import { Loader } from "${loaderUrl}";\n`;

  if (useCache) {
    const cacheUrl = parseRelativePath(bindingJsFileName, "../cache.ts");
    loaderText += `import { cacheToLocalDir } from "${cacheUrl}";\n`;
  }

  loaderText += `
const loader = new Loader({
  imports,
  cache: ${useCache ? "cacheToLocalDir" : "undefined"},
})
`;

  loaderText += `/**
 * Decompression callback
 *
 * @callback DecompressCallback
 * @param {Uint8Array} compressed
 * @return {Uint8Array} decompressed
 */

 /**
  * Options for instantiating a Wasm instance.
  * @typedef {Object} InstantiateOptions
  * @property {URL=} url - Optional url to the Wasm file to instantiate.
  * @property {DecompressCallback=} decompress - Callback to decompress the
  * raw Wasm file bytes before instantiating.
  */

/** Instantiates an instance of the Wasm module returning its functions.
 * @remarks It is safe to call this multiple times and once successfully
 * loaded it will always return a reference to the same object.
 * @param {InstantiateOptions=} opts
 */
export async function instantiate(opts) {
  return (await instantiateWithInstance(opts)).exports;
}

/** Instantiates an instance of the Wasm module along with its exports.
 * @remarks It is safe to call this multiple times and once successfully
 * loaded it will always return a reference to the same object.
 * @param {InstantiateOptions=} opts
 * @returns {Promise<{
 *   instance: WebAssembly.Instance;
 *   exports: { ${exportNames.map((n) => `${n}: typeof ${n}`).join("; ")} }
 * }>}
 */
export async function instantiateWithInstance(opts) {
  const {instance } = await loader.load(
    opts?.url ?? new URL("${getWasmFileNameFromCrate(crate)}", import.meta.url),
    opts?.decompress,
  );
  wasm = wasm ?? instance.exports;
  cachedInt32Memory0 = cachedInt32Memory0 ?? new Int32Array(wasm.memory.buffer);
  cachedUint8Memory0 = cachedUint8Memory0 ?? new Uint8Array(wasm.memory.buffer);
  return {
    instance,
    exports: getWasmInstanceExports(),
  };
}

function getWasmInstanceExports() {
  return { ${exportNames.join(", ")} };
}

/** Gets if the Wasm module has been instantiated. */
export function isInstantiated() {
  return loader.instance != null;
}
`;

  return loaderText;
}

function getExportNames(bindgenOutput: BindgenOutput) {
  return Array.from(bindgenOutput.js.matchAll(
    /export (function|class) ([^({]+)[({]/g,
  )).map((m) => m[2]);
}

function getWasmFileNameFromCrate(crate: WasmCrate) {
  return `${crate.libName}_bg.wasm`;
}
