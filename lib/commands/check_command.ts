// Copyright 2018-2024 the Deno authors. MIT license.

import * as colors from "@std/fmt/colors";
import type { CheckCommand } from "../args.ts";
import { runPreBuild } from "../pre_build.ts";

export async function runCheckCommand(args: CheckCommand) {
  const output = await runPreBuild(args);
  const originalHash = await getOriginalSourceHash();
  if (originalHash === output.sourceHash) {
    console.log(
      `${colors.bold(colors.green("Success"))} ` +
        `wasmbuild output is up to date.`,
    );
  } else {
    console.error(
      `${colors.bold(colors.red("Error"))} ` +
        `wasmbuild output is out of date (found hash ${output.sourceHash}, expected ${originalHash}).`,
    );
    Deno.exit(1);
  }

  async function getOriginalSourceHash() {
    try {
      return getSourceHashFromText(
        await Deno.readTextFile(output.bindingJs.path),
      );
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        return undefined;
      } else {
        throw err;
      }
    }
  }

  function getSourceHashFromText(text: string) {
    const result = text.match(/source-hash: (.+)\b/);
    return result?.[1];
  }
}
