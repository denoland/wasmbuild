use std::sync::Mutex;

use wasm_bindgen::prelude::*;

static VALUE: Mutex<u32> = Mutex::new(0);

#[wasm_bindgen(module = "/add.js")]
extern "C" {
  fn add(a: u32, b: u32) -> u32;
}

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
  let result = add(1, 2) + *VALUE.lock().unwrap();
  format!("Hello, {}! Result: {}", name, result)
}

#[cfg(feature = "start")]
#[wasm_bindgen(start)]
pub fn main_js() {
  *VALUE.lock().unwrap() = 1;
}
