"use client";
/* eslint-disable @next/next/no-img-element -- private media uses authorized dynamic URLs */
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ContentBlock,
  ItineraryDocument,
  ItinerarySection,
  MediaRecord,
  RevisionSummary,
  TemplateRecord,
} from "@/types";
import { mutate } from "./AdminDashboard";

const uid = () => crypto.randomUUID();
const snapshot = (value: ItineraryDocument) => JSON.stringify(value);
function block(type: ContentBlock["type"]): ContentBlock {
  if (type === "heading") return { id: uid(), type, text: "New heading" };
  if (type === "paragraph")
    return { id: uid(), type, text: "Write the story of this moment." };
  if (type === "list") return { id: uid(), type, items: ["New detail"] };
  if (type === "facts")
    return {
      id: uid(),
      type,
      title: "Day at a glance",
      items: [{ label: "Activities", value: "Game drive" }],
    };
  return { id: uid(), type, mediaIds: [] };
}
function cloneBlocks(blocks: ContentBlock[]) {
  return blocks.map((value) =>
    value.type === "gallery" ||
    value.type === "carousel" ||
    value.type === "imageGrid"
      ? { ...structuredClone(value), id: uid(), mediaIds: [] }
      : { ...structuredClone(value), id: uid() },
  );
}
function cloneSection(source: ItinerarySection): ItinerarySection {
  return {
    ...structuredClone(source),
    id: uid(),
    title: `${source.title} copy`,
    blocks: cloneBlocks(source.blocks),
  };
}
function csrf() {
  return decodeURIComponent(
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("safariforge_admin_csrf="))
      ?.split("=")
      .slice(1)
      .join("=") || "",
  );
}

