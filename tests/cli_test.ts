import { createTempDirSync } from "@david/temp";
import { Path } from "@david/path";

const rootFolder = new Path(import.meta.dirname!).parentOrThrow();

Deno.test("should create a new wasmbuild project, build it, and run it", async () => {
  using tempDir = createTempDirSync();
  await tempDir.join("deno.json").writeText(
    `{ "tasks": { "wasmbuild": "${
      Deno.execPath().replace(/\\/g, "\\\\")
    } run -A ${
      rootFolder.join("main.ts").toString().replace(/\\/g, "\\\\")
    }" }}\n`,
  );
  await runCommand("deno", "task", "wasmbuild", "new");
  await runCommand("deno", "task", "wasmbuild");
  await tempDir.join("test.ts").writeText(`
import { add } from "./lib/rs_lib.js";

Deno.test("should add values", async () => {
  const result = add(1, 2);
  if (result !== 3) {
    throw new Error("Did not match");
  }
});
`);
  await runCommand("deno", "test", "-A");
  await runCommand("cargo", "test");

  async function runCommand(cmd: string, ...args: string[]) {
    const p = new Deno.Command(cmd, {
      args,
      cwd: tempDir.toString(),
    }).spawn();
    const output = await p.status;
    if (!output.success) {
      throw new Error("FAILED");
    }
  }
});
