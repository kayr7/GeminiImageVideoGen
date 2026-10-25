import { useState } from 'react';
import Input from '@/components/ui/Input';
import type { ChatSession } from '@/types/text-generation';

/** Sidebar list of chat sessions with inline rename and delete. */
export default function ChatSessionList({
  sessions,
  currentId,
  loadingSessions,
  busy,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  sessions: ChatSession[];
  currentId: string | undefined;
  loadingSessions: boolean;
  busy: boolean;
  onSelect: (session: ChatSession) => void;
  onCreate: () => void;
  /** Resolves true when the rename succeeded so the inline editor can close. */
  onRename: (sessionId: string, name: string) => Promise<boolean>;
  onDelete: (sessionId: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const stopEditing = () => {
    setEditingId(null);
    setEditingName('');
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">Chat Sessions</h3>
        <button
          type="button"
          onClick={onCreate}
          className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
          disabled={busy}
        >
          + New
        </button>
      </div>
      {loadingSessions ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      ) : sessions.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          No sessions yet. Create one to start chatting!
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`px-3 py-2 rounded text-sm transition-colors ${
                currentId === session.id
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
              }`}
            >
              {editingId === session.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="flex-1 text-sm"
                    placeholder="Session name"
                  />
                  <button
                    onClick={async () => {
                      if (await onRename(session.id, editingName)) stopEditing();
                    }}
                    className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs"
                  >
                    ✓
                  </button>
                  <button
                    onClick={stopEditing}
                    className="px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => onSelect(session)} className="flex-1 text-left">
                    {session.name || 'Untitled Chat'}
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingId(session.id);
                        setEditingName(session.name || '');
                      }}
                      className="p-1 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      title="Rename"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => onDelete(session.id)}
                      className="p-1 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
