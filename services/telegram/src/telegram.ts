import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { Bot, InputFile, type Context } from 'grammy';
import { sequentialize } from '@grammyjs/runner';
import { config, profiles, type ProfileName } from './config.js';
import { codexStatus, sendMessage } from './codex.js';
import { currentProfile, deleteSession, getSession, sessionKey, setProfile, setSession } from './sessions.js';
import { skillsText } from './skills.js';

const bot = new Bot(config.telegramBotToken);

bot.use(sequentialize((ctx) => ctx.chat?.id.toString() ?? ''));

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id?.toString();
  if (!userId || !config.allowedUserIds.has(userId)) return;
  await next();
});

const activeChats = new Set<string>();

bot.command('start', async (ctx) => {
  await ctx.reply('Eidos is online. Use /profile, /skills, /status, or just talk.');
});

bot.command('help', async (ctx) => {
  await ctx.reply([
    '/profile - show active profile',
    '/profile personal - switch profile',
    '/profile creative - switch profile',
    '/profile bioinformatics - switch profile',
    '/skills - show skill inventory',
    '/new - reset current Codex session',
    '/status - show gateway status',
  ].join('\n'));
});

bot.command('new', async (ctx) => {
  const key = sessionKey(ctx.from!.id.toString());
  const profile = currentProfile(key);
  deleteSession(key);
  setProfile(key, profile);
  await ctx.reply(`Session reset. Profile is still ${profile}.`);
});

bot.command('profile', async (ctx) => {
  const key = sessionKey(ctx.from!.id.toString());
  const requested = ctx.match?.trim() as ProfileName | '';

  if (!requested) {
    const profile = currentProfile(key);
    await ctx.reply(`Active profile: ${profile}\n\n${profileList()}`);
    return;
  }

  if (!isProfileName(requested)) {
    await ctx.reply(`Unknown profile: ${requested}\n\n${profileList()}`);
    return;
  }

  setProfile(key, requested);
  await ctx.reply(`Profile switched to ${requested}. New Codex session will start on your next message.`);
});

bot.command('skills', async (ctx) => {
  await ctx.reply(skillsText());
});

bot.command('status', async (ctx) => {
  const key = sessionKey(ctx.from!.id.toString());
  const session = getSession(key);
  const profile = currentProfile(key);
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const mins = Math.floor((uptime % 3600) / 60);
  const lines = [
    'Gateway: Eidos Telegram',
    `Uptime: ${hours}h ${mins}m`,
    session?.sessionId
      ? `Session: ${session.sessionId.slice(0, 8)}... (last active: ${session.lastActiveAt})`
      : 'No active session',
    codexStatus(profile),
  ];
  await ctx.reply(lines.join('\n'));
});

bot.on('message:text', async (ctx) => {
  const userId = ctx.from!.id.toString();
  const key = sessionKey(userId);
  const chatId = ctx.chat.id;
  const chatKey = chatId.toString();
  const profile = currentProfile(key);

  if (activeChats.has(chatKey)) {
    await ctx.reply('Queued. Processing previous message first.').catch(() => {});
  }

  activeChats.add(chatKey);

  try {
    await ctx.replyWithChatAction('typing');
    const existing = getSession(key);
    let sentMessage: { message_id: number } | undefined;
    let buffer = '';
    let lastEditTime = 0;

    const onPartialText = async (chunk: string) => {
      buffer += chunk;
      const now = Date.now();
      if (now - lastEditTime < config.telegram.editDebounceMs) return;

      const preview = buffer.slice(0, config.telegram.maxMessageLength);

      try {
        if (!sentMessage) {
          sentMessage = await bot.api.sendMessage(chatId, preview);
        } else {
          await bot.api.editMessageText(chatId, sentMessage.message_id, preview);
        }
        lastEditTime = now;
      } catch {
        // Edit failures are non-critical.
      }

      await ctx.replyWithChatAction('typing').catch(() => {});
    };

    const response = await sendMessage(ctx.message.text, {
      profile,
      resumeSessionId: existing?.sessionId || undefined,
      onPartialText,
    });

    if (response.sessionId) {
      setSession(key, response.sessionId, profile);
    } else if (response.error && existing?.sessionId) {
      deleteSession(key);
      setProfile(key, profile);
    }

    const finalText = response.error
      ? `Error: ${response.error}\n\n${response.text || '(no response)'}`
      : response.text || '(no response)';

    await sendFinalText(chatId, sentMessage, finalText);
    await sendReferencedDocuments(chatId, finalText);
  } finally {
    activeChats.delete(chatKey);
  }
});

