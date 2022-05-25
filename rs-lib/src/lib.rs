use anyhow::Result;
use wasm_bindgen::prelude::*;

#[derive(serde::Serialize)]
pub struct Output {
  pub js: String,
  pub wasm: Vec<u8>,
}

#[wasm_bindgen]
pub fn generate_bindgen(wasm: &[u8]) -> Result<JsValue, JsValue> {
  let output = inner(wasm)
    .map_err(|err| JsValue::from(js_sys::Error::new(&err.to_string())))?;
  let output = JsValue::from_serde(&output)
    .map_err(|err| JsValue::from(js_sys::Error::new(&err.to_string())))?;
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
