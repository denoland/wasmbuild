// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
import {
  Buffer,
  cacheDir,
  colors,
  copy,
  ensureDir,
  gunzip,
  path,
  Untar,
} from "./deps.ts";

const wasmOptFileName = Deno.build.os === "windows"
  ? "wasm-opt.exe"
  : "wasm-opt";
const tag = "version_109";

export async function runWasmOpt(filePath: string) {
  const binPath = await getWasmOptBinaryPath();
  const optimizedPath = filePath + ".temp";
  const p = Deno.run({
    cmd: [binPath, "-Oz", filePath, "-o", optimizedPath],
    stderr: "inherit",
    stdout: "inherit",
  });
  const status = await p.status();
  p.close();

  if (!status.success) {
    throw new Error(`error executing wasmopt`);
  }

  await Deno.rename(optimizedPath, filePath);
}

async function getWasmOptBinaryPath() {
  const cacheDirPath = cacheDir();
  if (!cacheDirPath) {
    throw new Error("Could not find cache directory.");
  }
  const tempDirPath = path.join(cacheDirPath, "wasmbuild", tag);
  const wasmOptExePath = path.join(
    tempDirPath,
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
    `${colors.bold(colors.green("Caching"))} wasm-opt binary...`,
  );

  const response = await fetch(binaryenUrl());
  if (!response.ok) {
    throw new Error(`Error downloading wasmopt: ${response.statusText}`);
  }
  const buf = new Uint8Array(await response.arrayBuffer());
  const decompressed = gunzip(buf);
  const untar = new Untar(new Buffer(decompressed));

  for await (const entry of untar) {
    if (
      entry.fileName.endsWith(wasmOptFileName) ||
      entry.fileName.endsWith(".dylib")
    ) {
      const fileName = path.join(tempPath, path.basename(entry.fileName));
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
  const target = {
    "linux": "x86_64-linux",
    "darwin": "x86_64-macos",
    "windows": "x86_64-windows",
  }[Deno.build.os];
  return new URL(
    `https://github.com/WebAssembly/binaryen/releases/download/${tag}/binaryen-${tag}-${target}.tar.gz`,
  );
}
