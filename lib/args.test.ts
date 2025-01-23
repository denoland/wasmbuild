// Copyright 2018-2025 the Deno authors. MIT license.

import { assertEquals } from "@std/assert";
import { type CommonBuild, parseArgs } from "./args.ts";

Deno.test("no default features", () => {
  const args = parseArgs([
    "--features",
    "wasm",
    "--no-default-features",
    "--inline",
    "--out",
    "js",
  ]);
  assertEquals(
    (args as CommonBuild).cargoFlags,
    ["--no-default-features", "--features", "wasm", "--inline"],
  );
});
