// @vitest-environment node
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";

// The app's own lint config, read from the frontend folder, as `npm run lint` and CI run it.
const eslint = new ESLint({ cwd: fileURLToPath(new URL("../..", import.meta.url)) });

async function problems(code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: "src/components/sample.tsx" });
  return result.messages.filter((message) => message.ruleId === "no-restricted-syntax").map((m) => m.message);
}

describe("UI token lint", () => {
  it.each([
    ["a raw hex colour", `export const A = () => <p className="bg-[#1a73e8]" />;`],
    ["an rgb colour with a variant", `export const A = () => <p className="hover:text-[rgb(0,0,0)]" />;`],
    ["an oklch border colour", `export const A = () => <p className="border-[oklch(50%_0.1_250)]" />;`],
    ["an ad-hoc radius", `export const A = () => <p className="rounded-[3px]" />;`],
    ["an ad-hoc corner radius", `export const A = () => <p className="rounded-tl-[4px]" />;`],
    ["an ad-hoc shadow", `export const A = () => <p className="shadow-[0_1px_2px_black]" />;`],
    ["a class held in a constant", `const CARD = "p-4 bg-[#fff]"; export const A = () => <p className={CARD} />;`],
    ["a class in a template literal", "export const A = ({ x }: { x: string }) => <p className={`${x} rounded-[2px]`} />;"],
    ["an inline style", `export const A = () => <p style={{ color: "red" }} />;`],
  ])("flags %s", async (_case, code) => {
    expect(await problems(code)).toHaveLength(1);
  });

  it.each([
    ["colour tokens", `export const A = () => <p className="bg-accent text-ink border-rule" />;`],
    ["radius and shadow tokens", `export const A = () => <p className="rounded-(--radius-control) shadow-whisper" />;`],
    ["an arbitrary size, which no token covers", `export const A = () => <p className="text-[13px] px-[18px]" />;`],
    ["a hex colour that is not a class", `export const BRAND = "#1a73e8";`],
    ["a style prop on a component, not an element", `export const A = () => <Chart style="compact" />;`],
  ])("allows %s", async (_case, code) => {
    expect(await problems(code)).toEqual([]);
  });

  it("names the token to reach for", async () => {
    const [message] = await problems(`export const A = () => <p className="bg-[#fff]" />;`);

    expect(message).toMatch(/globals\.css/);
  });
});
