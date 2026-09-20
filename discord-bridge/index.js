const { Client, GatewayIntentBits, Events } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const WebSocket = require('ws');

// Получаем токен из аргументов командной строки
const token = process.argv[2];
if (!token) {
    console.error('Error: Bot token not specified!');
    console.error('Usage: node index.js <TOKEN>');
    process.exit(1);
}

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ] 
});

const wss = new WebSocket.Server({ port: 8080 });

// Подключения к голосовым каналам
const voiceConnections = new Map();
// Состояния говорящих пользователей
const speakingStates = new Map();
// ID целевого канала
let targetChannelId = '';

wss.on('connection', (ws) => {
  console.log('[Discord Bridge] New client connected');
  
  ws.on('message', (message) => {
    console.log('[Discord Bridge] Received message:', message.toString());
    try {
      const data = JSON.parse(message);
      console.log('[Discord Bridge] Parsed message:', data);
      
      if (data.type === 'config') {
        targetChannelId = data.channelId;
        console.log('[Discord Bridge] Updated target channel ID:', targetChannelId);
      } else if (data.type === 'joinVoice') {
        console.log('[Discord Bridge] Received join voice command for channel:', data.channelId);
        connectToVoiceChannel(data.channelId);
      } else if (data.type === 'leaveVoice') {
        console.log('[Discord Bridge] Received leave voice command');
        // Отключаемся от всех голосовых каналов
        for (const [channelId, connection] of voiceConnections) {
          console.log('[Discord Bridge] Disconnecting from channel:', channelId);
          connection.destroy();
          voiceConnections.delete(channelId);
        }
        // Очищаем состояния говорящих
        speakingStates.clear();
      } else if (data.type === 'getCurrentVoiceStates') {
        console.log('[Discord Bridge] Received request for current voice states');
        // Получаем текущий голосовой канал бота
        for (const guild of client.guilds.cache.values()) {
          const me = guild.members.cache.get(client.user.id);
          if (me && me.voice.channelId) {
            const voiceChannel = me.voice.channel;
            console.log(`[Discord Bridge] Bot is in channel: ${voiceChannel.name}`);
            
            // Отправляем информацию о каждом участнике
            voiceChannel.members.forEach(member => {
              console.log(`[Discord Bridge] Sending info about user: ${member.displayName}`);
              ws.send(JSON.stringify({
                type: 'voiceStateUpdate',
                user: member.displayName,
                userId: member.user.id,
                userOrig: member.user.username,
                channelId: voiceChannel.id,
                channelName: voiceChannel.name,
                joined: true,
                speaking: speakingStates.has(member.user.id),
                isOurBot: member.user.id === client.user.id
              }));
            });
          }
        }
      }
    } catch (error) {
      console.error('[Discord Bridge] Error parsing message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('[Discord Bridge] Client disconnected');
  });
});

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Проверяем все сервера на наличие "мёртвого" бота
  for (const guild of client.guilds.cache.values()) {
    const me = guild.members.cache.get(client.user.id);
    if (me && me.voice.channelId) {
      console.log(`[Discord Bridge] Found bot in voice channel on server ${guild.name}, reconnecting...`);
      
      // Создаём новое подключение
      const connection = joinVoiceChannel({
        channelId: me.voice.channelId,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
      });

      // Сохраняем подключение
      voiceConnections.set(me.voice.channelId, connection);

      // Настраиваем отслеживание говорящих
      connection.receiver.speaking.on('start', (userId) => {
        if (!speakingStates.get(userId)) {
          const speakingMember = guild.members.cache.get(userId);
          if (speakingMember) {
            console.log(`${speakingMember.displayName} speaking`);
            speakingStates.set(userId, true);
            
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'voiceSpeaking',
                  user: speakingMember.displayName,
                  speaking: true,
                  userId: userId,
                  userOrig: speakingMember.user.username,
                  channelId: me.voice.channelId,
                  channelName: me.voice.channel.name
                }));
              }
            });
          }
        }
      });

      connection.receiver.speaking.on('end', (userId) => {
        if (speakingStates.get(userId)) {
          const speakingMember = guild.members.cache.get(userId);
          if (speakingMember) {
            console.log(`${speakingMember.displayName} stopped speaking`);
            speakingStates.set(userId, false);
            
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'voiceSpeaking',
                  user: speakingMember.displayName,
                  speaking: false,
                  userId: userId,
                  userOrig: speakingMember.user.username,
                  channelId: me.voice.channelId,
                  channelName: me.voice.channel.name
                }));
              }
            });
          }
        }
      });
    }
  }
});

