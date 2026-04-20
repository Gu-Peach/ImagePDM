"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UploadIcon } from "lucide-react";
import FileSelector from "@/components/upload/file-selector";
import SaveFileDialog from "@/components/upload/save-file-dialog";
import "@/lib/types"; // 修正导入路径，使用绝对路径

// 文件/文件夹接口定义 (确保与FileSelector和SaveFileDialog组件中的定义一致)
interface FileSystemItem {
  id: string;
  name: string;
  isDirectory: boolean;
  path: string;
  children?: FileSystemItem[];
  size?: string;
  lastModified?: string;
  fileObject?: File;
}

interface UploadFileButtonProps {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  title?: string;
  onUploadComplete?: () => void; // 添加上传完成后的回调函数
  processFolder?: boolean; // 是否处理文件夹内的PDF文件
}

export default function UploadFileButton({
  variant = "default",
  size = "default",
  title = "上传文件",
  onUploadComplete,
  processFolder = true, // 默认开启文件夹处理
}: UploadFileButtonProps) {
  const [isFileSelectorOpen, setIsFileSelectorOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileSystemItem[]>([]);
  const [hasPDF, setHasPDF] = useState(false);

  // 打开文件选择器
  const handleOpenFileSelector = () => {
    setIsFileSelectorOpen(true);
  };

  // 递归检查是否包含PDF文件
  const checkForPDFFiles = (items: FileSystemItem[]): boolean => {
    for (const item of items) {
      if (!item.isDirectory && item.name.toLowerCase().endsWith(".pdf")) {
        return true;
      }
      if (item.isDirectory && item.children) {
        if (checkForPDFFiles(item.children)) {
          return true;
        }
      }
    }
    return false;
  };

  // 处理文件选择
  const handleFilesSelected = (files: FileSystemItem[]) => {
    console.log("选择了文件:", files.length);
    setSelectedFiles(files);
    setIsFileSelectorOpen(false);

    // 检查是否包含PDF文件（包括文件夹内的PDF）
    const containsPDF = checkForPDFFiles(files);
    setHasPDF(containsPDF);

    // 如果选择了文件，打开保存对话框
    if (files.length > 0) {
      setIsSaveDialogOpen(true);
    }
  };

  // 处理保存对话框关闭
  const handleSaveDialogClose = (success: boolean = false) => {
    setIsSaveDialogOpen(false);
    // 清空选中的文件
    setSelectedFiles([]);

    // 如果上传成功且有回调函数，则调用回调
    if (success && onUploadComplete) {
      onUploadComplete();
    }

    // 如果上传成功，刷新BOM树
    if (success) {
      // 调用全局的刷新函数
      const win = window as any;
      if (win.refreshBomTree && typeof win.refreshBomTree === "function") {
        console.log("正在刷新BOM树...");
        win.refreshBomTree();
      }
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleOpenFileSelector}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
      >
        <UploadIcon className="h-4 w-4" />
        {title}
      </Button>

      {/* 文件选择器 */}
      <FileSelector
        isOpen={isFileSelectorOpen}
        onClose={() => setIsFileSelectorOpen(false)}
        onSelect={handleFilesSelected}
        initialPath="/models"
      />

      {/* 保存文件对话框 */}
      <SaveFileDialog
        isOpen={isSaveDialogOpen}
        onClose={handleSaveDialogClose}
        selectedFiles={selectedFiles}
        hasPDF={hasPDF}
      />
    </>
  );
}
