# wasmbuild

A tiny build tool to generate wasm-bindgen glue for Deno.

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

Bindings will be generated at `./lib/<crate-name>.generated.js`:

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
- `--project <crate-name>` / `-p <crate-name>` - Specifies the crate to build
  when using a Cargo workspace.
- `--out <dir-path>` - Specifies the output directory. Defaults to `./lib`
- `--all-features` - Build the crate with all features.
- `--no-default-features` - Build the crate with no default features.
- `--features` - Specify the features to create. Specify multiple features
  quoted and with spaces (ex. `--features "wasm serialization"`).
- `--sync` - Generate a synchronous module that stores the Wasm module inline as base64 text.
