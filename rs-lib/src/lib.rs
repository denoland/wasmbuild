use wasm_bindgen::prelude::*;
use anyhow::Result;

#[derive(serde::Serialize)]
pub struct Output {
  pub js: String,
  pub wasm: Vec<u8>,
}

#[wasm_bindgen]
pub fn bindgen(wasm: &[u8]) -> Result<JsValue, JsValue> {
  let output = inner(wasm).map_err(|err| JsValue::from(js_sys::Error::new(&err.to_string())))?;
  let output = JsValue::from_serde(&output).map_err(|err| JsValue::from(js_sys::Error::new(&err.to_string())))?;
  Ok(output)
}

fn inner(wasm: &[u8]) -> Result<Output> {
  let mut x = wasm_bindgen_cli_support::Bindgen::new()
    .deno(true)?
    .weak_refs(true)
    .input_module("foo", walrus::Module::from_buffer(wasm)?)
    .generate_output()?;

  Ok(Output {
    js: x.js().to_string(),
    wasm: x.wasm_mut().emit_wasm(),
  })
}

#[cfg(test)]
mod tests {
  use crate::bindgen;

  // todo: temporary
  const TEST_WASM_BYTES: &[u8] = include_bytes!("../deno_test.wasm");

  #[test]
  fn it_works() {
  }
}
