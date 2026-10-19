'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import ChatSessionList from '@/components/text/ChatSessionList';
import LibrarySelector from '@/components/text/LibrarySelector';
import MessageList from '@/components/text/MessageList';
import SaveLibraryModal from '@/components/text/SaveLibraryModal';
import VariableInputs from '@/components/text/VariableInputs';
import { formatDateTime } from '@/lib/utils/files';
import { templateAPI, systemPromptAPI, textGenerationAPI, chatAPI } from '@/lib/text/api';
import { extractVariables, isTemplateFilled, getUnfilledVariables } from '@/lib/text/utils';
import type {
  PromptTemplate,
  SystemPrompt,
  ChatSession,
  ChatMessage,
} from '@/types/text-generation';

type Mode = 'single' | 'chat';

export default function TextGenerationPage() {
  const { token, initialising, config } = useAuth();
  const textModels = useMemo(() => config?.models?.text?.enabled ?? [], [config]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const textModelId =
    textModels.find((m) => m.id === selectedModelId)?.id ??
    config?.models?.text?.default ??
    textModels[0]?.id ??
    undefined;

  // Mode selection
  const [mode, setMode] = useState<Mode>('single');

  // Templates and System Prompts
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [selectedSystemPrompt, setSelectedSystemPrompt] = useState<SystemPrompt | null>(null);
  const [loadingLibraries, setLoadingLibraries] = useState(false);

  // User input
  const [systemPromptText, setSystemPromptText] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  // Chat state
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Response state
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showSaveSystemPromptModal, setShowSaveSystemPromptModal] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savingSystemPrompt, setSavingSystemPrompt] = useState(false);

  // Compute if system prompt can be edited (no messages sent yet)
  const canEditSystemPrompt = messages.length === 0;

  // Extract variables from user message
  const detectedVariables = useMemo(() => extractVariables(userMessage), [userMessage]);

  // Update variable values when detected variables change
  useEffect(() => {
    setVariableValues(prev => {
      const newValues = { ...prev };
      // Add new variables
      detectedVariables.forEach(v => {
        if (!(v in newValues)) {
          newValues[v] = '';
        }
      });
      // Remove variables that are no longer in the template
      Object.keys(newValues).forEach(k => {
        if (!detectedVariables.includes(k)) {
          delete newValues[k];
        }
      });
      return newValues;
    });
  }, [detectedVariables]);

  // Load templates and system prompts
  useEffect(() => {
    if (!token) return;

    const loadLibraries = async () => {
      setLoadingLibraries(true);
      try {
        const [templatesData, promptsData] = await Promise.all([
          templateAPI.list('text'),
          systemPromptAPI.list('text'),
        ]);
        setTemplates(templatesData);
        setSystemPrompts(promptsData);
      } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load libraries');
      } finally {
        setLoadingLibraries(false);
      }
    };

    void loadLibraries();
  }, [token]);

  // Load chat sessions when in chat mode
  useEffect(() => {
    if (!token || mode !== 'chat') return;

    const loadSessions = async () => {
      setLoadingSessions(true);
      try {
        const sessions = await chatAPI.listSessions();
        setChatSessions(sessions);
      } catch {
        // Non-critical: the session list simply stays empty
      } finally {
        setLoadingSessions(false);
      }
    };

    void loadSessions();
  }, [token, mode]);

  // Load messages when session changes
  useEffect(() => {
    if (!currentSession) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      setLoadingMessages(true);
      try {
        const msgs = await chatAPI.getMessages(currentSession.id);
        setMessages(msgs);
      } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load messages');
      } finally {
        setLoadingMessages(false);
      }
    };

    void loadMessages();
  }, [currentSession]);

  const handleVariableChange = useCallback((variable: string, value: string) => {
    setVariableValues(prev => ({ ...prev, [variable]: value }));
  }, []);

  // Handle template selection
  const handleTemplateSelect = useCallback((templateId: string) => {
    if (templateId === '') {
      setSelectedTemplate(null);
      setUserMessage('');
      return;
    }

    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(template);
      setUserMessage(template.templateText);
    }
  }, [templates]);

  // Handle system prompt selection
  const handleSystemPromptSelect = useCallback((promptId: string) => {
    if (promptId === '') {
      setSelectedSystemPrompt(null);
      setSystemPromptText('');
      return;
    }

    const prompt = systemPrompts.find(p => p.id === promptId);
    if (prompt) {
      setSelectedSystemPrompt(prompt);
      setSystemPromptText(prompt.promptText);
    }
  }, [systemPrompts]);

  // Handle single-turn generation
  const handleGenerate = async () => {
    if (!userMessage.trim()) {
      setError('Please enter a message');
      return;
    }

    // Check if all variables are filled
    if (detectedVariables.length > 0 && !isTemplateFilled(userMessage, variableValues)) {
      const unfilled = getUnfilledVariables(userMessage, variableValues);
      setError(`Please fill in all variables: ${unfilled.join(', ')}`);
      return;
    }

    setLoading(true);
    setError(null);
    setResponse('');

    try {
      const result = await textGenerationAPI.generate({
        userMessage,
        systemPrompt: systemPromptText || undefined,
        systemPromptId: selectedSystemPrompt?.id,
        templateId: selectedTemplate?.id,
        variableValues: Object.keys(variableValues).length > 0 ? variableValues : undefined,
        model: textModelId,
      });

      setResponse(result.modelResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate text');
    } finally {
      setLoading(false);
    }
  };

  // Handle chat session creation
  const handleCreateSession = async () => {
    setLoading(true);
    setError(null);

    try {
      const session = await chatAPI.createSession({
        name: `Chat ${formatDateTime(new Date())}`,
        systemPrompt: systemPromptText || undefined,
        systemPromptId: selectedSystemPrompt?.id,
      });

      setChatSessions(prev => [session, ...prev]);
      setCurrentSession(session);
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create chat session');
    } finally {
      setLoading(false);
    }
  };

  // Handle sending chat message
  const handleSendMessage = async () => {
    if (!currentSession || !userMessage.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Add user message immediately for better UX
      const tempUserMessage: ChatMessage = {
        id: `temp-${Date.now()}`,
        sessionId: currentSession.id,
        role: 'user',
        content: userMessage,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, tempUserMessage]);

      const message = await chatAPI.sendMessage(currentSession.id, {
        message: userMessage,
        model: textModelId,
      });

      // Replace temp message with real one and add model response
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempUserMessage.id),
        tempUserMessage,
        message,
      ]);

      setUserMessage('');
      setVariableValues({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Remove temp message on error
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
    } finally {
      setLoading(false);
    }
  };

  // Handle renaming session
  const handleRenameSession = async (sessionId: string, name: string): Promise<boolean> => {
    if (!name.trim()) {
      setError('Session name cannot be empty');
      return false;
    }

    try {
      const updatedSession = await chatAPI.updateSession(sessionId, { name });

      setChatSessions(prev => prev.map(s => (s.id === sessionId ? updatedSession : s)));

      if (currentSession?.id === sessionId) {
        setCurrentSession(updatedSession);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename session');
      return false;
    }
  };

  // Handle deleting session
  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this chat session?')) {
      return;
    }

    try {
      await chatAPI.deleteSession(sessionId);

      setChatSessions(prev => prev.filter(s => s.id !== sessionId));

      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session');
    }
  };

  // Handle updating chat session system prompt (only if no messages sent)
  const handleUpdateChatSystemPrompt = async () => {
    if (!currentSession) return;

    if (messages.length > 0) {
      setError('Cannot update system prompt after messages have been sent');
      return;
    }

    try {
      const updatedSession = await chatAPI.updateSession(currentSession.id, {
        systemPrompt: systemPromptText || undefined,
      });

      setChatSessions(prev =>
        prev.map(s => (s.id === currentSession.id ? updatedSession : s))
      );

      setCurrentSession(updatedSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update system prompt');
    }
  };

  // Handle saving template
  const handleSaveTemplate = async (name: string) => {
    if (!name.trim()) {
      setError('Please enter a template name');
      return;
    }

    if (!userMessage.trim()) {
      setError('Please enter a template text');
      return;
    }

    setSavingTemplate(true);
    setError(null);

    try {
      const newTemplate = await templateAPI.create({
        name,
        mediaType: 'text',
        templateText: userMessage,
        variables: detectedVariables,
      });

      setTemplates(prev => [newTemplate, ...prev]);
      setSelectedTemplate(newTemplate);
      setShowSaveTemplateModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  // Handle updating template
  const handleUpdateTemplate = async () => {
    if (!selectedTemplate) return;

    setLoading(true);
    setError(null);

    try {
      const updated = await templateAPI.update(selectedTemplate.id, {
        templateText: userMessage,
        variables: detectedVariables,
      });

      setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
      setSelectedTemplate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update template');
    } finally {
      setLoading(false);
    }
  };

  // Handle saving system prompt
  const handleSaveSystemPrompt = async (name: string) => {
    if (!name.trim()) {
      setError('Please enter a system prompt name');
      return;
    }

    if (!systemPromptText.trim()) {
      setError('Please enter a system prompt text');
      return;
    }

    setSavingSystemPrompt(true);
    setError(null);

    try {
      const newPrompt = await systemPromptAPI.create({
        name,
        mediaType: 'text',
        promptText: systemPromptText,
      });

      setSystemPrompts(prev => [newPrompt, ...prev]);
      setSelectedSystemPrompt(newPrompt);
      setShowSaveSystemPromptModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save system prompt');
    } finally {
      setSavingSystemPrompt(false);
    }
  };

  // Handle updating system prompt
  const handleUpdateSystemPrompt = async () => {
    if (!selectedSystemPrompt) return;

    setLoading(true);
    setError(null);

    try {
      const updated = await systemPromptAPI.update(selectedSystemPrompt.id, {
        promptText: systemPromptText,
      });

      setSystemPrompts(prev => prev.map(p => p.id === updated.id ? updated : p));
      setSelectedSystemPrompt(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update system prompt');
    } finally {
      setLoading(false);
    }
  };

  if (initialising) {
    return <LoadingSpinner message="Loading..." />;
  }

  if (!token) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">Please log in to use text generation</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Text Generation
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Generate text using Gemini AI with templates and system prompts
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-sm text-red-600 dark:text-red-400 underline mt-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Mode Selector */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => {
              setMode('single');
              setCurrentSession(null);
              setMessages([]);
            }}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              mode === 'single'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Single Turn
          </button>
          <button
            type="button"
            onClick={() => setMode('chat')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              mode === 'chat'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Multi-Turn Chat
          </button>
          {textModels.length > 0 && (
            <label className="ml-auto flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span>Model</span>
              <select
                aria-label="Text model"
                value={textModelId ?? ''}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-white"
              >
                {textModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar - Libraries and Sessions */}
        <div className="space-y-6">
          <LibrarySelector
            title="System Prompt"
            ariaLabel="Select system prompt"
            items={systemPrompts}
            selected={selectedSystemPrompt}
            loadingItems={loadingLibraries}
            busy={loading}
            canSaveNew={!!systemPromptText.trim()}
            onSelect={handleSystemPromptSelect}
            onSaveNew={() => setShowSaveSystemPromptModal(true)}
            onUpdate={() => void handleUpdateSystemPrompt()}
          />

          <LibrarySelector
            title="Template"
            ariaLabel="Select template"
            items={templates}
            selected={selectedTemplate}
            loadingItems={loadingLibraries}
            busy={loading}
            canSaveNew={!!userMessage.trim()}
            onSelect={handleTemplateSelect}
            onSaveNew={() => setShowSaveTemplateModal(true)}
            onUpdate={() => void handleUpdateTemplate()}
          />

          {/* Chat Sessions (only in chat mode) */}
          {mode === 'chat' && (
            <ChatSessionList
              sessions={chatSessions}
              currentId={currentSession?.id}
              loadingSessions={loadingSessions}
              busy={loading}
              onSelect={setCurrentSession}
              onCreate={() => void handleCreateSession()}
              onRename={handleRenameSession}
              onDelete={handleDeleteSession}
            />
          )}
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* System Prompt Input */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              System Prompt (Optional)
            </label>
            <Textarea
              value={systemPromptText}
              onChange={(e) => setSystemPromptText(e.target.value)}
              placeholder="e.g., You are a helpful assistant that explains things simply"
              rows={3}
              disabled={mode === 'chat' && currentSession !== null && !canEditSystemPrompt}
            />
            {mode === 'chat' && currentSession && (
              <>
                {canEditSystemPrompt ? (
                  <div className="mt-3">
                    <Button 
                      onClick={handleUpdateChatSystemPrompt}
                      disabled={loading}
                    >
                      Update System Prompt
                    </Button>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      System prompt can be edited until the first message is sent.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    System prompt cannot be changed after messages have been sent.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Chat Mode */}
          {mode === 'chat' && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              {!currentSession ? (
                <div className="text-center py-12">
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Select a chat session or create a new one to start chatting
                  </p>
                  <Button onClick={() => void handleCreateSession()} disabled={loading}>
                    Create New Chat Session
                  </Button>
                </div>
              ) : (
                <>
                  <MessageList messages={messages} loading={loadingMessages} />

                  {/* Message Input */}
                  <div>
                    <Textarea
                      value={userMessage}
                      onChange={(e) => setUserMessage(e.target.value)}
                      placeholder="Type your message..."
                      rows={3}
                      disabled={loading}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendMessage();
                        }
                      }}
                    />
                    <VariableInputs
                      variables={detectedVariables}
                      values={variableValues}
                      onChange={handleVariableChange}
                    />
                    <Button
                      onClick={() => void handleSendMessage()}
                      disabled={loading || !userMessage.trim()}
                      className="mt-4 w-full"
                    >
                      {loading ? 'Sending...' : 'Send Message'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Single Turn Mode */}
          {mode === 'single' && (
            <>
              {/* User Message Input */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Your Message (use {'{{'} variable {'}}'}  for templates)
                </label>
                <Textarea
                  value={userMessage}
                  onChange={(e) => setUserMessage(e.target.value)}
                  placeholder="e.g., Write a {{style}} email to {{recipient}} about {{topic}}"
                  rows={6}
                  disabled={loading}
                />

                <VariableInputs
                  variables={detectedVariables}
                  values={variableValues}
                  onChange={handleVariableChange}
                    />

                <Button
                  onClick={() => void handleGenerate()}
                  disabled={loading || !userMessage.trim()}
                  className="mt-4 w-full"
                >
                  {loading ? 'Generating...' : 'Generate Text'}
                </Button>
              </div>

              {/* Response Display */}
              {response && (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Response</h3>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(response);
                      }}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <div className="prose dark:prose-invert max-w-none">
                    <p className="whitespace-pre-wrap">{response}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showSaveTemplateModal && (
        <SaveLibraryModal
          title="Save Template"
          nameLabel="Template Name"
          namePlaceholder="e.g., Formal Email Template"
          previewLabel="Template Text (Preview)"
          previewText={userMessage}
          saving={savingTemplate}
          onSave={(name) => void handleSaveTemplate(name)}
          onCancel={() => setShowSaveTemplateModal(false)}
        >
          {detectedVariables.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Detected Variables
              </label>
              <div className="flex flex-wrap gap-2">
                {detectedVariables.map(v => (
                  <span
                    key={v}
                    className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-sm"
                  >
                    {'{{'}{v}{'}}'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </SaveLibraryModal>
      )}

      {showSaveSystemPromptModal && (
        <SaveLibraryModal
          title="Save System Prompt"
          nameLabel="System Prompt Name"
          namePlaceholder="e.g., Professional Writer"
          previewLabel="System Prompt Text (Preview)"
          previewText={systemPromptText}
          saving={savingSystemPrompt}
          onSave={(name) => void handleSaveSystemPrompt(name)}
          onCancel={() => setShowSaveSystemPromptModal(false)}
        />
      )}
    </div>
  );
}
