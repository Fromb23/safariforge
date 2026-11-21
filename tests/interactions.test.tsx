// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ActionMenu } from "@/components/ActionMenu";
import { Carousel, ContentBlocks } from "@/components/SafariJournalRenderer";
import type { MediaRecord } from "@/types";

afterEach(cleanup);
describe("accessible administrative action menus", () => {
  it("toggles, closes outside and on Escape, and allows only one open menu", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ActionMenu label="First">
          <button role="menuitem">Edit</button>
          <button role="menuitem">Delete</button>
        </ActionMenu>
        <ActionMenu label="Second">
          <button role="menuitem">Duplicate</button>
        </ActionMenu>
        <div data-testid="outside">Outside</div>
      </>,
    );
    const first = screen.getByRole("button", { name: "First" }),
      second = screen.getByRole("button", { name: "Second" });
    await user.click(first);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(first);
    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(first);
    await user.click(second);
    expect(screen.getByRole("menu")).toHaveTextContent("Duplicate");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Duplicate" })).toHaveFocus());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() => expect(second).toHaveFocus());
    await user.click(first);
    await user.click(screen.getByTestId("outside"));
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("supports arrow-key focus and closes after selecting an action", async () => {
    const user = userEvent.setup();
    render(
      <ActionMenu>
        <button role="menuitem">Preview</button>
        <button role="menuitem">Duplicate</button>
      </ActionMenu>,
    );
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Preview" })).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("shared carousel interactions", () => {
  const records: MediaRecord[] = ["one", "two", "three"].map((id, index) => ({
    id,
    originalName: `${id}.jpg`,
    mimeType: "image/jpeg",
    width: 1200,
    height: 800,
    tags: ["test"],
    altText: `Photo ${index + 1}`,
    createdAt: "2026-01-01T00:00:00Z",
  }));
  const media = new Map(records.map((item) => [item.id, item]));
  it("uses arrows, keyboard, swipe, position, and administrative order", async () => {
    const user = userEvent.setup();
    render(<Carousel ids={["two", "one", "three"]} media={media} />);
    const region = screen.getByRole("region", { name: "Page image carousel" });
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Photo 2");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Photo 1");
    region.focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Photo 2");
    fireEvent.touchStart(region, { changedTouches: [{ clientX: 200 }] });
    fireEvent.touchEnd(region, { changedTouches: [{ clientX: 100 }] });
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Photo 1");
  });
  it("hides navigation for a single image", () => {
    render(<Carousel ids={["one"]} media={media} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/1 \/ 1/)).toBeNull();
  });
  it("renders no viewport for an empty or entirely unavailable selection", () => {
    const { rerender } = render(<Carousel ids={[]} media={media} />);
    expect(screen.queryByRole("region", { name: "Page image carousel" })).toBeNull();
    rerender(<Carousel ids={["missing"]} media={media} />);
    expect(screen.queryByRole("region", { name: "Page image carousel" })).toBeNull();
  });
  it.each(["imageGrid", "carousel"] as const)("renders a persisted %s block as the same one-image-at-a-time carousel", async (type) => {
    const user = userEvent.setup();
    render(
      <ContentBlocks
        blocks={[
          {
            id: "existing-image-block",
            type,
            mediaIds: ["one", "two", "three"],
          },
        ]}
        media={media}
      />,
    );
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Photo 1");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(document.querySelector(".image-grid")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Photo 2");
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous image" }));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Photo 1");
  });
  it("keeps the viewport stable when an image cannot be loaded", () => {
    render(<Carousel ids={["one", "two"]} media={media} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img", { name: "Photo 1 unavailable" })).toHaveTextContent("Image unavailable");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });
});
