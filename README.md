## wasmbuild

A tiny build tool to generate wasm-bindgen glue for Deno.

### Installing

```bash
rustup target add wasm32-unknown-unknown

deno install --unstable -A -f -n wasmbuild https://raw.githubusercontent.com/denoland/wasmbuild/main/main.ts
```

### Usage

Just invoke `wasmbuild` on your project root.

```bash
$ wasmbuild
# or build for debug
$ wasmbuild --debug
```

bindings will be generated at `./lib/<crate-name>.generated.js`:

```typescript
import { greet } from "./lib/deno_test.generated.js";

greet("Deno");
```
