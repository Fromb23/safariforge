"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Item = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  sectionCount: number;
  updatedAt: string;
  publishedAt: string | null;
  status: "DRAFT" | "PUBLISHED" | "UNPUBLISHED";
};
function csrf() {
  return (
    document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("safariforge_admin_csrf="))
      ?.split("=")
      .slice(1)
      .join("=") || ""
  );
}
export async function mutate(url: string, method = "POST", body?: unknown) {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": decodeURIComponent(csrf()),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}
export function AdminDashboard({ items: initial }: { items: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const create = async () => {
    setCreating(true);
    try {
      const result = await mutate("/api/admin/itineraries", "POST", {
        title: "Untitled Tanzania journey",
      });
      router.push(`/admin/itineraries/${result.id}`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Creation failed");
    } finally {
      setCreating(false);
    }
  };
  return (
    <div className="admin-dashboard">
      <section className="admin-title">
        <div>
          <p className="eyebrow">Instructor workspace</p>
          <h1>Shape the journey.</h1>
          <p>
            Draft freely. Travelers keep seeing only their explicitly assigned
            published revision.
          </p>
          {message && <p role="status">{message}</p>}
        </div>
        <button className="copper-button" onClick={create} disabled={creating}>
          {creating ? "Creating…" : "New itinerary"}
        </button>
      </section>
      <section className="itinerary-list">
        <div className="list-heading">
          <h2>Itineraries</h2>
          <span>{items.length} journeys</span>
        </div>
        {items.map((item) => (
          <div className="itinerary-row" key={item.id}>
            <div
              className={`status-seal ${item.status === "PUBLISHED" ? "live" : "draft"}`}
            >
              {item.status === "PUBLISHED"
                ? "Live"
                : item.status === "UNPUBLISHED"
                  ? "Off"
                  : "Draft"}
            </div>
            <div>
              <h3>
                <a href={`/admin/itineraries/${item.id}`}>{item.title}</a>
              </h3>
              <p>{item.subtitle || "Private journey"}</p>
            </div>
            <div className="row-meta">
              <span>{item.sectionCount} draft sections</span>
              <span>
                Edited {new Date(item.updatedAt).toLocaleDateString()}
              </span>
            </div>
            <div className="row-controls">
              <a href={`/admin/itineraries/${item.id}`}>Open</a>
              {item.publishedAt && (
                <button
                  onClick={async () => {
                    if (
                      !confirm(
                        `Unpublish “${item.title}”? Travelers assigned to it will see a preparation message; history and drafts remain.`,
                      )
                    )
                      return;
                    try {
                      await mutate(
                        `/api/admin/itineraries/${item.id}/unpublish`,
                      );
                      setItems((current) =>
                        current.map((value) =>
                          value.id === item.id
                            ? {
                                ...value,
                                publishedAt: null,
                                status: "UNPUBLISHED",
                              }
                            : value,
                        ),
                      );
                      setMessage(`${item.title} unpublished`);
                    } catch (reason) {
                      setMessage(
                        reason instanceof Error
                          ? reason.message
                          : "Unpublish failed",
                      );
                    }
                  }}
                >
                  Unpublish
                </button>
              )}
              <button
                onClick={async () => {
                  try {
                    await mutate(
                      `/api/admin/itineraries/${item.id}/assign-traveler`,
                    );
                    setMessage(`Traveler access assigned to ${item.title}`);
                  } catch (reason) {
                    setMessage(
                      reason instanceof Error
                        ? reason.message
                        : "Assignment failed",
                    );
                  }
                }}
              >
                Assign traveler
              </button>
              <button
                className="danger"
                onClick={async () => {
                  if (
                    !confirm(
                      `Delete the entire itinerary “${item.title}”, including every draft and publication revision? Shared media will remain. This cannot be reversed.`,
                    )
                  )
                    return;
                  try {
                    await mutate(`/api/admin/itineraries/${item.id}`, "DELETE");
                    setItems((current) =>
                      current.filter((value) => value.id !== item.id),
                    );
                    setMessage(
                      `${item.title} deleted; shared media was retained`,
                    );
                  } catch (reason) {
                    setMessage(
                      reason instanceof Error
                        ? reason.message
                        : "Delete failed",
                    );
                  }
                }}
              >
                Delete itinerary
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
