use anyhow::Result;
use wasm_bindgen::prelude::*;

#[derive(serde::Serialize)]
pub struct Output {
  pub js: String,
  pub wasm_bytes: Vec<u8>,
}

#[wasm_bindgen]
pub fn generate_bindgen(
  name: &str,
  wasm_bytes: &[u8],
) -> Result<JsValue, JsValue> {
  let output = inner(name, wasm_bytes)
    .map_err(|err| JsValue::from(js_sys::Error::new(&err.to_string())))?;
  let output = JsValue::from_serde(&output)
    .map_err(|err| JsValue::from(js_sys::Error::new(&err.to_string())))?;
  Ok(output)
}

fn inner(name: &str, wasm_bytes: &[u8]) -> Result<Output> {
  let mut x = wasm_bindgen_cli_support::Bindgen::new()
    .deno(true)?
    .weak_refs(true)
    .input_module(name, walrus::Module::from_buffer(wasm_bytes)?)
    .generate_output()?;

  Ok(Output {
    js: x.js().to_string(),
    wasm_bytes: x.wasm_mut().emit_wasm(),
  })
}
