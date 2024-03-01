// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// @ts-check

/**
 * @param {URL} url
 * @param {(bytes: Uint8Array) => Uint8Array} decompress
 * @returns {Promise<URL | Uint8Array | undefined>}
*/
export async function cacheToLocalDir(url, decompress) {
  const localPath = await getUrlLocalPath(url);
  if (localPath == null) {
    return undefined;
  }
  if (!await exists(localPath)) {
    const fileBytes = decompress(new Uint8Array(await getUrlBytes(url)));
    try {
      await Deno.writeFile(localPath, fileBytes);
    } catch {
      // ignore and return the wasm bytes
      return fileBytes;
    }
  }
  return toFileUrl(localPath);
}

/** 
 * @param {URL} url
 * @returns {Promise<string | undefined>}
*/
async function getUrlLocalPath(url) {
  try {
    const dataDirPath = await getInitializedLocalDataDirPath();
    const hash = await getUrlHash(url);
    return `${dataDirPath}/${hash}.wasm`;
  } catch {
    return undefined;
  }
}

/**
 * @returns {Promise<string>}
 */
async function getInitializedLocalDataDirPath() {
  const dataDir = localDataDir();
  if (dataDir == null) {
    throw new Error(`Could not find local data directory.`);
  }
  const dirPath = `${dataDir}/deno-wasmbuild`;
  await ensureDir(dirPath);
  return dirPath;
}

/**
 * 
 * @param {string | URL} filePath 
 * @returns {Promise<boolean>}
 */
async function exists(filePath) {
  try {
    await Deno.lstat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
}

/** @param {string} dir */
async function ensureDir(dir) {
  try {
    const fileInfo = await Deno.lstat(dir);
    if (!fileInfo.isDirectory) {
      throw new Error(`Path was not a directory '${dir}'`);
    }
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      // if dir not exists. then create it.
      await Deno.mkdir(dir, { recursive: true });
      return;
    }
    throw err;
  }
}

/**
 * @param {URL} url
 * @returns {Promise<string>}
 */
async function getUrlHash(url) {
  // Taken from MDN: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url.href),
  );
  // convert buffer to byte array
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // convert bytes to hex string
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

/**
 * @param {URL} url
 * @returns {Promise<ArrayBuffer>}
 */
async function getUrlBytes(url) {
  const response = await fetchWithRetries(url);
  return await response.arrayBuffer();
}

// the below is extracted from deno_std/path

/** @type {Record<string, string>} */
const WHITESPACE_ENCODINGS = {
  "\u0009": "%09",
  "\u000A": "%0A",
  "\u000B": "%0B",
  "\u000C": "%0C",
  "\u000D": "%0D",
  "\u0020": "%20",
};

/**
 * @param {string} string
 * @returns {string}
*/
function encodeWhitespace(string) {
  return string.replaceAll(/[\s]/g, (c) => {
    return WHITESPACE_ENCODINGS[c] ?? c;
  });
}

/**
 * @param {string} path
 * @returns {URL}
*/
function toFileUrl(path) {
  return Deno.build.os === "windows"
    ? windowsToFileUrl(path)
    : posixToFileUrl(path);
}

/**
 * @param {string} path
 * @returns {URL}
*/
function posixToFileUrl(path) {
  const url = new URL("file:///");
  url.pathname = encodeWhitespace(
    path.replace(/%/g, "%25").replace(/\\/g, "%5C"),
  );
  return url;
}

/**
 * @param {string} path
 * @returns {URL}
*/
function windowsToFileUrl(path) {
  const matchValue = path.match(
    /^(?:[/\\]{2}([^/\\]+)(?=[/\\](?:[^/\\]|$)))?(.*)/,
  )
  if (matchValue == null) {
    throw new Error("Invalid path: " + path);
  }
  const [, hostname, pathname] = matchValue;
  const url = new URL("file:///");
  url.pathname = encodeWhitespace(pathname.replace(/%/g, "%25"));
  if (hostname != null && hostname != "localhost") {
    url.hostname = hostname;
    if (!url.hostname) {
      throw new TypeError("Invalid hostname.");
    }
  }
  return url;
}

/**
 * @param {URL | string} url
 * @returns {Promise<Response>}
*/
export async function fetchWithRetries(url, maxRetries = 5) {
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

// MIT License - Copyright (c) justjavac.
// https://github.com/justjavac/deno_dirs/blob/e8c001bbef558f08fd486d444af391729b0b8068/data_local_dir/mod.ts
/** @returns {string | undefined} */
function localDataDir() {
  switch (Deno.build.os) {
    case "linux": {
      const xdg = Deno.env.get("XDG_DATA_HOME");
      if (xdg) return xdg;

      const home = Deno.env.get("HOME");
      if (home) return `${home}/.local/share`;
      break;
    }

    case "darwin": {
      const home = Deno.env.get("HOME");
      if (home) return `${home}/Library/Application Support`;
      break;
    }

    case "windows":
      return Deno.env.get("LOCALAPPDATA") ?? undefined;
  }

  return undefined;
}
