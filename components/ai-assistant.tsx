"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { ComparisonResult } from "@/lib/comparison";
import type { Correction } from "@/lib/corrections";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AiAssistantProps {
  sourceCode: string;
  outputCode: string;
  direction: "aws-to-azure" | "azure-to-aws";
  comparison: ComparisonResult | null;
  corrections: Correction[];
}

const QUICK_ACTIONS = [
  { label: "Explain migration", prompt: "Explain what this migration did and summarize the key mappings." },
  { label: "Fix red items", prompt: "What are the red/gap items in the comparison and how do I fix them?" },
  { label: "TODO guide", prompt: "Walk me through the TODO items that need manual configuration." },
  { label: "Validate output", prompt: "Is this migrated output correct and deployment-ready? What should I check?" },
];

export default function AiAssistant({
  sourceCode,
  outputCode,
  direction,
  comparison,
  corrections,
}: AiAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsLoading(true);

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            context: {
              sourceCode: sourceCode.slice(0, 2000),
              outputCode: outputCode.slice(0, 2000),
              direction,
              comparison: comparison
                ? {
                    summary: comparison.summary,
                    mappings: comparison.mappings.map((m) => ({
                      sourceStep: m.sourceStep,
                      sourceType: m.sourceType,
                      targetStep: m.targetStep,
                      targetType: m.targetType,
                      status: m.status,
                      needsManualConfig: m.needsManualConfig,
                    })),
                  }
                : null,
              corrections: corrections.slice(0, 5),
            },
          }),
        });

        const data = await res.json();

        const assistantMsg: Message = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.reply || data.error || "Sorry, I could not process that.",
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            content: "Network error — please try again.",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, sourceCode, outputCode, direction, comparison, corrections]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const hasContext = sourceCode.trim() || outputCode.trim();

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all hover:scale-105 active:scale-95 ${
          isOpen
            ? "bg-slate-700 text-white hover:bg-slate-800"
            : "bg-gradient-to-br from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700"
        }`}
        title="AI Assistant"
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18" /><path d="M6 6l12 12" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a8 8 0 0 1 8 8c0 3.3-2 6.1-4.8 7.4L12 22l-3.2-4.6A8 8 0 0 1 12 2z" />
            <circle cx="12" cy="10" r="2" />
          </svg>
        )}

        {/* Notification pulse */}
        {!isOpen && hasContext && messages.length === 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-300 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-indigo-500 items-center justify-center text-[8px] text-white font-bold">?</span>
          </span>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[520px] w-[380px] flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] shadow-2xl animate-fadeIn" style={{ background: "var(--card)" }}>
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-[var(--card-border)] bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2a8 8 0 0 1 8 8c0 3.3-2 6.1-4.8 7.4L12 22l-3.2-4.6A8 8 0 0 1 12 2z" />
                <circle cx="12" cy="10" r="2" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-white">AI Migration Assistant</h3>
              <p className="text-[10px] text-white/70">Ask about your workflow migration</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="rounded-md px-2 py-1 text-[10px] text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-4 py-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgb(99,102,241)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>How can I help?</p>
                  <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                    {hasContext
                      ? "Ask me about your migration results"
                      : "Run a migration first, then ask me anything"}
                  </p>
                </div>

                {/* Quick Actions */}
                {hasContext && (
                  <div className="grid grid-cols-2 gap-2 w-full px-2 mt-2">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.label}
                        onClick={() => sendMessage(action.prompt)}
                        className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-[11px] font-medium text-indigo-700 text-left transition-all hover:bg-indigo-100 hover:border-indigo-200"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-md"
                      : "bg-slate-100 text-slate-800 rounded-bl-md"
                  }`}
                >
                  <div className={`text-[12px] leading-relaxed whitespace-pre-wrap ${
                    msg.role === "assistant" ? "prose-sm" : ""
                  }`}>
                    {msg.role === "assistant" ? formatAssistantMessage(msg.content) : msg.content}
                  </div>
                  <div className={`mt-1 text-[9px] ${
                    msg.role === "user" ? "text-indigo-200" : "text-slate-400"
                  }`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t border-[var(--card-border)] p-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={hasContext ? "Ask about your migration..." : "Run a migration first..."}
                disabled={isLoading}
                className="flex-1 rounded-xl border border-[var(--card-border)] px-3.5 py-2.5 text-[12px] placeholder-[var(--muted)] outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
                style={{ background: "var(--subtle-bg)", color: "var(--foreground)" }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4z" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// Simple markdown-ish formatting for assistant messages
function formatAssistantMessage(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold markers (displayed as plain in this context)
    .replace(/`(.*?)`/g, "$1");       // Remove inline code markers
}
