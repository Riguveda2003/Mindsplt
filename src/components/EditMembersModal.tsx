import { useEffect, useState } from 'react';
import { Minus, Plus, Trash2, UserPlus, X } from 'lucide-react';
import type { Member, Trip } from '../types';
import { makeInitials, pickMemberColor } from '../utils/storage';

interface EditMembersModalProps {
  isOpen: boolean;
  trip: Trip;
  onClose: () => void;
  onSaveMembers: (nextMembers: Member[]) => void;
}

function makeTempId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `m-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function EditMembersModal({
  isOpen,
  trip,
  onClose,
  onSaveMembers,
}: EditMembersModalProps) {
  const [draftMembers, setDraftMembers] = useState<Member[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraftMembers(trip.members.map((m) => ({ ...m })));
    setNewName('');
    setError(null);
  }, [isOpen, trip]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const originalIds = new Set(trip.members.map((m) => m.id));
  const draftIds = new Set(draftMembers.map((m) => m.id));
  const removedExistingCount = Array.from(originalIds).filter(
    (id) => !draftIds.has(id)
  ).length;

  const handleRename = (id: string, name: string) => {
    setDraftMembers((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, name, initials: makeInitials(name || 'M') } : m
      )
    );
    setError(null);
  };

  const handleAddOne = (customName?: string) => {
    const label = customName?.trim() || `Traveler ${draftMembers.length + 1}`;
    const next: Member = {
      id: makeTempId(),
      name: label,
      initials: makeInitials(label),
      color: pickMemberColor(draftMembers.length),
    };
    setDraftMembers((prev) => [...prev, next]);
    setNewName('');
    setError(null);
  };

  const handleRemoveById = (id: string) => {
    if (draftMembers.length <= 2) {
      setError('A group trip needs at least 2 members.');
      return;
    }
    setDraftMembers((prev) => prev.filter((m) => m.id !== id));
    setError(null);
  };

  const handleDecreaseCount = () => {
    if (draftMembers.length <= 2) {
      setError('A group trip needs at least 2 members.');
      return;
    }
    setDraftMembers((prev) => prev.slice(0, prev.length - 1));
    setError(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (draftMembers.length < 2) {
      setError('A group trip needs at least 2 members.');
      return;
    }
    const cleaned = draftMembers.map((m, idx) => {
      const trimmed = m.name.trim() || `Traveler ${idx + 1}`;
      return {
        ...m,
        name: trimmed,
        initials: makeInitials(trimmed),
      };
    });
    onSaveMembers(cleaned);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-members-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2
              id="edit-members-title"
              className="font-display text-base font-bold text-slate-900"
            >
              Edit Group Members
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{trip.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit members dialog"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 p-5" noValidate>
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
            >
              {error}
            </div>
          )}

          {/* Group size stepper */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Number of Members
              </p>
              <p className="text-xs text-slate-500">
                Adjust group size or edit names below
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDecreaseCount}
                aria-label="Decrease member count"
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                disabled={draftMembers.length <= 2}
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <span
                data-testid="edit-members-count"
                className="min-w-[32px] text-center font-mono-num text-base font-bold text-slate-900"
              >
                {draftMembers.length}
              </span>
              <button
                type="button"
                onClick={() => handleAddOne()}
                aria-label="Increase member count"
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Add named traveler */}
          <div className="flex items-center gap-2">
            <label htmlFor="modal-add-member-name" className="sr-only">
              New member name
            </label>
            <input
              id="modal-add-member-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (newName.trim()) handleAddOne(newName);
                }
              }}
              placeholder="Add member by name (e.g., Kenji Sato)..."
              className="min-h-[40px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
            />
            <button
              type="button"
              onClick={() => handleAddOne(newName)}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add</span>
            </button>
          </div>

          {/* Editable member list */}
          <ul
            data-testid="edit-members-list"
            className="divide-y divide-slate-100 rounded-xl border border-slate-200"
          >
            {draftMembers.map((member, index) => (
              <li
                key={member.id}
                className="flex items-center gap-3 px-3.5 py-2.5"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: member.color }}
                  aria-hidden="true"
                >
                  {member.initials}
                </span>
                <label htmlFor={`member-name-${member.id}`} className="sr-only">
                  Member {index + 1} name
                </label>
                <input
                  id={`member-name-${member.id}`}
                  type="text"
                  value={member.name}
                  onChange={(e) => handleRename(member.id, e.target.value)}
                  className="min-h-[38px] flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveById(member.id)}
                  disabled={draftMembers.length <= 2}
                  aria-label={`Remove member ${member.name || index + 1}`}
                  className="inline-flex min-h-[38px] min-w-[38px] shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          {removedExistingCount > 0 && trip.expenses.length > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              {removedExistingCount} existing member
              {removedExistingCount === 1 ? '' : 's'} removed. Shared bills and
              balances will recalculate across the remaining{' '}
              {draftMembers.length} members.
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[42px] rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Save Members
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
