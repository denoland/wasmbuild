// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.

import { BuildCommand, CheckCommand } from "./args.ts";
import { base64, colors, path, Sha1, writeAll } from "./deps.ts";
import { getCargoWorkspace, WasmCrate } from "./manifest.ts";
import { verifyVersions } from "./versions.ts";
import { BindgenOutput, generateBindgen } from "./bindgen.ts";
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
  const workspace = await getCargoWorkspace(root, args.cargoFlags);
  const crate = workspace.getWasmCrate(args.project);

  verifyVersions(crate);

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
    `${colors.bold(colors.green("Building"))} ${crate.name} WebAssembly...`,
  );

  const cargoBuildCmd = [
    "cargo",
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

  const { bindingJsText, sourceHash } = await getBindingJsOutput(
    args,
    crate,
    bindgenOutput,
  );
  const bindingJsFileName =
    `${crate.libName}.generated.${args.bindingJsFileExt}`;

  return {
    bindgen: bindgenOutput,
    bindingJsText,
    bindingJsPath: path.join(args.outDir, bindingJsFileName),
    sourceHash,
    wasmFileName: args.isSync ? undefined : getWasmFileNameFromCrate(crate),
  };
}

async function getBindingJsOutput(
  args: CheckCommand | BuildCommand,
  crate: WasmCrate,
  bindgenOutput: BindgenOutput,
) {
  const sourceHash = await getHash();
  const header = `// @generated file from wasmbuild -- do not edit
// deno-lint-ignore-file
// deno-fmt-ignore-file`;
  const genText = bindgenOutput.js.replace(
    /\bconst\swasm_url\s.+/ms,
    getLoaderText(args, crate, bindgenOutput),
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
      Deno.execPath(),
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
    await writeAll(denoFmtCmd.stdin, new TextEncoder().encode(inputText));
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
) {
  if (args.isSync) {
    return getSyncLoaderText(bindgenOutput);
  } else {
    return getAsyncLoaderText(crate, bindgenOutput);
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

function getAsyncLoaderText(
  crate: WasmCrate,
  bindgenOutput: BindgenOutput,
) {
  const exportNames = getExportNames(bindgenOutput);
  return `
const wasm_url = new URL("${getWasmFileNameFromCrate(crate)}", import.meta.url);

/**
 * Decompression callback
 *
 * @callback decompressCallback
 * @param {Uint8Array} compressed
 * @return {Uint8Array} decompressed
 */

/** Instantiates an instance of the Wasm module returning its functions.
 * @remarks It is safe to call this multiple times and once successfully
 * loaded it will always return a reference to the same object.
 * @param {decompressCallback=} transform
 */
export async function instantiate(transform) {
  return (await instantiateWithInstance(transform)).exports;
}

let instanceWithExports;
let lastLoadPromise;

/** Instantiates an instance of the Wasm module along with its exports.
 * @remarks It is safe to call this multiple times and once successfully
 * loaded it will always return a reference to the same object.
 * @param {decompressCallback=} transform
 * @returns {Promise<{
 *   instance: WebAssembly.Instance;
 *   exports: { ${exportNames.map((n) => `${n}: typeof ${n}`).join("; ")} }
 * }>}
 */
export function instantiateWithInstance(transform) {
  if (instanceWithExports != null) {
    return Promise.resolve(instanceWithExports);
  }
  if (lastLoadPromise == null) {
    lastLoadPromise = (async () => {
      try {
        const instance = (await instantiateModule(transform)).instance;
        wasm = instance.exports;
        cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
        cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
        instanceWithExports = {
          instance,
          exports: getWasmInstanceExports(),
        };
        return instanceWithExports;
      } finally {
        lastLoadPromise = null;
      }
    })();
  }
  return lastLoadPromise;
}

function getWasmInstanceExports() {
  return { ${exportNames.join(", ")} };
}

/** Gets if the Wasm module has been instantiated. */
export function isInstantiated() {
  return instanceWithExports != null;
}

async function instantiateModule(transform) {
  switch (wasm_url.protocol) {
    case "file:": {
      if (typeof Deno !== "object") {
        throw new Error("file urls are not supported in this environment");
      }

      if ("permissions" in Deno) await Deno.permissions.request({ name: "read", path: wasm_url });
      const wasmCode = await Deno.readFile(wasm_url);
      return WebAssembly.instantiate(!transform ? wasmCode : transform(wasmCode), imports);
    }
    case "https:":
    case "http:": {
      if (typeof Deno === "object" && "permissions" in Deno) {
        await Deno.permissions.request({ name: "net", host: wasm_url.host });
      }
      const wasmResponse = await fetch(wasm_url);
      if (transform) {
        const wasmCode = new Uint8Array(await wasmResponse.arrayBuffer());
        return WebAssembly.instantiate(transform(wasmCode), imports);
      }
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

function getWasmFileNameFromCrate(crate: WasmCrate) {
  return `${crate.libName}_bg.wasm`;
}
