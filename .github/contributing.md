# Contributing

Setup:

1. Install [Deno](https://deno.com/).
1. Install [Rust](https://www.rust-lang.org/).
1. Run `deno task build`

## Upgrading wasm-bindgen version

1. Upgrade the versions in the Cargo.toml files
1. Upgrade the versions in `lib/versions.ts` to match.
1. Run `cargo install -f wasm-bindgen-cli` to get the latest wasm-bindgen-cli
   version.
   - See https://github.com/denoland/wasmbuild/issues/51 for why this is
     necessary
1. Finally run `deno task build:bindgen-upgrade` which will build itself using
   wasm-bindgen-cli instead of the Wasm file.