bot.on('message:photo', async (ctx) => {
  const caption = ctx.message.caption || 'What do you see in this image?';
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const file = await ctx.api.getFile(photo.file_id);
  const path = await downloadTelegramFile(file.file_path, 'photo', 'jpg');
  await forwardFilePrompt(ctx, `[User sent a photo saved at ${path}] ${caption}`);
});

bot.on('message:voice', async (ctx) => {
  const file = await ctx.api.getFile(ctx.message.voice.file_id);
  const path = await downloadTelegramFile(file.file_path, 'voice', 'ogg');
  await forwardFilePrompt(
    ctx,
    `[User sent a voice message saved at ${path}. Transcribe it first if transcription tooling is available, then respond to the content.]`,
  );
});

bot.on('message:document', async (ctx) => {
  const doc = ctx.message.document;
  const file = await ctx.api.getFile(doc.file_id);
  const safeName = (doc.file_name || 'file').replace(/[^A-Za-z0-9._-]/g, '_');
  const path = await downloadTelegramFile(file.file_path, 'doc', safeName);
  const caption = ctx.message.caption || `Here's a file: ${doc.file_name}`;
  await forwardFilePrompt(ctx, `[User sent a document saved at ${path}, original name: ${doc.file_name}] ${caption}`);
});

async function forwardFilePrompt(ctx: Context, prompt: string): Promise<void> {
  const key = sessionKey(ctx.from!.id.toString());
  const profile = currentProfile(key);
  const existing = getSession(key);
  await ctx.replyWithChatAction('typing');
  const response = await sendMessage(prompt, {
    profile,
    resumeSessionId: existing?.sessionId || undefined,
  });
  if (response.sessionId) {
    setSession(key, response.sessionId, profile);
  } else if (response.error && existing?.sessionId) {
    deleteSession(key);
    setProfile(key, profile);
  }
  await sendChunked(ctx.chat!.id, response.error ? `Error: ${response.error}\n\n${response.text}` : response.text || '(no response)');
}

async function downloadTelegramFile(filePath: string | undefined, kind: string, suffix: string): Promise<string> {
  if (!filePath) throw new Error('Telegram file path missing');
  const dir = resolve(config.workspacePath, 'data/inbox/telegram');
  mkdirSync(dir, { recursive: true });
  const filename = suffix.includes('.') ? `${Date.now()}-${suffix}` : `${Date.now()}.${suffix}`;
  const localPath = resolve(dir, `${kind}-${filename}`);
  const url = `https://api.telegram.org/file/bot${config.telegramBotToken}/${filePath}`;
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  writeFileSync(localPath, Buffer.from(buf));
  return localPath;
}

async function sendFinalText(chatId: number, sentMessage: { message_id: number } | undefined, text: string): Promise<void> {
  const chunks = splitMessage(text, config.telegram.maxMessageLength);

  if (sentMessage && chunks.length === 1) {
    try {
      await bot.api.editMessageText(chatId, sentMessage.message_id, chunks[0]);
      return;
    } catch (err: unknown) {
      const description = typeof err === 'object' && err && 'description' in err
        ? String((err as { description?: unknown }).description)
        : '';
      if (description.includes('message is not modified')) return;
    }
  }

  if (sentMessage) {
    await bot.api.deleteMessage(chatId, sentMessage.message_id).catch(() => {});
  }

  for (const chunk of chunks) {
    await bot.api.sendMessage(chatId, chunk);
  }
}

async function sendChunked(chatId: number, text: string): Promise<void> {
  for (const chunk of splitMessage(text, config.telegram.maxMessageLength)) {
    await bot.api.sendMessage(chatId, chunk);
  }
}

async function sendReferencedDocuments(chatId: number, text: string): Promise<void> {
  const paths = Array.from(new Set(text.match(/\/[^\s"'`]+\.pdf/g) ?? []));
  for (const path of paths) {
    if (!existsSync(path)) continue;
    await bot.api.sendDocument(chatId, new InputFile(path), {
      caption: path.split('/').pop() || 'PDF',
    }).catch(() => {});
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf('\n', maxLen);
    if (splitIdx < maxLen / 2) splitIdx = maxLen;
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).replace(/^\n/, '');
  }
  return chunks;
}

function isProfileName(value: string): value is ProfileName {
  return value === 'personal' || value === 'creative' || value === 'bioinformatics';
}

function profileList(): string {
  return Object.entries(profiles)
    .map(([name, profile]) => `${name}: ${profile.description}`)
    .join('\n');
}

export async function startBot(): Promise<void> {
  await bot.start({
    onStart: () => console.log('[telegram] Eidos bot started'),
  });
}

export async function stopBot(): Promise<void> {
  await bot.stop();
}
