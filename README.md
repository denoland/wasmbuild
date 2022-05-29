## wasmbuild

A tiny build tool to generate wasm-bindgen glue for Deno.

### Setup

Add a build task to the _deno.json_ file in your project:

```json
{
  "tasks": {
    "build": "deno run --unstable -A https://deno.land/x/wasmbuild@VERSION_GOES_HERE/main.ts"
  }
}
```

### Usage

Now invoke `deno task build` in your project's root.

```bash
$ deno task build
# or build for debug
$ deno task build --debug
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
