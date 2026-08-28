import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../../shared/i18n";
import { EditorNavigationProvider } from "./EditorNavigationProvider";
import { useEditorNavigation } from "./useEditorNavigation";

function GuardHarness({
  save,
  stash,
}: {
  save: () => Promise<boolean>;
  stash: () => void;
}) {
  const { registerGuard, requestDocumentChange } = useEditorNavigation();
  const [result, setResult] = useState("waiting");
  useEffect(
    () => registerGuard({ isBlocked: () => true, save, stash }),
    [registerGuard, save, stash],
  );
  return (
    <>
      <button
        onClick={() =>
          void requestDocumentChange().then((allowed) =>
            setResult(allowed ? "allowed" : "denied"),
          )
        }
        type="button"
      >
        切换文档
      </button>
      <output>{result}</output>
    </>
  );
}

describe("EditorNavigationProvider", () => {
  afterEach(() => cleanup());

  it("can preserve a tab draft before switching", async () => {
    const stash = vi.fn();
    render(
      <EditorNavigationProvider>
        <GuardHarness save={vi.fn()} stash={stash} />
      </EditorNavigationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "切换文档" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /保留草稿并切换/ }),
    );

    expect(stash).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByText("allowed")).toBeVisible());
  });

  it("only permits switching after a successful save", async () => {
    const save = vi.fn().mockResolvedValue(false);
    render(
      <EditorNavigationProvider>
        <GuardHarness save={save} stash={vi.fn()} />
      </EditorNavigationProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "切换文档" }));
    fireEvent.click(await screen.findByRole("button", { name: /保存并切换/ }));

    expect(
      await screen.findByText("正文未能保存，请重试或先保留标签页草稿。"),
    ).toBeInTheDocument();
    expect(screen.getByText("waiting")).toBeVisible();
  });
});
