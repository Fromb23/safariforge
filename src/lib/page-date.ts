import type { LeftPanel, SafariPageDocument } from "@/types";

type LegacyLeftPanel = LeftPanel & { startDate?: unknown; endDate?: unknown };

/** Resolve a calendar date without parsing it as an instant. */
export function pageDate(leftPanel: LeftPanel | LegacyLeftPanel): string | undefined {
  const left = leftPanel as LegacyLeftPanel;
  for (const value of [left.date, left.startDate, left.endDate]) {
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

export function isValidPageDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

/** Normalize a revision in memory without changing its stored historical JSON. */
export function normalizePageDocument(document: SafariPageDocument): SafariPageDocument {
  const legacy = document.leftPanel as LegacyLeftPanel;
  const date = pageDate(legacy);
  const leftPanel = { ...legacy };
  delete leftPanel.date;
  delete leftPanel.startDate;
  delete leftPanel.endDate;
  return { ...document, leftPanel: { ...leftPanel, ...(date ? { date } : {}) } };
}

export function formatPageDate(value?: string): string {
  if (!value || !isValidPageDate(value)) return "";
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const [year, month, day] = value.split("-").map(Number);
  return `${months[month - 1]} ${day}, ${year}`;
}
