#!/usr/bin/env -S deno run --allow-run --allow-read --allow-write --allow-env
// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.

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
    await runBuildCommand(command)
    break;
  }
  case "check": {
    await runCheckCommand(command)
    break;
  }
  default: {
    const _assertNever: never = command;
    throw new Error("Not implemented.");
  }
}
