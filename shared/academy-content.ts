export type AcademyContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string; level?: 2 | 3 }
  | { type: "list"; items: string[] }
  | { type: "callout"; title?: string; text: string };

export type AcademyMemberContentResponse = {
  lessonId: string;
  content: AcademyContentBlock[];
};
