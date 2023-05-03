import { path } from "../lib/deps.ts";

const rootFolder = path.dirname(
  path.dirname(path.fromFileUrl(import.meta.url)),
);

Deno.test("should create a new wasmbuild project, build it, and run it", async () => {
  const tempDir = await Deno.makeTempDir();
  try {
    console.log(tempDir);
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
import { instantiate } from "./lib/rs_lib.generated.js";

Deno.test("should add values", async () => {
  const { add } = await instantiate();
  const result = add(1, 2);
  if (result !== 3) {
    throw new Error("Did not match");
  }
});
`,
    );
    await runCommand("deno", "test", "-A");
    await runCommand("cargo", "test");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }

  async function runCommand(cmd: string, ...args: string[]) {
    const p = new Deno.Command(cmd, {
      args,
      cwd: tempDir,
    });
    const output = await p.output();
    if (!output.success) {
      throw new Error("FAILED");
    }
  }
});
