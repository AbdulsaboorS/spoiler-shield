import { useState, useCallback } from 'react';
import { ChatMessage, ResponseStyle, RefinementOption, WatchSetup } from '@/lib/types';
import { useLocalStorage } from './useLocalStorage';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/spoiler-shield-chat`;

export function useChat() {
  const [messages, setMessages] = useLocalStorage<ChatMessage[]>('spoilershield-chat', []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (
    question: string,
    watchSetup: WatchSetup,
    style: ResponseStyle
  ) => {
    if (!watchSetup.context.trim()) {
      setError('Please provide context from what you\'ve watched.');
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
      timestamp: new Date(),
      style
    };

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
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        if (response.status === 402) {
          throw new Error('Service temporarily unavailable. Please try again later.');
        }
        throw new Error('Failed to get response');
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
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => 
              i === prev.length - 1 ? { ...m, content } : m
            );
          }
          return [...prev, {
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
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
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
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              updateAssistantMessage(assistantContent + content);
            }
          } catch { /* ignore */ }
        }
      }

    } catch (err) {
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