function Picker({
  media,
  selected,
  multiple,
  destination,
  onConfirm,
  onClose,
}: {
  media: MediaRecord[];
  selected: string[];
  multiple: boolean;
  destination: string;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(selected);
  const normalized = query.trim().toLowerCase();
  const visible = media.filter(
    (item) =>
      !normalized ||
      item.originalName.toLowerCase().includes(normalized) ||
      item.tags.some((tag) => tag.includes(normalized)),
  );
  return (
    <div
      className="picker"
      role="dialog"
      aria-modal="true"
      aria-label={`Choose media for ${destination}`}
    >
      <div className="picker-panel">
        <header>
          <div>
            <p className="eyebrow">Media library</p>
            <h2>Select {destination}</h2>
          </div>
          <button onClick={onClose}>Cancel</button>
        </header>
        <input
          autoFocus
          className="media-search"
          placeholder="Search filename or tag"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="picker-grid">
          {visible.map((item) => {
            const active = pending.includes(item.id);
            return (
              <button
                className={active ? "selected" : ""}
                key={item.id}
                onClick={() =>
                  setPending(
                    multiple
                      ? active
                        ? pending.filter((id) => id !== item.id)
                        : [...pending, item.id]
                      : [item.id],
                  )
                }
              >
                <img
                  src={`/api/media/${item.id}/thumbnail`}
                  alt={item.altText}
                />
                <span>{item.originalName}</span>
                <i>{active ? "Selected" : "Select"}</i>
              </button>
            );
          })}
        </div>
        <footer>
          <span>
            {pending.length} selected for {destination}
          </span>
          <button
            className="copper-button"
            onClick={() => {
              onConfirm(pending);
              onClose();
            }}
          >
            Confirm selection
          </button>
        </footer>
      </div>
    </div>
  );
}
function BlockEditor({
  value,
  media,
  onChange,
  onRemove,
}: {
  value: ContentBlock;
  media: MediaRecord[];
  onChange: (value: ContentBlock) => void;
  onRemove: () => void;
}) {
  const [pick, setPick] = useState(false);
  let fields: React.ReactNode;
  if (value.type === "heading" || value.type === "paragraph")
    fields = (
      <textarea
        rows={value.type === "heading" ? 1 : 5}
        value={value.text}
        onChange={(event) => onChange({ ...value, text: event.target.value })}
      />
    );
  else if (value.type === "list")
    fields = (
      <textarea
        rows={5}
        value={value.items.join("\n")}
        onChange={(event) =>
          onChange({ ...value, items: event.target.value.split("\n") })
        }
      />
    );
  else if (value.type === "facts")
    fields = (
      <>
        <input
          value={value.title}
          onChange={(event) =>
            onChange({ ...value, title: event.target.value })
          }
        />
        {value.items.map((fact, index) => (
          <div className="fact-input" key={index}>
            <input
              value={fact.label}
              placeholder="Label"
              onChange={(event) =>
                onChange({
                  ...value,
                  items: value.items.map((item, i) =>
                    i === index ? { ...item, label: event.target.value } : item,
                  ),
                })
              }
            />
            <input
              value={fact.value}
              placeholder="Value"
              onChange={(event) =>
                onChange({
                  ...value,
                  items: value.items.map((item, i) =>
                    i === index ? { ...item, value: event.target.value } : item,
                  ),
                })
              }
            />
            <button
              onClick={() =>
                onChange({
                  ...value,
                  items: value.items.filter((_, i) => i !== index),
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
              ...value,
              items: [...value.items, { label: "New detail", value: "" }],
            })
          }
        >
          Add fact
        </button>
      </>
    );
  else
    fields = (
      <>
        <div className="selected-images">
          {value.mediaIds.map((id, index) => (
            <div key={id}>
              <img
                src={`/api/media/${id}/thumbnail`}
                alt={media.find((item) => item.id === id)?.altText || ""}
              />
              <span>
                <button
                  disabled={!index}
                  onClick={() => {
                    const ids = [...value.mediaIds];
                    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                    onChange({ ...value, mediaIds: ids });
                  }}
                >
                  ←
                </button>
                <button
                  disabled={index === value.mediaIds.length - 1}
                  onClick={() => {
                    const ids = [...value.mediaIds];
                    [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
                    onChange({ ...value, mediaIds: ids });
                  }}
                >
                  →
                </button>
                <button
                  onClick={() =>
                    onChange({
                      ...value,
                      mediaIds: value.mediaIds.filter((item) => item !== id),
                    })
                  }
                >
                  Remove
                </button>
              </span>
            </div>
          ))}
        </div>
        <button className="outline-button" onClick={() => setPick(true)}>
          Choose images · {value.mediaIds.length}
        </button>
        {pick && (
          <Picker
            media={media}
            selected={value.mediaIds}
            multiple
            destination={value.type}
            onConfirm={(ids) => onChange({ ...value, mediaIds: ids })}
            onClose={() => setPick(false)}
          />
        )}
      </>
    );
  return (
    <div className="block-editor">
      <div className="block-top">
        <span>{value.type.replace("imageGrid", "image grid")}</span>
        <button onClick={onRemove}>Remove</button>
      </div>
      {fields}
    </div>
  );
}

export function Editor({
  id,
  initial,
  initialRevisionId,
  initialRevisionVersion,
  media: initialMedia,
  templates: initialTemplates,
}: {
  id: string;
  initial: ItineraryDocument;
  initialRevisionId: string;
  initialRevisionVersion: number;
  media: MediaRecord[];
  templates: TemplateRecord[];
}) {
  const [doc, setDoc] = useState(initial);
  const [baseline, setBaseline] = useState(snapshot(initial));
  const [revisionId, setRevisionId] = useState(initialRevisionId);
  const [revisionVersion, setRevisionVersion] = useState(
    initialRevisionVersion,
  );
  const [media, setMedia] = useState(initialMedia);
  const [templates, setTemplates] = useState(initialTemplates);
  const [activeId, setActiveId] = useState(initial.sections[0]?.id || "");
  const [heroPicker, setHeroPicker] = useState(false);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("Draft changes are private");
  const [error, setError] = useState("");
  const [upload, setUpload] = useState<number | null>(null);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const operation = useRef(0);
  const dirty = snapshot(doc) !== baseline;
  const busy = saving || publishing;
  const active = doc.sections.find((section) => section.id === activeId);
  const filtered = useMemo(() => {
    const value = filter.toLowerCase().trim();
    return media.filter(
      (item) =>
        !value ||
        item.tags.some((tag) => tag.includes(value)) ||
        item.originalName.toLowerCase().includes(value),
    );
  }, [media, filter]);
  const chronological = useMemo(
    () =>
      doc.sections
        .map((section, index) => ({ section, index }))
        .sort(
          (a, b) =>
            (a.section.startDate || "9999-12-31").localeCompare(
              b.section.startDate || "9999-12-31",
            ) || a.index - b.index,
        ),
    [doc.sections],
  );
  const hasDateConflict = chronological.some(
    (item, index) => item.index !== index,
  );
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    fetch(`/api/admin/itineraries/${id}/revisions`, {
      credentials: "same-origin",
    })
      .then((response) => response.json())
      .then((result) => setRevisions(result.revisions || []))
      .catch(() => {});
  }, [id]);
  const patchSection = (patch: Partial<ItinerarySection>) =>
    setDoc((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === activeId ? { ...section, ...patch } : section,
      ),
    }));
  const save = async () => {
    if (busy) return;
    const token = ++operation.current;
    setSaving(true);
    setError("");
    try {
      const result = await mutate(`/api/admin/itineraries/${id}`, "PUT", {
        document: doc,
        revisionId,
        revisionVersion,
      });
      if (token !== operation.current) return;
      setDoc(result.document);
      setRevisionId(result.revisionId);
      setRevisionVersion(result.revisionVersion);
      setBaseline(snapshot(result.document));
      setMessage("Draft saved on the server");
    } catch (reason) {
      if (token === operation.current)
        setError(reason instanceof Error ? reason.message : "Save failed");
    } finally {
      if (token === operation.current) setSaving(false);
    }
  };
  const publish = async () => {
    if (busy) return;
    const token = ++operation.current;
    setPublishing(true);
    setError("");
    try {
      const result = await mutate(
        `/api/admin/itineraries/${id}/publish`,
        "POST",
        { document: doc, revisionId, revisionVersion },
      );
      if (token !== operation.current) return;
      setDoc(result.draft.document);
      setRevisionId(result.draft.revisionId);
      setRevisionVersion(result.draft.revisionVersion);
      setBaseline(snapshot(result.draft.document));
      setActiveId("");
      setMessage(
        `Published revision ${result.published.revisionNumber}. A clean new draft is ready.`,
      );
      setRevisions(
        await fetch(`/api/admin/itineraries/${id}/revisions`)
          .then((response) => response.json())
          .then((value) => value.revisions || []),
      );
    } catch (reason) {
      if (token === operation.current)
        setError(reason instanceof Error ? reason.message : "Publish failed");
    } finally {
      if (token === operation.current) setPublishing(false);
    }
  };
  const addSection = (template?: TemplateRecord) => {
    const section: ItinerarySection = {
      id: uid(),
      title: template?.name || "New section",
      templateId: template?.id,
      blocks: template ? cloneBlocks(template.blocks) : [block("paragraph")],
    };
    setDoc((current) => ({
      ...current,
      sections: [...current.sections, section],
    }));
    setActiveId(section.id);
  };
  const move = (direction: number) => {
    const index = doc.sections.findIndex((section) => section.id === activeId),
      target = index + direction;
    if (index < 0 || target < 0 || target >= doc.sections.length) return;
    const sections = [...doc.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    setDoc({ ...doc, sections });
  };
  const uploadFile = (file: File) => {
    const tagsText = prompt("Meaningful comma-separated tags (required)", "");
    if (
      !tagsText
        ?.split(",")
        .some(
          (value) => value.trim() && value.trim().toLowerCase() !== "uploaded",
        )
    ) {
      setError("Upload cancelled: add at least one meaningful tag.");
      return;
    }
    const altText = prompt(
      "Alt text (required)",
      file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
    );
    if (!altText?.trim()) {
      setError("Upload cancelled: alt text is required.");
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/media");
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-CSRF-Token", csrf());
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("X-Tags", tagsText);
    xhr.setRequestHeader("X-Alt-Text", altText);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        setUpload(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = async () => {
      setUpload(null);
      const result = (await xhr.responseText)
        ? JSON.parse(xhr.responseText)
        : {};
      if (xhr.status >= 200 && xhr.status < 300) {
        const listing = await fetch("/api/admin/media").then((response) =>
          response.json(),
        );
        setMedia(listing.media);
        setMessage(
          "Image uploaded to the library; it has not been placed in the itinerary",
        );
      } else setError(result.error || "Upload failed validation");
    };
    xhr.onerror = () => {
      setUpload(null);
      setError("Upload failed");
    };
    xhr.send(file);
  };
  const editMedia = async (item: MediaRecord) => {
    const altText = prompt("Alt text", item.altText);
    if (altText === null) return;
    const tagsText = prompt("Comma-separated tags", item.tags.join(", "));
    if (tagsText === null) return;
    try {
      await mutate(`/api/admin/media/${item.id}`, "PUT", {
        altText,
        tags: tagsText.split(","),
      });
      setMedia((current) =>
        current.map((value) =>
          value.id === item.id
            ? {
                ...value,
                altText,
                tags: tagsText
                  .split(",")
                  .map((tag) => tag.trim().toLowerCase())
                  .filter(Boolean),
              }
            : value,
        ),
      );
      setMessage("Media metadata updated");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Metadata update failed",
      );
    }
  };
  return (
    <div className="editor">
      <aside className="section-rail">
        <a href="/admin" className="back-link">
          All itineraries
        </a>
        <div className="rail-title">
          <p className="eyebrow">Sections</p>
          <span>{doc.sections.length}</span>
        </div>
        {hasDateConflict && (
          <p className="order-warning">
            Manual order conflicts with dates. Preview and publication use
            chronological order.
          </p>
        )}
        <nav>
          {doc.sections.map((section, index) => (
            <button
              className={section.id === activeId ? "active" : ""}
              key={section.id}
              onClick={() => setActiveId(section.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b>{section.title}</b>
              <small>{section.startDate || "Date not set"}</small>
            </button>
          ))}
        </nav>
        <details className="template-menu">
          <summary>Sections & templates</summary>
          <button onClick={() => addSection()}>Add blank section</button>
          {templates.map((template) => (
            <div className="template-row" key={template.id}>
              <button onClick={() => addSection(template)}>
                {template.name}
                <small>{template.description}</small>
              </button>
              <button
                title="Edit template"
                onClick={async () => {
                  const name = prompt("Template name", template.name),
                    description = prompt(
                      "Template description",
                      template.description,
                    );
                  if (!name || description === null) return;
                  try {
                    const saved = await mutate("/api/admin/templates", "PUT", {
                      ...template,
                      name,
                      description,
                    });
                    setTemplates((current) =>
                      current.map((item) =>
                        item.id === template.id ? saved : item,
                      ),
                    );
                    setMessage(
                      "Template updated; existing sections were not changed",
                    );
                  } catch (reason) {
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Template update failed",
                    );
                  }
                }}
              >
                Edit
              </button>
              <button
                className="danger"
                title="Delete template"
                onClick={async () => {
                  if (
                    !confirm(
                      `Delete template “${template.name}”? Existing sections will remain unchanged.`,
                    )
                  )
                    return;
                  try {
                    await mutate(
                      `/api/admin/templates/${template.id}`,
                      "DELETE",
                    );
                    setTemplates((current) =>
                      current.filter((item) => item.id !== template.id),
                    );
                    setMessage("Template deleted");
                  } catch (reason) {
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Template deletion failed",
                    );
                  }
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </details>
        <details className="publication-menu">
          <summary>Publications ({revisions.length})</summary>
          {revisions.map((revision) => (
            <div key={revision.id}>
              <span>
                Revision {revision.number} · {revision.state}
              </span>
              <a
                target="_blank"
                href={`/admin/itineraries/${id}/revisions/${revision.id}/preview`}
              >
                Preview
              </a>
              <button
                onClick={async () => {
                  if (
                    dirty &&
                    !confirm(
                      "Replace this unsaved draft with the selected publication?",
                    )
                  )
                    return;
                  try {
                    const result = await mutate(
                      `/api/admin/itineraries/${id}/revisions/${revision.id}`,
                      "POST",
                      {
                        draftRevisionId: revisionId,
                        draftRevisionVersion: revisionVersion,
                      },
                    );
                    setDoc(result.document);
                    setBaseline(snapshot(result.document));
                    setRevisionVersion(result.revisionVersion);
                    setActiveId(result.document.sections[0]?.id || "");
                    setMessage(`Editing a copy of revision ${revision.number}`);
                  } catch (reason) {
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Could not restore publication",
                    );
                  }
                }}
              >
                Edit as draft
              </button>
              <button
                className="danger"
                onClick={async () => {
                  if (
                    !confirm(
                      `Delete publication revision ${revision.number}? This cannot be reversed.`,
                    )
                  )
                    return;
                  try {
                    await mutate(
                      `/api/admin/itineraries/${id}/revisions/${revision.id}`,
                      "DELETE",
                    );
                    setRevisions((current) =>
                      current.filter((item) => item.id !== revision.id),
                    );
                    setMessage(
                      `Publication revision ${revision.number} deleted`,
                    );
                  } catch (reason) {
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Delete failed",
                    );
                  }
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </details>
      </aside>
      <main className="edit-canvas">
        <header className="editor-toolbar">
          <div>
            <span className="save-status">
              {error || message}
              {dirty ? " · Unsaved changes" : " · Clean"}
            </span>
          </div>
          <div>
            <a
              className="outline-button"
              href={`/admin/itineraries/${id}/preview`}
              target="_blank"
            >
              Preview draft
            </a>
            <button className="outline-button" onClick={save} disabled={busy}>
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              className="copper-button"
              onClick={publish}
              disabled={busy || !doc.sections.length}
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          </div>
        </header>
        <section className="trip-fields">
          <label>
            Itinerary title
            <input
              value={doc.title}
              onChange={(event) =>
                setDoc({ ...doc, title: event.target.value })
              }
            />
          </label>
          <label>
            Subtitle
            <input
              value={doc.subtitle}
              onChange={(event) =>
                setDoc({ ...doc, subtitle: event.target.value })
              }
            />
          </label>
          <label>
            Traveler
            <input
              value={doc.travelerName}
              onChange={(event) =>
                setDoc({ ...doc, travelerName: event.target.value })
              }
            />
          </label>
          <label>
            Journey dates
            <span className="date-pair">
              <input
                type="date"
                value={doc.startDate || ""}
                onChange={(event) =>
                  setDoc({ ...doc, startDate: event.target.value })
                }
              />
              <input
                type="date"
                value={doc.endDate || ""}
                onChange={(event) =>
                  setDoc({ ...doc, endDate: event.target.value })
                }
              />
            </span>
          </label>
        </section>
        {active ? (
          <section className="section-editor">
            <div className="section-actions">
              <button onClick={() => move(-1)}>Move up</button>
              <button onClick={() => move(1)}>Move down</button>
              <button
                onClick={() => {
                  const copy = cloneSection(active);
                  setDoc({
                    ...doc,
                    sections: [
                      ...doc.sections.slice(
                        0,
                        doc.sections.indexOf(active) + 1,
                      ),
                      copy,
                      ...doc.sections.slice(doc.sections.indexOf(active) + 1),
                    ],
                  });
                  setActiveId(copy.id);
                }}
              >
                Duplicate
              </button>
              <button
                onClick={async () => {
                  const name = prompt("Template name", active.title);
                  if (!name) return;
                  try {
                    const saved = await mutate("/api/admin/templates", "POST", {
                      id: `custom-${uid()}`,
                      name,
                      description: `Saved from ${active.title}`,
                      blocks: active.blocks,
                    });
                    setTemplates((current) => [...current, saved]);
                    setMessage("Reusable template created");
                  } catch (reason) {
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Template failed",
                    );
                  }
                }}
              >
                Save as template
              </button>
              <button
                className="danger"
                onClick={() => {
                  if (
                    confirm(
                      `Remove “${active.title}” from this draft? Published revisions will not change.`,
                    )
                  ) {
                    const sections = doc.sections.filter(
                      (section) => section.id !== active.id,
                    );
                    setDoc({ ...doc, sections });
                    setActiveId(sections[0]?.id || "");
                  }
                }}
              >
                Remove section
              </button>
            </div>
            <div className="section-meta">
              <label>
                Section title
                <input
                  value={active.title}
                  onChange={(event) =>
                    patchSection({ title: event.target.value })
                  }
                />
              </label>
              <label>
                Location
                <input
                  value={active.location || ""}
                  onChange={(event) =>
                    patchSection({ location: event.target.value })
                  }
                />
              </label>
              <label>
                Start
                <input
                  type="date"
                  value={active.startDate || ""}
                  onChange={(event) =>
                    patchSection({ startDate: event.target.value })
                  }
                />
              </label>
              <label>
                End
                <input
                  type="date"
                  value={active.endDate || ""}
                  onChange={(event) =>
                    patchSection({ endDate: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="hero-field">
              {active.heroMediaId ? (
                <img
                  src={`/api/media/${active.heroMediaId}/thumbnail`}
                  alt={
                    media.find((item) => item.id === active.heroMediaId)
                      ?.altText || "Selected hero"
                  }
                />
              ) : (
                <div className="image-missing">No hero selected</div>
              )}
              <span>
                <p className="eyebrow">Hero image</p>
                <button
                  className="outline-button"
                  onClick={() => setHeroPicker(true)}
                >
                  Choose from library
                </button>
                {active.heroMediaId && (
                  <button
                    className="text-button"
                    onClick={() => patchSection({ heroMediaId: undefined })}
                  >
                    Remove hero
                  </button>
                )}
              </span>
            </div>
            <div className="blocks">
              {active.blocks.map((value, index) => (
                <BlockEditor
                  key={value.id}
                  value={value}
                  media={media}
                  onChange={(next) =>
                    patchSection({
                      blocks: active.blocks.map((item, i) =>
                        i === index ? next : item,
                      ),
                    })
                  }
                  onRemove={() =>
                    patchSection({
                      blocks: active.blocks.filter((_, i) => i !== index),
                    })
                  }
                />
              ))}
            </div>
            <div className="add-block">
              <span>Add content</span>
              {(
                [
                  "heading",
                  "paragraph",
                  "list",
                  "facts",
                  "imageGrid",
                  "carousel",
                ] as ContentBlock["type"][]
              ).map((type) => (
                <button
                  key={type}
                  onClick={() =>
                    patchSection({ blocks: [...active.blocks, block(type)] })
                  }
                >
                  {type.replace("imageGrid", "image grid")}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="empty-editor">
            <h2>Clean new draft</h2>
            <p>
              Add a blank section or restore a published revision when you are
              ready to begin the next edition.
            </p>
          </section>
        )}
      </main>
      <aside className="media-rail">
        <div className="media-heading">
          <div>
            <p className="eyebrow">Media</p>
            <h2>Library</h2>
          </div>
          <button onClick={() => fileRef.current?.click()}>Upload</button>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadFile(file);
              event.currentTarget.value = "";
            }}
          />
        </div>
        {upload !== null && (
          <div className="upload-progress">
            <span style={{ width: `${upload}%` }} />
            <b>{upload}%</b>
          </div>
        )}
        <input
          className="media-search"
          placeholder="Filter by tag or name"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <p className="media-help">
          Library images are not placed until you confirm a hero or content
          selection.
        </p>
        <div className="media-grid">
          {filtered.map((item) => (
            <div key={item.id}>
              <img src={`/api/media/${item.id}/thumbnail`} alt={item.altText} />
              <span>{item.tags.slice(0, 2).join(" · ")}</span>
              <button onClick={() => editMedia(item)}>Metadata</button>
              <button
                className="danger"
                onClick={async () => {
                  if (
                    !confirm(
                      `Delete “${item.originalName}” from the media library? Only unreferenced images can be deleted.`,
                    )
                  )
                    return;
                  try {
                    await mutate(`/api/admin/media/${item.id}`, "DELETE");
                    setMedia((current) =>
                      current.filter((value) => value.id !== item.id),
                    );
                    setMessage("Unreferenced image deleted");
                  } catch (reason) {
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Delete failed",
                    );
                  }
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </aside>
      {heroPicker && active && (
        <Picker
          media={media}
          selected={active.heroMediaId ? [active.heroMediaId] : []}
          multiple={false}
          destination="section hero"
          onConfirm={(ids) => patchSection({ heroMediaId: ids[0] })}
          onClose={() => setHeroPicker(false)}
        />
      )}
    </div>
  );
}
