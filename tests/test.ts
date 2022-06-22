import * as wasm from "./lib/deno_test.generated.js";
import * as wasmSync from "./lib_sync/deno_test.generated.js";
import { assertEquals } from "./test.deps.ts";

assertEquals(wasm.isInstantiated(), false);
assertEquals(wasmSync.isInstantiated(), false);

async function assertInstantiate() {
  let init = false;
  const module = await wasm.instantiate((wasm: Uint8Array) => {
    init = true;
    return wasm;
  });
  assertEquals(init, true);
  return module;
}

await assertInstantiate();

Deno.test("async - test works export", async () => {
  await wasm.instantiate();
  assertEquals(wasm.isInstantiated(), true);
  assertEquals(wasm.greet("Deno"), "Hello, Deno! Result: 3");
});

Deno.test("async - test works result", async () => {
  const { greet } = await wasm.instantiate();
  assertEquals(greet("Deno"), "Hello, Deno! Result: 3");
  assertEquals(await wasm.instantiate(), await wasm.instantiate());
});

Deno.test("async - test works second instantiate", async () => {
  const { greet } = await wasm.instantiate();
  assertEquals(greet("friend"), "Hello, friend! Result: 3");
});

Deno.test("sync - test works export", () => {
  wasmSync.instantiate();
  assertEquals(wasmSync.isInstantiated(), true);
  assertEquals(wasmSync.greet("Deno"), "Hello, Deno! Result: 3");
});

Deno.test("sync - test works result", () => {
  const { greet } = wasmSync.instantiate();
  assertEquals(greet("Deno"), "Hello, Deno! Result: 3");
  assertEquals(wasmSync.instantiate(), wasmSync.instantiate());
});

Deno.test("sync - test works second instantiate", () => {
  const { greet } = wasmSync.instantiate();
  assertEquals(greet("friend"), "Hello, friend! Result: 3");
});
