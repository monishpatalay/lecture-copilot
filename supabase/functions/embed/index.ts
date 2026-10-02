import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

// Query-time embeddings with the built-in gte-small (384 dims).
// Must match the worker's sentence-transformers gte-small; see worker/tests/test_parity.py.
const model = new Supabase.ai.Session('gte-small')

Deno.serve(async (req) => {
  const { input } = await req.json().catch(() => ({}))
  if (typeof input !== 'string' || !input.trim() || input.length > 2000) {
    return Response.json({ error: 'input must be a non-empty string ≤ 2000 chars' }, { status: 400 })
  }
  const embedding = await model.run(input, { mean_pool: true, normalize: true })
  return Response.json({ embedding })
})
