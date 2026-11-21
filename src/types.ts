export type Role = "ADMIN" | "TRAVELER";
export type Fact = { label: string; value: string };
export type ContentBlock =
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "subtitle"; text: string }
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "list"; items: string[] }
  | { id: string; type: "facts"; title: string; items: Fact[] }
  | { id: string; type: "imageGrid" | "carousel" | "gallery"; mediaIds: string[] };
export type ItinerarySection = {
  id: string; title: string; startDate?: string; endDate?: string; location?: string;
  heroMediaId?: string; templateId?: string; blocks: ContentBlock[];
};
export type ItineraryDocument = {
  title: string; subtitle: string; travelerName: string; startDate?: string; endDate?: string;
  sections: ItinerarySection[];
};
export type MediaRecord = {
  id: string; originalName: string; mimeType: string; width: number; height: number;
  tags: string[]; altText: string; createdAt: string;
};
export type TemplateRecord = { id: string; name: string; description: string; blocks: ContentBlock[]; updatedAt: string };
export type RevisionSummary = { id: string; number: number; state: string; publishedAt: string | null; updatedAt: string };

export type LeftPanel = {
  eyebrow?: string;
  title: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  heroMediaId?: string;
  /** center-left is retained only for safely rendering historical snapshots. */
  overlayPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center-left";
  objectPosition?: string;
};
export type MediaAllocation = { media_id: string; page_id: string; page_title: string };
export type SafariPageDocument = {
  leftPanel: LeftPanel;
  rightPanel: { blocks: ContentBlock[] };
};
export type SafariPageStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "UNPUBLISHED_CHANGES";
export type SafariPageSummary = {
  id: string;
  title: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  heroMediaId?: string;
  sortOrder: number;
  status: SafariPageStatus;
  journalIncluded: boolean;
  updatedAt: string;
  publishedAt: string | null;
};
