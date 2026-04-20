"use client";

import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Paperclip, Mic, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchContext } from "@/lib/search-context";

export default function SearchFooter() {
  const { addMessage } = useAppStore();
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { handleSearch } = useSearchContext();

  // 处理搜索/发送消息
  const handleSubmit = async () => {
    if (!query.trim() || isLoading) return;

    setIsLoading(true);

    try {
      // 添加用户消息
      addMessage({
        id: Date.now().toString(),
        content: query,
        sender: "user",
        timestamp: new Date(),
      });

      // 调用搜索处理函数
      await handleSearch(query);

      setQuery("");
    } catch (error) {
      console.error("搜索出错:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理按键事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 聚焦输入框
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // 当按下斜杠键且没有聚焦在输入框时，聚焦输入框
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, []);

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-background/80 to-background/40 backdrop-blur-md py-6">
      <div className="container mx-auto px-4">
        <div
          className={cn(
            "max-w-3xl mx-auto transition-all duration-300 ease-in-out",
            isFocused ? "scale-[1.02]" : "scale-100"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2 bg-white rounded-full border shadow-lg px-4 py-2 transition-all duration-300",
              isFocused ? "shadow-xl border-primary/50" : ""
            )}
          >
            <div className="flex-shrink-0">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>

            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="搜索图纸或BOM信息..."
              className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-1"
            />

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-muted-foreground hover:text-foreground"
                type="button"
              >
                <Paperclip className="h-5 w-5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-muted-foreground hover:text-foreground"
                type="button"
              >
                <Mic className="h-5 w-5" />
              </Button>

              <Button
                variant="default"
                size="icon"
                className="rounded-full"
                disabled={!query.trim() || isLoading}
                onClick={handleSubmit}
              >
                {isLoading ? (
                  <div className="h-5 w-5 border-2 border-t-transparent border-white rounded-full animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>

          <div className="text-xs text-center text-muted-foreground mt-2">
            按下 <kbd className="px-1 py-0.5 bg-muted rounded border">/ </kbd>{" "}
            聚焦搜索 · 支持查询图纸、零件编号、BOM信息
          </div>
        </div>
      </div>
    </footer>
  );
}
