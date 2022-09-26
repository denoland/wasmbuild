import { instantiate } from "./wasmbuild.generated.js";
import { path } from "./deps.ts";

export interface BindgenOutput {
  js: string;
  snippets: { [name: string]: string[] };
  localModules: { [name: string]: string };
  wasmBytes: number[];
}

export async function generateBindgen(libName: string, filePath: string) {
  // if wasmbuild is building itself, then we need to use the wasm-bindgen-cli
  if (Deno.env.get("WASMBUILD_SELF_BUILD") === "1") {
    return generateForSelfBuild(filePath);
  }

  const originalWasmBytes = await Deno.readFile(filePath);
  const { generate_bindgen } = await instantiate();
  return await generate_bindgen(
    libName,
    originalWasmBytes,
  ) as BindgenOutput;
}

async function generateForSelfBuild(filePath: string): Promise<BindgenOutput> {
  const tempPath = await Deno.makeTempDir();
  try {
    console.log(tempPath);
    const p = Deno.run({
      cmd: ["wasm-bindgen", "--target", "deno", "--out-dir", tempPath, filePath]
    });
    const status = await p.status();
    if (!status.success) {
      throw new Error("Failed.");
    }
    const wasmBytes = await Deno.readFile(path.join(tempPath, "wasmbuild_bg.wasm"));
    return {
      js: await Deno.readTextFile(path.join(tempPath, "wasmbuild.js")),
      localModules: {},
      snippets: {},
      wasmBytes: Array.from(wasmBytes),
    }
  } finally {
    await Deno.remove(tempPath, {
      recursive: true
    });
  }
}