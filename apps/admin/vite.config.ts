import { defineConfig, loadEnv } from "vite";

// Everything in a VITE_* variable ships in the page. Refuse to build if a Supabase secret/service-role key was put
// in one by mistake: this console must only ever act through the signed-in staff member's own JWT.
function isSecretKey(value: string): boolean {
  if (value.startsWith("sb_secret_")) return true;
  const payload = value.split(".")[1];
  if (!payload) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).role === "service_role";
  } catch {
    return false;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const leaked = Object.entries(env).filter(([, v]) => isSecretKey(v)).map(([k]) => k);
  if (leaked.length) throw new Error(`Refusing to bundle a Supabase secret key: ${leaked.join(", ")}. Use the anon key.`);
  return {};
});