// Обрабатываем изменения состояния голосового канала
client.on('voiceStateUpdate', (oldState, newState) => {
  // Получаем информацию о канале
  const channel = newState.channel || oldState.channel;
  if (!channel) return;

  const channelId = channel.id;
  const channelName = channel.name;
  const userId = oldState.member.user.id;
  const username = oldState.member.user.username;

  // Проверяем, это наш целевой канал или нет
  if (channelId !== targetChannelId) return;

  // Определяем тип события (присоединение/отключение)
  const joined = !oldState.channel && newState.channel;
  const left = oldState.channel && !newState.channel;

  // Отправляем информацию об изменении состояния
  const voiceStateData = {
    type: 'voiceStateUpdate',
    user: oldState.member.displayName,
    userId: userId,
    userOrig: oldState.member.user.username,
    channelId: channelId,
    channelName: channelName,
    joined: joined,
    left: left,
    isOurBot: userId === client.user.id
  };

  // Отправляем всем клиентам
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(voiceStateData));
    }
  });

  // Если пользователь вышел, проверяем количество оставшихся участников
  if (left) {
    return // Пока что отключим
    // Получаем текущее количество участников в канале (без бота)
    const membersCount = channel.members.size - (voiceConnections.has(channelId) ? 1 : 0);
    
    // Если канал пустой (никого кроме бота), отключаем бота
    if (membersCount === 0 && voiceConnections.has(channelId)) {
      console.log('[Discord Bridge] Channel is empty, disconnecting bot');
      const connection = voiceConnections.get(channelId);
      connection.destroy();
      voiceConnections.delete(channelId);
      speakingStates.clear();
    }
  }
});

// Функция для подключения к голосовому каналу
function connectToVoiceChannel(channelId) {
  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    console.error('Channel not found:', channelId);
    return;
  }

  try {
    const connection = joinVoiceChannel({
      channelId: channelId,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false
    });

    // Получаем список всех пользователей в канале
    channel.members.forEach(member => {
      if (!member.user.bot) { // Игнорируем ботов
        console.log(`[Discord Bridge] Found existing user in channel: ${member.displayName}`);
        
        // Отправляем информацию о пользователе
        const voiceStateData = {
          type: 'voiceStateUpdate',
          user: member.displayName,
          userId: member.user.id,
          userOrig: member.user.username,
          channelId: channelId,
          channelName: channel.name,
          joined: true,
          left: false,
          isOurBot: member.user.id === client.user.id
        };

        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(voiceStateData));
          }
        });

        // Добавляем пользователя в список для отслеживания
        speakingStates.set(member.user.id, true);
      }
    });

    // Отслеживаем когда пользователь начинает говорить
    connection.receiver.speaking.on('start', (userId) => {
      // Проверяем, не отправляли ли мы уже это состояние чтобы избежать дублирования
      if (!speakingStates.get(userId)) {
        const speakingMember = channel.guild.members.cache.get(userId);
        speakingStates.set(userId, true);
        
        const speakingData = {
          type: 'voiceSpeaking',
          user: speakingMember.displayName,
          speaking: true,
          userId: userId,
          userOrig: speakingMember.user.username,
          channelId: channelId,
          channelName: channel.name
        };
        
        console.log(`${speakingMember.displayName} speaking`);
        
        // это идёт всем клиентам
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(speakingData));
          }
        });
      }
    });

    // Отслеживаем когда пользователь перестает говорить
    connection.receiver.speaking.on('end', (userId) => {
      // Проверяем, не отправляли ли мы уже это состояние, опять же чтобы избежать дублирования
      if (speakingStates.get(userId)) {
        const speakingMember = channel.guild.members.cache.get(userId);
        speakingStates.set(userId, false);
        
        const speakingData = {
          type: 'voiceSpeaking',
          user: speakingMember.displayName,
          speaking: false,
          userId: userId,
          userOrig: speakingMember.user.username,
          channelId: channelId,
          channelName: channel.name
        };
        
        console.log(`${speakingMember.displayName} stopped speaking`);
        
        // Тоже отправляем всем клиентам
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(speakingData));
          }
        });
      }
    });

    voiceConnections.set(channelId, connection);
  } catch (error) {
    console.error('Error connecting to voice channel:', error);
  }
}

// Токен бота из файлика
client.login(token);