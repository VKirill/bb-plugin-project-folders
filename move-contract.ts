import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  sessionInventoryInput,
  sessionInventoryOutput,
} from "./session-inventory";
export const moveInput = z
  .object({ source: z.string().min(1), destination: z.string().min(1) })
  .strict();
export const moveHostContract = defineRpcContract({
  folder_edit: {
    input: z.object({
      protectedPaths: z.array(z.string()).optional(),
      parent: z.string().min(1),
      name: z.string().min(1).max(255),
      action: z.enum(["create", "delete"]),
    }),
    output: z.object({ path: z.string() }),
  },
  inspect: {
    input: moveInput,
    output: z.object({
      source: z.string(),
      destination: z.string(),
      moved: z.boolean(),
    }),
  },
  move: {
    input: moveInput,
    output: z.object({
      source: z.string(),
      destination: z.string(),
      moved: z.boolean(),
    }),
  },
  link: {
    input: moveInput,
    output: z.object({
      source: z.string(),
      destination: z.string(),
      moved: z.boolean(),
    }),
  },
  session_inventory: {
    input: sessionInventoryInput,
    output: sessionInventoryOutput,
  },
  repo_remotes: {
    input: z.object({ paths: z.array(z.string()) }).strict(),
    output: z.object({
      remotes: z.array(
        z.object({ path: z.string(), url: z.string().nullable() }),
      ),
    }),
  },
});
