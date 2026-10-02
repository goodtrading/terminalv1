import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const storePath = () => process.env.GOODTRADING_PROVIDER_DPAPI_PATH?.trim() || path.join(process.cwd(), "work", "provider-vault.dpapi.json");
type Store = Record<string, string>;
function run(mode: "protect" | "unprotect", value: string): string {
  const script = mode === "protect"
    ? '$v=[Console]::In.ReadToEnd(); Add-Type -AssemblyName System.Security; $b=[Text.Encoding]::UTF8.GetBytes($v); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,"CurrentUser"))'
    : '$v=[Console]::In.ReadToEnd(); Add-Type -AssemblyName System.Security; $b=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v),$null,"CurrentUser"); [Text.Encoding]::UTF8.GetString($b)';
  const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { input: value, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024 });
  if (result.status !== 0 || !result.stdout) throw new Error("WINDOWS_DPAPI_OPERATION_FAILED");
  return result.stdout.trimEnd();
}
async function readStore(): Promise<Store> { try { return JSON.parse(await fs.readFile(storePath(), "utf8")) as Store; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; } }
async function writeStore(store: Store): Promise<void> { const file=storePath(); await fs.mkdir(path.dirname(file),{recursive:true}); const tmp=`${file}.${process.pid}.${Date.now()}.tmp`; await fs.writeFile(tmp,JSON.stringify(store),{mode:0o600}); await fs.rename(tmp,file); }
export async function putWindowsSecret(reference: string, value: string): Promise<void> { const store=await readStore(); store[reference]=run("protect",value); await writeStore(store); }
export async function getWindowsSecret(reference: string): Promise<string | null> { const value=(await readStore())[reference]; return value ? run("unprotect",value) : null; }
export async function deleteWindowsSecret(reference: string): Promise<void> { const store=await readStore(); if (!(reference in store)) return; delete store[reference]; await writeStore(store); }
