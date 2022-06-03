import { greet, instantiate, isInstantiated } from "./lib/deno_test.generated.js";
import { assertEquals } from "https://deno.land/std@0.142.0/testing/asserts.ts";

assertEquals(isInstantiated(), false);

Deno.test("test works export", async () => {
  await instantiate();
  assertEquals(isInstantiated(), true);
  assertEquals(greet("Deno"), "Hello, Deno! Result: 3");
});

Deno.test("test works result", async () => {
  const { greet } = await instantiate();
  assertEquals(greet("Deno"), "Hello, Deno! Result: 3");
});

Deno.test("test works second instantiate", async () => {
  const { greet } = await instantiate();
  assertEquals(greet("friend"), "Hello, friend! Result: 3");
});
