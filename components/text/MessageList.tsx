import type { ChatMessage } from '@/types/text-generation';

export default function MessageList({
  messages,
  loading,
}: {
  messages: ChatMessage[];
  loading: boolean;
}) {
  return (
    <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
      {loading ? (
        <div className="text-center text-gray-500 dark:text-gray-400">Loading messages...</div>
      ) : messages.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400">
          No messages yet. Start the conversation!
        </div>
      ) : (
        messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              <p className="text-xs opacity-70 mt-1">{new Date(msg.createdAt).toLocaleTimeString()}</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
