import { editFolder } from "./folder-files";
import { repoRemotes } from "./repo-remote";
import { githubRemotes } from "./github-remote";
import { sessionInventory } from "./session-inventory";
import { worktreeOrigins } from "./worktree-origin";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { moveHostContract } from "./move-contract";
import { inspectMove, moveDirectory, linkDirectory } from "./move-files";
export default experimental_defineHostEntry({
  contract: moveHostContract,
  handlers: {
    folder_edit: editFolder,
    inspect: inspectMove,
    move: moveDirectory,
    link: linkDirectory,
    github_remotes: githubRemotes,
    repo_remotes: repoRemotes,
    session_inventory: sessionInventory,
    worktree_origins: worktreeOrigins,
  },
});
