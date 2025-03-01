// Copyright 2018-2025 the Deno authors. MIT license.

import { createTempDirSync } from "@david/temp";
import { generate_bindgen } from "./wasmbuild.js";
import type { Path } from "@david/path";

export interface BindgenTextFileOutput {
  name: string;
  text: string;
}

export interface BindgenOutput {
  jsBg: BindgenTextFileOutput;
  ts: BindgenTextFileOutput;
  snippets: Map<string, string[]>;
  localModules: Map<string, string>;
  start: string | undefined;
  wasm: {
    name: string;
    bytes: number[];
  };
}

export async function generateBindgen({ libName, filePath, ext }: {
  libName: string;
  filePath: Path;
  ext: string;
}) {
  // if wasmbuild is building itself, then we need to use the wasm-bindgen-cli
  const hasEnvPerm = await Deno.permissions.query({ name: "env" });
  if (hasEnvPerm && Deno.env.get("WASMBUILD_BINDGEN_UPGRADE") === "1") {
    return generateForSelfBuild(filePath);
  }

  const originalWasmBytes = filePath.readBytesSync();
  return await generate_bindgen(
    libName,
    ext,
    originalWasmBytes,
  ) as BindgenOutput;
}

async function generateForSelfBuild(filePath: Path): Promise<BindgenOutput> {
  // When upgrading wasm-bindgen within wasmbuild, we can't rely on
  // using the .wasm file because it will be out of date and not build,
  // so we revert to using the globally installed wasm-bindgen cli.
  // See https://github.com/denoland/wasmbuild/issues/51 for more details
  using tempDir = createTempDirSync();
  // note: ensure you have run `cargo install -f wasm-bindgen-cli` to upgrade
  // to the latest version
  const p = new Deno.Command("wasm-bindgen", {
    args: [
      "--target",
      "bundler",
      "--out-dir",
      tempDir.toString(),
      filePath.toString(),
    ],
  }).spawn();
  const output = await p.status;
  if (!output.success) {
    throw new Error("Failed.");
  }
  const wasmBytes = tempDir.join("wasmbuild_bg.wasm").readBytesSync();
  return {
    jsBg: {
      name: "wasmbuild_bg.js",
      text: tempDir.join("wasmbuild_bg.js").readTextSync(),
    },
    ts: {
      name: "wasmbuild.d.ts",
      text: tempDir.join("wasmbuild.d.ts").readTextSync(),
    },
    localModules: new Map(),
    snippets: new Map(),
    start: undefined,
    wasm: {
      name: "wasmbuild_bg.wasm",
      bytes: Array.from(wasmBytes),
    },
  };
}
