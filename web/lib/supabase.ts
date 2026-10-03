import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Anon client: row-level security applies, so it only ever sees public courses.
export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
