"use client";

import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { FolderOpen, MessageSquare } from "lucide-react";
import PDFViewer from "@/components/viewer/document-viewer";
import ChatPanel from "@/components/chat/chat-panel";
import FileExplorer from "@/components/Bom/bom-tree";
import SearchFooter from "@/components/footer/search-footer";
import { SearchProvider } from "@/lib/search-context";
import { useRef } from "react";
import AppHeader from "@/components/header/app-header";
import DocumentViewer from "@/components/viewer/document-viewer";
import ModelViewer from "@/components/gltf/ModelViewer";

export default function MainLayout() {
  const { currentDrawing, toggleChatPanel, toggleFileExplorer, addMessage } =
    useAppStore();

  // 引用ChatPanel组件的搜索函数
  const chatPanelRef = useRef<{
    handleSearch: (query: string) => Promise<void>;
  }>(null);

  // 搜索处理函数，将调用转发给ChatPanel组件
  const handleSearch = async (query: string) => {
    if (chatPanelRef.current) {
      await chatPanelRef.current.handleSearch(query);

      // 只有在聊天面板未显示时才显示它
      if (!useAppStore.getState().showChatPanel) {
        toggleChatPanel();
      }
    }
  };

  return (
    <SearchProvider handleSearch={handleSearch}>
      <div className="min-h-screen bg-gray-50 flex flex-col pb-24">
        {/* 应用头部 */}
        <AppHeader />

        {/* 为固定头部预留空间 */}
        <div className="app-header-spacer"></div>

        {/* 主要内容区域 */}
        <main className="flex-1 container mx-auto px-4 md:pl-8 lg:pl-12 py-6">
          {currentDrawing ? (
            <div className="max-w-4xl mx-auto">
              <h2 className="text-xl font-semibold mb-4">
                {currentDrawing.name}
              </h2>
              <DocumentViewer url={currentDrawing.url} />
            </div>
          ) : (
            <div className="max-w-2xl mx-auto text-center py-16">
              <h2 className="text-2xl font-bold text-gray-700 mb-4">
                AutoCAD图纸管理系统
              </h2>
              <p className="text-gray-500 mb-8">
                请在底部搜索框中输入关键词查询图纸或BOM信息
              </p>
            </div>
          )}
        </main>

        {/* 浮动按钮 */}
        <div className="fixed bottom-28 right-8 flex flex-col gap-4 z-20">
          <Button
            size="icon"
            className="rounded-full h-12 w-12 shadow-lg"
            onClick={toggleChatPanel}
          >
            <MessageSquare className="h-6 w-6" />
          </Button>

          <Button
            size="icon"
            className="rounded-full h-12 w-12 shadow-lg"
            onClick={toggleFileExplorer}
          >
            <FolderOpen className="h-6 w-6" />
          </Button>
        </div>

        {/* 搜索底部栏 */}
        <SearchFooter />

        {/* 侧边面板 */}
        <ChatPanel ref={chatPanelRef} />
        <FileExplorer />

        {/* 3D模型查看器 */}
        <ModelViewer />
      </div>
    </SearchProvider>
  );
}
