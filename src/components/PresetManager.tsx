"use client";
import { useState } from "react";
import type { ContentBlock, TemplateRecord } from "@/types";
import { mutate } from "./AdminDashboard";
import { ActionMenu } from "./ActionMenu";
const uid = () => crypto.randomUUID();
function block(type: ContentBlock["type"]): ContentBlock {
  if (type === "heading" || type === "subtitle" || type === "paragraph") return { id: uid(), type, text: "Starter copy" };
  if (type === "list") return { id: uid(), type, items: ["Starter detail"] };
  if (type === "facts")
    return {
      id: uid(),
      type,
      title: "At a glance",
      items: [{ label: "Detail", value: "Value" }],
    };
  return { id: uid(), type, mediaIds: [] };
}
function Block({ value, onChange }: { value: ContentBlock; onChange: (value: ContentBlock) => void }) {
  if (value.type === "heading" || value.type === "subtitle" || value.type === "paragraph") return <textarea aria-label={`${value.type} starter text`} value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} />;
  if (value.type === "list") return <textarea aria-label="Starter list" value={value.items.join("\n")} onChange={(e) => onChange({ ...value, items: e.target.value.split("\n") })} />;
  if (value.type === "facts")
    return (
      <>
        <input aria-label="Facts title" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
        <textarea
          aria-label="Facts, label and value separated by a colon"
          value={value.items.map((v) => `${v.label}: ${v.value}`).join("\n")}
          onChange={(e) =>
            onChange({
              ...value,
              items: e.target.value.split("\n").map((line) => {
                const [label, ...rest] = line.split(":");
                return { label: label.trim(), value: rest.join(":").trim() };
              }),
            })
          }
        />
      </>
    );
  return <p>Image selection remains empty until an administrator places media on a page.</p>;
}
export function PresetManager({ initial }: { initial: TemplateRecord[] }) {
  const [items, setItems] = useState(initial),
    [message, setMessage] = useState("");
  const update = (id: string, change: (item: TemplateRecord) => TemplateRecord) => setItems((v) => v.map((item) => (item.id === id ? change(item) : item)));
  const save = async (item: TemplateRecord) => {
    try {
      const saved = await mutate("/api/admin/templates", "PUT", item);
      setItems((v) => v.map((p) => (p.id === item.id ? saved : p)));
      setMessage("Layout preset saved");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    }
  };
  return (
    <main className="management-page">
      <a href="/admin">← Back to Pages</a>
      <p className="eyebrow">Reusable structure</p>
      <h1>Layout Presets</h1>
      <p>Presets initialize independent pages. Later preset changes never alter existing Safari Pages.</p>
      {message && <p role="status">{message}</p>}
      <button
        className="copper-button"
        onClick={async () => {
          const item = {
            id: uid(),
            name: "New preset",
            description: "",
            blocks: [] as ContentBlock[],
            updatedAt: "",
          };
          const saved = await mutate("/api/admin/templates", "POST", item);
          setItems((v) => [...v, saved]);
        }}
      >
        Create preset
      </button>
      <section className="preset-list">
        {items.map((item) => (
          <article className="preset-editor" key={item.id}>
            <header>
              <label>
                Name
                <input value={item.name} onChange={(e) => update(item.id, (v) => ({ ...v, name: e.target.value }))} />
              </label>
              <label>
                Description
                <input
                  value={item.description}
                  onChange={(e) =>
                    update(item.id, (v) => ({
                      ...v,
                      description: e.target.value,
                    }))
                  }
                />
              </label>
              <button onClick={() => save(item)}>Save preset</button>
              <ActionMenu>
                <button
                  role="menuitem"
                  className="danger"
                  onClick={async () => {
                    if (!confirm(`Delete preset “${item.name}”? Existing pages are unaffected.`)) return;
                    await mutate(`/api/admin/templates/${item.id}`, "DELETE");
                    setItems((v) => v.filter((p) => p.id !== item.id));
                  }}
                >
                  Delete preset
                </button>
              </ActionMenu>
            </header>
            <div>
              {item.blocks.map((entry, index) => (
                <div className="preset-block" key={entry.id}>
                  <div>
                    <b>{entry.type === "imageGrid" ? "Carousel (legacy image block)" : entry.type}</b>
                    <button
                      disabled={!index}
                      onClick={() =>
                        update(item.id, (v) => {
                          const blocks = [...v.blocks],
                            [moved] = blocks.splice(index, 1);
                          blocks.splice(index - 1, 0, moved);
                          return { ...v, blocks };
                        })
                      }
                    >
                      Earlier
                    </button>
                    <button
                      disabled={index === item.blocks.length - 1}
                      onClick={() =>
                        update(item.id, (v) => {
                          const blocks = [...v.blocks],
                            [moved] = blocks.splice(index, 1);
                          blocks.splice(index + 1, 0, moved);
                          return { ...v, blocks };
                        })
                      }
                    >
                      Later
                    </button>
                    <button
                      onClick={() =>
                        update(item.id, (v) => {
                          const copy = structuredClone(entry);
                          return {
                            ...v,
                            blocks: v.blocks.toSpliced(index + 1, 0, {
                              ...copy,
                              id: uid(),
                            } as ContentBlock),
                          };
                        })
                      }
                    >
                      Duplicate
                    </button>
                    <button
                      className="danger"
                      onClick={() =>
                        update(item.id, (v) => ({
                          ...v,
                          blocks: v.blocks.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      Delete
                    </button>
                  </div>
                  <Block
                    value={entry}
                    onChange={(next) =>
                      update(item.id, (v) => ({
                        ...v,
                        blocks: v.blocks.map((current, i) => (i === index ? next : current)),
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="preset-add">
              <span>Add starter block</span>
              {(["heading", "subtitle", "paragraph", "list", "facts", "carousel"] as ContentBlock["type"][]).map((type) => (
                <button
                  key={type}
                  onClick={() =>
                    update(item.id, (v) => ({
                      ...v,
                      blocks: [...v.blocks, block(type)],
                    }))
                  }
                >
                  {type}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
