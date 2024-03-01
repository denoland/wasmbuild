import $ from "@david/dax";
import { Project, ScriptTarget } from "ts-morph";
// todo(dsherret): remove this after upgrading to a ts-morph version
// that exports code-block-writer >= v13.0.1
import CodeBlockWriter from "code-block-writer";

const rootDir = $.path(import.meta).parentOrThrow().parentOrThrow();

const loaderTextFile = rootDir.join("lib/loader_text.generated.ts");
const loaderFile = rootDir.join("lib/loader.ts");

const loaderText = loaderFile.readTextSync();
const project = new Project({
  useInMemoryFileSystem: true,
  compilerOptions: {
    target: ScriptTarget.ES2021,
  },
});
const file = project.createSourceFile("loader.ts", loaderText);
const emitText = file.getEmitOutput().getOutputFiles()[0].getText();
const writer = new CodeBlockWriter({
  indentNumberOfSpaces: 2,
});
const copyrightComment =
  "// Copyright 2018-2022 the Deno authors. MIT license.\n";
writer.writeLine(copyrightComment);
writer.write("export const loaderText = ")
  .quote(emitText.replace(copyrightComment, ""))
  .write(";")
  .newLine();
loaderTextFile.writeTextSync(writer.toString());
