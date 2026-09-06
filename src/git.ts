import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import type { ChangedFile } from "./types.js";

function assertSafeRef(ref: string): void {
  if (!ref || ref.startsWith("-")) {
    throw new Error(
      `Invalid ref "${ref}": refs must be non-empty and must not start with "-" ` +
        `(a leading "-" would let the ref be interpreted as a git option, e.g. ` +
        `"--upload-pack=..." or "--output=...", instead of a revision).`,
    );
  }
}

function assertRepository(repositoryPath: string): void {
  if (!repositoryPath || !existsSync(repositoryPath) || !statSync(repositoryPath).isDirectory()) {
    throw new Error(`Repository path "${repositoryPath}" does not exist or is not a directory.`);
  }
}

function git(repositoryPath: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: repositoryPath,
      encoding: "utf8",
    }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`"git ${args.join(" ")}" failed in "${repositoryPath}": ${message}`);
  }
}

export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  const base = baseRef ?? "main";
  assertRepository(repositoryPath);
  assertSafeRef(base);

  const output = git(repositoryPath, ["diff", "--name-status", `${base}...HEAD`]);

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [code, ...pathParts] = line.split("\t");
      const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
      return { path: pathParts.join("\t"), status };
    });
}
