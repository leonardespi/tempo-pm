import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/store';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import type { User } from '@/types';
import styles from './UsersPage.module.css';

const PALETTE: string[] = [
  '#C17D52',
  '#6B8E6B',
  '#4A7FA5',
  '#A0522D',
  '#7B68EE',
  '#20B2AA',
  '#CD853F',
  '#8B4789',
  '#2E8B57',
  '#B8860B',
];

type UserForm = { name: string; email: string; color: string; weeklyCapacity: string };
const EMPTY_FORM: UserForm = {
  name: '',
  email: '',
  color: PALETTE[0] ?? '#C17D52',
  weeklyCapacity: '10',
};

export default function UsersPage() {
  const users = useStore((s) => s.users);
  const addUser = useStore((s) => s.addUser);
  const updateUser = useStore((s) => s.updateUser);
  const deleteUser = useStore((s) => s.deleteUser);

  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<UserForm>>({});

  const validate = (): boolean => {
    const errs: Partial<UserForm> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    const cap = Number(form.weeklyCapacity);
    if (isNaN(cap) || cap < 0) errs.weeklyCapacity = 'Must be ≥ 0';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email';
    const colorTaken = users.find((u) => u.color === form.color && u.id !== editId);
    if (colorTaken) errs.color = `Color already used by ${colorTaken.name}`;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const openCreate = () => {
    const usedColors = new Set(users.map((u) => u.color));
    const free = PALETTE.find((c) => !usedColors.has(c)) ?? '#C17D52';
    setForm({ ...EMPTY_FORM, color: free });
    setEditId(null);
    setErrors({});
    setShowCreate(true);
  };

  const openEdit = (u: User) => {
    setForm({
      name: u.name,
      email: u.email ?? '',
      color: u.color,
      weeklyCapacity: String(u.weeklyCapacity),
    });
    setEditId(u.id);
    setErrors({});
    setShowCreate(true);
  };

  const handleSave = () => {
    if (!validate()) return;
    const payload: Omit<User, 'id'> = {
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      color: form.color,
      weeklyCapacity: Number(form.weeklyCapacity),
    };
    if (editId) {
      void updateUser(editId, payload);
    } else {
      void addUser({ id: uuidv4(), ...payload });
    }
    setShowCreate(false);
  };

  const handleClose = () => {
    setShowCreate(false);
    setErrors({});
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Team</h1>
        <Button variant="primary" onClick={openCreate}>
          + Add member
        </Button>
      </div>

      {users.length === 0 ? (
        <div className={styles.empty}>
          <p>No team members yet.</p>
          <p className={styles.emptyHint}>Add members to assign tasks and track workload.</p>
          <Button variant="primary" onClick={openCreate}>
            Add member
          </Button>
        </div>
      ) : (
        <div className={styles.list}>
          {users.map((u) => (
            <div key={u.id} className={styles.card}>
              <div className={styles.avatar} style={{ background: u.color }}>
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className={styles.info}>
                <span className={styles.name}>{u.name}</span>
                {u.email && <span className={styles.email}>{u.email}</span>}
                <span className={styles.capacity}>
                  <span className={styles.mono}>{u.weeklyCapacity}</span> pts/week
                </span>
              </div>
              <div className={styles.actions}>
                <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(u.id)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal
          title={editId ? 'Edit member' : 'Add member'}
          onClose={handleClose}
          footer={
            <>
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave}>
                {editId ? 'Save' : 'Add'}
              </Button>
            </>
          }
        >
          <div className={styles.form}>
            <FormField label="Name" htmlFor="user-name" error={errors.name} required>
              <input
                id="user-name"
                className="input"
                value={form.name}
                autoFocus
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Alice"
              />
            </FormField>
            <FormField label="Email" htmlFor="user-email" error={errors.email}>
              <input
                id="user-email"
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="alice@example.com"
              />
            </FormField>
            <FormField
              label="Weekly capacity (effort pts)"
              htmlFor="user-cap"
              error={errors.weeklyCapacity}
              required
            >
              <input
                id="user-cap"
                className="input"
                type="number"
                min="0"
                step="1"
                value={form.weeklyCapacity}
                onChange={(e) => setForm({ ...form, weeklyCapacity: e.target.value })}
              />
            </FormField>
            <FormField label="Identity color" error={errors.color}>
              <div className={styles.colorRow}>
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    className={`${styles.swatch} ${form.color === c ? styles.selected : ''}`}
                    style={{ background: c }}
                    onClick={() => setForm({ ...form, color: c })}
                    aria-label={`Color ${c}`}
                    type="button"
                  />
                ))}
                <input
                  type="color"
                  className={styles.colorInput}
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  title="Custom color"
                />
              </div>
            </FormField>
          </div>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal
          title="Remove member?"
          onClose={() => setDeleteConfirm(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  void deleteUser(deleteConfirm);
                  setDeleteConfirm(null);
                }}
              >
                Remove
              </Button>
            </>
          }
        >
          <p>
            This removes the team member from the roster. Any tasks assigned to them will keep the
            reference but show as unassigned.
          </p>
        </Modal>
      )}
    </div>
  );
}
