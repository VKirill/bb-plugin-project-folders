/** Shared geometry for folder headings, guides, chat rows and Show all. */
export const TREE_ROW_PADDING = 4;
export const TREE_CONTENT_PADDING = 2;
export const TREE_CHEVRON_WIDTH = 12;
export const TREE_LABEL_GAP = 7;
export const TREE_MARKER_WIDTH = 18;
/** Branch toggle column: its centre sits on the section guide line. */
export const TREE_BRANCH_TOGGLE_WIDTH = 16;

export function sidebarTreeLayout(indent: number) {
  const padding = Number.isFinite(indent)
    ? Math.min(32, Math.max(0, indent))
    : 8;
  const guideOffset =
    TREE_ROW_PADDING + TREE_CONTENT_PADDING + TREE_CHEVRON_WIDTH / 2;
  // Chats have no expand/collapse control. Reserve its column so their marker
  // occupies the same column as a child folder's marker, never its chevron.
  const chatOffset = TREE_CHEVRON_WIDTH + TREE_LABEL_GAP;
  return {
    guideOffset,
    childPadding: padding,
    chatOffset,
    childStep: guideOffset + 1 + padding,
  };
}
