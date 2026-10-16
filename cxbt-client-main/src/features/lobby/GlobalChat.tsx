import { useState, useEffect, type FormEvent, useRef } from 'react';
import { apiFetch, WS_BASE } from '../../api';
import './GlobalChat.css';

type GlobalChatProps = {
  hostName: string;
  onClose: () => void;
};

type ChatEntry = {
  id: string;
  channel: string;
  sender: string;
  message: string;
  time?: string;
};

const QUICK_PHRASES = [
  '🔥 组队刷远征首领，来高战队友！',
  '⚔️ 练习赛房间已开，速来切磋！',
  '💎 收强化石与稀有造型卡！',
  '🎉 凌云要塞集合，准备夺旗！',
];

export default function GlobalChat({ hostName, onClose }: GlobalChatProps) {
  const [channel, setChannel] = useState<'global' | 'guild' | 'team'>('global');
  const [entries, setEntries] = useState<ChatEntry[]>([
    { id: 'sys-0', channel: 'global', sender: '系统', message: '欢迎来到《创想兵团》联机大厅全局频道！支持回车快速发言。' },
  ]);
  const [draft, setDraft] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const appendEntry = (entry: ChatEntry) => {
    setEntries((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.sender === entry.sender && last.message === entry.message && last.channel === entry.channel) {
        return prev;
      }
      return [...prev.slice(-99), entry];
    });
  };

  useEffect(() => {
    apiFetch(`/chat/history?channel=${channel}`)
      .then((rows: any[]) => {
        if (Array.isArray(rows) && rows.length > 0) {
          setEntries([
            { id: 'sys-0', channel: 'global', sender: '系统', message: '欢迎来到《创想兵团》联机大厅全局频道！' },
            ...rows.map((r, i) => ({
              id: `hist-${r.id ?? i}`,
              channel: r.channel || 'global',
              sender: r.sender || '玩家',
              message: r.message || '',
            })),
          ]);
        }
      })
      .catch(() => undefined);
  }, [channel]);

  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}?roomId=&playerId=${encodeURIComponent(hostName)}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'chat' || msg.type === 'invite') {
          appendEntry({
            id: `ws-${Date.now()}-${Math.random()}`,
            channel: msg.channel || 'global',
            sender: msg.sender || msg.userId || '玩家',
            message: msg.message || '',
            time: msg.time,
          });
        }
      } catch {
        // ignore malformed payload
      }
    };
    return () => ws.close();
  }, [hostName]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries]);

  const dispatchChat = (text: string) => {
    const message = text.trim();
    if (!message) return;
    appendEntry({
      id: `local-${Date.now()}`,
      channel,
      sender: hostName,
      message,
    });
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'chat', channel, message, userId: hostName, sender: hostName }));
    }
    void apiFetch('/chat/send', {
      method: 'POST',
      body: JSON.stringify({ channel, message, sender: hostName }),
    }).catch(() => undefined);
    setDraft('');
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    dispatchChat(draft);
  };

  const CHANNEL_LABEL: Record<string, string> = {
    global: '[世界]',
    guild: '[公会]',
    team: '[小队]',
  };

  return (
    <div className="global-chat-shade" onClick={onClose}>
      <div className="global-chat-modal" onClick={e => e.stopPropagation()}>
        <div className="global-chat-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2>全局聊天频道</h2>
            {(['global', 'guild', 'team'] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannel(ch)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 6,
                  border: channel === ch ? '1px solid #fbbf24' : '1px solid #475569',
                  background: channel === ch ? '#d97706' : '#1e293b',
                  color: '#fff',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {CHANNEL_LABEL[ch]}
              </button>
            ))}
          </div>
          <button className="global-chat-close" onClick={onClose}>×</button>
        </div>
        <div className="global-chat-messages" ref={listRef}>
          {entries.map((entry) => (
            <div key={entry.id} className="global-chat-msg">
              <span style={{ color: entry.channel === 'guild' ? '#34d399' : entry.channel === 'team' ? '#38bdf8' : '#fbbf24', marginRight: 6 }}>
                {CHANNEL_LABEL[entry.channel] || '[世界]'}
              </span>
              <strong>{entry.sender}:</strong> {entry.message}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '6px 12px', flexWrap: 'wrap', background: 'rgba(15,23,42,0.6)' }}>
          {QUICK_PHRASES.map((phrase) => (
            <button
              key={phrase}
              type="button"
              onClick={() => dispatchChat(phrase)}
              style={{
                padding: '3px 8px',
                borderRadius: 4,
                border: '1px solid #334155',
                background: '#1e293b',
                color: '#cbd5e1',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {phrase}
            </button>
          ))}
        </div>
        <form className="global-chat-input" onSubmit={sendMessage}>
          <input 
            autoFocus
            value={draft} 
            onChange={e => setDraft(e.target.value)} 
            placeholder="在频道中发言 (按 Enter 发送)..."
            maxLength={120}
          />
          <button type="submit">发送</button>
        </form>
      </div>
    </div>
  );
}

