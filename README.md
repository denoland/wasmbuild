## wasmbuild

A tiny build tool to generate wasm-bindgen glue for Deno.

### Installing

Add a build task to your _deno.json_ file:

```json
{
  "tasks": {
    "build": "deno run --unstable -A https://raw.githubusercontent.com/denoland/wasmbuild/main/main.ts"
  }
}
```

### Usage

Now invoke `deno task build` in your project root.

```bash
$ deno task build
# or build for debug
$ deno task build --debug
```

Bindings will be generated at `./lib/<crate-name>.generated.js`:

```typescript
import { greet } from "./lib/deno_test.generated.js";

greet("Deno");
```
