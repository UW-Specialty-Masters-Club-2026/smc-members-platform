'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, describeError } from '@/lib/api';
import { uploadImage } from '@/lib/upload';
import { Icon } from './Icon';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'markdown'
  | 'link'
  | 'image'
  | 'select'
  | 'checks'
  | 'lines'
  | 'number'
  | 'toggle'
  | 'date';

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  options?: { value: string; label: string }[];
  /** Fields on the same row share a key. */
  row?: string;
  /** Only shown when editing an existing item. */
  editOnly?: boolean;
}

export interface Column<T> {
  label: string;
  render: (item: T) => ReactNode;
}

type Item = { id: string } & Record<string, unknown>;

interface Props<T extends Item> {
  title: string;
  description: string;
  /** API path, e.g. "/admin/content/team". */
  endpoint: string;
  singular: string;
  columns: Column<T>[];
  fields: Field[];
  /** Values for a new item. */
  defaults: Record<string, unknown>;
  /** Link to the item on the public site, if any. */
  publicUrl?: (item: T) => string | null;
  /** Property of the list response holding the rows (default "items"). */
  listKey?: string;
}

function toFormValue(field: Field, value: unknown): unknown {
  if (field.type === 'lines') return Array.isArray(value) ? value.join('\n') : '';
  if (field.type === 'checks') return Array.isArray(value) ? value : [];
  if (field.type === 'toggle') return Boolean(value);
  if (field.type === 'number') return value ?? '';
  return value ?? '';
}

function toPayload(fields: Field[], values: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.name];
    if (f.type === 'lines') {
      out[f.name] = String(v ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    } else if (f.type === 'number') {
      out[f.name] = v === '' || v === undefined ? undefined : Number(v);
    } else if (f.type === 'toggle' || f.type === 'checks') {
      out[f.name] = v;
    } else {
      const s = String(v ?? '').trim();
      // Empty optional fields are cleared; empty required fields are left for validation.
      out[f.name] = s === '' ? (f.required ? '' : null) : s;
    }
  }
  return out;
}

