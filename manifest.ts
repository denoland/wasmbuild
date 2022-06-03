// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.

export interface CargoMetadata {
  packages: CargoPackageMetadata[];
  /** Identifiers in the `packages` array of the workspace members. */
  "workspace_members": string[];
  /** The absolute workspace root directory path. */
  "workspace_root": string;
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
  const p = Deno.run({
    cwd: directory,
    cmd: ["cargo", "metadata", "--format-version", "1", ...cargoFlags],
    stdout: "piped",
  });
  const [status, output] = await Promise.all([p.status(), p.output()]);
  if (!status.success) {
    throw new Error("Error retrieving cargo metadata.");
  }
  const result = new TextDecoder().decode(output);
  return new CargoWorkspace(JSON.parse(result!) as CargoMetadata);
}

export interface WasmCrate {
  name: string;
  libName: string;
  wasmBindgenVersion: string | undefined;
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
        crates.push({
          name: pkg.name,
          libName: wasmLibName,
          wasmBindgenVersion: getWasmBindgenVersion(pkg, this.metadata),
        });
      }
    }
    return crates;

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

    function getWasmBindgenVersion(
      pkg: CargoPackageMetadata,
      metadata: CargoMetadata,
    ) {
      const wasmBindgenReq = metadata.resolve.nodes
        .find((n) => n.id === pkg.id);
      for (const depId of wasmBindgenReq?.dependencies ?? []) {
        const pkg = metadata.packages.find((pkg) => pkg.id === depId);
        if (pkg?.name === "wasm-bindgen") {
          return pkg.version;
        }
      }
      return undefined;
    }
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
