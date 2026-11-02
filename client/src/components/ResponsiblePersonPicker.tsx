import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { looksLikeEmail } from './ResponsiblePerson';

export interface PickerUser {
  id: number;
  name: string;
  email: string | null;
  // What is stored as the responsible person (the mailbox when there is one).
  value: string;
}

interface ResponsiblePersonPickerProps {
  // The stored value (an email or a name) and its server-resolved display name.
  value?: string | null;
  resolvedName?: string | null;
  users: PickerUser[];
  saving?: boolean;
  // Called with the chosen user's value, or '' to clear the assignment.
  onConfirm: (value: string) => void;
}

const PANEL_WIDTH = 320;

// Shows the assigned person like "Sent By" (name, with the email smaller below). Clicking it opens a searchable list;
// choosing a name only selects it - the change is saved with the Confirm button, and clicking outside cancels.
export default function ResponsiblePersonPicker({ value, resolvedName, users, saving = false, onConfirm }: ResponsiblePersonPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null); // null = nothing picked yet
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const current = value || '';
  const knownUser = users.find((user) => user.value.toLowerCase() === current.toLowerCase());
  const displayName = knownUser?.name || resolvedName || current;
  const displayEmail = looksLikeEmail(current) && displayName !== current ? current : null;

  const close = () => {
    setOpen(false);
    setQuery('');
    setSelected(null);
  };

  const openPanel = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - PANEL_WIDTH - 8);
      const below = rect.bottom + 4;
      // open upwards when there is no room underneath
      const top = below + 330 > window.innerHeight ? Math.max(8, rect.top - 334) : below;
      setPosition({ top, left });
    }
    setOpen(true);
  };

  // Click outside, Escape, scroll or resize all cancel an unconfirmed selection.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      close();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => user.name.toLowerCase().includes(needle) || (user.email || '').toLowerCase().includes(needle));
  }, [users, query]);

  const chosen = selected !== null && selected !== current ? selected : null;
  const chosenUser = chosen ? users.find((user) => user.value === chosen) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={saving}
        onClick={() => (open ? close() : openPanel())}
        title={current ? 'Click to reassign' : 'Assign a responsible person'}
        className={`group text-left rounded-lg transition-colors disabled:opacity-60 ${
          current
            ? 'px-1 -mx-1 py-0.5 hover:bg-slate-100'
            : 'inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-500'
        }`}
      >
        {current ? (
          <span className="block">
            <span className="block text-sm text-slate-700">{displayName}</span>
            {displayEmail && <span className="block text-xs text-slate-400">{displayEmail}</span>}
          </span>
        ) : (
          <>
            <span className="text-sm">Assign...</span>
            <ChevronDown size={14} />
          </>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: position.top, left: position.left, width: PANEL_WIDTH, maxWidth: 'calc(100vw - 16px)' }}
            className="z-[70] bg-white border border-slate-200 rounded-xl shadow-xl"
          >
            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name or email..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
            </div>

            <ul className="max-h-60 overflow-y-auto py-1">
              {current && !query && (
                <li>
                  <button
                    type="button"
                    onClick={() => setSelected('')}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 ${selected === '' ? 'bg-cyan-50 text-cyan-700' : 'text-slate-500'}`}
                  >
                    Not assigned
                  </button>
                </li>
              )}
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-sm text-slate-400">No users found</li>
              ) : (
                filtered.map((user) => {
                  const isSelected = (selected ?? current).toLowerCase() === user.value.toLowerCase();
                  return (
                    <li key={user.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(user.value)}
                        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 ${isSelected ? 'bg-cyan-50' : ''}`}
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-slate-800 truncate">{user.name}</span>
                          {user.email && <span className="block text-xs text-slate-400 truncate">{user.email}</span>}
                        </span>
                        {isSelected && <Check size={14} className="text-cyan-600 flex-shrink-0" />}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            {selected !== null && selected !== current && (
              <div className="p-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 truncate">{chosen === '' ? 'Remove assignment' : chosenUser?.name || chosen}</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = selected;
                    close();
                    onConfirm(next);
                  }}
                  className="px-3 py-1.5 text-sm font-medium bg-[#0f172a] text-white rounded-lg hover:bg-slate-700 transition-colors flex-shrink-0"
                >
                  Confirm
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
