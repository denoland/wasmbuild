// Copyright 2018-2025 the Deno authors. MIT license.

import * as colors from "@std/fmt/colors";
import { versions } from "../versions.ts";
import { Path } from "@david/path";

export async function runNewCommand() {
  await checkIfRequiredToolsExist();

  const rootDir = new Path(Deno.cwd());
  const rsLibDir = rootDir.join("rs_lib");

  if (rsLibDir.existsSync()) {
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

  writeIfNotExists(
    rootDir.join("Cargo.toml"),
    `[workspace]
resolver = "2"
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

  writeIfNotExists(
    rootDir.join(".rustfmt.toml"),
    `max_width = 80
tab_spaces = 2
edition = "2021"
`,
  );

  let gitIgnoreText = await getFileTextIfExists("./.gitignore") ?? "";
  if (!/^\/target$/m.test(gitIgnoreText)) {
    gitIgnoreText = gitIgnoreText.trim();
    if (gitIgnoreText.length > 0) {
      gitIgnoreText = gitIgnoreText + "\n";
    }
    gitIgnoreText += "/target\n";
    await Deno.writeTextFile("./.gitignore", gitIgnoreText);
  }

  const srcDir = rsLibDir.join("src");
  srcDir.ensureDirSync();
  rsLibDir.join("./Cargo.toml").writeTextSync(
    `[package]
name = "rs_lib"
version = "0.0.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "=${versions["wasm-bindgen"]}"
`,
  );

  srcDir.join("lib.rs").writeTextSync(
    `use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
  a + b
}

#[wasm_bindgen]
pub struct Greeter {
  name: String,
}

#[wasm_bindgen]
impl Greeter {
  #[wasm_bindgen(constructor)]
  pub fn new(name: String) -> Self {
    Self { name }
  }

  pub fn greet(&self) -> String {
    format!("Hello {}!", self.name)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn it_adds() {
    let result = add(1, 2);
    assert_eq!(result, 3);
  }

  #[test]
  fn it_greets() {
    let greeter = Greeter::new("world".into());
    assert_eq!(greeter.greet(), "Hello world!");
  }
}
`,
  );

  // use a .js file for the most compatibility out of the box (ex. browsers)
  writeIfNotExists(
    rootDir.join("mod.js"),
    `import { add, Greeter } from "./lib/rs_lib.js";

// adds
console.log(add(1, 1));

// greets
const greeter = new Greeter("world");
console.log(greeter.greet());
`,
  );

  console.log("%cTo get started run:", "color:yellow");
  console.log("deno task wasmbuild");
  console.log("deno run mod.js");
}

function writeIfNotExists(path: Path, text: string) {
  if (path.existsSync()) {
    return;
  }
  path.writeTextSync(text);
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
  const requiredTools = ["deno", "cargo"];
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

  if (notInstalled.length > 0) {
    throw new Error(
      "Some required tools are missing: " + notInstalled.join(", "),
    );
  }
}
