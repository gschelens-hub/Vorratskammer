// Tiny PostgREST client for Supabase, used only server-side with the service role key.

export function db(env) {
  const base = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  async function call(method, path, body, extra = {}) {
    const res = await fetch(`${base}/${path}`, {
      method,
      headers: { ...headers, ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase ${method} ${path} → ${res.status}: ${text}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    select: (table, query = '') => call('GET', `${table}?select=*${query ? `&${query}` : ''}`),
    insert: (table, row) => call('POST', table, row, { Prefer: 'return=representation' }),
    upsert: (table, row, onConflict) =>
      call('POST', `${table}?on_conflict=${onConflict}`, row, {
        Prefer: 'resolution=merge-duplicates,return=representation',
      }),
    update: (table, query, patch) => call('PATCH', `${table}?${query}`, patch, { Prefer: 'return=representation' }),
    remove: (table, query) => call('DELETE', `${table}?${query}`),
  };
}
