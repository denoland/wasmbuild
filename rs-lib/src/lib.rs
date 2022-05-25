fn bindgen(wasm: &[u8]) -> Result<String, anyhow::Error> {
  let x = wasm_bindgen_cli_support::Bindgen::new()
    .deno(true)?
    .weak_refs(true)
    .input_module("foo", walrus::Module::from_buffer(wasm)?)
    .generate_output()?;

  println!("{}", x.js());

  Ok(x.js().to_string())
}


#[cfg(test)]
mod tests {
  use crate::bindgen;

  // todo: temporary
  const TEST_WASM_BYTES: &[u8] = include_bytes!("../deno_test.wasm");

  #[test]
  fn it_works() {
    std::fs::write("test.js", bindgen(TEST_WASM_BYTES).unwrap()).unwrap();
  }
}
