// ── Impact House Church — API Client ──────────────────────
// Set this to your Render backend URL after deploying
const API_BASE = window.ENV_API_URL || 'http://localhost:4000/api';

let _token = localStorage.getItem('ihc_token') || null;

const headers = () => ({
  'Content-Type': 'application/json',
  ..._token ? { Authorization: `Bearer ${_token}` } : {},
});

const handle = async (res) => {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

// ── Auth ────────────────────────────────────────────────
export const auth = {
  async login(email, password) {
    const data = await handle(await fetch(`${API_BASE}/auth/login`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ email, password })
    }));
    _token = data.token;
    localStorage.setItem('ihc_token', _token);
    return data;
  },
  async register(name, email, password) {
    const data = await handle(await fetch(`${API_BASE}/auth/register`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ name, email, password })
    }));
    _token = data.token;
    localStorage.setItem('ihc_token', _token);
    return data;
  },
  async me() {
    return handle(await fetch(`${API_BASE}/auth/me`, { headers: headers() }));
  },
  logout() {
    _token = null;
    localStorage.removeItem('ihc_token');
    window.location.reload();
  },
  isLoggedIn: () => !!_token,
};

// ── Stats ───────────────────────────────────────────────
export const stats = {
  async get() {
    return handle(await fetch(`${API_BASE}/stats`, { headers: headers() }));
  },
};

// ── Members ─────────────────────────────────────────────
export const members = {
  async list(params = {}) {
    const q = new URLSearchParams(params).toString();
    return handle(await fetch(`${API_BASE}/members${q ? '?' + q : ''}`, { headers: headers() }));
  },
  async get(id) {
    return handle(await fetch(`${API_BASE}/members/${id}`, { headers: headers() }));
  },
  async create(data) {
    return handle(await fetch(`${API_BASE}/members`, {
      method: 'POST', headers: headers(), body: JSON.stringify(data)
    }));
  },
  async update(id, data) {
    return handle(await fetch(`${API_BASE}/members/${id}`, {
      method: 'PATCH', headers: headers(), body: JSON.stringify(data)
    }));
  },
  async remove(id) {
    return handle(await fetch(`${API_BASE}/members/${id}`, {
      method: 'DELETE', headers: headers()
    }));
  },
  async groups() {
    return handle(await fetch(`${API_BASE}/members/groups/list`, { headers: headers() }));
  },
};

// ── Messages ────────────────────────────────────────────
export const messages = {
  async list(params = {}) {
    const q = new URLSearchParams(params).toString();
    return handle(await fetch(`${API_BASE}/messages${q ? '?' + q : ''}`, { headers: headers() }));
  },
  async get(id) {
    return handle(await fetch(`${API_BASE}/messages/${id}`, { headers: headers() }));
  },
  async send(data) {
    return handle(await fetch(`${API_BASE}/messages`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ ...data, send_now: true })
    }));
  },
  async draft(data) {
    return handle(await fetch(`${API_BASE}/messages`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ ...data, send_now: false })
    }));
  },
  async deliveries(id) {
    return handle(await fetch(`${API_BASE}/messages/${id}/deliveries`, { headers: headers() }));
  },
};
