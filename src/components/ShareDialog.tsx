import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import type { Project, Share } from '../api';
import { formatDateTime } from '../lib/time';
import { Modal } from './Modal';

const EXPIRY_OPTIONS = [
  { days: 1, label: '24 hours' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

type Props = {
  project: Project;
  onClose: () => void;
  attempt: <T>(action: () => Promise<T>) => Promise<T | undefined>;
};

const linkFor = (share: Share) => `${location.origin}/s/${share.token}`;

export function ShareDialog({ project, onClose, attempt }: Props) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [days, setDays] = useState(7);
  const [label, setLabel] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    attempt(() => api.shares(project.id)).then((list) => setShares(list ?? []));
  }, [attempt, project.id]);

  async function create(event: FormEvent) {
    event.preventDefault();
    const share = await attempt(() => api.createShare(project.id, days, label));
    if (!share) return;
    setShares((list) => [share, ...(list ?? [])]);
    setLabel('');
    copy(share);
  }

  async function revoke(share: Share) {
    if ((await attempt(() => api.deleteShare(share.token))) === undefined) return;
    setShares((list) => list?.filter((s) => s.token !== share.token) ?? null);
  }

  function copy(share: Share) {
    navigator.clipboard?.writeText(linkFor(share)).then(
      () => setCopied(share.token),
      () => undefined,
    );
  }

  return (
    <Modal title={`Share ${project.name}`} onClose={onClose}>
      <p className="muted small">
        Anyone with the link can see this project's hours and daily log until it expires. Rates and earnings stay
        private.
      </p>

      <form className="share-create" onSubmit={create}>
        <input
          className="share-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label, e.g. Client — October"
          maxLength={80}
          aria-label="Label"
        />
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Expires after">
          {EXPIRY_OPTIONS.map((option) => (
            <option key={option.days} value={option.days}>
              {option.label}
            </option>
          ))}
        </select>
        <button className="btn btn-ink">Create link</button>
      </form>

      <ul className="share-list">
        {shares?.length === 0 && <li className="muted small">No active links.</li>}
        {shares?.map((share) => (
          <li key={share.token} className="share-item">
            <div className="share-item-text">
              <span className="share-item-label">{share.label || 'Untitled link'}</span>
              <code className="share-item-url">{linkFor(share)}</code>
              <span className="muted small">Expires {formatDateTime(share.expiresAt)}</span>
            </div>
            <div className="share-item-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => copy(share)}>
                {copied === share.token ? 'Copied' : 'Copy'}
              </button>
              <a className="btn btn-ghost btn-sm" href={linkFor(share)} target="_blank" rel="noreferrer">
                Open
              </a>
              <button className="btn btn-danger-ghost btn-sm" onClick={() => revoke(share)}>
                Revoke
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
