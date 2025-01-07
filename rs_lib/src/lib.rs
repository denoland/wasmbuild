use std::collections::HashMap;

use anyhow::Result;
use wasm_bindgen::prelude::*;

// uncomment for debugging
// #[wasm_bindgen]
// extern "C" {
//     #[wasm_bindgen(js_namespace = console)]
//     fn log(s: &str);
// }

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BindgenTextFileOutput {
  pub name: String,
  pub text: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BindgenBytesFileOutput {
  pub name: String,
  pub bytes: Vec<u8>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
  pub js: BindgenTextFileOutput,
  pub js_bg: BindgenTextFileOutput,
  pub ts: Option<BindgenTextFileOutput>,
  pub snippets: HashMap<String, Vec<String>>,
  pub local_modules: HashMap<String, String>,
  pub wasm: BindgenBytesFileOutput,
}

#[wasm_bindgen]
pub fn generate_bindgen(
  name: &str,
  ext: &str,
  wasm_bytes: Vec<u8>,
) -> Result<JsValue, JsValue> {
  let output = inner(name, ext, wasm_bytes)
    .map_err(|err| JsValue::from(js_sys::Error::new(&err.to_string())))?;
  let output = serde_wasm_bindgen::to_value(&output)
    .map_err(|err| JsValue::from(js_sys::Error::new(&err.to_string())))?;
  Ok(output)
}

fn inner(name: &str, ext: &str, wasm_bytes: Vec<u8>) -> Result<Output> {
  let mut x = wasm_bindgen_cli_support::Bindgen::new()
    .bundler(true)?
    .typescript(true)
    .input_bytes(name, wasm_bytes)
    .generate_output()?;

  let searching_module = format!("./{}_bg.js", name);
  let wasm_mut = x.wasm_mut();
  for import in wasm_mut.imports.iter_mut() {
    if import.module == searching_module {
      import.module = format!("./{name}.internal.{ext}");
    }
  }

  Ok(Output {
    js: BindgenTextFileOutput {
      name: format!("{}.{}", name, ext),
      text: format!("import * as wasm from \"./{name}.wasm\";
export * from \"./{name}.internal.{ext}\";
import {{ __wbg_set_wasm }} from \"./{name}.internal.{ext}\";
__wbg_set_wasm(wasm);
"),
    },
    js_bg: BindgenTextFileOutput {
      name: format!("{}.internal.{}", name, ext),
      text: x.js().to_string(),
    },
    ts: x.ts().map(|t| BindgenTextFileOutput {
      name: format!("{}.d.{}", name, ext),
      text: t.to_string()
    }),
    snippets: x.snippets().clone(),
    local_modules: x.local_modules().clone(),
    wasm: BindgenBytesFileOutput {
      name: format!("{}.wasm", name),
      bytes: x.wasm_mut().emit_wasm(),
    }
  })
}
