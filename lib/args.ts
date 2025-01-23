// Copyright 2018-2025 the Deno authors. MIT license.

import { parseArgs as parseFlags } from "@std/cli/parse-args";

export type Command = NewCommand | BuildCommand | CheckCommand | HelpCommand;

export interface NewCommand {
  kind: "new";
}
export interface HelpCommand {
  kind: "help";
}

export interface CommonBuild {
  outDir: string;
  bindingJsFileExt: "js" | "mjs";
  profile: "debug" | "release";
  project: string | undefined;
  isOpt: boolean;
  inline: boolean;
  cargoFlags: string[];
}

export interface BuildCommand extends CommonBuild {
  kind: "build";
}

export interface CheckCommand extends CommonBuild {
  kind: "check";
}

export function parseArgs(rawArgs: string[]): Command {
  const flags = parseFlags(rawArgs, {
    "--": true,
  });
  if (flags.help || flags.h) return { kind: "help" };
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
    if (flags.sync) {
      throw new Error(
        "The --sync flag has been renamed to --inline.",
      );
    }
    if (flags["no-cache"]) {
      throw new Error(
        "The --no-cache flag is no longer necessary now that Wasmbuild supports Wasm imports.",
      );
    }

    return {
      profile: flags.debug ? "debug" : "release",
      project: flags.p ?? flags.project,
      inline: flags.inline,
      isOpt: !(flags["skip-opt"] ?? flags.debug == "debug"),
      outDir: flags.out ?? "./lib",
      bindingJsFileExt: getBindingJsFileExt(),
      cargoFlags: getCargoFlags(),
    };
  }

  function getBindingJsFileExt() {
    const ext: string = flags["js-ext"] ?? `js`;
    if (ext !== "js" && ext !== "mjs") {
      throw new Error("js-ext must be 'js' or 'mjs'");
    }
    return ext;
  }

  function getCargoFlags() {
    const cargoFlags = [];

    if (flags["no-default-features"]) {
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
