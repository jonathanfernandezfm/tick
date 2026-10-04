import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Project, ProjectInput } from '../api';
import { toSquareDataUrl } from '../lib/image';
import { Avatar } from './Avatar';
import { Modal } from './Modal';

const COLORS = ['#e4572e', '#1b1a17', '#2f6f4f', '#3a5a98', '#c9a227', '#8c4a6b'];

type Props = {
  project?: Project;
  onClose: () => void;
  onSave: (input: ProjectInput) => Promise<void>;
  onDelete?: () => void;
};

export function ProjectDialog({ project, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState(project?.name ?? '');
  const [color, setColor] = useState(project?.color ?? COLORS[0]);
  const [image, setImage] = useState<string | null>(project?.image ?? null);
  const [rate, setRate] = useState(project?.hourlyRate?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickImage(file: File | undefined) {
    if (!file) return;
    try {
      setImage(await toSquareDataUrl(file));
      setError(null);
    } catch {
      setError('That image could not be read. Try a PNG or JPEG.');
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await onSave({ name: name.trim(), color, image, hourlyRate: rate === '' ? null : Number(rate) });
    setBusy(false);
  }

  return (
    <Modal title={project ? 'Edit project' : 'New project'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="image-picker">
          <Avatar project={{ name: name || '?', color, image }} size={72} />
          <div className="image-picker-actions">
            <label className="btn btn-ghost">
              {image ? 'Change image' : 'Upload image'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
            </label>
            {image && (
              <button type="button" className="link-btn" onClick={() => setImage(null)}>
                Remove
              </button>
            )}
          </div>
        </div>

        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />
        </label>

        <fieldset className="field">
          <legend>Color</legend>
          <div className="swatches">
            {COLORS.map((swatch) => (
              <button
                type="button"
                key={swatch}
                className={`swatch${swatch === color ? ' is-selected' : ''}`}
                style={{ background: swatch }}
                onClick={() => setColor(swatch)}
                aria-label={`Color ${swatch}`}
                aria-pressed={swatch === color}
              />
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span>
            Hourly rate <em className="optional">optional, private</em>
          </span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="e.g. 45"
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          {onDelete && (
            <button
              type="button"
              className="btn btn-danger-ghost"
              onClick={() => {
                if (confirm(`Delete ${project?.name} and all of its tracked time? This cannot be undone.`)) onDelete();
              }}
            >
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-ink" disabled={busy || !name.trim()}>
            {project ? 'Save' : 'Create project'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
