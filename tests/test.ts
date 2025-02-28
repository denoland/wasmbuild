import { assertEquals } from "@std/assert";
import * as wasm from "./lib/deno_test.js";
import * as wasm2 from "./lib_inline/deno_test.js";

Deno.test("test works export", () => {
  function hasStart() {
    return Deno.readTextFileSync(import.meta.dirname + "/lib/deno_test.js").includes("__wbindgen_start");
  }
  assertEquals(wasm.greet("Deno"), hasStart() ? "Hello, Deno! Result: 4" : "Hello, Deno! Result: 3");
});

Deno.test("test inline works", () => {
  assertEquals(wasm2.greet("Deno"), "Hello, Deno! Result: 3");
});
