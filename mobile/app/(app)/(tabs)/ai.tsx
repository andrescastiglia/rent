import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { aiApi, AiConversationMessage } from '@/api/ai';
import { Screen } from '@/components/screen';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  model?: string | null;
};

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export default function AiScreen() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ['ai', 'tools-status'],
    queryFn: aiApi.getToolsStatus,
  });

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  const chatEnabled = data?.mode === 'FULL' || data?.mode === 'READONLY';
  const modeLabel =
    data?.mode === 'FULL'
      ? t('common.aiModeFull')
      : data?.mode === 'READONLY'
        ? t('common.aiModeReadonly')
        : t('common.aiDisabled');

  const sortedMessages = useMemo(() => messages, [messages]);

  const pushAssistantError = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: createId(),
        role: 'assistant',
        text,
      },
    ]);
  };

  const appendConversationMessages = (items: AiConversationMessage[]) => {
    setMessages(
      items.map((item) => ({
        id: item.id,
        role: item.role,
        text: item.content,
        model: item.model ?? null,
      })),
    );
  };

  const handleSend = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || sending || !chatEnabled) return;

    setPrompt('');
    setMessages((prev) => [
      ...prev,
      {
        id: createId(),
        role: 'user',
        text: trimmed,
      },
    ]);

    setSending(true);
    try {
      const response = await aiApi.respond(trimmed, { conversationId: conversationId ?? undefined });
      if (response.conversationId && !conversationId) {
        setConversationId(response.conversationId);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          text: response.outputText || t('common.noDataAvailable'),
          model: response.model,
        },
      ]);
    } catch (submitError) {
      pushAssistantError(submitError instanceof Error ? submitError.message : t('messages.loadError'));
    } finally {
      setSending(false);
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 10);
    }
  };

  const handleReloadConversation = async () => {
    if (!conversationId) return;
    try {
      const response = await aiApi.getConversation(conversationId);
      appendConversationMessages(response.messages);
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: false });
      }, 10);
    } catch (reloadError) {
      pushAssistantError(reloadError instanceof Error ? reloadError.message : t('messages.loadError'));
    }
  };

  return (
    <Screen scrollable={false} padded={false}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 82 : 0}
      >
        <View style={styles.topBar}>
          <View>
            <Text style={styles.topSubtitle}>{`${t('dashboard.activity.columns.status')}: ${modeLabel}`}</Text>
          </View>
          {conversationId ? (
            <Pressable style={styles.reloadChip} onPress={() => void handleReloadConversation()} testID="ai.reloadConversation">
              <Text style={styles.reloadChipText}>{t('interested.actions.reload')}</Text>
            </Pressable>
          ) : null}
        </View>

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>{t('common.loading')}</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{(error as Error).message}</Text> : null}

        <ScrollView
          ref={scrollRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          testID="ai.chat.scroll"
        >
          {sortedMessages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t('common.aiAssistantPlaceholder')}</Text>
            </View>
          ) : null}

          {sortedMessages.map((message) => {
            const isUser = message.role === 'user';
            return (
              <View
                key={message.id}
                style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}
                testID={`ai.message.${message.role}.${message.id}`}
              >
                <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
                  <Text style={[styles.messageText, isUser ? styles.userMessageText : styles.assistantMessageText]}>
                    {message.text}
                  </Text>
                  {message.model ? <Text style={styles.modelTag}>{message.model}</Text> : null}
                </View>
              </View>
            );
          })}

          {sending ? (
            <View style={styles.messageRowAssistant}>
              <View style={[styles.messageBubble, styles.assistantBubble]}>
                <Text style={styles.assistantMessageText}>{t('common.loading')}</Text>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            editable={chatEnabled && !sending}
            multiline
            placeholder={chatEnabled ? t('common.aiPromptPlaceholder') : t('common.aiDisabled')}
            style={[styles.promptInput, (!chatEnabled || sending) && styles.promptInputDisabled]}
            testID="ai.prompt"
          />
          <Pressable
            style={[styles.sendButton, (!chatEnabled || sending || !prompt.trim()) && styles.sendButtonDisabled]}
            onPress={() => void handleSend()}
            disabled={!chatEnabled || sending || !prompt.trim()}
            testID="ai.send"
          >
            <Text style={styles.sendButtonText}>{sending ? t('common.saving') : t('common.send')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  topSubtitle: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  reloadChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
  },
  reloadChipText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 12,
  },
  loadingState: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#475569',
  },
  error: {
    color: '#b91c1c',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  emptyState: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    padding: 12,
  },
  emptyText: {
    color: '#475569',
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '86%',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: '#2563eb',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#ffffff',
  },
  assistantMessageText: {
    color: '#0f172a',
  },
  modelTag: {
    marginTop: 6,
    fontSize: 10,
    color: '#94a3b8',
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  promptInput: {
    minHeight: 84,
    maxHeight: 160,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    color: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  promptInputDisabled: {
    backgroundColor: '#f1f5f9',
    color: '#94a3b8',
  },
  sendButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
