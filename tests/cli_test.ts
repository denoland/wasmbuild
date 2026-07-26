import { createTempDirSync, type TempDir } from "@david/temp";
import { Path } from "@david/path";
import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "@std/assert";

const rootFolder = new Path(import.meta.dirname!).parentOrThrow();
const mainTsPath = rootFolder.join("main.ts").toString();
const wasmbuildTask = "deno run -A @deno/wasmbuild";

interface DenoConfig {
  tasks?: Record<string, string>;
  imports?: Record<string, string>;
  [key: string]: unknown;
}

Deno.test("should create a new wasmbuild project, build it, and run it", async () => {
  using tempDir = createTempDirSync();
  await runNewCommand(tempDir);

  const configFile = tempDir.join("deno.json");
  const config = configFile.readJsonSync<DenoConfig>();
  assertEquals(config.tasks?.wasmbuild, wasmbuildTask);
  assertMatch(config.imports!["@deno/wasmbuild"], /^jsr:@deno\/wasmbuild@/);
  // the created task and import should work together
  await runCommand(tempDir, "deno", "task", "wasmbuild", "--help");

  // now build using this repo's code instead of the published version
  config.tasks!.wasmbuild = `${Deno.execPath()} run -A ${mainTsPath}`;
  configFile.writeJsonPrettySync(config);

  await runCommand(tempDir, "deno", "task", "wasmbuild");
  tempDir.join("test.ts").writeTextSync(`
import { add } from "./lib/rs_lib.js";

Deno.test("should add values", async () => {
  const result = add(1, 2);
  if (result !== 3) {
    throw new Error("Did not match");
  }
});
`);
  await runCommand(tempDir, "deno", "test", "-A");
  await runCommand(tempDir, "cargo", "test");
});

Deno.test("should fill in an existing deno.json", async () => {
  using tempDir = createTempDirSync();
  const configFile = tempDir.join("deno.json");
  configFile.writeTextSync(`{
  "name": "@scope/name",
  "exports": "./mod.js",
  "tasks": {
    "other": "echo 1"
  }
}
`);

  await runNewCommand(tempDir);

  const config = configFile.readJsonSync<DenoConfig>();
  assertEquals(config.name, "@scope/name");
  assertEquals(config.exports, "./mod.js");
  assertEquals(config.tasks, {
    other: "echo 1",
    wasmbuild: wasmbuildTask,
  });
  assertMatch(config.imports!["@deno/wasmbuild"], /^jsr:@deno\/wasmbuild@/);
});

Deno.test("should keep an existing wasmbuild task in the deno.json", async () => {
  using tempDir = createTempDirSync();
  const configFile = tempDir.join("deno.json");
  configFile.writeTextSync(
    `{\n  "tasks": {\n    "wasmbuild": "deno run -A ./main.ts"\n  }\n}\n`,
  );

  await runNewCommand(tempDir);

  const config = configFile.readJsonSync<DenoConfig>();
  assertEquals(config.tasks?.wasmbuild, "deno run -A ./main.ts");
  assertMatch(config.imports!["@deno/wasmbuild"], /^jsr:@deno\/wasmbuild@/);
});

Deno.test("should fill in a deno.jsonc keeping the comments", async () => {
  using tempDir = createTempDirSync();
  const configFile = tempDir.join("deno.jsonc");
  configFile.writeTextSync(`{\n  // a comment\n  "tasks": {}\n}\n`);

  await runNewCommand(tempDir);

  assert(!tempDir.join("deno.json").existsSync());
  const configText = configFile.readTextSync();
  assertStringIncludes(
    configText,
    `  // a comment\n  "tasks": {\n    "wasmbuild": "${wasmbuildTask}"\n  },\n`,
  );
  assertMatch(configText, /"@deno\/wasmbuild": "jsr:@deno\/wasmbuild@/);
});

Deno.test("should keep the comments in a deno.json with comments", async () => {
  using tempDir = createTempDirSync();
  const configFile = tempDir.join("deno.json");
  configFile.writeTextSync(`{\n  // a comment\n  "tasks": {}\n}\n`);

  await runNewCommand(tempDir);

  const configText = configFile.readTextSync();
  assertStringIncludes(
    configText,
    `  // a comment\n  "tasks": {\n    "wasmbuild": "${wasmbuildTask}"\n  },\n`,
  );
  assertMatch(configText, /"@deno\/wasmbuild": "jsr:@deno\/wasmbuild@/);
});

Deno.test("should prefer the deno.json over the deno.jsonc", async () => {
  using tempDir = createTempDirSync();
  const jsoncFile = tempDir.join("deno.jsonc");
  jsoncFile.writeTextSync(`{\n  // a comment\n  "tasks": {}\n}\n`);
  const configFile = tempDir.join("deno.json");
  configFile.writeTextSync(`{}\n`);

  await runNewCommand(tempDir);

  assertEquals(configFile.readJsonSync<DenoConfig>().tasks, {
    wasmbuild: wasmbuildTask,
  });
  assertEquals(
    jsoncFile.readTextSync(),
    `{\n  // a comment\n  "tasks": {}\n}\n`,
  );
});

Deno.test("should fill in an empty deno.json", async () => {
  using tempDir = createTempDirSync();
  const configFile = tempDir.join("deno.json");
  configFile.writeTextSync("");

  await runNewCommand(tempDir);

  assertEquals(configFile.readJsonSync<DenoConfig>().tasks, {
    wasmbuild: wasmbuildTask,
  });
});

Deno.test("should keep an existing wasmbuild task in the deno.jsonc", async () => {
  using tempDir = createTempDirSync();
  const configFile = tempDir.join("deno.jsonc");
  configFile.writeTextSync(
    `{\n  // a comment\n  "tasks": {\n    "wasmbuild": "deno run -A ./main.ts"\n  }\n}\n`,
  );

  await runNewCommand(tempDir);

  const configText = configFile.readTextSync();
  assertStringIncludes(
    configText,
    `  // a comment\n  "tasks": {\n    "wasmbuild": "deno run -A ./main.ts"\n  },\n`,
  );
});

function runNewCommand(cwd: TempDir) {
  return runCommand(cwd, Deno.execPath(), "run", "-A", mainTsPath, "new");
}

async function runCommand(cwd: TempDir, cmd: string, ...args: string[]) {
  const output = await new Deno.Command(cmd, {
    args,
    cwd: cwd.toString(),
    stdout: "piped",
    stderr: "piped",
  }).output();
  const text = new TextDecoder().decode(output.stdout) +
    new TextDecoder().decode(output.stderr);
  if (!output.success) {
    throw new Error(`FAILED\n${text}`);
  }
  return text;
}
