#!/usr/bin/env -S deno run --allow-run --allow-read --allow-write --allow-env
// Copyright 2018-2024 the Deno authors. MIT license.

import { parseArgs } from "./lib/args.ts";
import { runNewCommand } from "./lib/commands/new_command.ts";
import { runCheckCommand } from "./lib/commands/check_command.ts";
import { runBuildCommand } from "./lib/commands/build_command.ts";

await Deno.permissions.request({ name: "env" });
await Deno.permissions.request({ name: "run" });
await Deno.permissions.request({ name: "read" });
await Deno.permissions.request({ name: "write" });

const command = parseArgs(Deno.args);
switch (command.kind) {
  case "new": {
    await runNewCommand();
    break;
  }
  case "build": {
    await runBuildCommand(command);
    break;
  }
  case "check": {
    await runCheckCommand(command);
    break;
  }
  case "help": {
    showHelp();
    break;
  }
  default: {
    const _assertNever: never = command;
    throw new Error("Not implemented.");
  }
}

function showHelp() {
  console.log("%cWasmBuild", "font-weight: bold");
  console.log();
  console.log(
    "%cnew %c- Scaffold a new project",
    "color: green",
    "color: reset",
  );
  console.log();
  console.log("%cbuild %c- Build the project", "color: green", "color: reset");
  console.log();
  console.log("%cBuild options:", "font-style: italic");
  console.log();
  console.log(
    "%c--debug %c- Build without optimizations.",
    "font-weight: bold",
    "font-weight: normal",
  );
  console.log();
  console.log(
    "%c--project <crate_name> / -p <crate_name> %c- Specifies the crate to build when using a Cargo workspace.",
    "font-weight: bold",
    "font-weight: normal",
  );
  console.log();
  console.log(
    "%c--out <dir_path> %c- Specifies the output directory. Defaults to ./lib",
    "font-weight: bold",
    "font-weight: normal",
  );
  console.log();
  console.log(
    "%c--js-ext <ext_no_period> %c- Extension to use for the wasm-bindgen JS file. Defaults to js.",
    "font-weight: bold",
    "font-weight: normal",
  );
  console.log();
  console.log(
    "%c--all-features %c- Build the crate with all features.",
    "font-weight: bold",
    "font-weight: normal",
  );
  console.log();
  console.log(
    "%c--no-default-features %c- Build the crate with no default features.",
    "font-weight: bold",
    "font-weight: normal",
  );
  console.log();
  console.log(
    '%c--features %c- Specify the features to create. Specify multiple features quoted and with spaces (ex. --features "wasm serialization").',
    "font-weight: bold",
    "font-weight: normal",
  );
  console.log();
  console.log(
    "%c--sync %c- Generate a synchronous module that stores the Wasm module inline as base64 text.",
    "font-weight: bold",
    "font-weight: normal",
  );
  console.log();
  console.log(
    "%c--skip-opt %c- Skip running wasm-opt.",
    "font-weight: bold",
    "font-weight: normal",
  );
  console.log();
  console.log(
    "%c--check %c- Checks if the output is up-to-date.",
    "font-weight: bold",
    "font-weight: normal",
  );
  console.log();
  console.log(
    "%c--no-cache %c- Do not generate the code to cache the Wasm file locally.",
    "font-weight: bold",
    "font-weight: normal",
  );
}
