import type { DocumentView } from "@difracta/client";
import { useEffect, useState } from "react";

import { rememberTarget, type PreviewChoice } from "./preview-choice";
import { PreviewFrame } from "./preview-frame";
import { PreviewHeader } from "./preview-header";
import { PreviewNoticeBar } from "./preview-notice";
import {
  usePreviewChoice,
  useResolvedPreview,
  useTargetAspect,
} from "./preview-state";
import {
  framedOn,
  type PreviewNotice,
  type PreviewTarget,
} from "./preview-target";

/**
 * Studio's own rendering of an Output, of a Surface flat or of a Layer. It
 * follows the selection or stays on a named Output, and renders only while
 * `active`.
 */
export function PreviewTab({
  view,
  active,
}: {
  readonly view: DocumentView;
  readonly active: boolean;
}) {
  const [choice, setChoice] = usePreviewChoice(view);
  // The Scene shown in place of the active one lasts as long as the
  // document is open: a show reopens on what plays.
  const [sceneId, setSceneId] = useState<string | null>(null);
  const { target, notice } = useResolvedPreview(view, choice, sceneId);
  const shownScene =
    target === undefined ? undefined : framedOn(target).sceneId;
  // Where the Preview went is where it stays when the selection moves on.
  if (shownScene !== undefined && shownScene !== sceneId)
    setSceneId(shownScene);
  useEffect(() => {
    if (target === undefined) return;
    const next = rememberTarget(choice, target);
    if (next !== choice) setChoice(next);
  }, [target, choice, setChoice]);
  if (target === undefined)
    return (
      <p className="p-3 text-muted-foreground">
        No Outputs yet. Add one from the navigator and the Preview shows what it
        would project.
      </p>
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Shown
        view={view}
        choice={choice}
        target={target}
        active={active}
        notice={notice}
        onChoice={setChoice}
      />
    </div>
  );
}

function Shown({
  view,
  choice,
  target,
  active,
  notice,
  onChoice,
}: {
  readonly view: DocumentView;
  readonly choice: PreviewChoice;
  readonly target: PreviewTarget;
  readonly active: boolean;
  readonly notice: PreviewNotice | undefined;
  readonly onChoice: (next: PreviewChoice) => void;
}) {
  const aspect = useTargetAspect(view, target);
  return (
    <>
      <PreviewHeader
        view={view}
        choice={choice}
        target={target}
        aspect={aspect.choice}
        onChoice={onChoice}
        onAspect={aspect.pick}
      />
      {notice !== undefined && (
        <PreviewNoticeBar
          notice={notice}
          onOutput={(outputId) =>
            onChoice({ ...choice, follow: true, outputId })
          }
        />
      )}
      <PreviewFrame
        view={view}
        target={target}
        aspect={aspect.aspect}
        active={active}
        outline={choice.outline}
      />
    </>
  );
}
