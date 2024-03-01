// Copyright 2018-2024 the Deno authors. MIT license.

import { BuildCommand, CheckCommand } from "./args.ts";
import * as colors from "@std/fmt/colors";
import * as path from "@std/path";
import * as base64 from "@std/encoding/base64";
import { Sha1 } from "./utils/sha1.ts";
import { getCargoWorkspace, WasmCrate } from "./manifest.ts";
import { verifyVersions } from "./versions.ts";
import { BindgenOutput, generateBindgen } from "./bindgen.ts";
import { pathExists } from "./helpers.ts";
export type { BindgenOutput } from "./bindgen.ts";
// run `deno task build` if this file doesn't exist
import { loaderText as generatedLoaderText } from "./loader_text.generated.ts";

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
) {
  const sourceHash = await getHash();
  const header = `// @generated file from wasmbuild -- do not edit
// @ts-nocheck: generated
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
) {
  switch (args.loaderKind) {
    case "sync":
      return getSyncLoaderText(bindgenOutput);
    case "async":
      return getAsyncLoaderText(
        crate,
        bindgenOutput,
        false,
      );
    case "async-with-cache":
      return getAsyncLoaderText(
        crate,
        bindgenOutput,
        true,
      );
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
    base64.encodeBase64(new Uint8Array(bindgenOutput.wasmBytes))
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
  useCache: boolean,
) {
  const exportNames = getExportNames(bindgenOutput);

  let loaderText = getWasmbuildLoaderText();

  let cacheText = "";
  if (useCache) {
    // If it's Deno or Node (via dnt), then use the cache.
    // It's ok that the Node path is importing a .ts file because
    // it will be transformed by dnt.
    loaderText +=
      `const isNodeOrDeno = typeof Deno === "object" || (typeof process !== "undefined" && process.versions != null && process.versions.node != null);\n`;
    cacheText += `isNodeOrDeno ? cacheToLocalDir : undefined`;
  } else {
    cacheText = "undefined";
  }

  loaderText += `
const loader = new WasmBuildLoader({
  imports,
  cache: ${cacheText},
})
`;

  loaderText += `/**
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

  return loaderText + " " + generatedLoaderText;

  function getWasmbuildLoaderText() {
    return `/**
* @callback WasmBuildDecompressCallback
* @param {Uint8Array} compressed
* @returns {Uint8Array} decompressed
*/

/**
* @callback WasmBuildCacheCallback
* @param {URL} url
* @param {WasmBuildDecompressCallback | undefined} decompress
* @returns {Promise<URL |Uint8Array>}
*/

/**
* @typedef WasmBuildLoaderOptions
* @property {WebAssembly.Imports | undefined} imports - The Wasm module's imports.
* @property {WasmBuildCacheCallback} [cache] - A function that caches the Wasm module to
* a local path so that a network request isn't required on every load.
*
* Returns an ArrayBuffer with the bytes on download success, but cache save failure.
*/

class WasmBuildLoader {
 /** @type {WasmBuildLoaderOptions} */
 #options;
 /** @type {Promise<WebAssembly.WebAssemblyInstantiatedSource> | undefined} */
 #lastLoadPromise;
 /** @type {WebAssembly.WebAssemblyInstantiatedSource | undefined} */
 #instantiated;

 /** @param {WasmBuildLoaderOptions} options */
 constructor(options) {
   this.#options = options;
 }

 /** @returns {WebAssembly.Instance | undefined} */
 get instance() {
   return this.#instantiated?.instance;
 }

 /** @returns {WebAssembly.Module | undefined} */
 get module() {
   return this.#instantiated?.module;
 }

 /**
  * @param {URL} url
  * @param {WasmBuildDecompressCallback | undefined} decompress
  * @returns {Promise<WebAssembly.WebAssemblyInstantiatedSource>}
  */
 load(
   url,
   decompress,
 ) {
   if (this.#instantiated) {
     return Promise.resolve(this.#instantiated);
   } else if (this.#lastLoadPromise == null) {
     this.#lastLoadPromise = (async () => {
       try {
         this.#instantiated = await this.#instantiate(url, decompress);
         return this.#instantiated;
       } finally {
         this.#lastLoadPromise = undefined;
       }
     })();
   }
   return this.#lastLoadPromise;
 }

 /**
  * @param {URL} url
  * @param {WasmBuildDecompressCallback | undefined} decompress
  */
 async #instantiate(url, decompress) {
   const imports = this.#options.imports;
   if (this.#options.cache != null && url.protocol !== "file:") {
     try {
       const result = await this.#options.cache(
         url,
         decompress ?? ((bytes) => bytes),
       );
       if (result instanceof URL) {
         url = result;
         decompress = undefined; // already decompressed
       } else if (result != null) {
         return WebAssembly.instantiate(result, imports);
       }
     } catch {
       // ignore if caching ever fails (ex. when on deploy)
     }
   }

   const isFile = url.protocol === "file:";

   // make file urls work in Node via dnt
   const isNode =
     (/** @type {any} */ (globalThis)).process?.versions?.node != null;
   if (isFile && typeof Deno !== "object") {
     throw new Error(
       "Loading local files are not supported in this environment",
     );
   }
   if (isNode && isFile) {
     // the deno global will be shimmed by dnt
     const wasmCode = await Deno.readFile(url);
     return WebAssembly.instantiate(
       decompress ? decompress(wasmCode) : wasmCode,
       imports,
     );
   }

   switch (url.protocol) {
     case "file:":
     case "https:":
     case "http:": {
       const wasmResponse = await fetchWithRetries(url);
       if (decompress) {
         const wasmCode = new Uint8Array(await wasmResponse.arrayBuffer());
         return WebAssembly.instantiate(decompress(wasmCode), imports);
       }
       if (
         isFile ||
         wasmResponse.headers.get("content-type")?.toLowerCase()
           .startsWith("application/wasm")
       ) {
         return WebAssembly.instantiateStreaming(
           // Cast to any so there's no type checking issues with dnt
           // (https://github.com/denoland/wasmbuild/issues/92)
           /** @type {any} */ (wasmResponse),
           imports,
         );
       } else {
         return WebAssembly.instantiate(
           await wasmResponse.arrayBuffer(),
           imports,
         );
       }
     }
     default:
       throw new Error(\`Unsupported protocol: \${url.protocol}\`);
   }
 }
}
`;
  }
}

function getExportNames(bindgenOutput: BindgenOutput) {
  return Array.from(bindgenOutput.js.matchAll(
    /export (function|class) ([^({]+)[({]/g,
  )).map((m) => m[2]);
}

function getWasmFileNameFromCrate(crate: WasmCrate) {
  return `${crate.libName}_bg.wasm`;
}
