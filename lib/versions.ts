interface WasmCrate {
  name: string;
  getDependencyVersion(name: string): string | undefined;
}

export const versions = {
  wasmBindgen: "0.2.81",
  wasmBindgenFutures: "0.4.31",
  jsSys: "0.3.58",
  webSys: "0.3.58",
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
