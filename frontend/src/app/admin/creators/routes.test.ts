import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

// PBI-4: one Creator Detail page takes the place of the per-creator Content Plan page. A page
// that has no file has no address, so "can no longer be accessed" is checked where the
// addresses come from: the files themselves.

const SRC = join(process.cwd(), "src");

/** Every file under a directory, as paths from `src` written with forward slashes. */
function filesUnder(directory: string): string[] {
  return readdirSync(join(SRC, directory), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(SRC, join(entry.parentPath, entry.name)).split(sep).join("/"));
}

describe("the admin's creator pages", () => {
  it("are the Creator Database and the Creator Detail page, and no other", () => {
    const pages = filesUnder("app/admin/creators").filter((file) => file.endsWith("/page.tsx"));

    expect(pages.sort()).toEqual([
      "app/admin/creators/[id]/page.tsx",
      "app/admin/creators/page.tsx",
    ]);
  });

  it("no longer hold a per-creator Content Plan address", () => {
    const leftovers = filesUnder("app/admin/creators").filter((file) =>
      file.includes("/content-plan/"),
    );

    expect(leftovers).toEqual([]);
  });
});
