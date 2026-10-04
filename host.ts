import { editFolder } from "./folder-files";
import { repoRemotes } from "./repo-remote";
import { sessionInventory } from "./session-inventory";
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
    repo_remotes: repoRemotes,
    session_inventory: sessionInventory,
  },
});
