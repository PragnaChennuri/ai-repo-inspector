# Submission

## What did you investigate first, and why?

I started by reading the README and SUBMISSION.md to understand what was actually being evaluated. From there, I read through every file in `src/` end to end (there were only seven files, so this was pretty quick) before making any changes. I wanted to have a full picture of how the system worked before touching the code. The README mentioned that the starter implementation only worked for a narrow happy path, so I focused on finding what would break outside of that path.

## What did you choose to implement or fix?

* **mcp-server.ts:** The Zod schema declared the field as `repo_path`, but the handler was reading `input.repoPath`. Since the two names did not match, `repositoryPath` was always undefined and the MCP tool could not actually function. I fixed the mismatch and standardized the field naming.

* **git.ts:** `baseRef` was being passed unsanitized into a git argv element (`${base}...HEAD`). A ref beginning with `-` can be interpreted by git as an option rather than a revision (for example, `--upload-pack=` or `--output=`), which creates a known git argument-injection issue. I added validation to reject any ref starting with `-`, as well as a check that `repositoryPath` exists before invoking git.

* **validation.ts:** `runValidation` rejected the promise whenever a command exited with a non-zero status, even though `ValidationResult.status` already models a `"failed"` state. This meant that a failing validation command, such as a failing `npm test`, would crash the entire review instead of being reported as a failed validation. I changed it to resolve with `status: "failed"` and added a timeout so a hung command cannot block the review indefinitely.

* **core.ts:** I added a single `repositoryPath` check in the shared `reviewRepository()` function so that the CLI and MCP adapters validate input consistently instead of handling the same error differently.

* **report.ts:** The validation status was already being calculated, but it was never actually shown in the output. I added an explicit pass/fail line for each validation command.

* **vitest.config.ts:** After a build, `npm test` was also picking up the compiled test files under `dist/`, which caused every test to run twice. I restricted test discovery to `test/**/*.test.ts`.

## What did you intentionally not do?

* `--format json` is accepted by the interface but currently has no effect, and the output is always Markdown. Given the time available, I documented this as a known limitation rather than implementing a second output renderer.

* `changedFiles()` only reports committed differences against a base ref. It cannot surface uncommitted or untracked changes, even though the `ChangedFile` type includes `"untracked"` as a possible status that the code never actually produces. This felt like a product decision as much as a bug: does "review" mean comparing two commits, or reviewing the current working tree? Rather than guessing, I documented it as a limitation.

* I left `cli.ts`'s argument parser unchanged. It currently silently truncates `--repo` at the first space, does not validate `--format` against its allowed values, and does not handle a missing flag value. These are real issues, but given the time constraint, I considered them lower priority than the main issues above.

* I did not add an allowlist or sandbox around `validationCommands`. Executing an arbitrary caller-supplied command is the intended capability of this tool, rather than a defect. I instead treated this as part of the trust boundary described below.

## Interface decision

* **Decision:** Hybrid

* **Primary user and execution environment:** A developer running the CLI locally, or an AI coding agent invoking the MCP tool from that same machine or session. This is not intended to be used by a remote or multi-tenant caller.

* **Trust boundary and allowed capabilities:** I treated the CLI and MCP interfaces as equally trusted since both operate under the same OS-level principal that launched the process. `validationCommands` intentionally executes arbitrary shell commands in both interfaces. This is acceptable only because neither interface is intended to be exposed to a remote or untrusted caller. If this were deployed behind a network-facing gateway or shared MCP host, `validationCommands` would need an allowlist or would need to be removed entirely. I would consider that a hard requirement rather than an optimization.

* **Reliability, discoverability, latency/context, and output tradeoffs:** MCP responses currently return a single Markdown string. This works well enough for a small diff, but it means an agent does not get structured data to work with without parsing the Markdown. A more MCP-first design would return structured content alongside, or instead of, the Markdown output. Writing output to a file works well for a human developer but is less convenient for an agent expecting an inline result.

* **How supported interfaces remain consistent:** Input validation, including the `repositoryPath` requirement and `baseRef` safety check, now lives in `core.ts`. This means both adapters share the same behavior when given invalid input.

* **Evidence that would change this decision:** If usage data showed that the MCP tool was being used significantly more than the CLI, or if the agent host required structured output, I would move toward an MCP-first design with a JSON contract and the CLI acting as a thin wrapper around it.

## How did you use an AI coding agent?

I used an AI coding agent (Claude) conversationally throughout the process. I first had it read and summarize the entire repo so I could understand the overall structure and potential issues. I then asked it to prioritize the most important issues rather than simply listing everything it found.

Before allowing it to make changes, I asked it to explain the scope of each issue and what would need to change. I then had it implement one fix at a time and explain each change—what the bug was, why it mattered, and exactly what was changed—before moving on to verification.

## Where did you check, correct, or reject an AI suggestion? (required)

1. **I corrected the agent's initial assessment of a security issue.** The agent initially characterized the use of `child_process.exec` in `validation.ts` as a shell injection risk. After reviewing the implementation, I determined that this was not the right way to characterize the issue. `git.ts` uses `execFileSync`, which does not invoke a shell and was already safe, while `validation.ts`'s use of `exec` is intentional because the tool is specifically designed to execute caller-supplied validation commands. I had the agent re-examine the code and this led to the actual issue being identified: git argument injection through the unsanitized `baseRef`. That was the vulnerability I ultimately fixed. I also directed the agent to document the intentional command-execution behavior as a trust-boundary decision rather than changing the feature itself.

2. **I rejected unnecessary test files.** The agent added three new test files without me asking for them. Since I had not requested new tests and was working within a time constraint, I had the agent remove them. I instead verified the changes manually through typechecking, building, running the existing tests, and running the CLI with relevant inputs.

## Commands used to verify the result, with outcomes

* `npm run typecheck`: Clean with no errors. I ran this after each change to catch issues as I went.

* `npm run build`: Clean.

* `npm test`: One test file with one test, passing (`test/report.test.ts`). Before adding `vitest.config.ts`, this also ran a duplicate compiled copy from `dist/`, resulting in two files and two tests being executed. After adding the configuration, the duplicate run was resolved.

* `npm run inspector -- review --repo . --validate "npm test"`: Confirmed that the report now includes an explicit pass/fail status for each validation command instead of only showing the raw console output.

* `npm run inspector -- review --repo . --base-ref "--upload-pack=evil"`: Confirmed that the malicious-looking ref is rejected with a clear error instead of being passed through to git.

## A blocker you hit and how you approached it

An early run of the CLI produced a report with no changed files and no validation output, which initially looked like a defect. After investigating, I found that there were actually two separate reasons for this:

1. I was diffing `main` against itself with no commits yet in place. `git diff --name-status` only reports committed history in this setup and does not include working-tree changes.
2. I had not supplied a `--validate` flag, so there was no validation output to report.

I resolved this by testing with more realistic inputs, committing the changes, and supplying `--validate` rather than assuming the implementation itself was broken.

## Known limitations and the next three things you would do

1. **Implement `--format json` properly.** It is currently accepted by the interface but silently ignored, even though it is part of the declared contract.

2. **Decide and implement what "review" should mean for uncommitted or untracked changes.** The tool currently cannot see work that has not been committed, which limits its usefulness for reviewing work in progress.

3. **Replace `cli.ts`'s argument parser with a proper parser.** The current parser silently truncates paths containing spaces, does not validate the value of `--format`, and does not handle missing flag values. I would also add MCP-specific integration tests that exercise the actual server over stdio rather than only testing the shared core.

## Approximate focused-work time

* **Start:** 10:00 PM
* **Finish:** 11:07 PM
