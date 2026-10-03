import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Service role: bypasses row-level security. Only API routes and server components may import this,
// for the few writes and reads that have no public policy. Never import it from a client component.
export const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
