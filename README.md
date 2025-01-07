# wasmbuild

A build tool to generate wasm-bindgen glue code for Deno and the browser.

## Setup

Add a task to the _deno.json_ file in your project:

```json
{
  "tasks": {
    "wasmbuild": "deno run -A jsr:@deno/wasmbuild@VERSION_GOES_HERE"
  }
}
```

## Scaffold project (Optional)

To create a starter Rust crate in an `rs_lib` subfolder of your project, run:

```bash
deno task wasmbuild new
```

## Building

To build, invoke `deno task wasmbuild` in your project:

```bash
deno task wasmbuild
```

You can now try it out with `deno run mod.js`

Bindings will be generated at `./lib/<crate-name>.js`:

```ts
import { add } from "./lib/rs_lib.js";

console.log(add(1, 1));
```

## Checking output is up-to-date

It may occur that someone updates the Rust code, but forgets to build when
submitting a PR. To ensure that the output is up-to-date, you can use the
`--check` flag:

```shellsession
deno task wasmbuild --check
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
- `--skip-opt` - Skip running wasm-opt.
- `--check` - Checks if the output is up-to-date.
