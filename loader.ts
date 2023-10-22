// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
import { fetchWithRetries } from "./cache.ts";

export type DecompressCallback = (bytes: Uint8Array) => Uint8Array;

export interface LoaderOptions {
  /** The Wasm module's imports. */
  imports: WebAssembly.Imports | undefined;
  /** A function that caches the Wasm module to a local path so that
   * so that a network request isn't required on every load.
   *
   * Returns an ArrayBuffer with the bytes on download success, but
   * cache save failure.
   */
  cache?: (
    url: URL,
    decompress: DecompressCallback | undefined,
  ) => Promise<URL | Uint8Array>;
}

export class Loader {
  #options: LoaderOptions;
  #lastLoadPromise:
    | Promise<WebAssembly.WebAssemblyInstantiatedSource>
    | undefined;
  #instantiated: WebAssembly.WebAssemblyInstantiatedSource | undefined;

  constructor(options: LoaderOptions) {
    this.#options = options;
  }

  get instance() {
    return this.#instantiated?.instance;
  }

  get module() {
    return this.#instantiated?.module;
  }

  load(
    url: URL,
    decompress: DecompressCallback | undefined,
  ): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
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

  async #instantiate(url: URL, decompress: DecompressCallback | undefined) {
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
    // deno-lint-ignore no-explicit-any
    const isNode = (globalThis as any).process?.versions?.node != null;
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
          // Cast to any so there's no type checking issues with dnt
          // (https://github.com/denoland/wasmbuild/issues/92)
          // deno-lint-ignore no-explicit-any
          return WebAssembly.instantiateStreaming(wasmResponse as any, imports);
        } else {
          return WebAssembly.instantiate(
            await wasmResponse.arrayBuffer(),
            imports,
          );
        }
      }
      default:
        throw new Error(`Unsupported protocol: ${url.protocol}`);
    }
  }
}
