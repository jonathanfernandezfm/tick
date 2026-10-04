import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Entry } from '../api';
import { DAY, dayKey, formatDuration, fromInputs, timeInput } from '../lib/time';
import { Modal } from './Modal';

type Props = {
  entry: Entry;
  onClose: () => void;
  onSave: (input: { startedAt: number; endedAt: number | null; note: string }) => Promise<void>;
  onDelete: () => void;
};

export function EntryDialog({ entry, onClose, onSave, onDelete }: Props) {
  const isRunning = entry.endedAt === null;
  const [date, setDate] = useState(dayKey(entry.startedAt));
  const [start, setStart] = useState(timeInput(entry.startedAt));
  const [end, setEnd] = useState(entry.endedAt ? timeInput(entry.endedAt) : '');
  const [note, setNote] = useState(entry.note);
  const [busy, setBusy] = useState(false);

  const startedAt = fromInputs(date, start);
  let endedAt = isRunning ? null : fromInputs(date, end);
  // An end time before the start means the work ran past midnight.
  if (endedAt !== null && endedAt <= startedAt) endedAt += DAY;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await onSave({ startedAt, endedAt, note: note.trim() });
    setBusy(false);
  }

  return (
    <Modal title={isRunning ? 'Running timer' : 'Edit entry'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field-row">
          <label className="field">
            <span>Day</span>
            <input type="date" value={date} max={dayKey(Date.now())} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>From</span>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          {!isRunning && (
            <label className="field">
              <span>To</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </label>
          )}
        </div>
        {endedAt !== null && (
          <p className="muted small">
            Duration <strong>{formatDuration(endedAt - startedAt)}</strong>
          </p>
        )}
        <label className="field">
          <span>
            Note <em className="optional">optional</em>
          </span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="What did you work on?" />
        </label>
        <div className="form-actions">
          <button
            type="button"
            className="btn btn-danger-ghost"
            onClick={() => confirm('Delete this entry?') && onDelete()}
          >
            Delete
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-ink" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
