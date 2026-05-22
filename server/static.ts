import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).type("application/json").json({
        success: false,
        code: "API_NOT_FOUND",
        message: "API route not found.",
      });
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
