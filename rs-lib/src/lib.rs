
#[cfg(test)]
mod tests {
  // todo: temporary
  const TEST_WASM_BYTES: &[u8] = include_bytes!("../deno_test.wasm");

  #[test]
  fn it_works() {
    let result = 2 + 2;
    assert_eq!(result, 4);
  }
}
