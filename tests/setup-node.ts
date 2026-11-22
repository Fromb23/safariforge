import { migrate } from "@/lib/db";

// Imported explicitly by persistence suites so jsdom never loads server modules.
migrate();
