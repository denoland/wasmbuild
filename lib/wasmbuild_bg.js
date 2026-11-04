// @generated file from wasmbuild -- do not edit
// @ts-nocheck: generated
// deno-lint-ignore-file
// deno-fmt-ignore-file

/**
 * @param {string} name
 * @param {string} ext
 * @param {Uint8Array | number[]} wasm_bytes
 * @returns {any}
 */
export function generate_bindgen(name, ext, wasm_bytes) {
  let ptr0, len0, ptr1, len1, ptr2, len2;
  try {
    ptr0 = passStringToWasm0(
      name,
      wasm.__wbindgen_malloc,
      wasm.__wbindgen_realloc,
    );
    len0 = WASM_VECTOR_LEN;
    ptr1 = passStringToWasm0(
      ext,
      wasm.__wbindgen_malloc,
      wasm.__wbindgen_realloc,
    );
    len1 = WASM_VECTOR_LEN;
    ptr2 = passArray8ToWasm0(wasm_bytes, wasm.__wbindgen_malloc);
    len2 = WASM_VECTOR_LEN;
  } catch (e) {
    if (ptr2) wasm.__wbindgen_free(ptr2, len2 * 1, 1);
    if (ptr1) wasm.__wbindgen_free(ptr1, len1 * 1, 1);
    if (ptr0) wasm.__wbindgen_free(ptr0, len0 * 1, 1);
    throw e;
  }
  const ret = wasm.generate_bindgen(ptr0, len0, ptr1, len1, ptr2, len2);
  if (ret[2]) {
    throw takeFromExternrefTable0(ret[1]);
  }
  return takeFromExternrefTable0(ret[0]);
}
export function __wbg_Error_208446807d0d1e30(arg0, arg1) {
  const ret = Error(getStringFromWasm0(arg0, arg1));
  return ret;
}
export function __wbg_String_8564e559799eccda(arg0, arg1) {
  const ret = String(arg1);
  const ptr1 = passStringToWasm0(
    ret,
    wasm.__wbindgen_malloc,
    wasm.__wbindgen_realloc,
  );
  const len1 = WASM_VECTOR_LEN;
  getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
  getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
}
export function __wbg___wbindgen_is_string_fc456fee5d3317de(arg0) {
  const ret = typeof arg0 === "string";
  return ret;
}
export function __wbg___wbindgen_throw_4c88d8bf264fd984(arg0, arg1) {
  throw new Error(getStringFromWasm0(arg0, arg1));
}
export function __wbg_new_37eb45aaf5eeb820() {
  const ret = new Array();
  return ret;
}
export function __wbg_new_7075786089b89c5e() {
  const ret = new Map();
  return ret;
}
export function __wbg_new_787b9fb330d55d78(arg0, arg1) {
  const ret = new Error(getStringFromWasm0(arg0, arg1));
  return ret;
}
export function __wbg_new_cd4348290afae586() {
  const ret = new Object();
  return ret;
}
export function __wbg_set_8282f7e0d2d01336(arg0, arg1, arg2) {
  const ret = arg0.set(arg1, arg2);
  return ret;
}
export function __wbg_set_d2d33b52458e984a(arg0, arg1, arg2) {
  arg0[arg1 >>> 0] = arg2;
}
export function __wbg_set_e4b9a833d288759a(arg0, arg1, arg2) {
  arg0[arg1] = arg2;
}
export function __wbindgen_generic_0000000000000001(arg0) {
  // Cast intrinsic for `F64 -> Externref`.
  const ret = arg0;
  return ret;
}
export function __wbindgen_generic_0000000000000002(arg0, arg1) {
  // Cast intrinsic for `Ref(String) -> Externref`.
  const ret = getStringFromWasm0(arg0, arg1);
  return ret;
}
export function __wbindgen_init_externref_table() {
  const table = wasm.__wbindgen_externrefs;
  table.set(0, undefined);
  table.set(1024, undefined);
  table.set(1025, null);
  table.set(1026, true);
  table.set(1027, false);
}
let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
  if (
    cachedDataViewMemory0 === null ||
    cachedDataViewMemory0.buffer.detached === true ||
    (cachedDataViewMemory0.buffer.detached === undefined &&
      cachedDataViewMemory0.buffer !== wasm.memory.buffer)
  ) {
    cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
  }
  return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
  ptr = ptr >>> 0;
  return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
  if (
    cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0
  ) {
    cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory0;
}

function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1, 1) >>> 0;
  getUint8ArrayMemory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === undefined) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr = malloc(buf.length, 1) >>> 0;
    getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr;
  }

  let len = arg.length;
  let ptr = malloc(len, 1) >>> 0;

  const mem = getUint8ArrayMemory0();

  let offset = 0;

  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 0x7F) break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
    const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
    const ret = cachedTextEncoder.encodeInto(arg, view);

    offset += ret.written;
    ptr = realloc(ptr, len, offset, 1) >>> 0;
  }

  WASM_VECTOR_LEN = offset;
  return ptr;
}

function takeFromExternrefTable0(idx) {
  const value = wasm.__wbindgen_externrefs.get(idx);
  wasm.__externref_table_dealloc(idx);
  return value;
}

let cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(bytes) {
  numBytesDecoded += bytes.length;
  if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
    cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
    cachedTextDecoder.decode();
    numBytesDecoded = bytes.length;
  }
  return cachedTextDecoder.decode(bytes);
}

const cachedTextEncoder = new TextEncoder();

if (!("encodeInto" in cachedTextEncoder)) {
  cachedTextEncoder.encodeInto = function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
      read: arg.length,
      written: buf.length,
    };
  };
}

let WASM_VECTOR_LEN = 0;

let wasm;
export function __wbg_set_wasm(val) {
  wasm = val;
}
