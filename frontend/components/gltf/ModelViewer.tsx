"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { X } from "lucide-react";
import GLTFModel from "./Viewer";

export default function ModelViewer() {
  const { showModelViewer, toggleModelViewer, modelViewerOptions } =
    useAppStore();

  // 当模型查看器打开时，禁止页面滚动
  useEffect(() => {
    if (showModelViewer) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showModelViewer]);

  return (
    <Dialog
      open={showModelViewer}
      onOpenChange={(open) => {
        if (!open) toggleModelViewer();
      }}
    >
      <DialogContent className="max-w-[90vw] max-h-[90vh] w-[1200px] h-[800px] p-0 overflow-hidden">
        {/* 左上角显示零件名称 */}
        <div className="absolute left-4 top-4 z-10 bg-black/50 px-3 py-1 rounded text-white">
          {modelViewerOptions.title || "3D模型查看器"}
        </div>

        {/* 右上角显示关闭按钮 */}
        <DialogClose className="absolute right-4 top-4 z-10 bg-black/50 p-2 rounded-full text-white hover:bg-black/70">
          <X className="h-5 w-5" />
        </DialogClose>

        {/* 隐藏的标题用于屏幕阅读器 */}
        <div className="sr-only">
          <DialogTitle>
            {modelViewerOptions.title || "3D模型查看器"}
          </DialogTitle>
        </div>

        <div className="relative w-full h-full">
          <GLTFModel />
        </div>
      </DialogContent>
    </Dialog>
  );
}
