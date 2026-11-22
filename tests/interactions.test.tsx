// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ActionMenu } from "@/components/ActionMenu";
import { Carousel, ContentBlocks, SafariJournalRenderer } from "@/components/SafariJournalRenderer";
import { PageEditor } from "@/components/PageEditor";
import type { MediaRecord, SafariPageDocument } from "@/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});
describe("Safari Page date editing", () => {
  it("shows one restored page date and marks the draft dirty when it changes", () => {
    const initial: SafariPageDocument = {
      leftPanel: { title: "Elephants beneath the baobabs", date: "2026-11-21", overlayPosition: "bottom-left" },
      rightPanel: { blocks: [{ id: "copy", type: "paragraph", text: "Preserved right-panel copy" }] },
    };
    render(<PageEditor id="page-one" initial={initial} initialRevisionId="revision-one" initialRevisionVersion={1} media={[]} allocations={[]} />);
    const date = screen.getByLabelText("Page Date");
    expect(date).toHaveValue("2026-11-21");
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();
    fireEvent.change(date, { target: { value: "2026-11-22" } });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeEnabled();
  });
});
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
    expect(document.querySelector(".carousel-position")).toHaveTextContent("01 / 03 photos");
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
    expect(document.querySelector(".carousel-position")).toHaveTextContent("01 / 03 photos");
    expect(document.querySelector(".image-grid")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Photo 2");
    expect(document.querySelector(".carousel-position")).toHaveTextContent("02 / 03 photos");
    await user.click(screen.getByRole("button", { name: "Previous image" }));
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Photo 1");
  });
  it("keeps the viewport stable when an image cannot be loaded", () => {
    render(<Carousel ids={["one", "two"]} media={media} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img", { name: "Photo 1 unavailable" })).toHaveTextContent("Image unavailable");
    expect(document.querySelector(".carousel-position")).toHaveTextContent("01 / 02 photos");
  });
  it("keeps multiple carousel states independent", async () => {
    const user = userEvent.setup();
    render(<ContentBlocks blocks={[
      { id: "first", type: "carousel", mediaIds: ["one", "two"] },
      { id: "second", type: "imageGrid", mediaIds: ["two", "three"] },
    ]} media={media} />);
    const carousels = screen.getAllByRole("region", { name: "Page image carousel" });
    expect(carousels[0]).toHaveTextContent("01 / 02 photos");
    expect(carousels[1]).toHaveTextContent("01 / 02 photos");
    await user.click(screen.getAllByRole("button", { name: "Next image" })[1]);
    expect(carousels[0].querySelector("img")).toHaveAttribute("alt", "Photo 1");
    expect(carousels[1].querySelector("img")).toHaveAttribute("alt", "Photo 3");
    expect(carousels[0]).toHaveTextContent("01 / 02 photos");
    expect(carousels[1]).toHaveTextContent("02 / 02 photos");
  });
});

