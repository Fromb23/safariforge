export type Role = "ADMIN" | "TRAVELER";
export type Fact = { label: string; value: string };
export type ContentBlock =
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "list"; items: string[] }
  | { id: string; type: "facts"; title: string; items: Fact[] }
  | { id: string; type: "imageGrid" | "gallery"; mediaIds: string[] };
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
