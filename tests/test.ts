import { assertEquals } from "@std/assert";
import * as wasm from "./lib/deno_test.js";

Deno.test("test works export", () => {
  assertEquals(wasm.greet("Deno"), "Hello, Deno! Result: 3");
});
