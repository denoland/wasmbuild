// MIT License - Copyright (c) justjavac.
// https://github.com/justjavac/deno_dirs/blob/e8c001bbef558f08fd486d444af391729b0b8068/data_local_dir/mod.ts
export function localDataDir(): string | undefined {
  switch (Deno.build.os) {
    case "linux": {
      const xdg = Deno.env.get("XDG_DATA_HOME");
      if (xdg) return xdg;

      const home = Deno.env.get("HOME");
      if (home) return `${home}/.local/share`;
      break;
    }

    case "darwin": {
      const home = Deno.env.get("HOME");
      if (home) return `${home}/Library/Application Support`;
      break;
    }

    case "windows":
      return Deno.env.get("LOCALAPPDATA") ?? undefined;
  }

  return undefined;
}

// https://github.com/justjavac/deno_dirs/blob/e8c001bbef558f08fd486d444af391729b0b8068/cache_dir/mod.ts
export function cacheDir(): string | undefined {
  switch (Deno.build.os) {
    case "linux": {
      const xdg = Deno.env.get("XDG_CACHE_HOME");
      if (xdg) return xdg;

      const home = Deno.env.get("HOME");
      if (home) return `${home}/.cache`;
      break;
    }

    case "darwin": {
      const home = Deno.env.get("HOME");
      if (home) return `${home}/Library/Caches`;
      break;
    }

    case "windows":
      return Deno.env.get("LOCALAPPDATA") ?? undefined;
  }

  return undefined;
}