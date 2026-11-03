import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UpdateBanner } from "./UpdateBanner";

describe("UpdateBanner", () => {
  it("renders nothing without an update", () => {
    const { container } = render(<UpdateBanner info={null} onOpen={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("opens the update URL and can be put off", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <UpdateBanner
        info={{ latest: "1.2.0", url: "https://example.com/dl", notes: "Faster previews" }}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText("ICG 1.2.0 is available.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Get update" }));
    expect(onOpen).toHaveBeenCalledWith("https://example.com/dl");
    await user.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByText("ICG 1.2.0 is available.")).toBeNull();
  });
});
