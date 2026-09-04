import { describe, expect, it } from "vitest";
import { openCommand, shouldOpenBrowser } from "./open-browser";

describe("launch glue (spec §10 run model) — open-browser", () => {
  it("picks the platform opener command", () => {
    expect(openCommand("http://localhost:4317", "darwin")).toEqual([
      "open",
      ["http://localhost:4317"],
    ]);
    expect(openCommand("http://localhost:4317", "linux")).toEqual([
      "xdg-open",
      ["http://localhost:4317"],
    ]);
    const [cmd, args] = openCommand("http://localhost:4317", "win32");
    expect(cmd).toBe("cmd");
    expect(args).toEqual(["/c", "start", "", "http://localhost:4317"]);
  });

  it("opens by default and is disabled by DS_OPEN=0/false/no", () => {
    expect(shouldOpenBrowser({})).toBe(true);
    expect(shouldOpenBrowser({ DS_OPEN: "1" })).toBe(true);
    for (const off of ["0", "false", "FALSE", "no"]) {
      expect(shouldOpenBrowser({ DS_OPEN: off })).toBe(false);
    }
  });
});
