import { CodexAppServerClient } from "./codexAppServer";
const clients = new Map<number, CodexAppServerClient>();
export function getCodexClient(userId: number) { let client = clients.get(userId); if (!client) { client = new CodexAppServerClient(); clients.set(userId, client); } return client; }
export async function stopCodexClient(userId: number) { const client = clients.get(userId); if (client) { await client.stop(); clients.delete(userId); } }
export function getCodexClientIfStarted(userId: number) { return clients.get(userId) ?? null; }
