"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  FolderIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  RefreshCwIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import EquipmentForm from "./equipment-form";
import axios from "axios";

// 文件/文件夹接口定义 (与FileSelector组件中保持一致)
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

interface SaveFileDialogProps {
  isOpen: boolean;
  onClose: (success?: boolean) => void;
  selectedFiles: FileSystemItem[]; // 从FileSelector获取的选中文件
  hasPDF?: boolean; // 是否包含PDF文件
}

export default function SaveFileDialog({
  isOpen,
  onClose,
  selectedFiles,
  hasPDF = false, // 默认为false
}: SaveFileDialogProps) {
  const [folderStructure, setFolderStructure] = useState<FileSystemItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );
  const [selectedFolder, setSelectedFolder] = useState<FileSystemItem | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showEquipmentForm, setShowEquipmentForm] = useState(false);
  const [destinationPath, setDestinationPath] = useState("");
  const [extractedData, setExtractedData] = useState<Record<string, string>>(
    {}
  );
  const [isExtracting, setIsExtracting] = useState(false);

  // 获取文件夹结构
  useEffect(() => {
    if (isOpen) {
      fetchFolderStructure();
    }
  }, [isOpen]);

  const fetchFolderStructure = async () => {
    try {
      setIsLoading(true);
      setSaveError(null);

      // 使用后端API从Supabase获取文件夹结构
      const response = await fetch(
        "http://localhost:8000/api/models-directory"
      );
      if (!response.ok) {
        throw new Error("无法获取文件夹结构");
      }

      const data = await response.json();

      // 检查是否有"模型文件夹"作为根目录，跳过它
      let actualFolderStructure = data;
      if (
        data.length === 1 &&
        data[0].name === "模型文件夹" &&
        data[0].children
      ) {
        actualFolderStructure = data[0].children;
      }

      // 只保留目录，过滤掉文件
      const filterDirectoriesOnly = (
        items: FileSystemItem[]
      ): FileSystemItem[] => {
        return items
          .filter((item) => item.isDirectory)
          .map((item) => {
            if (item.children) {
              return {
                ...item,
                children: filterDirectoriesOnly(item.children),
              };
            }
            return item;
          });
      };

      setFolderStructure(filterDirectoriesOnly(actualFolderStructure));
    } catch (error) {
      console.error("获取文件夹结构时出错:", error);
      setSaveError("获取文件夹结构失败，请重试");
    } finally {
      setIsLoading(false);
    }
  };

  // 切换文件夹展开状态
  const toggleFolder = (folder: FileSystemItem) => {
    const newExpandedFolders = new Set(expandedFolders);
    if (expandedFolders.has(folder.path)) {
      newExpandedFolders.delete(folder.path);
    } else {
      newExpandedFolders.add(folder.path);
    }
    setExpandedFolders(newExpandedFolders);
  };

  // 选择文件夹
  const selectFolder = (folder: FileSystemItem) => {
    // 如果点击的是当前选中的文件夹，则取消选择
    if (selectedFolder?.path === folder.path) {
      setSelectedFolder(null);
    } else {
      setSelectedFolder(folder);
    }
  };

  // 处理点击空白区域取消选择的功能
  const handleBackgroundClick = (e: React.MouseEvent) => {
    // 确保点击的是容器背景而不是其他元素
    if (e.target === e.currentTarget) {
      setSelectedFolder(null);
    }
  };

  // 处理点击"保存到此位置"按钮
  const handleSaveClick = async () => {
    if (!selectedFolder) {
      setSaveError("请选择一个文件夹");
      return;
    }

    // 收集所有PDF文件
    const pdfFiles: FileSystemItem[] = [];

    // 递归查找所有PDF文件
    const collectPdfFiles = (items: FileSystemItem[]) => {
      items.forEach((item) => {
        if (item.isDirectory && item.children) {
          collectPdfFiles(item.children);
        } else if (
          !item.isDirectory &&
          item.name.toLowerCase().endsWith(".pdf") &&
          item.fileObject
        ) {
          // 如果是PDF文件且有fileObject，添加到列表
          pdfFiles.push(item);
        }
      });
    };

    // 收集所有选中文件中的PDF文件
    collectPdfFiles(selectedFiles);

    // 直接上传文件，不再提前提取PDF信息
    if (pdfFiles.length > 0 && hasPDF) {
      try {
        setIsExtracting(true);
        // 直接上传文件，跳过预先提取
        await saveFiles();
        setShowEquipmentForm(true);
      } catch (error) {
        console.error("PDF处理失败:", error);
      } finally {
        setIsExtracting(false);
      }
    } else {
      // 如果没有PDF文件或未启用PDF处理，直接上传文件
      await saveFiles();
    }
  };

  // 处理设备信息录入完成
  const handleEquipmentFormComplete = () => {
    setShowEquipmentForm(false);
    // 不再需要调用saveFiles，因为文件已经在显示表单前上传了
    onClose(true);
  };

  // 保存文件到选定文件夹
  const saveFiles = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      setSaveError("没有选择任何文件");
      return;
    }

    try {
      setIsSaving(true);
      setSaveError(null);

      const savePath = selectedFolder?.path || "";
      console.log("正在保存文件到:", selectedFolder?.path || "根目录");
      console.log("要保存的文件数量:", selectedFiles.length);

      // 分离文件夹和文件
      const folders = selectedFiles.filter((item) => item.isDirectory);
      const validFiles = selectedFiles.filter(
        (item) => !item.isDirectory && item.fileObject
      );

      // 如果没有文件也没有文件夹，报错
      if (folders.length === 0 && validFiles.length === 0) {
        throw new Error("没有有效的文件或文件夹可上传");
      }

      const formData = new FormData();
      formData.append("destinationPath", savePath);

      // 跟踪已处理的文件，避免重复上传
      const processedFiles = new Set<string>();

      // 收集所有PDF文件，用于后续批量处理
      const allPdfFiles: { file: File; path: string }[] = [];

      // 添加文件夹信息，确保每个文件夹都单独添加
      if (folders.length > 0) {
        folders.forEach((folder, index) => {
          // 只传递文件夹的名称而非完整路径
          const folderName = folder.name;
          formData.append(`folderPaths[${index}]`, folderName);

          // 收集文件夹内的所有文件
          const collectFiles = (
            items: FileSystemItem[] | undefined,
            parentPath = ""
          ) => {
            if (!items) return;

            items.forEach((item) => {
              // 生成唯一ID避免重复添加同一个文件
              const fileId = item.fileObject
                ? item.fileObject.name + item.fileObject.size
                : "";

              if (
                !item.isDirectory &&
                item.fileObject &&
                !processedFiles.has(fileId)
              ) {
                // 构建相对路径，保存文件夹结构
                const relativePath = parentPath
                  ? `${parentPath}/${item.name}`
                  : item.name;
                formData.append("files", item.fileObject);
                formData.append("filePaths", relativePath);
                processedFiles.add(fileId);

                // 如果是PDF文件，添加到PDF文件列表
                if (item.name.toLowerCase().endsWith(".pdf")) {
                  allPdfFiles.push({
                    file: item.fileObject,
                    path: `${savePath}/${relativePath}`.replace(/\/+/g, "/"),
                  });
                }
              } else if (item.isDirectory && item.children) {
                // 递归处理子文件夹，即使没有选中任何文件，也要保持文件夹结构
                const newPath = parentPath
                  ? `${parentPath}/${item.name}`
                  : item.name;
                collectFiles(item.children, newPath);
              }
            });
          };

          // 从文件夹根节点开始收集文件
          collectFiles(folder.children, folderName);
        });
      }

      // 添加单独的文件（不在文件夹中的）
      validFiles.forEach((file) => {
        // 生成唯一ID避免重复添加同一个文件
        const fileId = file.fileObject
          ? file.fileObject.name + file.fileObject.size
          : "";

        if (file.fileObject && !processedFiles.has(fileId)) {
          console.log(`添加文件: ${file.name}`);
          formData.append("files", file.fileObject);
          formData.append("filePaths", file.name);
          processedFiles.add(fileId);

          // 如果是PDF文件，添加到PDF文件列表
          if (file.name.toLowerCase().endsWith(".pdf")) {
            allPdfFiles.push({
              file: file.fileObject,
              path: `${savePath}/${file.name}`.replace(/\/+/g, "/"),
            });
          }
        }
      });

      // 发送请求到后端API，后端将处理上传到Supabase
      const response = await fetch(
        "http://localhost:8000/api/upload-to-supabase",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("上传失败响应:", errorText);

        let errorMessage;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || "上传文件失败";
        } catch (e) {
          errorMessage = `上传失败: ${response.status} ${response.statusText}`;
        }

        throw new Error(errorMessage);
      }

      // 处理成功
      const result = await response.json();
      console.log("上传成功:", result);

      // 检查是否有文件上传失败
      if (result.files && result.files.length < selectedFiles.length) {
        console.warn(
          `部分文件上传失败: 成功上传 ${result.files.length}/${selectedFiles.length}`
        );
      }

      // 如果有PDF文件，调用批量处理API
      if (allPdfFiles.length > 0 && hasPDF && !showEquipmentForm) {
        // 只有当不显示设备表单时才调用批量处理API
        try {
          console.log(`正在处理 ${allPdfFiles.length} 个PDF文件...`);

          // 创建新的FormData用于PDF处理
          const pdfFormData = new FormData();
          pdfFormData.append("destinationPath", savePath);

          // 添加所有PDF文件
          allPdfFiles.forEach((pdfItem, index) => {
            pdfFormData.append("files", pdfItem.file);

            // 计算相对路径
            const relativePath = pdfItem.path.replace(`${savePath}/`, "");
            pdfFormData.append("filePaths", relativePath);
          });

          // 调用批量处理API
          const pdfResponse = await fetch(
            "http://localhost:8000/api/process-pdf-folder",
            {
              method: "POST",
              body: pdfFormData,
            }
          );

          if (pdfResponse.ok) {
            const pdfResult = await pdfResponse.json();
            console.log("PDF处理成功:", pdfResult);
          } else {
            console.error("PDF处理失败:", await pdfResponse.text());
          }
        } catch (pdfError) {
          console.error("处理PDF文件时出错:", pdfError);
          // PDF处理失败不应影响整体上传流程
        }
      }

      // 显示成功消息（可以使用toast通知或其他方式）
      alert(
        `成功保存${selectedFiles.length}个文件到 ${
          selectedFolder?.path || "根目录"
        }`
      );
      onClose(true);
    } catch (error) {
      console.error("保存文件时出错:", error);
      let errorMessage = "保存文件失败，请重试";

      if (typeof error === "string") {
        errorMessage = error;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      setSaveError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // 递归渲染文件夹结构
  const renderFolderTree = (item: FileSystemItem, level = 0) => {
    const isExpanded = expandedFolders.has(item.path);
    const isSelected = selectedFolder?.path === item.path;

    return (
      <div key={item.path}>
        <div
          className={`flex items-center py-1 px-2 cursor-pointer ${
            isSelected ? "bg-blue-100" : "hover:bg-gray-200"
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => selectFolder(item)}
        >
          <span
            className="mr-1 flex items-center"
            onClick={(e) => {
              e.stopPropagation();
              toggleFolder(item);
            }}
          >
            {item.isDirectory && (item.children?.length || 0) > 0 ? (
              isExpanded ? (
                <ChevronDownIcon className="h-4 w-4" />
              ) : (
                <ChevronRightIcon className="h-4 w-4" />
              )
            ) : (
              <span className="w-4"></span>
            )}
          </span>
          <FolderIcon className="h-4 w-4 mr-1 text-yellow-500" />
          <span className="text-sm truncate">{item.name}</span>
        </div>

        {isExpanded && item.children && item.children.length > 0 && (
          <div>
            {item.children.map((child) => renderFolderTree(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="right" className="w-[400px] p-0 flex flex-col">
          <SheetHeader className="p-4 border-b">
            <SheetTitle>选择保存位置</SheetTitle>
          </SheetHeader>

          <div className="p-4 border-b">
            <div className="text-sm text-gray-500 mb-1">选择的文件:</div>
            <div className="text-sm font-medium">
              {selectedFiles.length} 个文件
            </div>
            {hasPDF && (
              <div className="mt-2 text-xs text-blue-600">
                检测到PDF文件，系统将自动提取序列号和供应商信息
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto p-4">
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm font-medium">文件夹结构</div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={fetchFolderStructure}
                disabled={isLoading}
              >
                <RefreshCwIcon
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>

            {isLoading ? (
              <div className="flex justify-center items-center h-40">
                <RefreshCwIcon className="h-5 w-5 animate-spin mr-2" />
                <span>加载文件夹结构...</span>
              </div>
            ) : folderStructure.length > 0 ? (
              <div
                className="border rounded-lg"
                onClick={handleBackgroundClick}
              >
                {folderStructure.map((item) => renderFolderTree(item))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-10">
                没有可用的文件夹
              </div>
            )}

            {saveError && (
              <div className="mt-4 p-2 bg-red-100 text-red-600 rounded text-sm">
                {saveError}
              </div>
            )}

            {selectedFolder && (
              <div className="mt-4 p-2 bg-blue-50 rounded">
                <div className="text-sm text-gray-500">将文件保存到:</div>
                <div className="text-sm font-medium">{selectedFolder.path}</div>
              </div>
            )}
          </div>

          <SheetFooter className="p-4 border-t">
            <div className="flex justify-between items-center w-full">
              <Button variant="outline" onClick={() => onClose()}>
                取消
              </Button>
              <Button
                onClick={handleSaveClick}
                disabled={
                  isSaving || isExtracting || selectedFiles.length === 0
                }
                className="bg-gray-700 hover:bg-gray-800"
              >
                {isSaving || isExtracting ? (
                  <>
                    <RefreshCwIcon className="h-4 w-4 animate-spin mr-2" />
                    {isExtracting ? "提取PDF信息中..." : "保存中..."}
                  </>
                ) : selectedFolder ? (
                  hasPDF ? (
                    "继续并提取PDF信息"
                  ) : (
                    "保存到此位置"
                  )
                ) : hasPDF ? (
                  "继续并提取PDF信息"
                ) : (
                  "保存到根目录"
                )}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* 设备信息表单 */}
      <EquipmentForm
        isOpen={showEquipmentForm}
        onClose={() => setShowEquipmentForm(false)}
        selectedFiles={selectedFiles}
        destinationPath={destinationPath}
        onComplete={handleEquipmentFormComplete}
        extractedData={extractedData}
      />
    </>
  );
}
