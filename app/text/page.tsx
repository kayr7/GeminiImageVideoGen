'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
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
  const { token, initialising } = useAuth();

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
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [saveSystemPromptName, setSaveSystemPromptName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savingSystemPrompt, setSavingSystemPrompt] = useState(false);

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
        console.error('Failed to load libraries:', err);
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
      } catch (err) {
        console.error('Failed to load sessions:', err);
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
        console.error('Failed to load messages:', err);
        setError(err instanceof Error ? err.message : 'Failed to load messages');
      } finally {
        setLoadingMessages(false);
      }
    };

    void loadMessages();
  }, [currentSession]);

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
        model: 'gemini-2.5-flash',
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
        name: `Chat ${new Date().toLocaleString()}`,
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
        model: 'gemini-2.5-flash',
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

  // Handle saving template
  const handleSaveTemplate = async () => {
    if (!saveTemplateName.trim()) {
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
        name: saveTemplateName,
        mediaType: 'text',
        templateText: userMessage,
        variables: detectedVariables,
      });

      setTemplates(prev => [newTemplate, ...prev]);
      setSelectedTemplate(newTemplate);
      setShowSaveTemplateModal(false);
      setSaveTemplateName('');
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
  const handleSaveSystemPrompt = async () => {
    if (!saveSystemPromptName.trim()) {
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
        name: saveSystemPromptName,
        mediaType: 'text',
        promptText: systemPromptText,
      });

      setSystemPrompts(prev => [newPrompt, ...prev]);
      setSelectedSystemPrompt(newPrompt);
      setShowSaveSystemPromptModal(false);
      setSaveSystemPromptName('');
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
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar - Libraries and Sessions */}
        <div className="space-y-6">
          {/* System Prompt Selector */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">System Prompt</h3>
            {loadingLibraries ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
            ) : (
              <>
                <Select
                  value={selectedSystemPrompt?.id || ''}
                  onChange={(e) => handleSystemPromptSelect(e.target.value)}
                  options={[
                    { value: '', label: '-- None --' },
                    ...systemPrompts.map(p => ({ value: p.id, label: p.name })),
                  ]}
                  className="mb-2"
                  aria-label="Select system prompt"
                />
                <button
                  type="button"
                  onClick={() => setShowSaveSystemPromptModal(true)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  disabled={!systemPromptText.trim()}
                >
                  💾 Save Current as New
                </button>
                {selectedSystemPrompt && (
                  <button
                    type="button"
                    onClick={() => void handleUpdateSystemPrompt()}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline ml-4"
                    disabled={loading}
                  >
                    ✏️ Update &quot;{selectedSystemPrompt.name}&quot;
                  </button>
                )}
              </>
            )}
          </div>

          {/* Template Selector */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Template</h3>
            {loadingLibraries ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
            ) : (
              <>
                <Select
                  value={selectedTemplate?.id || ''}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  options={[
                    { value: '', label: '-- None --' },
                    ...templates.map(t => ({ value: t.id, label: t.name })),
                  ]}
                  className="mb-2"
                  aria-label="Select template"
                />
                <button
                  type="button"
                  onClick={() => setShowSaveTemplateModal(true)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  disabled={!userMessage.trim()}
                >
                  💾 Save Current as New
                </button>
                {selectedTemplate && (
                  <button
                    type="button"
                    onClick={() => void handleUpdateTemplate()}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline ml-4"
                    disabled={loading}
                  >
                    ✏️ Update &quot;{selectedTemplate.name}&quot;
                  </button>
                )}
              </>
            )}
          </div>

          {/* Chat Sessions (only in chat mode) */}
          {mode === 'chat' && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-white">Chat Sessions</h3>
                <button
                  type="button"
                  onClick={() => void handleCreateSession()}
                  className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                  disabled={loading}
                >
                  + New
                </button>
              </div>
              {loadingSessions ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
              ) : chatSessions.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  No sessions yet. Create one to start chatting!
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {chatSessions.map(session => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => setCurrentSession(session)}
                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                        currentSession?.id === session.id
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {session.name || 'Untitled Chat'}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
              disabled={mode === 'chat' && currentSession !== null}
            />
            {mode === 'chat' && currentSession && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                System prompt is set at session creation and cannot be changed during the chat.
              </p>
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
                  {/* Messages */}
                  <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                    {loadingMessages ? (
                      <div className="text-center text-gray-500 dark:text-gray-400">
                        Loading messages...
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center text-gray-500 dark:text-gray-400">
                        No messages yet. Start the conversation!
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg px-4 py-2 ${
                              msg.role === 'user'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            <p className="text-xs opacity-70 mt-1">
                              {new Date(msg.createdAt).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

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
                    {detectedVariables.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Template Variables:
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          {detectedVariables.map(variable => (
                            <div key={variable}>
                              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                {variable}:
                              </label>
                              <Input
                                value={variableValues[variable] || ''}
                                onChange={(e) => setVariableValues(prev => ({
                                  ...prev,
                                  [variable]: e.target.value,
                                }))}
                                placeholder={`Enter ${variable}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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

                {/* Variable Inputs */}
                {detectedVariables.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Template Variables:
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      {detectedVariables.map(variable => (
                        <div key={variable}>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                            {variable}:
                          </label>
                          <Input
                            value={variableValues[variable] || ''}
                            onChange={(e) => setVariableValues(prev => ({
                              ...prev,
                              [variable]: e.target.value,
                            }))}
                            placeholder={`Enter ${variable}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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

      {/* Save Template Modal */}
      {showSaveTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Save Template
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Template Name
                </label>
                <Input
                  value={saveTemplateName}
                  onChange={(e) => setSaveTemplateName(e.target.value)}
                  placeholder="e.g., Formal Email Template"
                  disabled={savingTemplate}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Template Text (Preview)
                </label>
                <Textarea
                  value={userMessage}
                  readOnly
                  rows={4}
                  className="bg-gray-50 dark:bg-gray-800"
                />
              </div>
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
              <div className="flex gap-3">
                <Button
                  onClick={() => void handleSaveTemplate()}
                  disabled={savingTemplate || !saveTemplateName.trim()}
                  className="flex-1"
                >
                  {savingTemplate ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  onClick={() => {
                    setShowSaveTemplateModal(false);
                    setSaveTemplateName('');
                  }}
                  disabled={savingTemplate}
                  className="flex-1 bg-gray-500 hover:bg-gray-600"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save System Prompt Modal */}
      {showSaveSystemPromptModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Save System Prompt
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  System Prompt Name
                </label>
                <Input
                  value={saveSystemPromptName}
                  onChange={(e) => setSaveSystemPromptName(e.target.value)}
                  placeholder="e.g., Professional Writer"
                  disabled={savingSystemPrompt}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  System Prompt Text (Preview)
                </label>
                <Textarea
                  value={systemPromptText}
                  readOnly
                  rows={4}
                  className="bg-gray-50 dark:bg-gray-800"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => void handleSaveSystemPrompt()}
                  disabled={savingSystemPrompt || !saveSystemPromptName.trim()}
                  className="flex-1"
                >
                  {savingSystemPrompt ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  onClick={() => {
                    setShowSaveSystemPromptModal(false);
                    setSaveSystemPromptName('');
                  }}
                  disabled={savingSystemPrompt}
                  className="flex-1 bg-gray-500 hover:bg-gray-600"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
