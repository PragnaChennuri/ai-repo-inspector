import { exec } from "node:child_process";
import type { ValidationResult } from "./types.js";

// Guards against a hung validation command blocking the whole review indefinitely.
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export function runValidation(command: string, cwd: string): Promise<ValidationResult> {
  return new Promise((resolve) => {
    exec(command, { cwd, timeout: DEFAULT_TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error) {
        // A non-zero exit (e.g. a failing `npm test`) is an expected, reportable
        // outcome, not a crash — resolve with status "failed" instead of rejecting
        // so one failing validation command doesn't abort the whole review.
        const reason = (error as NodeJS.ErrnoException & { killed?: boolean }).killed
          ? `timed out after ${DEFAULT_TIMEOUT_MS}ms`
          : `exited with code ${error.code ?? "unknown"}`;
        resolve({
          command,
          status: "failed",
          output: [`(${reason})`, stdout, stderr].filter(Boolean).join("\n"),
        });
        return;
      }
      resolve({ command, status: "passed", output: stdout || stderr });
    });
  });
}

export async function runValidations(commands: string[], cwd: string): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd));
  }
  return results;
}
