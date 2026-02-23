import { useState, useRef, useEffect } from 'react';
import { Send, User, Wrench, Loader2, AlertTriangle } from 'lucide-react';
import Markdown from 'react-markdown';

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'model',
      text: "Hi there! Welcome to our auto repair shop. How can I help you with your vehicle today?",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [shopName, setShopName] = useState("Mike's Auto Repair");
  const [ready, setReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/settings');
        const settings = res.ok ? await res.json() : {};
        const name: string = settings.shop_name ?? "Mike's Auto Repair";
        setShopName(name);
        setMessages([{
          id: '1',
          role: 'model',
          text: `Hi there! Welcome to **${name}**. How can I help you with your vehicle today?`,
        }]);
      } catch {
        // use defaults
      }
      setReady(true);
    }
    init();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !ready) return;

    const text = input.trim().slice(0, 1000);
    const userMessage: Message = { id: Date.now().toString(), role: 'user', text };
    const history = messages.map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });
      const data = res.ok ? await res.json() : null;
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: data?.text || "I'm sorry, I didn't quite get that.",
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "Sorry, I'm having trouble connecting right now. Please try again later or call the shop directly.",
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col h-[85vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between shadow-md z-10">
          <div className="flex items-center gap-4">
            <div className="bg-amber-500 p-2.5 rounded-xl shadow-inner">
              <Wrench className="w-6 h-6 text-slate-900" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight">{shopName}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${ready ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`}></span>
                <p className="text-slate-300 text-xs font-medium uppercase tracking-wider">
                  {ready ? 'Virtual Assistant Online' : 'Loading…'}
                </p>
              </div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-slate-400 text-sm bg-slate-800 px-3 py-1.5 rounded-full">
            <AlertTriangle size={14} className="text-amber-500" />
            <span>Emergency? Call 911</span>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${msg.role === 'user' ? 'bg-slate-200 text-slate-600' : 'bg-amber-500 text-slate-900'}`}>
                {msg.role === 'user' ? <User size={20} /> : <Wrench size={20} />}
              </div>
              <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-4 ${msg.role === 'user' ? 'bg-slate-900 text-white rounded-tr-sm shadow-md' : 'bg-white text-slate-800 shadow-sm border border-slate-200 rounded-tl-sm'}`}>
                {msg.role === 'user' ? (
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                ) : (
                  <div className="prose prose-sm sm:prose-base prose-slate max-w-none prose-p:leading-relaxed prose-a:text-amber-600 hover:prose-a:text-amber-700 prose-strong:text-slate-900">
                    <Markdown>{msg.text}</Markdown>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-4 flex-row">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500 text-slate-900 flex items-center justify-center shadow-sm">
                <Wrench size={20} />
              </div>
              <div className="bg-white text-slate-800 shadow-sm border border-slate-200 rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                <span className="text-[15px] text-slate-500 font-medium">{shopName}'s assistant is typing...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 sm:p-5 bg-white border-t border-slate-200">
          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-3 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1000}
              placeholder={ready ? "Describe your car issue or ask a question..." : "Loading…"}
              className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl pl-5 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all text-[15px] shadow-sm"
              disabled={isLoading || !ready}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading || !ready}
              className="absolute right-2 top-2 bottom-2 aspect-square bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center shadow-sm"
            >
              <Send size={18} className="ml-0.5" />
            </button>
          </form>
          <p className="text-center text-xs text-slate-400 mt-3">
            This is an AI assistant. For accurate diagnosis, please bring your vehicle to the shop.
          </p>
        </div>
      </div>
    </div>
  );
}
