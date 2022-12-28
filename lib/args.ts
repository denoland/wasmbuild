// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.

import { parseFlags } from "./deps.ts";

export type Command = NewCommand | BuildCommand | CheckCommand;

export interface NewCommand {
  kind: "new";
  generateWasmCache: boolean;
}

export interface CommonBuild {
  outDir: string;
  bindingJsFileExt: string;
  profile: "debug" | "release";
  project: string | undefined;
  isSync: boolean;
  isOpt: boolean;
  cargoFlags: string[];
}

export interface BuildCommand extends CommonBuild {
  kind: "build";
}

export interface CheckCommand extends CommonBuild {
  kind: "check";
}

export function parseArgs(rawArgs: string[]): Command {
  const flags = parseFlags(rawArgs);
  switch (flags._[0]) {
    case "new":
      return {
        kind: "new",
        generateWasmCache: flags["generate-wasm-cache"],
      };
    case "build":
    case undefined:
    case null:
      if (flags.check) {
        return {
          kind: "check",
          ...getCommonBuild(),
        };
      } else {
        return {
          kind: "build",
          ...getCommonBuild(),
        };
      }
    default:
      throw new Error(`Unrecognized sub command: ${flags._[0]}`);
  }

  function getCommonBuild(): CommonBuild {
    return {
      profile: flags.debug ? "debug" : "release",
      project: flags.p ?? flags.project,
      isSync: flags.sync ?? false,
      isOpt: !(flags["skip-opt"] ?? flags.debug == "debug"),
      outDir: flags.out ?? "./lib",
      bindingJsFileExt: flags["js-ext"] ?? `js`,
      cargoFlags: getCargoFlags(),
    };
  }

  function getCargoFlags() {
    const cargoFlags = [];

    if (flags["default-features"] === false) {
      cargoFlags.push("--no-default-features");
    }
    if (flags["features"]) {
      cargoFlags.push(`--features`);
      cargoFlags.push(flags["features"]);
    }
    if (flags["all-features"]) {
      cargoFlags.push("--all-features");
    }

    return cargoFlags;
  }
}
