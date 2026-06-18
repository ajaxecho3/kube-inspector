import { useState, useEffect } from "react";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const FAVOURITES_PATH = path.join(
  os.homedir(),
  ".kube-inspector",
  "favourites.json",
);

export function useFavourites() {
  const [favourites, setFavourites] = useState<Set<string>>(new Set());

  useEffect(() => {
    fs.readFile(FAVOURITES_PATH, "utf-8")
      .then((data) => {
        const arr = JSON.parse(data) as string[];
        setFavourites(new Set(arr));
      })
      .catch(() => {}); // file doesn't exist yet — that's fine
  }, []);

  function toggle(uid: string) {
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      const arr = Array.from(next);
      fs.mkdir(path.dirname(FAVOURITES_PATH), { recursive: true })
        .then(() =>
          fs.writeFile(FAVOURITES_PATH, JSON.stringify(arr), "utf-8"),
        )
        .catch(() => {});
      return next;
    });
  }

  return { favourites, toggle };
}
