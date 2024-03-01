// Copyright 2018-2024 the Deno authors. MIT license.

export const loaderText =
  'export async function cacheToLocalDir(url, decompress) {\n\
    const localPath = await getUrlLocalPath(url);\n\
    if (localPath == null) {\n\
        return undefined;\n\
    }\n\
    if (!await exists(localPath)) {\n\
        const fileBytes = decompress(new Uint8Array(await getUrlBytes(url)));\n\
        try {\n\
            await Deno.writeFile(localPath, fileBytes);\n\
        }\n\
        catch {\n\
            // ignore and return the wasm bytes\n\
            return fileBytes;\n\
        }\n\
    }\n\
    return toFileUrl(localPath);\n\
}\n\
async function getUrlLocalPath(url) {\n\
    try {\n\
        const dataDirPath = await getInitializedLocalDataDirPath();\n\
        const hash = await getUrlHash(url);\n\
        return `${dataDirPath}/${hash}.wasm`;\n\
    }\n\
    catch {\n\
        return undefined;\n\
    }\n\
}\n\
async function getInitializedLocalDataDirPath() {\n\
    const dataDir = localDataDir();\n\
    if (dataDir == null) {\n\
        throw new Error(`Could not find local data directory.`);\n\
    }\n\
    const dirPath = `${dataDir}/deno-wasmbuild`;\n\
    await ensureDir(dirPath);\n\
    return dirPath;\n\
}\n\
async function exists(filePath) {\n\
    try {\n\
        await Deno.lstat(filePath);\n\
        return true;\n\
    }\n\
    catch (error) {\n\
        if (error instanceof Deno.errors.NotFound) {\n\
            return false;\n\
        }\n\
        throw error;\n\
    }\n\
}\n\
async function ensureDir(dir) {\n\
    try {\n\
        const fileInfo = await Deno.lstat(dir);\n\
        if (!fileInfo.isDirectory) {\n\
            throw new Error(`Path was not a directory \'${dir}\'`);\n\
        }\n\
    }\n\
    catch (err) {\n\
        if (err instanceof Deno.errors.NotFound) {\n\
            // if dir not exists. then create it.\n\
            await Deno.mkdir(dir, { recursive: true });\n\
            return;\n\
        }\n\
        throw err;\n\
    }\n\
}\n\
async function getUrlHash(url) {\n\
    // Taken from MDN: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest\n\
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url.href));\n\
    // convert buffer to byte array\n\
    const hashArray = Array.from(new Uint8Array(hashBuffer));\n\
    // convert bytes to hex string\n\
    const hashHex = hashArray\n\
        .map((b) => b.toString(16).padStart(2, "0"))\n\
        .join("");\n\
    return hashHex;\n\
}\n\
async function getUrlBytes(url) {\n\
    const response = await fetchWithRetries(url);\n\
    return await response.arrayBuffer();\n\
}\n\
// the below is extracted from deno_std/path\n\
const WHITESPACE_ENCODINGS = {\n\
    "\\u0009": "%09",\n\
    "\\u000A": "%0A",\n\
    "\\u000B": "%0B",\n\
    "\\u000C": "%0C",\n\
    "\\u000D": "%0D",\n\
    "\\u0020": "%20",\n\
};\n\
function encodeWhitespace(string) {\n\
    return string.replaceAll(/[\\s]/g, (c) => {\n\
        return WHITESPACE_ENCODINGS[c] ?? c;\n\
    });\n\
}\n\
function toFileUrl(path) {\n\
    return Deno.build.os === "windows"\n\
        ? windowsToFileUrl(path)\n\
        : posixToFileUrl(path);\n\
}\n\
function posixToFileUrl(path) {\n\
    const url = new URL("file:///");\n\
    url.pathname = encodeWhitespace(path.replace(/%/g, "%25").replace(/\\\\/g, "%5C"));\n\
    return url;\n\
}\n\
function windowsToFileUrl(path) {\n\
    const [, hostname, pathname] = path.match(/^(?:[/\\\\]{2}([^/\\\\]+)(?=[/\\\\](?:[^/\\\\]|$)))?(.*)/);\n\
    const url = new URL("file:///");\n\
    url.pathname = encodeWhitespace(pathname.replace(/%/g, "%25"));\n\
    if (hostname != null && hostname != "localhost") {\n\
        url.hostname = hostname;\n\
        if (!url.hostname) {\n\
            throw new TypeError("Invalid hostname.");\n\
        }\n\
    }\n\
    return url;\n\
}\n\
export async function fetchWithRetries(url, maxRetries = 5) {\n\
    let sleepMs = 250;\n\
    let iterationCount = 0;\n\
    while (true) {\n\
        iterationCount++;\n\
        try {\n\
            const res = await fetch(url);\n\
            if (res.ok || iterationCount > maxRetries) {\n\
                return res;\n\
            }\n\
        }\n\
        catch (err) {\n\
            if (iterationCount > maxRetries) {\n\
                throw err;\n\
            }\n\
        }\n\
        console.warn(`Failed fetching. Retrying in ${sleepMs}ms...`);\n\
        await new Promise((resolve) => setTimeout(resolve, sleepMs));\n\
        sleepMs = Math.min(sleepMs * 2, 10000);\n\
    }\n\
}\n\
// MIT License - Copyright (c) justjavac.\n\
// https://github.com/justjavac/deno_dirs/blob/e8c001bbef558f08fd486d444af391729b0b8068/data_local_dir/mod.ts\n\
function localDataDir() {\n\
    switch (Deno.build.os) {\n\
        case "linux": {\n\
            const xdg = Deno.env.get("XDG_DATA_HOME");\n\
            if (xdg)\n\
                return xdg;\n\
            const home = Deno.env.get("HOME");\n\
            if (home)\n\
                return `${home}/.local/share`;\n\
            break;\n\
        }\n\
        case "darwin": {\n\
            const home = Deno.env.get("HOME");\n\
            if (home)\n\
                return `${home}/Library/Application Support`;\n\
            break;\n\
        }\n\
        case "windows":\n\
            return Deno.env.get("LOCALAPPDATA") ?? undefined;\n\
    }\n\
    return undefined;\n\
}\n\
  ';
