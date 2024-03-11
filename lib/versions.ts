// Copyright 2018-2024 the Deno authors. MIT license.

/**
 * This module contains logic for ensuring that some other Rust dependencies
 * are using the correct version of the wasm-bindgen crate. Mismatches in
 * versions can cause runtime errors that are difficult to troubleshoot.
 * 
 * @see {@link https://github.com/rustwasm/wasm-bindgen/pull/2913#issuecomment-1139100835}
 */

interface WasmCrate {
  name: string;
  getDependencyVersion(name: string): string | undefined;
}

export const versions = {
  wasmBindgen: "0.2.91",
  wasmBindgenFutures: "0.4.41",
  jsSys: "0.3.68",
  webSys: "0.3.68",
};

export function verifyVersions(crate: WasmCrate) {
  verifyVersion(crate, "wasm-bindgen", versions.wasmBindgen);
  verifyVersionAllowNone(
    crate,
    "wasm-bindgen-futures",
    versions.wasmBindgenFutures,
  );
  verifyVersionAllowNone(crate, "js-sys", versions.jsSys);
  verifyVersionAllowNone(crate, "web-sys", versions.webSys);
}

function verifyVersionAllowNone(
  crate: WasmCrate,
  name: string,
  expectedVersion: string,
) {
  const actualVersion = crate.getDependencyVersion(name);
  if (actualVersion != null) {
    verifyVersionInner(
      crate,
      name,
      actualVersion,
      expectedVersion,
    );
  }
}

function verifyVersion(
  crate: WasmCrate,
  name: string,
  expectedVersion: string,
) {
  verifyVersionInner(
    crate,
    name,
    crate.getDependencyVersion(name),
    expectedVersion,
  );
}

function verifyVersionInner(
  crate: WasmCrate,
  name: string,
  actualVersion: string | undefined,
  expectedVersion: string,
) {
  if (actualVersion !== expectedVersion) {
    throw new Error(
      `The crate '${crate.name}' must have a dependency on ${name} ` +
        `${expectedVersion} (found ` +
        `${actualVersion ?? "<NOT FOUND>"}).`,
    );
  }
}
