// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.

import { parseFlags } from "./deps.ts";

export type Command = NewCommand | BuildCommand | CheckCommand;

export interface NewCommand {
  kind: "new";
}

export type LoaderKind = "sync" | "async" | "async-with-cache";

export interface CommonBuild {
  outDir: string;
  bindingJsFileExt: string;
  profile: "debug" | "release";
  project: string | undefined;
  loaderKind: LoaderKind;
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
  const flags = parseFlags(rawArgs, { "--": true });
  switch (flags._[0]) {
    case "new":
      return {
        kind: "new",
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
      loaderKind: flags.sync
        ? "sync"
        : flags["no-cache"]
        ? "async"
        : "async-with-cache",
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
    if (flags["--"]) {
      cargoFlags.push(...flags["--"]);
    }

    return cargoFlags;
  }
}
