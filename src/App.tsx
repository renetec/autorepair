import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Send, User, Wrench, Loader2, AlertTriangle } from 'lucide-react';
import Markdown from 'react-markdown';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const BASE_SYSTEM_PROMPT =
  "You are a helpful and knowledgeable customer service representative for {SHOP_NAME}. " +
  "You can answer questions about common car issues, provide pricing for services using the price list provided, " +
  "and help customers understand when they need to bring their car in for a diagnostic. " +
  "Be polite, professional, and reassuring. " +
  "If a problem sounds dangerous (like failing brakes, severe engine knocking, or flashing check engine light), " +
  "advise them to stop driving and get it towed. " +
  "Do not make definitive diagnoses without seeing the car. " +
  "When quoting prices, always use the prices in the price list below — do not guess or use outside knowledge for pricing. " +
  "Keep your responses concise and easy to read, using markdown formatting for lists or emphasis where appropriate.";

type Part = {
  id: number;
  category: string;
  name: string;
  price_low: number;
  price_high: number | null;
  notes: string | null;
};

function formatPriceList(parts: Part[]): string {
  const lines: string[] = ['OUR CURRENT PRICES:'];

  const byCategory: Record<string, Part[]> = {};
  for (const p of parts) {
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push(p);
  }

  for (const [category, items] of Object.entries(byCategory)) {
    lines.push(`\n${category}:`);
    for (const item of items) {
      const low = `CA$${item.price_low.toFixed(2)}`;
      const high = item.price_high != null ? `–CA$${item.price_high.toFixed(2)}` : '';
      const note = item.notes ? ` (${item.notes})` : '';
      lines.push(`- ${item.name}: ${low}${high}${note}`);
    }
  }

  return lines.join('\n');
}

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
  const [pricesLoaded, setPricesLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatRef = useRef<any>(null);

  useEffect(() => {
    async function initChat() {
      let priceList = '';
      let fetchedShopName: string = "Mike's Auto Repair";
      try {
        const [partsRes, settingsRes] = await Promise.all([
          fetch('/api/parts'),
          fetch('/api/settings'),
        ]);
        const parts: Part[] = partsRes.ok ? await partsRes.json() : [];
        const settings = settingsRes.ok ? await settingsRes.json() : {};
        fetchedShopName = settings.shop_name ?? "Mike's Auto Repair";
        setShopName(fetchedShopName);
        setMessages([{
          id: '1',
          role: 'model',
          text: `Hi there! Welcome to **${fetchedShopName}**. How can I help you with your vehicle today?`,
        }]);
        priceList = formatPriceList(parts);
      } catch (err) {
        console.warn('Could not fetch prices — using base prompt only:', err);
      }

      chatRef.current = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
          systemInstruction: (priceList
            ? BASE_SYSTEM_PROMPT + '\n\n' + priceList
            : BASE_SYSTEM_PROMPT).replace('{SHOP_NAME}', fetchedShopName),
        },
      });
      setPricesLoaded(true);
    }
    initChat();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !pricesLoaded) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await chatRef.current.sendMessage({ message: userMessage.text });

      const modelMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text || "I'm sorry, I didn't quite get that.",
      };

      setMessages((prev) => [...prev, modelMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "Sorry, I'm having trouble connecting right now. Please try again later or call the shop directly at (555) 123-4567.",
      };
      setMessages((prev) => [...prev, errorMessage]);
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
                <span className={`w-2 h-2 rounded-full ${pricesLoaded ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`}></span>
                <p className="text-slate-300 text-xs font-medium uppercase tracking-wider">
                  {pricesLoaded ? 'Virtual Assistant Online' : 'Loading prices…'}
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
            <div
              key={msg.id}
              className={`flex gap-4 ${
                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-slate-200 text-slate-600'
                    : 'bg-amber-500 text-slate-900'
                }`}
              >
                {msg.role === 'user' ? <User size={20} /> : <Wrench size={20} />}
              </div>
              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-4 ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white rounded-tr-sm shadow-md'
                    : 'bg-white text-slate-800 shadow-sm border border-slate-200 rounded-tl-sm'
                }`}
              >
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-3 relative"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={pricesLoaded ? "Describe your car issue or ask a question..." : "Loading shop prices…"}
              className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl pl-5 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all text-[15px] shadow-sm"
              disabled={isLoading || !pricesLoaded}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading || !pricesLoaded}
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
