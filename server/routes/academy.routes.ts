import type { Express, Request, Response } from "express";
import { requireSaasAuth } from "../middleware/saasAuth";
import { serveAcademyMemberContent } from "../academy/academyContentService";

export function registerAcademyRoutes(app: Express): void {
  app.get(
    "/api/academy/lessons/:courseSlug/:lessonSlug/content",
    requireSaasAuth,
    (req: Request, res: Response) => {
      void serveAcademyMemberContent(req, res);
    },
  );
}
