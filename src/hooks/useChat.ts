import { useState, useCallback, useEffect, useRef } from 'react';
import { ChatMessage, ResponseStyle, RefinementOption, WatchSetup } from '@/lib/types';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spoiler-shield-chat`;

export function useChat(storageKey = 'spoilershield-chat') {
  const storageKeyRef = useRef(storageKey);

  const [messages, setMessagesState] = useState<ChatMessage[]>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Re-initialize when storageKey changes (e.g. switching sessions)
  useEffect(() => {
    if (storageKeyRef.current !== storageKey) {
      storageKeyRef.current = storageKey;
      try {
        const raw = window.localStorage.getItem(storageKey);
        setMessagesState(raw ? JSON.parse(raw) : []);
      } catch {
        setMessagesState([]);
      }
    }
  }, [storageKey]);

  // Listen for external writes to this key (e.g. message imports from another session)
  useEffect(() => {
    const onUpdate = (e: CustomEvent<{ key: string }>) => {
      if (e.detail.key === storageKey) {
        try {
          const raw = window.localStorage.getItem(storageKey);
          setMessagesState(raw ? JSON.parse(raw) : []);
        } catch {
          setMessagesState([]);
        }
      }
    };
    window.addEventListener('spoilershield-messages-updated', onUpdate as EventListener);
    return () => window.removeEventListener('spoilershield-messages-updated', onUpdate as EventListener);
  }, [storageKey]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setMessages = useCallback((value: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setMessagesState(prev => {
      const next = value instanceof Function ? value(prev) : value;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [storageKey]);

  const sendMessage = useCallback(async (
    question: string,
    watchSetup: WatchSetup,
    style: ResponseStyle
  ) => {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
      timestamp: new Date(),
      style
    };

    const userMessageId = userMessage.id;

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    let assistantContent = '';

    try {
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          question,
          context: watchSetup.context,
          style,
          showInfo: {
            platform: watchSetup.platform,
            title: watchSetup.showTitle,
            season: watchSetup.season,
            episode: watchSetup.episode,
            timestamp: watchSetup.timestamp,
          }
        }),
      });

      if (!response.ok) {
        let errMsg = 'Failed to get response';
        try {
          const errBody = await response.json();
          if (errBody.error) errMsg = errBody.error;
          console.error('[SpoilerShield] API error:', {
            status: response.status,
            error: errBody.error,
            detail: errBody.detail,
            debug: errBody.debug,
          });
        } catch {
          console.error('[SpoilerShield] API error (unparseable):', response.status);
        }
        throw new Error(errMsg);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const updateAssistantMessage = (content: string) => {
        assistantContent = content;
        setMessages(prev => {
          let messagesWithUser = prev;
          const hasUserMessage = prev.some(m => m.id === userMessageId);
          if (!hasUserMessage) {
            messagesWithUser = [...prev, userMessage];
          }

          const last = messagesWithUser[messagesWithUser.length - 1];
          if (last?.role === 'assistant') {
            return messagesWithUser.map((m, i) =>
              i === messagesWithUser.length - 1 ? { ...m, content } : m
            );
          }
          return [...messagesWithUser, {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content,
            timestamp: new Date(),
            style
          }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (content) {
              updateAssistantMessage(assistantContent + content);
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        for (let raw of buffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (content) {
              updateAssistantMessage(assistantContent + content);
            }
          } catch { /* ignore */ }
        }
      }

      if (assistantContent.trim()) {
        setMessages(prev => {
          let messagesWithUser = prev;
          const hasUserMessage = prev.some(m => m.id === userMessageId);
          if (!hasUserMessage && userMessageId) {
            messagesWithUser = [...prev, userMessage];
          }

          const last = messagesWithUser[messagesWithUser.length - 1];
          if (last?.role === 'assistant' && last.content.trim()) {
            return messagesWithUser;
          }
          if (assistantContent.trim()) {
            return [...messagesWithUser, {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: assistantContent,
              timestamp: new Date(),
              style
            }];
          }
          return messagesWithUser;
        });
      }

    } catch (err) {
      if (assistantContent.trim()) {
        setMessages(prev => {
          let messagesWithUser = prev;
          const hasUserMessage = prev.some(m => m.id === userMessageId);
          if (!hasUserMessage && userMessageId) {
            messagesWithUser = [...prev, userMessage];
          }

          const last = messagesWithUser[messagesWithUser.length - 1];
          if (last?.role === 'assistant') {
            if (!last.content || last.content.length < assistantContent.length) {
              return messagesWithUser.map((m, i) =>
                i === messagesWithUser.length - 1
                  ? { ...m, content: assistantContent }
                  : m
              );
            }
            return messagesWithUser;
          }
          return [...messagesWithUser, {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: assistantContent,
            timestamp: new Date(),
            style
          }];
        });
      }

      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [setMessages]);

  const refineLastAnswer = useCallback(async (
    refinement: RefinementOption,
    watchSetup: WatchSetup
  ) => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    const lastUser = [...messages].reverse().find(m => m.role === 'user');

    if (!lastAssistant || !lastUser) return;

    const refinementPrompts: Record<RefinementOption, string> = {
      shorter: `Make this shorter: "${lastAssistant.content}"`,
      detail: `Add more detail to: "${lastAssistant.content}"`,
      examples: `Add examples to explain: "${lastAssistant.content}"`,
      terms: `Define any terms in: "${lastAssistant.content}"`
    };

    await sendMessage(refinementPrompts[refinement], watchSetup, lastAssistant.style || 'quick');
  }, [messages, sendMessage]);

  const clearChat = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    refineLastAnswer,
    clearChat,
    setError
  };
}
