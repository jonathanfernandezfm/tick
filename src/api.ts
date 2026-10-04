export type Project = {
  id: number;
  name: string;
  color: string;
  image: string | null;
  hourlyRate: number | null;
  createdAt: number;
};

export type Entry = {
  id: number;
  projectId: number;
  startedAt: number;
  endedAt: number | null;
  source: 'timer' | 'manual';
  note: string;
  createdAt: number;
};

export type Share = {
  token: string;
  projectId: number;
  label: string;
  expiresAt: number;
  createdAt: number;
};

export type ProjectInput = Pick<Project, 'name' | 'color' | 'image' | 'hourlyRate'>;

export type PublicView = {
  project: Pick<Project, 'name' | 'color' | 'image'>;
  expiresAt: number;
  entries: Entry[];
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.error ?? `Request failed (${response.status})`);
  return data as T;
}

const range = (from: number, to: number) => `from=${from}&to=${to}`;

export const api = {
  me: () => request<{ email: string }>('GET', '/me'),
  login: (email: string, password: string) => request<{ email: string }>('POST', '/login', { email, password }),
  logout: () => request<void>('POST', '/logout'),

  projects: () => request<Project[]>('GET', '/projects'),
  createProject: (input: ProjectInput) => request<Project>('POST', '/projects', input),
  updateProject: (id: number, input: ProjectInput) => request<Project>('PUT', `/projects/${id}`, input),
  deleteProject: (id: number) => request<void>('DELETE', `/projects/${id}`),

  entries: (from: number, to: number) => request<Entry[]>('GET', `/entries?${range(from, to)}`),
  startTimer: (projectId: number) => request<Entry>('POST', `/projects/${projectId}/start`),
  stopTimer: () => request<Entry | null>('POST', '/timer/stop'),
  addEntry: (input: { projectId: number; startedAt: number; endedAt: number; note?: string }) =>
    request<Entry>('POST', '/entries', input),
  updateEntry: (id: number, input: { startedAt: number; endedAt: number | null; note: string }) =>
    request<Entry>('PUT', `/entries/${id}`, input),
  deleteEntry: (id: number) => request<void>('DELETE', `/entries/${id}`),

  shares: (projectId: number) => request<Share[]>('GET', `/projects/${projectId}/shares`),
  createShare: (projectId: number, days: number, label: string) =>
    request<Share>('POST', `/projects/${projectId}/shares`, { days, label }),
  deleteShare: (token: string) => request<void>('DELETE', `/shares/${token}`),

  publicView: (token: string, from: number, to: number) =>
    request<PublicView>('GET', `/public/${encodeURIComponent(token)}?${range(from, to)}`),
};
