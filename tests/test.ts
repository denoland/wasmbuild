import { assertEquals } from "@std/assert";
import * as wasm from "./lib/deno_test.js";
import * as wasm2 from "./lib_inline/deno_test.js";

Deno.test("test works export", () => {
  assertEquals(wasm.greet("Deno"), "Hello, Deno! Result: 3");
});

Deno.test("test inline works", () => {
  assertEquals(wasm2.greet("Deno"), "Hello, Deno! Result: 3");
});
