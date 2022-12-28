# wasmbuild

A build tool to generate wasm-bindgen glue code for Deno and the browser.

## Setup

Add a task to the _deno.json_ file in your project:

```json
{
  "tasks": {
    "wasmbuild": "deno run -A https://deno.land/x/wasmbuild@VERSION_GOES_HERE/main.ts"
  }
}
```

## Scaffold project (Optional)

To create a starter Rust crate in an `rs_lib` subfolder of your project, run:

```bash
$ deno task wasmbuild new
```

In addition to that, you can also generate a helper to cache wasm files

```bash
deno task wasmbuild --generate-wasm-cache
```

This will create a `wasm_cache.ts` that exprots an `instantiateWithCaching` method.
It will cache the wasm file as hash of the current module url.

## Building

To build, invoke `deno task wasmbuild` in your project:

```bash
$ deno task wasmbuild
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

### Compression

When instantiating, you might want to decompress Wasm bytes.

```ts
import { instantiate } from "./lib/deno_test.generated.js";
import { decompress } from "https://deno.land/x/lz4@v0.1.2/mod.ts";

await instantiate({
  decompress,
});
```

Note, however, wasmbuild CLI does not compress the Wasm file automatically.

### Custom URL to .wasm file

A custom URL to the .wasm file may be provided by specifying the `url` option:

```ts
import { instantiate } from "./lib/deno_test.generated.js";

await instantiate({
  url: new URL("./custom_path_to_url.wasm", import.meta),
});
```

## Checking output is up-to-date

It may occur that someone updates the Rust code, but forgets to build when
submitting a PR. To ensure that the output is up-to-date, you can use the
`--check` flag:

```shellsession
$ deno task wasmbuild --check
```

For example, in a GitHub action:

```yml
- name: Check Wasm up-to-date
  run: deno task wasmbuild --check
```

### CLI flags

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
- `--skip-opt` - Skip running wasm-opt.
- `--check` - Checks if the output is up-to-date.
