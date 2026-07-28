import { assertEquals } from "@std/assert";
import { serveDir } from "@std/http/file-server";
import { chromium } from "playwright";
import { Path } from "@david/path";

Deno.test("browser test", async () => {
  const controller = new AbortController();
  const serverPromise = Deno.serve({
    port: 8082,
    signal: controller.signal,
    onListen: () => {},
  }, (req) => {
    return serveDir(req, {
      fsRoot: new Path(import.meta.dirname!).toString(),
      urlRoot: "",
      quiet: true,
    });
  }).finished;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://localhost:8082/browser.html");

  const result = await page.evaluate(() => {
    // @ts-ignore global function
    // deno-lint-ignore no-window
    return window.testGreet();
  });

  assertEquals(result, "Hello, Browser! Result: 3");

  await browser.close();
  controller.abort();
  await serverPromise;
});
