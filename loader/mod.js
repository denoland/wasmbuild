// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
import { fetchWithRetries } from "./fetch.js";

/**
 * @callback DecompressCallback
 * @param {Uint8Array} compressed
 * @returns {Uint8Array} decompressed
 */

/**
 * @callback CacheCallback
 * @param {URL} url
 * @param {DecompressCallback | undefined} decompress
 * @returns {Promise<URL |Uint8Array>}
 */

/**
 * @typedef LoaderOptions
 * @property {WebAssembly.Imports | undefined} imports - The Wasm module's imports.
 * @property {CacheCallback} [cache] - A function that caches the Wasm module to
 * a local path so that a network request isn't required on every load.
 *
 * Returns an ArrayBuffer with the bytes on download success, but cache save failure.
 */

export class Loader {
  /** @type {LoaderOptions} */
  #options;
  /** @type {Promise<WebAssembly.WebAssemblyInstantiatedSource> | undefined} */
  #lastLoadPromise;
  /** @type {WebAssembly.WebAssemblyInstantiatedSource | undefined} */
  #instantiated;

  /** @param {LoaderOptions} options */
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
   * @param {DecompressCallback | undefined} decompress
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
   * @param {DecompressCallback | undefined} decompress
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
        throw new Error(`Unsupported protocol: ${url.protocol}`);
    }
  }
}
