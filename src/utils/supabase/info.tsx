// Supabase connection config.
// Reads from environment variables (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
// Fallback values point to the original production project.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Extract project ID from the URL (e.g. https://abcdef.supabase.co -> abcdef)
export const projectId = supabaseUrl
  ? supabaseUrl.replace(/^https?:\/\//, '').replace('.supabase.co', '')
  : 'tmyopjxujhtmhylfybcc';

export const publicAnonKey = supabaseAnonKey
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRteW9wanh1amh0bWh5bGZ5YmNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDc4MzQsImV4cCI6MjA3NTQ4MzgzNH0.8M1dkWoBqsduMFWQ2q7SGrskRKwVu8KV2QYwzzRi94c';