describe("continuous public Safari journal", () => {
  const media: MediaRecord[] = ["hero-one", "hero-two", "photo-one", "photo-two"].map((id, index) => ({
    id,
    originalName: `${id}.jpg`,
    mimeType: "image/jpeg",
    width: 1200,
    height: 800,
    tags: ["test"],
    altText: `Journal image ${index + 1}`,
    createdAt: "2026-01-01T00:00:00Z",
  }));
  const pages: Array<{ id: string; document: SafariPageDocument }> = [
    {
      id: "first",
      document: {
        leftPanel: { eyebrow: "A SUB SECTION", title: "First hero", heroMediaId: "hero-one" },
        rightPanel: { blocks: [
          { id: "first-heading", type: "heading", text: "First story" },
          { id: "first-copy", type: "paragraph", text: "First paragraph" },
          { id: "first-carousel", type: "carousel", mediaIds: ["photo-one", "photo-two"] },
        ] },
      },
    },
    {
      id: "second",
      document: {
        leftPanel: { eyebrow: "Safari journal", title: "Second hero", heroMediaId: "hero-two" },
        rightPanel: { blocks: [
          { id: "second-heading", type: "heading", text: "Second story" },
          { id: "second-copy", type: "paragraph", text: "Second paragraph" },
        ] },
      },
    },
  ];

  it("renders every paired spread in order without manual Safari Page controls", async () => {
    const user = userEvent.setup();
    render(<SafariJournalRenderer pages={pages} media={media} />);
    const spreads = document.querySelectorAll(".safari-spread");
    expect(spreads).toHaveLength(2);
    expect(spreads[0]).toHaveTextContent("First hero");
    expect(spreads[0]).toHaveTextContent("First story");
    expect(spreads[0]).not.toHaveTextContent("Second story");
    expect(spreads[0].querySelector(".spread-hero img")).toHaveAttribute("src", "/api/media/hero-one/original");
    expect(spreads[1]).toHaveTextContent("Second hero");
    expect(spreads[1]).toHaveTextContent("Second story");
    expect(spreads[1]).not.toHaveTextContent("First paragraph");
    expect(spreads[1].querySelector(".spread-hero img")).toHaveAttribute("src", "/api/media/hero-two/original");
    expect(screen.queryByRole("button", { name: /Safari Page/i })).toBeNull();
    expect(document.querySelector(".page-position")).toBeNull();
    expect(screen.queryByText("A SUB SECTION")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("region", { name: "Page image carousel" })).toHaveTextContent("02 / 02 photos");
    expect(spreads).toHaveLength(2);
  });

  it("keeps the contents hidden initially and closes it through every supported interaction", async () => {
    const user = userEvent.setup();
    render(<SafariJournalRenderer pages={pages} media={media} />);
    const trigger = screen.getByRole("button", { name: "Open Table of Contents" });
    expect(screen.queryByRole("dialog", { name: "Table of Contents" })).toBeNull();

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Table of Contents" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close Table of Contents" }));
    expect(screen.queryByRole("dialog", { name: "Table of Contents" })).toBeNull();

    await user.click(trigger);
    fireEvent.mouseDown(document.querySelector(".contents-backdrop")!);
    expect(screen.queryByRole("dialog", { name: "Table of Contents" })).toBeNull();

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Table of Contents" })).toBeNull();

    await user.click(trigger);
    await user.click(screen.getByRole("link", { name: /Second hero/ }));
    expect(window.location.hash).toBe("#page-second");
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    expect(screen.queryByRole("dialog", { name: "Table of Contents" })).toBeNull();
  });

  it("restores direct section links, browser navigation, and persisted editorial block order", async () => {
    window.history.replaceState(null, "", "#page-second");
    render(<SafariJournalRenderer pages={pages} media={media} />);
    expect(document.getElementById("page-second")).toBeInTheDocument();
    expect(document.querySelectorAll(".safari-spread")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Open Table of Contents" }));
    await waitFor(() => expect(screen.getByRole("link", { name: /Second hero/ })).toHaveAttribute("aria-current", "location"));

    window.history.pushState(null, "", "#page-first");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Table of Contents" })).toBeNull());
    const heading = screen.getByRole("heading", { name: "First story" });
    const paragraph = screen.getByText("First paragraph");
    const carousel = screen.getByRole("region", { name: "Page image carousel" });
    expect(heading.compareDocumentPosition(paragraph) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(paragraph.compareDocumentPosition(carousel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("tracks the visible spread with IntersectionObserver and highlights its contents entry", async () => {
    let notify: IntersectionObserverCallback = () => undefined;
    const disconnect = vi.fn();
    class Observer {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe() {}
      unobserve() {}
      disconnect = disconnect;
      takeRecords() { return []; }
      root = null;
      rootMargin = "";
      thresholds = [0];
    }
    vi.stubGlobal("IntersectionObserver", Observer);
    render(<SafariJournalRenderer pages={pages} media={media} />);
    const second = document.getElementById("page-second")!;
    notify([{ target: second, isIntersecting: true, boundingClientRect: { top: 150 } } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    await userEvent.click(screen.getByRole("button", { name: "Open Table of Contents" }));
    expect(screen.getByRole("link", { name: /Second hero/ })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: /First hero/ })).not.toHaveAttribute("aria-current");
    cleanup();
    expect(disconnect).toHaveBeenCalled();
  });

  it("retains subsection metadata in draft preview while suppressing only the public label", () => {
    const { rerender } = render(<SafariJournalRenderer pages={[pages[0]]} media={media} />);
    expect(screen.queryByText("A SUB SECTION")).toBeNull();
    rerender(<SafariJournalRenderer preview pages={[pages[0]]} media={media} />);
    expect(screen.getByText("A SUB SECTION")).toBeInTheDocument();
    expect(screen.getByText(/Draft preview/)).toBeInTheDocument();
  });
});
