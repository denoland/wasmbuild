// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.

import { expandGlob, path, Sha1 } from "./deps.ts";

export interface CargoMetadata {
  packages: CargoPackageMetadata[];
  /** Identifiers in the `packages` array of the workspace members. */
  "workspace_members": string[];
  /** The absolute workspace root directory path. */
  "workspace_root": string;
  /** Path to the target directory. */
  "target_directory": string;
  resolve: {
    nodes: {
      id: string;
      dependencies: string[];
    }[];
  };
}

export interface CargoPackageMetadata {
  id: string;
  name: string;
  version: string;
  dependencies: CargoDependencyMetadata[];
  targets?: CargoPackageTarget[];
  /** Path to Cargo.toml */
  "manifest_path": string;
}

export interface CargoDependencyMetadata {
  name: string;
  /** Version requrement (ex. ^0.1.0) */
  req: string;
}

export interface CargoPackageTarget {
  kind: string[];
  name: string;
  crate_types?: string[];
}

export async function getCargoWorkspace(
  directory: string,
  cargoFlags: string[],
) {
  const p = new Deno.Command("cargo", {
    cwd: directory,
    args: ["metadata", "--format-version", "1", ...cargoFlags],
    stdout: "piped",
  });
  const output = await p.output();
  if (!output.success) {
    throw new Error("Error retrieving cargo metadata.");
  }
  const result = new TextDecoder().decode(output.stdout);
  return new CargoWorkspace(JSON.parse(result!) as CargoMetadata);
}

export class CargoWorkspace {
  constructor(public readonly metadata: CargoMetadata) {
  }

  getWasmCrate(filterName?: string | undefined) {
    const wasmCrates = this.getWasmCrates();
    if (filterName) {
      const wasmCrate = wasmCrates.find((c) => c.name === filterName);
      if (wasmCrate == null) {
        const pkg = this.metadata.packages.find((p) => p.name === filterName);
        if (pkg == null) {
          throw new Error(`Could not find crate with name '${filterName}'.`);
        } else {
          throw new Error(`Crate ${filterName} was not a cdylib crate.`);
        }
      }
      return wasmCrate;
    }
    if (wasmCrates.length === 0) {
      throw new Error("Could not find a cdylib crate in the workspace.");
    } else if (wasmCrates.length > 1) {
      throw new Error(
        "There were multiple cdylib crates in the repo. " +
          "Please select one by providing the '-p <crate-name>' cli flag.\n\n" +
          wasmCrates.map((p) => ` * ${p.name}`).join("\n"),
      );
    } else {
      return wasmCrates[0];
    }
  }

  getWasmCrates() {
    const crates: WasmCrate[] = [];
    for (const pkg of this.getWorkspacePackages()) {
      const wasmLibName = getWasmLibName(pkg);
      if (wasmLibName != null) {
        crates.push(
          new WasmCrate({
            metadata: this.metadata,
            pkg,
            libName: wasmLibName,
          }),
        );
      }
    }
    return crates;
  }

  getWorkspacePackages() {
    const pkgs: CargoPackageMetadata[] = [];
    for (const memberId of this.metadata.workspace_members) {
      const pkg = this.metadata.packages.find((pkg) => pkg.id === memberId);
      if (!pkg) {
        throw new Error(`Could not find package with id ${memberId}`);
      }
      pkgs.push(pkg);
    }
    return pkgs;
  }
}

export class WasmCrate {
  #metadata: CargoMetadata;
  #pkg: CargoPackageMetadata;

  libName: string;

  constructor(opts: {
    metadata: CargoMetadata;
    pkg: CargoPackageMetadata;
    libName: string;
  }) {
    this.#pkg = opts.pkg;
    this.#metadata = opts.metadata;
    this.libName = opts.libName;
  }

  get name() {
    return this.#pkg.name;
  }

  getDependencyVersion(name: string) {
    const node = this.#metadata.resolve.nodes
      .find((n) => n.id === this.#pkg.id);
    for (const depId of node?.dependencies ?? []) {
      const pkg = this.#metadata.packages.find((pkg) => pkg.id === depId);
      if (pkg?.name === name) {
        return pkg.version;
      }
    }
    return undefined;
  }

  get rootFolder() {
    return path.dirname(this.#pkg.manifest_path);
  }

  async getSourcesHash() {
    // simple for now...
    const paths = await this.#getSourcePaths();
    paths.sort();
    const hasher = new Sha1();
    for (const path of paths) {
      const fileText = await Deno.readTextFile(path);
      // standardize file paths so this is not subject to
      // however git is configured to checkout files
      hasher.update(fileText.replace(/\r?\n/g, "\n"));
    }
    return hasher.hex();
  }

  async #getSourcePaths() {
    const paths = [];
    for await (
      const entry of expandGlob("**/{*.rs,Cargo.toml}", {
        root: this.rootFolder,
        exclude: ["./target"],
      })
    ) {
      if (entry.isFile) {
        paths.push(entry.path);
      }
    }
    return paths;
  }
}

function getWasmLibName(pkg: CargoPackageMetadata) {
  // [lib]
  // name = "deno_wasm"
  // crate-type = ["cdylib"]
  const wasmlib = pkg.targets?.find((p) =>
    p.kind.includes("cdylib") && p.crate_types?.includes("cdylib")
  );
  // Hyphens are not allowed in crate names https://doc.rust-lang.org/reference/items/extern-crates.html
  return wasmlib?.name?.replaceAll("-", "_");
}
