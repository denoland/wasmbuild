import * as fs from "https://deno.land/std@0.170.0/fs/mod.ts";
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import { default as localDataDir } from "https://deno.land/x/dir@1.5.1/data_local_dir/mod.ts";
import { instantiate } from "./lib/rs_lib.generated.js";

export async function instantiateWithCaching() {
  let url = new URL("./lib/rs_lib_bg.wasm", import.meta.url);
  if (url.protocol !== "file:") {
    url = (await cacheLocalDir(url)) ?? url;
  }
  return await instantiate({ url });
}

async function cacheLocalDir(url: URL) {
  const localPath = await getUrlLocalPath(url);
  if (localPath == null) {
    return undefined;
  }
  if (!await fs.exists(localPath)) {
    const fileBytes = await getUrlBytes(url);
    await Deno.writeFile(localPath, new Uint8Array(fileBytes));
  }
  return path.toFileUrl(localPath);
}

async function getUrlLocalPath(url: URL) {
  try {
    const dataDirPath = await getInitializedLocalDataDirPath();
    const hash = getUrlHash(url);
    return path.join(dataDirPath, hash + ".wasm");
  } catch {
    return undefined;
  }
}

async function getInitializedLocalDataDirPath() {
  const dataDir = localDataDir();
  if (dataDir == null) {
    throw new Error(`Could not find local data directory.`);
  }
  const dirPath = path.join(dataDir, "deno-wasmbuild");
  await fs.ensureDir(dirPath);
  return dirPath;
}

async function getUrlHash(url: URL) {
  // Taken from MDN: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url.href),
  );
  // convert buffer to byte array
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // convert bytes to hex string
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return hashHex;
}

async function getUrlBytes(url: URL) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error downloading ${url}: ${response.statusText}`);
  }
  return await response.arrayBuffer();
}
