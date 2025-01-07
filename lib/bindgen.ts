// Copyright 2018-2024 the Deno authors. MIT license.

import { generate_bindgen } from "./wasmbuild.js";
import * as path from "@std/path";

export interface BindgenOutput {
  js: string;
  jsBg: string;
  ts: string;
  snippets: Map<string, string[]>;
  localModules: Map<string, string>;
  wasmBytes: number[];
}

export async function generateBindgen({ libName, filePath, ext }: {
  libName: string,
  filePath: string
  ext: string,
}) {
  // if wasmbuild is building itself, then we need to use the wasm-bindgen-cli
  const hasEnvPerm = await Deno.permissions.query({ name: "env" });
  if (hasEnvPerm && Deno.env.get("WASMBUILD_BINDGEN_UPGRADE") === "1") {
    return generateForSelfBuild(filePath);
  }

  const originalWasmBytes = await Deno.readFile(filePath);
  return await generate_bindgen(
    libName,
    ext,
    originalWasmBytes,
  ) as BindgenOutput;
}

async function generateForSelfBuild(filePath: string): Promise<BindgenOutput> {
  // When upgrading wasm-bindgen within wasmbuild, we can't rely on
  // using the .wasm file because it will be out of date and not build,
  // so we revert to using the globally installed wasm-bindgen cli.
  // See https://github.com/denoland/wasmbuild/issues/51 for more details
  const tempPath = await Deno.makeTempDir();
  try {
    // note: ensure you have run `cargo install -f wasm-bindgen-cli` to upgrade
    // to the latest version
    const p = new Deno.Command("wasm-bindgen", {
      args: [
        "--target",
        "bundler",
        "--out-name",
        "wasmbuild_internal",
        "--out-dir",
        tempPath,
        filePath,
      ],
    }).spawn();
    const output = await p.status;
    if (!output.success) {
      throw new Error("Failed.");
    }
    const wasmBytes = await Deno.readFile(
      path.join(tempPath, "wasmbuild_internal_bg.wasm"),
    );
    return {
      js: (await Deno.readTextFile(path.join(tempPath, "wasmbuild_internal.js"))).replaceAll("wasmbuild_internal_bg.wasm", "wasmbuild.wasm"),
      jsBg: await Deno.readTextFile(path.join(tempPath, "wasmbuild_internal_bg.js")),
      ts: await Deno.readTextFile(path.join(tempPath, "wasmbuild_internal.d.ts")),
      localModules: new Map(),
      snippets: new Map(),
      wasmBytes: Array.from(wasmBytes),
    };
  } finally {
    await Deno.remove(tempPath, {
      recursive: true,
    });
  }
}
