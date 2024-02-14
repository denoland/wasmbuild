use std::collections::HashMap;

use anyhow::Result;
use wasm_bindgen::prelude::*;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
  pub js: String,
  pub snippets: HashMap<String, Vec<String>>,
  pub local_modules: HashMap<String, String>,
  pub wasm_bytes: Vec<u8>,
}

#[wasm_bindgen]
pub fn generate_bindgen(
  name: &str,
  wasm_bytes: Vec<u8>,
) -> Result<JsValue, JsValue> {
  let output = inner(name, wasm_bytes)
    .map_err(|err| JsValue::from(js_sys::Error::new(&err.to_string())))?;
  let output = serde_wasm_bindgen::to_value(&output)
    .map_err(|err| JsValue::from(js_sys::Error::new(&err.to_string())))?;
  Ok(output)
}

fn inner(name: &str, wasm_bytes: Vec<u8>) -> Result<Output> {
  let mut x = wasm_bindgen_cli_support::Bindgen::new()
    .deno(true)?
    // .reference_types(true)
    .input_bytes(name, wasm_bytes)
    .generate_output()?;

  Ok(Output {
    js: x.js().to_string(),
    snippets: x.snippets().clone(),
    local_modules: x.local_modules().clone(),
    wasm_bytes: x.wasm_mut().emit_wasm(),
  })
}
