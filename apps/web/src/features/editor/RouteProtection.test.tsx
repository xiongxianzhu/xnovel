import { ConfigProvider } from "antd";
import { useEffect, useRef, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  createMemoryRouter,
  Link,
  Route,
  RouterProvider,
  Routes,
} from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import "../../shared/i18n";
import { EditorNavigationProvider } from "./EditorNavigationProvider";
import { useEditorNavigation } from "./useEditorNavigation";

afterEach(cleanup);
it("protects links and browser history while preserving the stash decision", async () => {
  const stash = vi.fn();
  function Editor() {
    const [value, setValue] = useState("");
    const valueRef = useRef("");
    const { registerGuard } = useEditorNavigation();
    useEffect(
      () =>
        registerGuard({
          isBlocked: () => Boolean(valueRef.current),
          save: async () => false,
          stash: () => stash(valueRef.current),
        }),
      [registerGuard],
    );
    return (
      <>
        <label>
          测试正文
          <input
            value={value}
            onChange={(event) => {
              valueRef.current = event.target.value;
              setValue(event.target.value);
            }}
          />
        </label>
        <Link to="/elsewhere">离开编辑器</Link>
      </>
    );
  }
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <EditorNavigationProvider>
            <Routes>
              <Route path="/write" element={<Editor />} />
              <Route path="/elsewhere" element={<h1>另一页面</h1>} />
            </Routes>
          </EditorNavigationProvider>
        ),
      },
    ],
    { initialEntries: ["/elsewhere", "/write"], initialIndex: 1 },
  );
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <RouterProvider router={router} />
    </ConfigProvider>,
  );
  fireEvent.change(screen.getByLabelText("测试正文"), {
    target: { value: "不能丢失的草稿" },
  });
  await act(async () => {
    await router.navigate(-1);
  });
  await waitFor(() =>
    expect(screen.getByText("当前正文尚未保存")).toBeVisible(),
  );
  fireEvent.click(screen.getByRole("button", { name: "留在当前文档" }));
  expect(screen.getByLabelText("测试正文")).toHaveValue("不能丢失的草稿");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("link", { name: "离开编辑器" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "保留草稿并切换" }),
  );
  expect(
    await screen.findByRole("heading", { name: "另一页面" }),
  ).toBeVisible();
  await waitFor(() => expect(stash).toHaveBeenCalledWith("不能丢失的草稿"));
  router.dispose();
});
