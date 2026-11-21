export type ReplyKeyboardButton = { text: string; web_app?: { url: string } };
export type InlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
  style?: 'primary' | 'success' | 'danger';
};

function stripButtonStyles(markup: unknown): unknown {
  if (!markup || typeof markup !== 'object') return markup;
  const obj = markup as Record<string, unknown>;
  if (!Array.isArray(obj.inline_keyboard)) return markup;
  return {
    ...obj,
    inline_keyboard: obj.inline_keyboard.map((row) =>
      Array.isArray(row)
        ? row.map((btn) => {
            if (!btn || typeof btn !== 'object') return btn;
            const { style: _style, ...rest } = btn as Record<string, unknown>;
            return rest;
          })
        : row
    ),
  };
}

export class TelegramBotClient {
  constructor(private token: string) {}

  private async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    const json = await res.json() as { ok: boolean; result?: T; description?: string };
    if (!json.ok && body.reply_markup && /style|button|markup|field/i.test(json.description ?? '')) {
      const retryRes = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, reply_markup: stripButtonStyles(body.reply_markup) }),
        signal: AbortSignal.timeout(12_000),
      });
      const retryJson = await retryRes.json() as { ok: boolean; result?: T; description?: string };
      if (!retryJson.ok) {
        throw new Error(`Telegram ${method} failed: ${retryJson.description ?? retryRes.status}`);
      }
      return retryJson.result as T;
    }
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

  private buildMarkup(options?: {
    replyKeyboard?: ReplyKeyboardButton[][];
    inlineKeyboard?: InlineKeyboardButton[][];
    removeKeyboard?: boolean;
  }) {
    return options?.inlineKeyboard
      ? { inline_keyboard: options.inlineKeyboard }
      : options?.replyKeyboard
        ? { keyboard: options.replyKeyboard, resize_keyboard: true }
        : options?.removeKeyboard
          ? { remove_keyboard: true }
          : undefined;
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
    return this.call<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text,
      reply_markup: this.buildMarkup(options),
      disable_web_page_preview: true,
    });
  }

  sendPhoto(
    chatId: string | number,
    photoUrl: string,
    caption?: string,
    options?: {
      replyKeyboard?: ReplyKeyboardButton[][];
      inlineKeyboard?: InlineKeyboardButton[][];
    }
  ) {
    return this.call<{ message_id: number }>('sendPhoto', {
      chat_id: chatId,
      photo: photoUrl,
      caption,
      reply_markup: this.buildMarkup(options),
    });
  }

  sendVideo(
    chatId: string | number,
    videoUrl: string,
    caption?: string,
    options?: {
      replyKeyboard?: ReplyKeyboardButton[][];
      inlineKeyboard?: InlineKeyboardButton[][];
    }
  ) {
    return this.call<{ message_id: number }>('sendVideo', {
      chat_id: chatId,
      video: videoUrl,
      caption,
      reply_markup: this.buildMarkup(options),
    });
  }

  async sendDocument(
    chatId: string | number,
    filename: string,
    content: string,
    mimeType: string,
    caption?: string
  ) {
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    if (caption) fd.append('caption', caption);
    fd.append('document', new Blob([content], { type: mimeType }), filename);

    const res = await fetch(`https://api.telegram.org/bot${this.token}/sendDocument`, {
      method: 'POST',
      body: fd,
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!json.ok) {
      throw new Error(`Telegram sendDocument failed: ${json.description ?? res.status}`);
    }
    return json.result;
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
