import { assertEquals } from "https://deno.land/std@0.198.0/assert/mod.ts";
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
