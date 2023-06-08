// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.

import { colors, ensureDir } from "../deps.ts";
import { versions } from "../versions.ts";
import { pathExists } from "../helpers.ts";

export async function runNewCommand() {
  await checkIfRequiredToolsExist();

  if (await pathExists("./rs_lib")) {
    console.log(
      `${
        colors.bold(colors.red("Error"))
      } cannot scaffold new project because the rs_lib folder already exists.`,
    );
    Deno.exit(1);
  }

  console.log(
    `${colors.bold(colors.green("Creating"))} rs_lib...`,
  );

  if (!await pathExists("./Cargo.toml")) {
    await Deno.writeTextFile(
      "./Cargo.toml",
      `[workspace]
members = [
  "rs_lib",
]

[profile.release]
codegen-units = 1
incremental = true
lto = true
opt-level = "z"
`,
    );
  }
  if (!await pathExists("./.rustfmt.toml")) {
    await Deno.writeTextFile(
      "./.rustfmt.toml",
      `max_width = 80
tab_spaces = 2
edition = "2021"
`,
    );
  }

  let gitIgnoreText = await getFileTextIfExists("./.gitignore") ?? "";
  if (!/^\/target$/m.test(gitIgnoreText)) {
    gitIgnoreText = gitIgnoreText.trim();
    if (gitIgnoreText.length > 0) {
      gitIgnoreText = gitIgnoreText + "\n";
    }
    gitIgnoreText += "/target\n";
    await Deno.writeTextFile("./.gitignore", gitIgnoreText);
  }

  await ensureDir("./rs_lib/src");
  await Deno.writeTextFile(
    "./rs_lib/Cargo.toml",
    `[package]
name = "rs_lib"
version = "0.0.0"
edition = "2021"

[lib]
crate_type = ["cdylib"]

[dependencies]
wasm-bindgen = "=${versions.wasmBindgen}"
`,
  );
  await Deno.writeTextFile(
    "./rs_lib/src/lib.rs",
    `use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
  return a + b;
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn it_works() {
    let result = add(1, 2);
    assert_eq!(result, 3);
  }
}
`,
  );
  if (!await pathExists("./mod.ts")) {
    await Deno.writeTextFile(
      "./mod.ts",
      `import { instantiate } from "./lib/rs_lib.generated.js";

const { add } = await instantiate();
console.log(add(1, 1));
`,
    );
  }
  console.log("%cTo get started run:", "color:yellow");
  console.log("deno task wasmbuild");
  console.log("deno run mod.ts");
}

async function getFileTextIfExists(path: string) {
  try {
    return await Deno.readTextFile(path);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return undefined;
    } else {
      throw err;
    }
  }
}

async function checkIfRequiredToolsExist() {
  const requiredTools = ["deno", "cargo", "rustup"];
  const notInstalled: string[] = [];

  for (const tool of requiredTools) {
    try {
      await new Deno.Command(tool, {
        args: ["--version"], // the current needed tools all have this arg
        stdout: "null",
        stderr: "null",
      })
        .spawn()
        .status;
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        notInstalled.push(tool);
      }
    }
  }

  if (notInstalled.length !== 0) {
    throw "Some required tools are missing: " + notInstalled;
  }
}
