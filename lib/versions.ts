// Copyright 2018-2024 the Deno authors. MIT license.

interface WasmCrate {
  name: string;
  getDependencyVersion(name: string): string | undefined;
}

export const versions = {
  "wasm-bindgen": "0.2.100",
  "wasm-bindgen-futures": "0.4.50",
  "js-sys": "0.3.77",
  "web-sys": "0.3.77",
} as const;

export function verifyVersions(crate: WasmCrate) {
  verifyVersion(crate, "wasm-bindgen", versions["wasm-bindgen"]);
  verifyVersionAllowNone(
    crate,
    "wasm-bindgen-futures",
    versions["wasm-bindgen-futures"],
  );
  verifyVersionAllowNone(crate, "js-sys", versions["js-sys"]);
  verifyVersionAllowNone(crate, "web-sys", versions["web-sys"]);
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
