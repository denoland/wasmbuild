// Copyright 2018-2024 the Deno authors. MIT license.

import * as colors from "@std/fmt/colors";
import { emptyDir } from "@std/fs/empty_dir";
import * as path from "@std/path";
import { ensureDir } from "@std/fs";
import type { BuildCommand } from "../args.ts";
import { runPreBuild } from "../pre_build.ts";
import { runWasmOpt } from "../wasmopt.ts";

export async function runBuildCommand(args: BuildCommand) {
  const output = await runPreBuild(args);

  await ensureDir(args.outDir);
  await writeSnippets();

  console.log(`  write ${colors.yellow(output.bindingJs.path)}`);
  await Deno.writeTextFile(output.bindingJs.path, output.bindingJs.text);
  console.log(`  write ${colors.yellow(output.bindingJsBg.path)}`);
  await Deno.writeTextFile(output.bindingJsBg.path, output.bindingJsBg.text);
  console.log(`  write ${colors.yellow(output.bindingDts.path)}`);
  await Deno.writeTextFile(output.bindingDts.path, output.bindingDts.text);

  if (output.wasmFileName != null) {
    const wasmDest = path.join(args.outDir, output.wasmFileName);
    await Deno.writeFile(wasmDest, new Uint8Array(output.bindgen.wasm.bytes));
    if (args.isOpt) {
      await optimizeWasmFile(wasmDest);
    }
  }

  console.log(
    `${colors.bold(colors.green("Finished"))} WebAssembly output`,
  );

  async function optimizeWasmFile(wasmFilePath: string) {
    try {
      console.log(
        `${colors.bold(colors.green("Optimizing"))} .wasm file...`,
      );
      await runWasmOpt(wasmFilePath);
    } catch (err) {
      console.error(
        `${colors.bold(colors.red("Error"))} ` +
          `running wasm-opt failed. Maybe skip with --skip-opt?\n\n${err}`,
      );
      Deno.exit(1);
    }
  }

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
