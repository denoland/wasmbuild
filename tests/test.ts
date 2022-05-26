import { greet } from "./lib/deno_test.generated.js";
import { assertEquals } from "https://deno.land/std@0.140.0/testing/asserts.ts";

Deno.test("test works", () => {
  assertEquals(greet("Deno"), "Hello, Deno!");
});
