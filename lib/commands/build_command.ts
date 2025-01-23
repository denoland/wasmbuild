// Copyright 2018-2025 the Deno authors. MIT license.

import * as colors from "@std/fmt/colors";
import * as base64 from "@std/encoding/base64";
import type { BuildCommand } from "../args.ts";
import {
  generatedHeader,
  type PreBuildOutput,
  runPreBuild,
} from "../pre_build.ts";
import { runWasmOpt } from "../wasmopt.ts";
import type { Path } from "@david/path";

export async function runBuildCommand(args: BuildCommand) {
  const output = await runPreBuild(args);

  await args.outDir.ensureDir();
  await writeSnippets();

  const files = args.inline
    ? await inlinePreBuild(output, args)
    : await handleWasmModuleOutput(output, args);

  for (const file of files) {
    console.log(`  write ${colors.yellow(file.path.toString())}`);
    if (typeof file.data === "string") {
      await file.path.writeText(file.data);
    } else {
      await file.path.write(file.data);
    }
  }

  console.log(
    `${colors.bold(colors.green("Finished"))} WebAssembly output`,
  );

  async function writeSnippets() {
    const localModules = Array.from(output.bindgen.localModules);
    const snippets = Array.from(output.bindgen.snippets);

    if (localModules.length === 0 && !snippets.some((s) => s[1].length > 0)) {
      return; // don't create the snippets directory
    }

    const snippetsDest = args.outDir.join("snippets");
    // start with a fresh directory in order to clear out any previously
    // created snippets which might have a different name
    await snippetsDest.emptyDir();

    for (const [name, text] of localModules) {
      const filePath = snippetsDest.join(name);
      const dirPath = filePath.parentOrThrow();
      await dirPath.mkdir({ recursive: true });
      await filePath.writeText(text);
    }

    for (const [identifier, list] of snippets) {
      if (list.length === 0) {
        continue;
      }
      const dirPath = snippetsDest.join(identifier);
      await dirPath.mkdir({ recursive: true });
      for (const [i, text] of list.entries()) {
        const name = `inline${i}.js`;
        const filePath = dirPath.join(name);
        await filePath.writeText(text);
      }
    }
  }
}

interface FileEntry {
  path: Path;
  data: string | Uint8Array;
}

async function handleWasmModuleOutput(
  output: PreBuildOutput,
  args: BuildCommand,
): Promise<FileEntry[]> {
  return [{
    path: args.outDir.join(
      `${output.crateName}.${args.bindingJsFileExt}`,
    ),
    data: `${generatedHeader}
// @ts-self-types="./${output.bindingDts.path.basename()}"
import * as wasm from "./${output.wasmFileName}";
export * from "./${output.crateName}.internal.${args.bindingJsFileExt}";
import {{ __wbg_set_wasm }} from "./${output.crateName}.internal.${args.bindingJsFileExt}";
__wbg_set_wasm(wasm);
`,
  }, {
    path: output.bindingJsBg.path,
    data: output.bindingJsBg.text,
  }, {
    path: output.bindingDts.path,
    data: output.bindingDts.text,
  }, {
    path: args.outDir.join(output.wasmFileName),
    data: await getWasmBytes(output, args),
  }];
}

async function inlinePreBuild(
  output: PreBuildOutput,
  args: BuildCommand,
): Promise<FileEntry[]> {
  const wasmBytes = await getWasmBytes(output, args);

  return [{
    path: args.outDir.join(
      `${output.crateName}.${args.bindingJsFileExt}`,
    ),
    data: `${generatedHeader}
// @ts-self-types="./${output.bindingDts.path.basename()}"
function base64decode(b64) {
  const binString = atob(b64);
  const size = binString.length;
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return bytes;
}

import * as imports from "./${output.crateName}.internal.${args.bindingJsFileExt}";
const bytes = base64decode("\\\n${
      base64.encodeBase64(wasmBytes).replace(/.{78}/g, "$&\\\n")
    }\\\n");
const wasmModule = new WebAssembly.Module(bytes);
const wasm = new WebAssembly.Instance(wasmModule, {
  "./${output.crateName}.internal.${args.bindingJsFileExt}": imports,
});

export * from "./${output.crateName}.internal.${args.bindingJsFileExt}";
import { __wbg_set_wasm } from "./${output.crateName}.internal.${args.bindingJsFileExt}";
__wbg_set_wasm(wasm.exports);
`,
  }, {
    path: output.bindingJsBg.path,
    data: output.bindingJsBg.text,
  }, {
    path: output.bindingDts.path,
    data: output.bindingDts.text,
  }];
}

async function getWasmBytes(output: PreBuildOutput, args: BuildCommand) {
  const wasmBytes = new Uint8Array(output.bindgen.wasm.bytes);
  if (args.isOpt) {
    return await optimizeWasmFile(wasmBytes);
  } else {
    return wasmBytes;
  }
}

async function optimizeWasmFile(fileBytes: Uint8Array) {
  try {
    console.log(
      `${colors.bold(colors.green("Optimizing"))} .wasm file...`,
    );
    return await runWasmOpt(fileBytes);
  } catch (err) {
    console.error(
      `${colors.bold(colors.red("Error"))} ` +
        `running wasm-opt failed. Maybe skip with --skip-opt?\n\n${err}`,
    );
    Deno.exit(1);
  }
}
