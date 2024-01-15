// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.

export async function fetchWithRetries(url: URL | string, maxRetries = 5) {
  let sleepMs = 250;
  let iterationCount = 0;
  while (true) {
    iterationCount++;
    try {
      const res = await fetch(url);
      if (res.ok || iterationCount > maxRetries) {
        return res;
      }
    } catch (err) {
      if (iterationCount > maxRetries) {
        throw err;
      }
    }
    console.warn(`Failed fetching. Retrying in ${sleepMs}ms...`);
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
    sleepMs = Math.min(sleepMs * 2, 10_000);
  }
}
