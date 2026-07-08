import { defineConfig } from "drizzle-kit";

const useRemote = !!process.env.DATABASE_URL;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  ...(useRemote
    ? { dbCredentials: { url: process.env.DATABASE_URL! } }
    : { driver: "pglite", dbCredentials: { url: process.env.PGLITE_DIR ?? "./.data/pglite" } }),
});
