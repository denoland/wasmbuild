// Copyright 2018-2025 the Deno authors. MIT license.

import * as colors from "@std/fmt/colors";
import { emptyDir } from "@std/fs/empty-dir";
import * as path from "@std/path";
import * as base64 from "@std/encoding/base64";
import { ensureDir } from "@std/fs";
import type { BuildCommand } from "../args.ts";
import {
  generatedHeader,
  type PreBuildOutput,
  runPreBuild,
} from "../pre_build.ts";
import { runWasmOpt } from "../wasmopt.ts";

export async function runBuildCommand(args: BuildCommand) {
  const output = await runPreBuild(args);

  await ensureDir(args.outDir);
  await writeSnippets();

  const files = args.inline
    ? await inlinePreBuild(output, args)
    : await handleWasmModuleOutput(output, args);

  for (const file of files) {
    console.log(`  write ${colors.yellow(file.path)}`);
    if (typeof file.data === "string") {
      await Deno.writeTextFile(file.path, file.data);
    } else {
      await Deno.writeFile(file.path, file.data);
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

    const snippetsDest = path.join(args.outDir, "snippets");
    // start with a fresh directory in order to clear out any previously
    // created snippets which might have a different name
    await emptyDir(snippetsDest);

    for (const [name, text] of localModules) {
      const filePath = path.join(snippetsDest, name);
      const dirPath = path.dirname(filePath);
      await Deno.mkdir(dirPath, { recursive: true });
      await Deno.writeTextFile(filePath, text);
    }

    for (const [identifier, list] of snippets) {
      if (list.length === 0) {
        continue;
      }
      const dirPath = path.join(snippetsDest, identifier);
      await Deno.mkdir(dirPath, { recursive: true });
      for (const [i, text] of list.entries()) {
        const name = `inline${i}.js`;
        const filePath = path.join(dirPath, name);
        await Deno.writeTextFile(filePath, text);
      }
    }
  }
}

interface FileEntry {
  path: string;
  data: string | Uint8Array;
}

async function handleWasmModuleOutput(
  output: PreBuildOutput,
  args: BuildCommand,
): Promise<FileEntry[]> {
  return [{
    path: path.join(
      args.outDir,
      `${output.crateName}.${args.bindingJsFileExt}`,
    ),
    data: `${generatedHeader}
// @ts-self-types="./${path.basename(output.bindingDts.path)}"
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
    path: path.join(args.outDir, output.wasmFileName),
    data: await getWasmBytes(output, args),
  }];
}

async function inlinePreBuild(
  output: PreBuildOutput,
  args: BuildCommand,
): Promise<FileEntry[]> {
  const wasmBytes = await getWasmBytes(output, args);

  return [{
    path: path.join(
      args.outDir,
      `${output.crateName}.${args.bindingJsFileExt}`,
    ),
    data: `${generatedHeader}
// @ts-self-types="./${path.basename(output.bindingDts.path)}"
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
