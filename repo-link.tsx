import { GitlabIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Content as TooltipContent,
  Portal as TooltipPortal,
  Provider as TooltipProvider,
  Root as Tooltip,
  Trigger as TooltipTrigger,
} from "@radix-ui/react-tooltip";
import { Icon } from "./components/ui/icon";
import { t } from "./i18n";
import type { Folder } from "./server";

type Provider = NonNullable<Folder["repoProvider"]>;

// Hugeicons has no Bitbucket mark; drawn in its 24px, 1.5 stroke style.
const BitbucketIcon: IconSvgElement = [
  [
    "path",
    {
      d: "M3.27 3H20.73C21.35 3 21.82 3.55 21.72 4.16L19.18 20.16C19.1 20.64 18.69 21 18.2 21H5.8C5.31 21 4.9 20.64 4.82 20.16L2.28 4.16C2.18 3.55 2.65 3 3.27 3Z",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "0",
    },
  ],
  [
    "path",
    {
      d: "M9 8.5H15L14.1 14.5H9.9L9 8.5Z",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "1.5",
      key: "1",
    },
  ],
];

// Corner badge for a private repo; filled so it stays legible at 8px.
const LockBadgeIcon: IconSvgElement = [
  [
    "path",
    {
      d: "M8 11V8C8 5.79 9.79 4 12 4C14.21 4 16 5.79 16 8V11",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeWidth: "3",
      key: "0",
    },
  ],
  [
    "rect",
    {
      x: "4.5",
      y: "10.5",
      width: "15",
      height: "11",
      rx: "2.5",
      fill: "currentColor",
      key: "1",
    },
  ],
];

const labels = {
  github: {
    open: () => t("Открыть репозиторий GitHub"),
    openPrivate: () => t("Открыть приватный репозиторий GitHub"),
    private: () => t("Приватный репозиторий GitHub"),
  },
  gitlab: {
    open: () => t("Открыть репозиторий GitLab"),
    openPrivate: () => t("Открыть приватный репозиторий GitLab"),
    private: () => t("Приватный репозиторий GitLab"),
  },
  bitbucket: {
    open: () => t("Открыть репозиторий Bitbucket"),
    openPrivate: () => t("Открыть приватный репозиторий Bitbucket"),
    private: () => t("Приватный репозиторий Bitbucket"),
  },
} satisfies Record<Provider, Record<string, () => string>>;

function ProviderIcon({ provider }: { provider: Provider }) {
  if (provider === "gitlab") return <HugeiconsIcon icon={GitlabIcon} />;
  if (provider === "bitbucket") return <HugeiconsIcon icon={BitbucketIcon} />;
  return <Icon name="Github" />;
}

/** Small mark that opens the section's GitHub, GitLab or Bitbucket repo. */
export function RepoLink({ folder }: { folder: Folder }) {
  const url = folder.repoUrl;
  const provider = folder.repoProvider;
  if (!url || !provider) return null;
  const text = labels[provider];
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            className={
              folder.repoPrivate
                ? "pf-icon pf-repo pf-repo-private"
                : "pf-icon pf-repo"
            }
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            data-provider={provider}
            aria-label={folder.repoPrivate ? text.openPrivate() : text.open()}
            onClick={(event) => event.stopPropagation()}
          >
            <ProviderIcon provider={provider} />
            {folder.repoPrivate && (
              <span className="pf-repo-lock" aria-hidden="true">
                <HugeiconsIcon icon={LockBadgeIcon} />
              </span>
            )}
          </a>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            className="pf-tooltip"
            side="top"
            sideOffset={6}
            collisionPadding={8}
          >
            {folder.repoPrivate ? text.private() : url}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}
