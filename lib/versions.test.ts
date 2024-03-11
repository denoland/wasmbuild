// Copyright 2018-2024 the Deno authors. MIT license.

import { assertThrows } from "@std/assert/assert_throws";
import { verifyVersions, versions } from "./versions.ts";

Deno.test("should verify when all correct", () => {
  const crate = {
    name: "test-crate",
    getDependencyVersion(depName: keyof typeof versions) {
      return versions[depName];
    },
  };
  verifyVersions(crate);
});

Deno.test("should error when no wasm-bindgen", () => {
  const crate = {
    name: "test-crate",
    getDependencyVersion(_depName: keyof typeof versions) {
      return undefined;
    },
  };
  assertThrows(
    () => verifyVersions(crate),
    Error,
    `The crate 'test-crate' must have a dependency on wasm-bindgen ${
      versions["wasm-bindgen"]
    } (found <NOT FOUND>).`,
  );
});

Deno.test("should error when has incorrect dependency", () => {
  const crateNames = Object.keys(versions) as (keyof typeof versions)[];
  for (const crateName of crateNames) {
    const crate = {
      name: "test-crate",
      getDependencyVersion(depName: string) {
        return {
          "wasm-bindgen": versions["wasm-bindgen"],
          [crateName]: "0.0.1",
        }[depName];
      },
    };
    assertThrows(
      () => verifyVersions(crate),
      Error,
      `The crate 'test-crate' must have a dependency on ${crateName} ${
        versions[crateName]
      } (found 0.0.1).`,
    );
  }
});
