import "dotenv/config";
import { migrate } from "../src/lib/db";
import { migrateLegacyPages } from "../src/lib/pages";
migrate();
migrateLegacyPages();
console.log("SafariForge database is up to date.");
