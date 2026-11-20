export type ReplyKeyboardButton = { text: string; web_app?: { url: string } };
export type InlineKeyboardButton = { text: string; callback_data?: string; url?: string; web_app?: { url: string } };

export class TelegramBotClient {
  constructor(private token: string) {}

  private async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json() as { ok: boolean; result?: T; description?: string };
    if (!json.ok) {
      throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
    }
    return json.result as T;
  }

  getMe() {
    return this.call<{ id: number; username: string; first_name: string }>('getMe', {});
  }

  setWebhook(url: string, secretToken?: string) {
    return this.call('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query', 'channel_post'],
    });
  }

  getWebhookInfo() {
    return this.call<{ url: string; pending_update_count: number; last_error_message?: string }>('getWebhookInfo', {});
  }

  setMyCommands(commands: Array<{ command: string; description: string }>) {
    return this.call('setMyCommands', { commands });
  }

  setChatMenuButton(webAppUrl: string, text = 'پنل دلارینو') {
    return this.call('setChatMenuButton', {
      menu_button: {
        type: 'web_app',
        text,
        web_app: { url: webAppUrl },
      },
    });
  }

  sendMessage(
    chatId: string | number,
    text: string,
    options?: {
      replyKeyboard?: ReplyKeyboardButton[][];
      inlineKeyboard?: InlineKeyboardButton[][];
      removeKeyboard?: boolean;
    }
  ) {
    const reply_markup = options?.inlineKeyboard
      ? { inline_keyboard: options.inlineKeyboard }
      : options?.replyKeyboard
        ? { keyboard: options.replyKeyboard, resize_keyboard: true }
        : options?.removeKeyboard
          ? { remove_keyboard: true }
          : undefined;

    return this.call<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text,
      reply_markup,
      disable_web_page_preview: true,
    });
  }

  editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    inlineKeyboard?: InlineKeyboardButton[][]
  ) {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
      disable_web_page_preview: true,
    });
  }

  answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
    return this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }
}
