// Copyright 2018-2024 the Deno authors. MIT license.

import { assertThrows } from "@std/assert/assert_throws";
import { verifyVersions } from "./versions.ts";

const correctMap: { [name: string]: string } = {
  "wasm-bindgen": "0.2.91",
  "js-sys": "0.3.68",
};

Deno.test("should verify when all correct", () => {
  const crate = {
    name: "test-crate",
    getDependencyVersion(depName: string) {
      return correctMap[depName];
    },
  };
  verifyVersions(crate);
});

Deno.test("should verify when only wasm-bindgen version", () => {
  const crate = {
    name: "test-crate",
    getDependencyVersion(depName: string) {
      return {
        "wasm-bindgen": correctMap["wasm-bindgen"],
      }[depName];
    },
  };
  verifyVersions(crate);
});

Deno.test("should error when no wasm-bindgen", () => {
  const crate = {
    name: "test-crate",
    getDependencyVersion(_depName: string) {
      return undefined;
    },
  };
  assertThrows(
    () => verifyVersions(crate),
    Error,
    `The crate 'test-crate' must have a dependency on wasm-bindgen ${
      correctMap["wasm-bindgen"]
    } (found <NOT FOUND>).`,
  );
});

Deno.test("should error when has incorrect dependency", () => {
  const crateNames = Object.keys(correctMap);
  for (const crateName of crateNames) {
    const crate = {
      name: "test-crate",
      getDependencyVersion(depName: string) {
        return {
          "wasm-bindgen": correctMap["wasm-bindgen"],
          [crateName]: "0.0.1",
        }[depName];
      },
    };
    assertThrows(
      () => verifyVersions(crate),
      Error,
      `The crate 'test-crate' must have a dependency on ${crateName} ${
        correctMap[crateName]
      } (found 0.0.1).`,
    );
  }
});
