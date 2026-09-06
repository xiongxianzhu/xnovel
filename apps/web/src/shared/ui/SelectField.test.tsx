import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import "../i18n";
import { SelectField } from "./SelectField";

afterEach(cleanup);
it("uses a themed option menu and preserves required form validation", async () => {
  const save = vi.fn();
  function Form() {
    const [value, setValue] = useState("");
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save(value);
        }}
      >
        <label htmlFor="chapter">章节</label>
        <SelectField
          id="chapter"
          name="chapter"
          required
          value={value}
          onValueChange={setValue}
        >
          <option value="">请选择</option>
          <option value="chapter-2">第二章</option>
        </SelectField>
        <button type="submit">保存</button>
      </form>
    );
  }
  render(<Form />);
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("请填写必填项");
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "章节" }));
  fireEvent.click(await screen.findByText("第二章"));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(save).toHaveBeenCalledWith("chapter-2");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("keeps the field disabled while its form is saving", () => {
  render(
    <fieldset disabled>
      <SelectField aria-label="状态" value="active" onValueChange={vi.fn()}>
        <option value="active">正常</option>
      </SelectField>
    </fieldset>,
  );
  expect(screen.getByRole("combobox", { name: "状态" })).toBeDisabled();
});
