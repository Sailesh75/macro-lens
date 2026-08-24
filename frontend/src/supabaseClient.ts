import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — copy frontend/.env.example to frontend/.env and fill them in."
  );
}

// The anon key is safe to ship to the browser by design — it's protected by
// the Row Level Security policies in backend/supabase/schema.sql, not by
// secrecy. This client is only ever used for auth (sign-up/login/session) in
// this app; actual meal data still goes through our own FastAPI backend
// using its service_role key, never queried directly from the frontend.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
