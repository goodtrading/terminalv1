declare const __GOODTRADING_APP_VERSION__: string | undefined;

export const appVersion =
  typeof __GOODTRADING_APP_VERSION__ !== "undefined"
    ? __GOODTRADING_APP_VERSION__
    : import.meta.env.VITE_APP_VERSION || "dev";

export const appBuildCommit = import.meta.env.VITE_GIT_COMMIT || "unknown";

export const appBuildLabel =
  appVersion === "dev" ? `dev-${appBuildCommit}` : appVersion;
