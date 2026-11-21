"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContentBlock, MediaAllocation, MediaRecord, SafariPageDocument } from "@/types";
import { mutate } from "./AdminDashboard";
import { SafariPageSpread } from "./SafariJournalRenderer";
import { ActionMenu } from "./ActionMenu";

const uid = () => crypto.randomUUID();
const imageBlock = (block: ContentBlock): block is Extract<ContentBlock, { mediaIds: string[] }> => block.type === "gallery" || block.type === "carousel" || block.type === "imageGrid";
function makeBlock(type: ContentBlock["type"]): ContentBlock {
  if (type === "heading") return { id: uid(), type, text: "New heading" };
  if (type === "subtitle") return { id: uid(), type, text: "Tailor made travel" };
  if (type === "paragraph") return { id: uid(), type, text: "Write your story here." };
  if (type === "list") return { id: uid(), type, items: ["New detail"] };
  if (type === "facts")
    return {
      id: uid(),
      type,
      title: "At a glance",
      items: [{ label: "Detail", value: "" }],
    };
  return { id: uid(), type, mediaIds: [] };
}

function MediaPicker({ media, allocations, pageId, selected, blockedIds = [], multiple, onDone, onClose }: { media: MediaRecord[]; allocations: MediaAllocation[]; pageId: string; selected: string[]; blockedIds?: string[]; multiple: boolean; onDone: (ids: string[]) => void; onClose: () => void }) {
  const [query, setQuery] = useState(""),
    [tag, setTag] = useState(""),
    [pending, setPending] = useState(selected),
    tags = [...new Set(media.flatMap((m) => m.tags))].sort(),
    visible = media.filter((m) => (!query || m.originalName.toLowerCase().includes(query.toLowerCase())) && (!tag || m.tags.includes(tag)));
  return (
    <div className="picker" role="dialog" aria-modal="true" aria-label="Choose images">
      <div className="picker-panel">
        <header>
          <div>
            <p className="eyebrow">Global media library</p>
            <h2>Choose explicit images</h2>
          </div>
          <button onClick={onClose}>Cancel</button>
        </header>
        <input className="media-search" autoFocus placeholder="Search by filename" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="tag-filter">
          <button className={!tag ? "active" : ""} onClick={() => setTag("")}>
            All tags
          </button>
          {tags.map((v) => (
            <button className={tag === v ? "active" : ""} key={v} onClick={() => setTag(v)}>
              {v}
            </button>
          ))}
        </div>
        <div className="picker-grid">
          {visible.map((item) => {
            const allocation = allocations.find((a) => a.media_id === item.id && a.page_id !== pageId),
              active = pending.includes(item.id),
              usedHere = blockedIds.includes(item.id),
              disabled = Boolean((allocation || usedHere) && !active),
              reason = allocation ? `Used on ${allocation.page_title}` : usedHere ? "Already used on this page" : "";
            return (
              <button key={item.id} disabled={disabled} className={active ? "selected" : ""} title={reason} onClick={() => setPending(multiple ? (active ? pending.filter((id) => id !== item.id) : [...pending, item.id]) : [item.id])}>
                <img src={`/api/media/${item.id}/thumbnail`} alt={item.altText} />
                <span>{item.originalName}</span>
                <i>{active ? "Selected" : reason || "Available"}</i>
              </button>
            );
          })}
        </div>
        <footer>
          <span>{pending.length} selected</span>
          <button
            className="copper-button"
            onClick={() => {
              onDone(pending);
              onClose();
            }}
          >
            Use selection
          </button>
        </footer>
      </div>
    </div>
  );
}

