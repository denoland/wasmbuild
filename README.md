# wasmbuild

A build tool to generate wasm-bindgen glue code for Deno and the Browser.

## Setup

Add a build task to the _deno.json_ file in your project:

```json
{
  "tasks": {
    "build": "deno run --unstable -A https://deno.land/x/wasmbuild@VERSION_GOES_HERE/main.ts"
  }
}
```

## Usage

Now invoke `deno task build` in your project's root.

```bash
$ deno task build
```

Bindings will be generated at `./lib/<crate-name>.generated.js`. Import the
`instantiate` function and call it asynchronously to get the exports:

```ts
import { instantiate } from "./lib/deno_test.generated.js";

const { greet } = await instantiate();
greet("Deno");
```

Or instantiate and use the exports:

```ts
import { greet, instantiate } from "./lib/deno_test.generated.js";

await instantiate();
greet("Deno");
```

### CLI Flags

- `--debug` - Build without optimizations.
- `--project <crate_name>` / `-p <crate_name>` - Specifies the crate to build
  when using a Cargo workspace.
- `--out <dir_path>` - Specifies the output directory. Defaults to `./lib`
- `--js-ext <ext_no_period>` - Extension to use for the wasm-bindgen JS file.
  Defaults to `js`.
- `--all-features` - Build the crate with all features.
- `--no-default-features` - Build the crate with no default features.
- `--features` - Specify the features to create. Specify multiple features
  quoted and with spaces (ex. `--features "wasm serialization"`).
- `--sync` - Generate a synchronous module that stores the Wasm module inline as
  base64 text.
- `--check` - Checks to ensure the output is up to date.
  - This is useful to run on the CI in order to ensure the wasmbuild output is
    up to date.
- `--skip-opt` - Skip running wasm-opt.
