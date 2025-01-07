import * as path from "@std/path";

const rootFolder = path.dirname(
  path.dirname(path.fromFileUrl(import.meta.url)),
);

Deno.test("should create a new wasmbuild project, build it, and run it", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      path.join(tempDir, "deno.json"),
      `{ "tasks": { "wasmbuild": "${
        Deno.execPath().replace(/\\/g, "\\\\")
      } run -A ${
        path.join(rootFolder, "main.ts").replace(/\\/g, "\\\\")
      }" }}\n`,
    );
    await runCommand("deno", "task", "wasmbuild", "new");
    await runCommand("deno", "task", "wasmbuild");
    await Deno.writeTextFile(
      path.join(tempDir, "test.ts"),
      `
import { add } from "./lib/rs_lib.js";

Deno.test("should add values", async () => {
  const result = add(1, 2);
  if (result !== 3) {
    throw new Error("Did not match");
  }
});
`,
    );
    await runCommand("deno", "test", "-A");
    await runCommand("cargo", "test");

    // ensure the generated wasm module has no import statements
    const fileText = Deno.readTextFileSync(
      path.join(tempDir, "./lib/rs_lib.js"),
    );
    if (fileText.includes("import ")) {
      console.log(fileText);
      // don't allow import statements because it should be self
      // contained and work in browser environments
      throw new Error("Generated wasm module had an import statement.");
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }

  async function runCommand(cmd: string, ...args: string[]) {
    const p = new Deno.Command(cmd, {
      args,
      cwd: tempDir,
    }).spawn();
    const output = await p.status;
    if (!output.success) {
      throw new Error("FAILED");
    }
  }
});
