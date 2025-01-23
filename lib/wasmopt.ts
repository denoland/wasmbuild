// Copyright 2018-2025 the Deno authors. MIT license.

import { UntarStream } from "@std/tar/untar-stream";
import { ensureDir } from "@std/fs/ensure-dir";
import * as colors from "@std/fmt/colors";
import * as path from "@std/path";
import { createTempFileSync } from "@david/temp";

const wasmOptFileName = Deno.build.os === "windows"
  ? "wasm-opt.exe"
  : "wasm-opt";
const tag = "version_121";

export async function runWasmOpt(fileBytes: Uint8Array) {
  const binPath = await getWasmOptBinaryPath();
  using outputTempFile = createTempFileSync();
  using inputTempFile = createTempFileSync();
  inputTempFile.writeSync(fileBytes);
  const p = new Deno.Command(binPath, {
    args: ["-Oz", inputTempFile.toString(), "-o", outputTempFile.toString()],
    stdin: "inherit",
    stderr: "inherit",
    stdout: "inherit",
  }).spawn();

  const status = await p.status;

  if (!status.success) {
    throw new Error(`error executing wasmopt`);
  }
  return outputTempFile.readBytesSync();
}

async function fetchWithRetries(url: URL | string, maxRetries = 5) {
  let sleepMs = 250;
  let iterationCount = 0;
  while (true) {
    iterationCount++;
    try {
      const res = await fetch(url);
      if (res.ok || iterationCount > maxRetries) {
        return res;
      }
    } catch (err) {
      if (iterationCount > maxRetries) {
        throw err;
      }
    }
    console.warn(`Failed fetching. Retrying in ${sleepMs}ms...`);
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
    sleepMs = Math.min(sleepMs * 2, 10_000);
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
      using file = await Deno.open(fileName, {
        create: true,
        write: true,
        mode: 0o755,
      });
      await entry.readable?.pipeTo(file.writable);
    } else {
      await entry.readable?.cancel();
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
