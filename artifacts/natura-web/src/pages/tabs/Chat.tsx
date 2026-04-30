import { useState, useRef, useEffect } from "react";
import { Activity, ArrowUp, Leaf, Moon, Droplets, Zap, ShieldCheck } from "lucide-react";
import { Layout } from "@/components/Layout";
import { askAI, type AIResponse } from "@/lib/ai";
import { BG, getBackgroundStyle } from "@/lib/background";

interface Message {
  id: string;
  role: "user" | "ai";
  text?: string;
  response?: AIResponse;
  timestamp: Date;
}

const SUGGESTIONS = [
  { text: "I'm feeling stressed and anxious",     Icon: Leaf,        color: "#9FE870" },
  { text: "Help me sleep better",                  Icon: Moon,        color: "#A78BFA" },
  { text: "My digestion feels sluggish",           Icon: Droplets,    color: "#7ECFED" },
  { text: "I need more energy",                    Icon: Zap,         color: "#F5C842" },
  { text: "How can I support my immune system?",   Icon: ShieldCheck, color: "#7CFFB2" },
];

function AIMessage({ response }: { response: AIResponse }) {
  const sections = [
    { label: "Herbs",       emoji: "🌿", items: response.herbs },
    { label: "Teas",        emoji: "🍵", items: response.teas },
    { label: "Foods",       emoji: "🥗", items: response.foods },
    { label: "Supplements", emoji: "💊", items: response.supplements },
  ];

  return (
    <div className="ai-message">
      <div className="ai-bubble-header">
        <div className="ai-avatar-sm"><Activity size={14} color="#7CFFB2" /></div>
        <span className="ai-label">Natura AI</span>
      </div>
      <p className="ai-why">{response.whyItHelps}</p>
      {sections.map(({ label, emoji, items }) => items.length > 0 && (
        <div key={label} className="ai-section">
          <p className="ai-section-title">{emoji} {label}</p>
          {items.map((item) => (
            <div key={item.name} className="ai-item">
              <p className="ai-item-name">{item.name}</p>
              <p className="ai-item-exp">{item.explanation}</p>
              <p className="ai-item-safety">⚠️ {item.safetyNote}</p>
            </div>
          ))}
        </div>
      ))}
      <p className="ai-disclaimer">Educational suggestions only — not medical advice</p>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { id: Date.now() + "u", role: "user", text: text.trim(), timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const response = await askAI(text.trim());
      setMessages((prev) => [...prev, { id: Date.now() + "a", role: "ai", response, timestamp: new Date() }]);
    } catch {
      setMessages((prev) => [...prev, { id: Date.now() + "e", role: "ai", text: "Sorry, something went wrong. Please try again.", timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  };

  const fillSuggestion = (text: string) => {
    setInput(text);
    setTimeout(() => {
      inputRef.current?.focus();
      const len = text.length;
      inputRef.current?.setSelectionRange(len, len);
    }, 60);
  };

  return (
    <Layout bgStyle={getBackgroundStyle(BG.focus)}>
      <div className="chat-screen" style={{ background: "transparent" }}>
        <div className="chat-header">
          <div className="chat-avatar">
            <Activity size={20} color="#7CFFB2" />
            <span className="chat-avatar-pulse" />
          </div>
          <div>
            <p className="chat-coach-label">AI Wellness Coach</p>
            <p className="chat-title">Natura AI</p>
            <p className="chat-sub">Natural wellness guidance</p>
          </div>
        </div>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">
              <p className="chat-empty-title">What would you like support with?</p>
              <p className="chat-empty-sub">Choose a topic below or type your own question.</p>
              <div className="suggestions">
                {SUGGESTIONS.map(({ text, Icon, color }, i) => (
                  <button
                    key={i}
                    className="suggestion-chip"
                    onClick={() => fillSuggestion(text)}
                  >
                    <span className="suggestion-icon" style={{ color }}>
                      <Icon size={18} />
                    </span>
                    <span className="suggestion-text">{text}</span>
                    <span className="suggestion-arrow">›</span>
                  </button>
                ))}
              </div>

              <div className="chat-divider">
                <span className="chat-divider-line" />
                <span className="chat-divider-label">or ask your own question</span>
                <span className="chat-divider-line" />
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" ? (
                <div className="user-message"><p>{msg.text}</p></div>
              ) : msg.response ? (
                <AIMessage response={msg.response} />
              ) : (
                <div className="ai-message"><p>{msg.text}</p></div>
              )}
            </div>
          ))}
          {loading && (
            <div className="ai-message typing">
              <div className="typing-dots"><span /><span /><span /></div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-bar">
          <div className={`chat-input-wrap ${input.trim() ? "has-input" : ""}`}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about herbs, sleep, stress..."
              className="chat-input"
              rows={1}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              disabled={loading}
            />
            <button
              className={`send-btn ${input.trim() && !loading ? "active" : ""}`}
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
            >
              <ArrowUp size={18} color={input.trim() && !loading ? "#0D1F16" : "#fff"} />
            </button>
          </div>
          <p className="chat-disclaimer">Educational suggestions only — not medical advice</p>
        </div>
      </div>
    </Layout>
  );
}
