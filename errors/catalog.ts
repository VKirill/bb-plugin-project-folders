import { commonErrors } from "./common";
import { filesErrors } from "./files";
import { sectionsErrors } from "./sections";
import { serverErrors } from "./server";
import type { ErrorText } from "./types";

/** Every message the plugin can show for a failure, by stable id. */
export const errorCatalog = {
  ...commonErrors,
  ...filesErrors,
  ...sectionsErrors,
  ...serverErrors,
};
export type ErrorId = keyof typeof errorCatalog;
export type { ErrorText };
