import "dotenv/config";
import { migrate } from "../src/lib/db";
migrate();
console.log("SafariForge database is up to date.");
