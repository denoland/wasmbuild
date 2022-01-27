// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
interface MetaData {
  packages: {
    name: string;
    targets?: {
      kind: string[];
      name: string;
      crate_types?: string[];
    }[];
  }[];
}

export async function getMetadata(directory: string) {
  const p = Deno.run({
    cwd: directory,
    cmd: ["cargo", "metadata", "--no-deps", "--format-version", "1"],
    stdout: "piped",
    stderr: "piped",
  });
  const result = new TextDecoder().decode(await p.output());
  return JSON.parse(result!) as MetaData;
}

export async function getCrateName(path?: string): Promise<string> {
  const { packages } = await getMetadata(path || ".");
  for (const metadata of packages) {
    // [lib]
    // name = "deno_wasm"
    // crate-type = ["cdylib"]
    const wasmlib = metadata.targets?.find((p) =>
      p.kind.includes("cdylib") && p.crate_types?.includes("cdylib")
    );
    if (wasmlib?.name) {
      return wasmlib.name;
    }
  }

  throw new Error("Could not find crate name");
}
