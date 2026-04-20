"use client";

import BOMManagement from "./bom-management";
import ChatInterface from "./chat-interface";

export default function BOMChatLayout() {
  return (
    <div className="flex h-screen">
      <BOMManagement isCollapsed={true} />
      <ChatInterface expandedChat={true} />
    </div>
  );
}
