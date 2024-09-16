// Copyright 2018-2024 the Deno authors. MIT license.

import { UntarStream } from "@std/tar/untar-stream";
import { ensureDir } from "@std/fs/ensure_dir";
import * as colors from "@std/fmt/colors";
import * as path from "@std/path";
import { fetchWithRetries } from "./loader.ts";

const wasmOptFileName = Deno.build.os === "windows"
  ? "wasm-opt.exe"
  : "wasm-opt";
const tag = "version_109";

export async function runWasmOpt(filePath: string) {
  const binPath = await getWasmOptBinaryPath();
  const p = new Deno.Command(binPath, {
    args: ["-Oz", filePath, "-o", filePath],
    stderr: "inherit",
    stdout: "inherit",
  }).spawn();
  const output = await p.status;

  if (!output.success) {
    throw new Error(`error executing wasmopt`);
  }
}

async function getWasmOptBinaryPath() {
  const cacheDirPath = cacheDir();
  if (!cacheDirPath) {
    throw new Error("Could not find cache directory.");
  }
  const tempDirPath = path.join(cacheDirPath, "wasmbuild", tag);
  const wasmOptExePath = path.join(
    tempDirPath,
    `binaryen-${tag}/bin`,
    wasmOptFileName,
  );

  if (!(await fileExists(wasmOptExePath))) {
    await downloadBinaryen(tempDirPath);
    if (!(await fileExists(wasmOptExePath))) {
      throw new Error(
        `For some reason the wasm-opt executable did not exist after downloading at ${wasmOptExePath}.`,
      );
    }
  }

  return wasmOptExePath;
}

async function fileExists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return false;
    } else {
      throw err;
    }
  }
}

async function downloadBinaryen(tempPath: string) {
  console.log(
    `${colors.bold(colors.green("Downloading"))} wasm-opt binary...`,
  );

  const response = await fetchWithRetries(binaryenUrl());
  const entries = response.body!
    .pipeThrough(new DecompressionStream("gzip"))
    .pipeThrough(new UntarStream());

  for await (const entry of entries) {
    if (
      entry.path.endsWith(wasmOptFileName) ||
      entry.path.endsWith(".dylib")
    ) {
      const fileName = path.join(tempPath, entry.path);
      await ensureDir(path.dirname(fileName));
      const file = await Deno.open(fileName, {
        create: true,
        write: true,
        mode: 0o755,
      });
      await entry.readable?.pipeTo(file.writable);
    }
  }
}

function binaryenUrl() {
  function getOs() {
    switch (Deno.build.os) {
      case "linux":
        return "linux";
      case "darwin":
        return "macos";
      case "windows":
        return "windows";
      default:
        throw new Error("Unsupported OS");
    }
  }

  const os = getOs();
  const arch = {
    "x86_64": "x86_64",
    "aarch64": "arm64",
  }[Deno.build.arch];
  return new URL(
    `https://github.com/WebAssembly/binaryen/releases/download/${tag}/binaryen-${tag}-${arch}-${os}.tar.gz`,
  );
}

// MIT License - Copyright (c) justjavac.
// https://github.com/justjavac/deno_dirs/blob/e8c001bbef558f08fd486d444af391729b0b8068/cache_dir/mod.ts
function cacheDir(): string | undefined {
  switch (Deno.build.os) {
    case "linux": {
      const xdg = Deno.env.get("XDG_CACHE_HOME");
      if (xdg) return xdg;

      const home = Deno.env.get("HOME");
      if (home) return `${home}/.cache`;
      break;
    }

    case "darwin": {
      const home = Deno.env.get("HOME");
      if (home) return `${home}/Library/Caches`;
      break;
    }

    case "windows":
      return Deno.env.get("LOCALAPPDATA") ?? undefined;
  }

  return undefined;
}
