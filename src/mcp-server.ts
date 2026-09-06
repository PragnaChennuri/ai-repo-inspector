#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { reviewRepository } from "./core.js";

const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

const inputSchema = {
  repo_path: z.string().describe("Path to the Git repository to inspect."),
  base_ref: z
    .string()
    .optional()
    .describe("Git ref to diff against (defaults to 'main')."),
  validation_commands: z
    .array(z.string())
    .optional()
    .describe(
      "Shell commands to run inside the repository for validation (e.g. 'npm test'). " +
        "These run with the same privileges as this MCP server process, in the same " +
        "way `inspector review --validate` does from the CLI — only pass commands you " +
        "would be willing to run yourself.",
    ),
};

server.tool(
  "review_repository",
  "Inspects a Git repository's changed files and runs optional validation commands, " +
    "returning a Markdown review report.",
  inputSchema,
  async (input) => {
    try {
      const report = await reviewRepository({
        repositoryPath: input.repo_path,
        baseRef: input.base_ref,
        validationCommands: input.validation_commands,
      });
      return { content: [{ type: "text", text: report }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Review failed: ${message}` }],
        isError: true,
      };
    }
  },
);

await server.connect(new StdioServerTransport());