export function ResourceManager<T extends Item>(props: Props<T>) {
  const { endpoint, fields } = props;
  const [items, setItems] = useState<T[] | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<T | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(
    async (q: string) => {
      const res = await api<Record<string, T[]>>(
        `${endpoint}${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      );
      if (!res.ok) return setLoadError(describeError(res));
      setLoadError(null);
      setItems(res.data?.[props.listKey ?? 'items'] ?? []);
    },
    [endpoint, props.listKey],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(query.trim()), 250);
    return () => clearTimeout(t);
  }, [load, query]);

  async function remove(item: T) {
    const res = await api(`${endpoint}/${item.id}`, { method: 'DELETE' });
    setConfirmDelete(null);
    setMessage(
      res.ok ? { text: `${props.singular} deleted.` } : { text: describeError(res), error: true },
    );
    await load(query.trim());
  }

  return (
    <>
      <div className="ax-page-head">
        <div>
          <h1 className="ax-h1">{props.title}</h1>
          <p>{props.description}</p>
        </div>
        <button type="button" className="ax-btn ax-btn--primary" onClick={() => setEditing('new')}>
          <Icon name="plus" /> New {props.singular.toLowerCase()}
        </button>
      </div>

      {message && (
        <p
          className={`ax-alert${message.error ? ' ax-alert--error' : ''}`}
          role={message.error ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}

      <section className="ax-card">
        <div className="ax-card-head">
          <label className="ax-search">
            <Icon name="search" size={16} />
            <span className="sr-only">Search {props.title.toLowerCase()}</span>
            <input
              className="ax-input"
              type="search"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <span className="ax-muted">{items ? `${items.length} total` : ''}</span>
        </div>
        {loadError ? (
          <p className="ax-alert ax-alert--error" style={{ margin: 16 }}>
            {loadError}
          </p>
        ) : items === null ? (
          <p className="ax-empty">Loading…</p>
        ) : items.length === 0 ? (
          <p className="ax-empty">
            Nothing here yet. Add the first {props.singular.toLowerCase()}.
          </p>
        ) : (
          <div className="ax-table-wrap">
            <table className="ax-table">
              <thead>
                <tr>
                  {props.columns.map((c) => (
                    <th key={c.label} scope="col">
                      {c.label}
                    </th>
                  ))}
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    {props.columns.map((c) => (
                      <td key={c.label}>{c.render(item)}</td>
                    ))}
                    <td>
                      {confirmDelete?.id === item.id ? (
                        <div className="ax-confirm">
                          <span>Delete permanently?</span>
                          <button
                            type="button"
                            className="ax-btn ax-btn--danger"
                            onClick={() => void remove(item)}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            className="ax-btn"
                            onClick={() => setConfirmDelete(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="ax-row-actions">
                          {props.publicUrl?.(item) && (
                            <a
                              className="ax-icon-btn"
                              href={props.publicUrl(item)!}
                              target="_blank"
                              rel="noopener"
                              aria-label="View on website"
                            >
                              <Icon name="external" size={16} />
                            </a>
                          )}
                          <button
                            type="button"
                            className="ax-icon-btn"
                            aria-label="Edit"
                            onClick={() => setEditing(item)}
                          >
                            <Icon name="edit" size={16} />
                          </button>
                          <button
                            type="button"
                            className="ax-icon-btn"
                            aria-label="Delete"
                            onClick={() => setConfirmDelete(item)}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <Editor
          key={editing === 'new' ? 'new' : editing.id}
          title={
            editing === 'new'
              ? `New ${props.singular.toLowerCase()}`
              : `Edit ${props.singular.toLowerCase()}`
          }
          fields={editing === 'new' ? fields.filter((f) => !f.editOnly) : fields}
          initial={editing === 'new' ? props.defaults : editing}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const body = toPayload(
              editing === 'new' ? fields.filter((f) => !f.editOnly) : fields,
              values,
            );
            const res =
              editing === 'new'
                ? await api(endpoint, { method: 'POST', body })
                : await api(`${endpoint}/${editing.id}`, { method: 'PATCH', body });
            if (res.ok) {
              setEditing(null);
              setMessage({ text: `${props.singular} saved.` });
              await load(query.trim());
            }
            return res;
          }}
        />
      )}
    </>
  );
}

function Editor(props: {
  title: string;
  fields: Field[];
  initial: Record<string, unknown>;
  onClose: () => void;
  onSave: (
    values: Record<string, unknown>,
  ) => Promise<{ ok: boolean; status: number; error: string | null; fields?: string[] }>;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(props.fields.map((f) => [f.name, toFormValue(f, props.initial[f.name])])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bad, setBad] = useState<string[]>([]);
  const first = useRef<HTMLElement | null>(null);
  const set = (name: string, v: unknown) => setValues((s) => ({ ...s, [name]: v }));

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await props.onSave(values);
    setBusy(false);
    if (!res.ok) {
      setBad(res.fields ?? []);
      setError(
        res.error === 'duplicate' ? 'That web address (slug) is already used.' : describeError(res),
      );
    }
  }

  // Group fields that share a row key.
  const rows: Field[][] = [];
  for (const f of props.fields) {
    const last = rows.at(-1);
    if (f.row && last?.[0]?.row === f.row) last.push(f);
    else rows.push([f]);
  }

  return (
    <>
      <button className="ax-drawer-scrim" aria-label="Close editor" onClick={props.onClose} />
      <form
        className="ax-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onSubmit={submit}
      >
        <div className="ax-card-head">
          <h2>{props.title}</h2>
          <button type="button" className="ax-icon-btn" aria-label="Close" onClick={props.onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="ax-drawer-body">
          {error && (
            <p className="ax-alert ax-alert--error" role="alert">
              {error}
            </p>
          )}
          <div className="ax-form">
            {rows.map((row, ri) => (
              <div key={ri} className={row.length > 1 ? 'ax-form-row' : undefined}>
                {row.map((f, fi) => (
                  <FieldInput
                    key={f.name}
                    field={f}
                    value={values[f.name]}
                    invalid={bad.some((b) => b === f.name || b.startsWith(`${f.name}.`))}
                    onChange={(v) => set(f.name, v)}
                    inputRef={ri === 0 && fi === 0 ? first : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="ax-drawer-foot">
          <button type="button" className="ax-btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="ax-btn ax-btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </>
  );
}

function FieldInput({
  field: f,
  value,
  invalid,
  onChange,
  inputRef,
}: {
  field: Field;
  value: unknown;
  invalid: boolean;
  onChange: (v: unknown) => void;
  inputRef?: React.RefObject<HTMLElement | null>;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const id = `f-${f.name}`;
  const common = {
    id,
    className: `ax-input${f.type === 'markdown' ? ' ax-input--mono' : ''}`,
    required: f.required,
    'aria-invalid': invalid || undefined,
  };
  const ref = inputRef as React.RefObject<never> | undefined;

  if (f.type === 'toggle') {
    return (
      <label className="ax-check" style={{ justifySelf: 'start' }}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        {f.label}
      </label>
    );
  }
  if (f.type === 'checks') {
    const selected = (value as string[]) ?? [];
    return (
      <fieldset
        className={`ax-field${invalid ? ' ax-field--invalid' : ''}`}
        style={{ border: 0, padding: 0, margin: 0 }}
      >
        <legend style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{f.label}</legend>
        <div className="ax-checks">
          {f.options!.map((o) => (
            <label key={o.value} className="ax-check">
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selected, o.value]
                      : selected.filter((v) => v !== o.value),
                  )
                }
              />
              {o.label}
            </label>
          ))}
        </div>
        {f.help && <small>{f.help}</small>}
      </fieldset>
    );
  }

  let control: ReactNode;
  const str = String(value ?? '');
  if (f.type === 'textarea' || f.type === 'lines') {
    control = (
      <textarea
        {...common}
        ref={ref}
        rows={f.type === 'lines' ? 5 : 3}
        value={str}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else if (f.type === 'markdown') {
    control = (
      <textarea
        {...common}
        ref={ref}
        rows={18}
        value={str}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else if (f.type === 'select') {
    control = (
      <select {...common} ref={ref} value={str} onChange={(e) => onChange(e.target.value)}>
        {f.options!.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (f.type === 'image') {
    control = (
      <div className="ax-image-field">
        {str && <img src={str} alt="" />}
        <div style={{ display: 'grid', gap: 8, flex: 1 }}>
          <input
            {...common}
            ref={ref}
            type="text"
            placeholder="https://… or upload"
            value={str}
            onChange={(e) => onChange(e.target.value)}
          />
          <label className="ax-btn" style={{ justifySelf: 'start' }}>
            <Icon name="upload" size={16} /> {uploading ? 'Uploading…' : 'Upload image'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                setUploadError(null);
                const r = await uploadImage(file);
                setUploading(false);
                if ('url' in r) onChange(r.url);
                else setUploadError(r.error);
                e.target.value = '';
              }}
            />
          </label>
          {uploadError && <small style={{ color: 'var(--ax-danger)' }}>{uploadError}</small>}
        </div>
      </div>
    );
  } else {
    const type =
      f.type === 'number'
        ? 'number'
        : f.type === 'date'
          ? 'date'
          : f.type === 'link'
            ? 'url'
            : 'text';
    control = (
      <input
        {...common}
        ref={ref}
        type={type}
        value={str}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <div className={`ax-field${invalid ? ' ax-field--invalid' : ''}`}>
      {f.type === 'image' ? <span>{f.label}</span> : <label htmlFor={id}>{f.label}</label>}
      {control}
      {f.help && <small>{f.help}</small>}
    </div>
  );
}
