import { parse } from "https://deno.land/std@0.122.0/encoding/yaml.ts";

interface MetaData {
  packages: {
    name: string;
    targets?: {
      kind: string;
      name: string;
      crate_type?: string[];
    }[];
  }[];
};

export async function getMetadata(directory: string) {
  const p = Deno.run({
    cwd: directory,
    cmd: ["cargo", "metadata", "--format-version", "1"],
    stdout: "piped",
    stderr: "piped",
  });
  await p.status();
  const result = new TextDecoder().decode(await p.output());
  return JSON.parse(result!) as MetaData;
}

export async function getCrateName(path?: string): Promise<string> {
  const { packages } = await getMetadata(path || ".");
  const metadata = packages[0];
  console.log(packages);
  // [lib]
  // name = "deno_wasm"
  // crate-type = ["cdylib"]
  const wasmlib = metadata.targets?.find(p => p.kind == "lib" && p.crate_type?.includes("cdylib"));
  if (wasmlib) {
    return wasmlib.name;
  }

  // [package]
  // name = "deno_wasm"
  return metadata.name;
}