function BlockEditor({ block, index, total, media, allocations, pageId, blockedIds, onChange, onRemove, onMove, onDuplicate }: { block: ContentBlock; index: number; total: number; media: MediaRecord[]; allocations: MediaAllocation[]; pageId: string; blockedIds: string[]; onChange: (v: ContentBlock) => void; onRemove: () => void; onMove: (n: number) => void; onDuplicate: () => void }) {
  const [picker, setPicker] = useState(false);
  let input: React.ReactNode;
  if (block.type === "heading" || block.type === "subtitle" || block.type === "paragraph") input = <textarea aria-label={`${block.type} text`} rows={block.type === "paragraph" ? 6 : 2} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />;
  else if (block.type === "list") input = <textarea aria-label="List items, one per line" rows={5} value={block.items.join("\n")} onChange={(e) => onChange({ ...block, items: e.target.value.split("\n") })} />;
  else if (block.type === "facts")
    input = (
      <>
        <input aria-label="Facts title" value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} />
        {block.items.map((fact, i) => (
          <div className="fact-input" key={i}>
            <input
              aria-label={`Fact ${i + 1} label`}
              placeholder="Label"
              value={fact.label}
              onChange={(e) =>
                onChange({
                  ...block,
                  items: block.items.map((v, n) => (n === i ? { ...v, label: e.target.value } : v)),
                })
              }
            />
            <input
              aria-label={`Fact ${i + 1} value`}
              placeholder="Value"
              value={fact.value}
              onChange={(e) =>
                onChange({
                  ...block,
                  items: block.items.map((v, n) => (n === i ? { ...v, value: e.target.value } : v)),
                })
              }
            />
            <button
              aria-label={`Delete fact ${i + 1}`}
              onClick={() =>
                onChange({
                  ...block,
                  items: block.items.filter((_, n) => n !== i),
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="text-button"
          onClick={() =>
            onChange({
              ...block,
              items: [...block.items, { label: "Detail", value: "" }],
            })
          }
        >
          Add fact
        </button>
      </>
    );
  else
    input = (
      <>
        <div className="selected-images">
          {block.mediaIds.map((id, i) => (
            <div key={id}>
              <img src={`/api/media/${id}/thumbnail`} alt="" />
              <span>
                <button
                  disabled={!i}
                  onClick={() => {
                    const ids = [...block.mediaIds];
                    [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                    onChange({ ...block, mediaIds: ids });
                  }}
                >
                  Earlier
                </button>
                <button
                  disabled={i === block.mediaIds.length - 1}
                  onClick={() => {
                    const ids = [...block.mediaIds];
                    [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                    onChange({ ...block, mediaIds: ids });
                  }}
                >
                  Later
                </button>
                <button
                  onClick={() =>
                    onChange({
                      ...block,
                      mediaIds: block.mediaIds.filter((v) => v !== id),
                    })
                  }
                >
                  Remove
                </button>
              </span>
            </div>
          ))}
        </div>
        <button className="outline-button" onClick={() => setPicker(true)}>
          Choose images · {block.mediaIds.length}
        </button>
        {picker && <MediaPicker media={media} allocations={allocations} pageId={pageId} selected={block.mediaIds} blockedIds={blockedIds} multiple onDone={(ids) => onChange({ ...block, mediaIds: ids })} onClose={() => setPicker(false)} />}
      </>
    );
  return (
    <div className="block-editor">
      <div className="block-top">
        <span>{block.type === "imageGrid" ? "Carousel (legacy image block)" : block.type}</span>
        <div>
          <button aria-label="Move block earlier" disabled={!index} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button aria-label="Move block later" disabled={index === total - 1} onClick={() => onMove(1)}>
            ↓
          </button>
          <button onClick={onDuplicate}>Duplicate</button>
          <button className="danger" onClick={onRemove}>
            Delete
          </button>
        </div>
      </div>
      {input}
    </div>
  );
}

const positions = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export function PageEditor({ id, initial, initialRevisionId, initialRevisionVersion, media, allocations }: { id: string; initial: SafariPageDocument; initialRevisionId: string; initialRevisionVersion: number; media: MediaRecord[]; allocations: MediaAllocation[] }) {
  const router = useRouter(),
    [doc, setDoc] = useState(initial),
    [revisionId, setRevisionId] = useState(initialRevisionId),
    [version, setVersion] = useState(initialRevisionVersion),
    [baseline, setBaseline] = useState(JSON.stringify(initial)),
    [heroPicker, setHeroPicker] = useState(false),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("Draft changes are private"),
    [error, setError] = useState("");
  const dirty = JSON.stringify(doc) !== baseline;
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    addEventListener("beforeunload", listener);
    return () => removeEventListener("beforeunload", listener);
  }, [dirty]);
  const store = async (publish = false) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await mutate(`/api/admin/pages/${id}${publish ? "/publish" : ""}`, publish ? "POST" : "PUT", { document: doc, revisionId, revisionVersion: version });
      const next = publish ? result.draft : result;
      setDoc(next.document);
      setRevisionId(next.revisionId);
      setVersion(next.revisionVersion);
      setBaseline(JSON.stringify(next.document));
      setMessage(publish ? "Page published. The public journal now uses this snapshot." : "Draft saved");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };
  const blocks = doc.rightPanel.blocks,
    allRightMedia = blocks.flatMap((block) => (imageBlock(block) ? block.mediaIds : [])),
    patchBlock = (index: number, value: ContentBlock) =>
      setDoc((v) => ({
        ...v,
        rightPanel: {
          blocks: v.rightPanel.blocks.map((b, i) => (i === index ? value : b)),
        },
      })),
    crop = (doc.leftPanel.objectPosition || "50% 50%").split(" ");
  return (
    <div className="page-editor">
      <header className="page-editor-toolbar">
        <a href="/admin">← Back to Pages</a>
        <div>
          <b>{doc.leftPanel.title}</b>
          <span>{dirty ? "Unsaved changes" : message}</span>
          {error && (
            <span className="editor-error" role="alert">
              {error}
            </span>
          )}
        </div>
        <nav>
          <button onClick={() => store()} disabled={busy || !dirty}>
            Save Draft
          </button>
          <button onClick={() => setPreview(!preview)}>{preview ? "Edit" : "Preview"}</button>
          <button className="copper-button" onClick={() => store(true)} disabled={busy}>
            Publish
          </button>
          <ActionMenu label="More Actions">
            <button
              role="menuitem"
              onClick={async () => {
                if (confirm("Unpublish this page?")) {
                  await mutate(`/api/admin/pages/${id}/unpublish`);
                  setMessage("Page unpublished; its editable draft remains.");
                  router.refresh();
                }
              }}
            >
              Unpublish
            </button>
            <button
              role="menuitem"
              className="danger"
              onClick={async () => {
                if (confirm("Permanently delete this page and its history? Shared media will remain.")) {
                  await mutate(`/api/admin/pages/${id}`, "DELETE");
                  router.push("/admin");
                }
              }}
            >
              Delete page
            </button>
          </ActionMenu>
        </nav>
      </header>
      {preview ? (
        <div className="editor-preview">
          <div className="preview-banner">Draft preview · visitors cannot see these changes</div>
          <SafariPageSpread page={doc} media={media} />
        </div>
      ) : (
        <main className="two-panel-editor">
          <section className="left-panel-editor">
            <div className="hero-edit">
              {doc.leftPanel.heroMediaId && <img src={`/api/media/${doc.leftPanel.heroMediaId}/original`} alt="" style={{ objectPosition: doc.leftPanel.objectPosition }} />}
              <div className="spread-shade" />
              <div className={`spread-copy ${doc.leftPanel.overlayPosition || "bottom-left"}`}>
                <input
                  aria-label="Eyebrow"
                  placeholder="Eyebrow"
                  value={doc.leftPanel.eyebrow || ""}
                  onChange={(e) =>
                    setDoc((v) => ({
                      ...v,
                      leftPanel: { ...v.leftPanel, eyebrow: e.target.value },
                    }))
                  }
                />
                <textarea
                  aria-label="Page title"
                  value={doc.leftPanel.title}
                  onChange={(e) =>
                    setDoc((v) => ({
                      ...v,
                      leftPanel: { ...v.leftPanel, title: e.target.value },
                    }))
                  }
                />
                <input
                  aria-label="Location"
                  placeholder="Location"
                  value={doc.leftPanel.location || ""}
                  onChange={(e) =>
                    setDoc((v) => ({
                      ...v,
                      leftPanel: { ...v.leftPanel, location: e.target.value },
                    }))
                  }
                />
                <div className="date-pair">
                  <input
                    aria-label="Start date"
                    type="date"
                    value={doc.leftPanel.startDate || ""}
                    onChange={(e) =>
                      setDoc((v) => ({
                        ...v,
                        leftPanel: {
                          ...v.leftPanel,
                          startDate: e.target.value,
                        },
                      }))
                    }
                  />
                  <input
                    aria-label="End date"
                    type="date"
                    value={doc.leftPanel.endDate || ""}
                    onChange={(e) =>
                      setDoc((v) => ({
                        ...v,
                        leftPanel: { ...v.leftPanel, endDate: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>
              <div className="hero-tools">
                <div>
                  <button onClick={() => setHeroPicker(true)}>{doc.leftPanel.heroMediaId ? "Replace hero" : "Select hero"}</button>
                  {doc.leftPanel.heroMediaId && (
                    <button
                      onClick={() =>
                        setDoc((v) => ({
                          ...v,
                          leftPanel: { ...v.leftPanel, heroMediaId: undefined },
                        }))
                      }
                    >
                      Clear hero
                    </button>
                  )}
                </div>
                <fieldset className="overlay-position-picker">
                  <legend>Text overlay placement</legend>
                  {positions.map((position) => (
                    <label key={position} className={`position-${position}`}>
                      <input
                        type="radio"
                        name="overlay-position"
                        checked={doc.leftPanel.overlayPosition === position}
                        onChange={() =>
                          setDoc((v) => ({
                            ...v,
                            leftPanel: {
                              ...v.leftPanel,
                              overlayPosition: position,
                            },
                          }))
                        }
                      />
                      <span>{position.replace("-", " ")}</span>
                    </label>
                  ))}
                </fieldset>
                <div className="crop-controls">
                  <label>
                    Hero crop horizontal{" "}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={parseInt(crop[0]) || 50}
                      onChange={(e) =>
                        setDoc((v) => ({
                          ...v,
                          leftPanel: {
                            ...v.leftPanel,
                            objectPosition: `${e.target.value}% ${crop[1] || "50%"}`,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Hero crop vertical{" "}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={parseInt(crop[1]) || 50}
                      onChange={(e) =>
                        setDoc((v) => ({
                          ...v,
                          leftPanel: {
                            ...v.leftPanel,
                            objectPosition: `${crop[0] || "50%"} ${e.target.value}%`,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            </div>
            {heroPicker && (
              <MediaPicker
                media={media}
                allocations={allocations}
                pageId={id}
                selected={doc.leftPanel.heroMediaId ? [doc.leftPanel.heroMediaId] : []}
                blockedIds={allRightMedia}
                multiple={false}
                onDone={(ids) =>
                  setDoc((v) => ({
                    ...v,
                    leftPanel: { ...v.leftPanel, heroMediaId: ids[0] },
                  }))
                }
                onClose={() => setHeroPicker(false)}
              />
            )}
          </section>
          <section className="right-panel-editor">
            <p className="eyebrow">Right panel · editorial content</p>
            {blocks.map((block, index) => (
              <BlockEditor
                key={block.id}
                block={block}
                index={index}
                total={blocks.length}
                media={media}
                allocations={allocations}
                pageId={id}
                blockedIds={[...(doc.leftPanel.heroMediaId ? [doc.leftPanel.heroMediaId] : []), ...blocks.filter((_, i) => i !== index).flatMap((item) => (imageBlock(item) ? item.mediaIds : []))]}
                onChange={(value) => patchBlock(index, value)}
                onRemove={() =>
                  setDoc((v) => ({
                    ...v,
                    rightPanel: {
                      blocks: v.rightPanel.blocks.filter((_, i) => i !== index),
                    },
                  }))
                }
                onMove={(amount) =>
                  setDoc((v) => {
                    const next = [...v.rightPanel.blocks],
                      [moved] = next.splice(index, 1);
                    next.splice(index + amount, 0, moved);
                    return { ...v, rightPanel: { blocks: next } };
                  })
                }
                onDuplicate={() =>
                  setDoc((v) => {
                    const next = [...v.rightPanel.blocks],
                      copy = structuredClone(block);
                    next.splice(index + 1, 0, {
                      ...copy,
                      id: uid(),
                      ...(imageBlock(copy) ? { mediaIds: [] } : {}),
                    } as ContentBlock);
                    return { ...v, rightPanel: { blocks: next } };
                  })
                }
              />
            ))}
            <div className="add-content">
              <b>Add Content</b>
              {(["heading", "subtitle", "paragraph", "list", "facts", "carousel"] as ContentBlock["type"][]).map((type) => (
                <button
                  key={type}
                  onClick={() =>
                    setDoc((v) => ({
                      ...v,
                      rightPanel: {
                        blocks: [...v.rightPanel.blocks, makeBlock(type)],
                      },
                    }))
                  }
                >
                  {type}
                </button>
              ))}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
