// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
import { Buffer } from "@std/io/buffer";
import { Untar } from "@std/archive/untar";
import { copy } from "@std/io/copy";
import { ensureDir } from "@std/fs/ensure_dir";
import { toArrayBuffer } from "@std/streams";
import * as colors from "@std/fmt/colors";
import * as path from "@std/path";
import { fetchWithRetries } from "../loader/fetch.ts";
import { cacheDir} from "./vendor/data_dir.ts";

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
  const ds = new DecompressionStream("gzip")
  const decompressed = response.body!.pipeThrough(ds);
  const untar = new Untar(new Buffer(await toArrayBuffer(decompressed)));

  for await (const entry of untar) {
    if (
      entry.fileName.endsWith(wasmOptFileName) ||
      entry.fileName.endsWith(".dylib")
    ) {
      const fileName = path.join(tempPath, entry.fileName);
      await ensureDir(path.dirname(fileName));
      const file = await Deno.open(fileName, {
        create: true,
        write: true,
        mode: 0o755,
      });
      try {
        await copy(entry, file);
      } finally {
        file.close();
      }
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
