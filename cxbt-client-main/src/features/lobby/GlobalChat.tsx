import { useState, useEffect, type FormEvent, useRef } from 'react';
import { apiFetch, WS_BASE } from '../../api';
import './GlobalChat.css';

type GlobalChatProps = {
  hostName: string;
  onClose: () => void;
};

export default function GlobalChat({ hostName, onClose }: GlobalChatProps) {
  const [messages, setMessages] = useState<string[]>(['系统: 欢迎来到联机大厅全局频道！']);
  const [draft, setDraft] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    apiFetch('/chat/history?channel=global')
      .then((rows: any[]) => {
        if (Array.isArray(rows) && rows.length > 0) {
          setMessages([
            '系统: 欢迎来到联机大厅全局频道！',
            ...rows.map((r) => `${r.sender}: ${r.message}`),
          ]);
        }
      })
      .catch(() => undefined);

    const ws = new WebSocket(`${WS_BASE}?roomId=&playerId=${encodeURIComponent(hostName)}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'chat' || msg.type === 'invite') {
          setMessages((current) => [...current.slice(-99), `${msg.userId}: ${msg.message}`]);
        }
      } catch {
        // ignore malformed payload
      }
    };
    return () => ws.close();
  }, [hostName]);

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'chat', message, userId: hostName }));
    } else {
      setMessages((current) => [...current.slice(-99), `${hostName}: ${message}`]);
    }
    setDraft('');
  };

  return (
    <div className="global-chat-shade" onClick={onClose}>
      <div className="global-chat-modal" onClick={e => e.stopPropagation()}>
        <div className="global-chat-header">
          <h2>全局频道</h2>
          <button className="global-chat-close" onClick={onClose}>×</button>
        </div>
        <div className="global-chat-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className="global-chat-msg">{msg}</div>
          ))}
        </div>
        <form className="global-chat-input" onSubmit={sendMessage}>
          <input 
            autoFocus
            value={draft} 
            onChange={e => setDraft(e.target.value)} 
            placeholder="在全局频道说点什么..."
            maxLength={100}
          />
          <button type="submit">发送</button>
        </form>
      </div>
    </div>
  );
}
