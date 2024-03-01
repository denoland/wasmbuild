// Copyright 2018-2024 the Deno authors. MIT license.

import { assertEquals } from "@std/assert";
import { CommonBuild, parseArgs } from "./args.ts";

Deno.test("no default features", () => {
  const args = parseArgs([
    "--features",
    "wasm",
    "--no-default-features",
    "--out",
    "js",
  ]);
  assertEquals(
    (args as CommonBuild).cargoFlags,
    ["--no-default-features", "--features", "wasm"],
  );
});
