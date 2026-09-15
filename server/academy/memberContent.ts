import type { AcademyMemberContentResponse } from "@shared/academy-content";

const MEMBER_CONTENT: ReadonlyMap<string, AcademyMemberContentResponse> = new Map([
  [
    "course-02-execution-and-risk-module-04-lesson-01",
    {
      lessonId: "course-02-execution-and-risk-module-04-lesson-01",
      content: [
        { type: "heading", level: 2, text: "Contenido Member" },
        {
          type: "paragraph",
          text: "Esta respuesta fue entregada desde el backend después de validar acceso.",
        },
        {
          type: "callout",
          title: "Fixture de infraestructura",
          text: "Contenido temporal para validar entrega autorizada; no contiene metodología operativa de GoodTrading.",
        },
      ],
    },
  ],
]);

export function getMemberContentByLessonId(lessonId: string): AcademyMemberContentResponse | undefined {
  return MEMBER_CONTENT.get(lessonId);
}

export function hasMemberContentForLessonId(lessonId: string): boolean {
  return MEMBER_CONTENT.has(lessonId);
}
