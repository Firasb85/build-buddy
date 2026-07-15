import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { askAssistant, listAssistantHistory } from "@/lib/local-api";
import { useI18n } from "@/hooks/use-i18n";
import { Send, Bot, User as UserIcon, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/assistant")({
  component: AssistantPage,
});

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

function AssistantPage() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const history = useQuery({ queryKey: ["assistant-history"], queryFn: () => listAssistantHistory() });
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = useMutation({
    mutationFn: (q: string) => askAssistant({ question: q, lang }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assistant-history"] }),
    onSettled: () => setPending(false),
  });

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = input.trim();
    if (!q || pending) return;
    setInput("");
    setPending(true);
    send.mutate(q);
  }

  // scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history.data, pending]);

  const messages: ChatMessage[] = (history.data ?? []) as ChatMessage[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          {t.assistant_title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.assistant_desc}</p>
      </div>

      <div className="card-panel p-0 overflow-hidden flex flex-col" style={{ height: "calc(100vh - 240px)", minHeight: 480 }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && !pending && (
            <div className="h-full grid place-items-center text-sm text-muted-foreground text-center px-8">
              <div>
                <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
                {t.assistant_empty}
                <div className="mt-4 grid gap-2 text-xs max-w-md mx-auto">
                  {suggestionPrompts(lang).map((s, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(s); }}
                      className="rounded-md border border-border bg-surface-2 px-3 py-2 text-start hover:border-primary hover:text-primary transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}
          {pending && (
            <div className="flex items-start gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
                <span className="inline-block animate-pulse">●</span>
                <span className="inline-block animate-pulse" style={{ animationDelay: "150ms" }}>●</span>
                <span className="inline-block animate-pulse" style={{ animationDelay: "300ms" }}>●</span>
                <span className="ml-2">{t.assistant_thinking}</span>
              </div>
            </div>
          )}
        </div>
        <form onSubmit={submit} className="border-t border-border bg-surface/60 p-3 flex gap-2">
          <input
            className="input-field flex-1"
            placeholder={t.assistant_placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={pending}
          />
          <button type="submit" className="btn-primary !px-4" disabled={!input.trim() || pending}>
            <Send className="h-4 w-4" />
            {t.assistant_send}
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={"flex items-start gap-3 " + (isUser ? "flex-row-reverse" : "")}>
      <div className={
        "grid h-8 w-8 place-items-center rounded-md shrink-0 " +
        (isUser ? "bg-accent/15 text-accent" : "bg-primary/10 text-primary")
      }>
        {isUser ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={
        "rounded-lg px-3 py-2 text-sm leading-relaxed max-w-[80%] whitespace-pre-wrap " +
        (isUser ? "bg-accent/10 border border-accent/30" : "bg-surface-2 border border-border")
      }>
        {msg.content}
      </div>
    </div>
  );
}

function suggestionPrompts(lang: "ar" | "en"): string[] {
  if (lang === "ar") {
    return [
      "ما حالة الإنتاج اليوم؟",
      "هل يوجد خط معطل؟",
      "أهم التوصيات الآن",
      "توقعات الطلب للأسبوع القادم",
    ];
  }
  return [
    "What is today's production status?",
    "Are any lines down?",
    "Top recommendations right now",
    "Demand forecast for next week",
  ];
}
