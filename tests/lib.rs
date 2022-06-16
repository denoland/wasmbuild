use wasm_bindgen::prelude::*;

#[wasm_bindgen(module = "/add.js")]
extern "C" {
  fn add(a: u32, b: u32) -> u32;
}

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
  let result = add(1, 2);
  format!("Hello, {}! Result: {}", name, result)
}
