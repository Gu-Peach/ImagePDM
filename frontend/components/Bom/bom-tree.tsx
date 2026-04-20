"use client";

import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X,
  FolderIcon,
  FileIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  SearchIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import UploadFileButton from "@/components/upload/upload-file-button";

// 文件/文件夹接口定义
interface FileSystemItem {
  name: string;
  isOpen: boolean;
  isDirectory: boolean;
  children: FileSystemItem[];
  path: string;
}

// 文件夹树组件
const FolderTree = ({
  item,
  level = 0,
  expandedFolders,
  setExpandedFolders,
  selectedFile,
  fetchFileContent,
  searchQuery,
}: {
  item: FileSystemItem;
  level?: number;
  expandedFolders: Set<string>;
  setExpandedFolders: (folders: Set<string>) => void;
  selectedFile: FileSystemItem | null;
  fetchFileContent: (file: FileSystemItem, e?: React.MouseEvent) => void;
  searchQuery?: string;
}) => {
  const isOpen = expandedFolders.has(item.path);
  // 检查当前项是否匹配搜索条件
  const isMatched =
    searchQuery && item.name.toLowerCase().includes(searchQuery.toLowerCase());

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (item.isDirectory) {
      const newExpandedFolders = new Set(expandedFolders);
      if (isOpen) {
        newExpandedFolders.delete(item.path);
      } else {
        newExpandedFolders.add(item.path);
      }
      setExpandedFolders(newExpandedFolders);
    } else {
      // 如果点击的是文件，则加载文件内容
      fetchFileContent(item);
    }
  };

  return (
    <div>
      <div
        className={`flex items-center py-1 px-2 hover:bg-gray-200 cursor-pointer ${
          level === 0 ? "font-semibold" : ""
        } ${selectedFile?.path === item.path ? "bg-blue-100" : ""} ${
          isMatched ? "bg-yellow-100" : ""
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        {item.isDirectory ? (
          isOpen ? (
            <ChevronDownIcon className="h-4 w-4 mr-1" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 mr-1" />
          )
        ) : (
          <span className="w-5"></span>
        )}

        {item.isDirectory ? (
          <FolderIcon className="h-4 w-4 mr-1 text-yellow-500" />
        ) : (
          <FileIcon className="h-4 w-4 mr-1 text-gray-500" />
        )}

        <span className="text-sm truncate">{item.name}</span>
      </div>

      {isOpen &&
        item.isDirectory &&
        item.children &&
        item.children.length > 0 && (
          <div>
            {item.children.map((child, index) => (
              <FolderTree
                key={`${child.path}-${index}`}
                item={child}
                level={level + 1}
                expandedFolders={expandedFolders}
                setExpandedFolders={setExpandedFolders}
                selectedFile={selectedFile}
                fetchFileContent={fetchFileContent}
                searchQuery={searchQuery}
              />
            ))}
          </div>
        )}
    </div>
  );
};

export default function FileExplorer() {
  const {
    showFileExplorer,
    toggleFileExplorer,
    setCurrentDrawing,
    searchQuery: storeSearchQuery,
    setSearchQuery: setStoreSearchQuery,
  } = useAppStore();

  // 文件浏览相关状态
  const [folderStructure, setFolderStructure] = useState<FileSystemItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredFolderStructure, setFilteredFolderStructure] = useState<
    FileSystemItem[]
  >([]);
  const [selectedFile, setSelectedFile] = useState<FileSystemItem | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileContentLoading, setFileContentLoading] = useState(false);
  const [filePreviewType, setFilePreviewType] = useState<
    "text" | "image" | "binary" | "unsupported" | "model"
  >("text");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );

  // 从store中同步搜索查询
  useEffect(() => {
    if (storeSearchQuery) {
      setSearchQuery(storeSearchQuery);
      // 清空store中的查询，避免重复触发
      setStoreSearchQuery("");
    }
  }, [storeSearchQuery, setStoreSearchQuery]);

  // 从服务器获取模型文件夹结构
  const fetchFolderStructure = async () => {
    try {
      setIsLoading(true);
      // 指向FastAPI后端 - 现在使用的是从Supabase获取数据的API
      const response = await fetch(
        "http://localhost:8000/api/models-directory"
      );
      if (!response.ok) {
        throw new Error("无法获取文件夹结构");
      }

      const data = await response.json();

      // 检查是否有"模型文件夹"作为根目录
      let actualFolderStructure = data;

      // 如果有一个根目录且名为"模型文件夹"，则直接使用其子目录作为顶层目录
      if (
        data.length === 1 &&
        data[0].name === "模型文件夹" &&
        data[0].children
      ) {
        actualFolderStructure = data[0].children;
        console.log("跳过'模型文件夹'层级，直接展示子目录");
      }

      setFolderStructure(actualFolderStructure);
      setFilteredFolderStructure(actualFolderStructure);

      // 初始化展开状态
      const initialExpandedFolders = new Set<string>();
      const processItem = (item: FileSystemItem) => {
        if (item.isDirectory && item.isOpen) {
          initialExpandedFolders.add(item.path);
        }
        if (item.children) {
          item.children.forEach(processItem);
        }
      };

      actualFolderStructure.forEach(processItem);
      setExpandedFolders(initialExpandedFolders);
    } catch (error) {
      console.error("获取文件夹结构时出错:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 初始加载时获取文件夹结构
  useEffect(() => {
    fetchFolderStructure();
  }, []);

  // 将刷新方法添加到全局对象，以便其他组件可以调用
  useEffect(() => {
    // 添加到window对象，使其可以从外部访问
    // @ts-ignore - 添加自定义属性到window
    window.refreshBomTree = fetchFolderStructure;

    // 清理函数
    return () => {
      // @ts-ignore - 移除自定义属性
      delete window.refreshBomTree;
    };
  }, []);

  // 添加搜索过滤功能
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFolderStructure(folderStructure);
      return;
    }

    // 找到所有匹配的文件和文件夹路径
    const matchingPaths = new Set<string>();
    const matchingFolders = new Set<string>();
    const matchingFiles = new Set<string>();

    const findMatchingPaths = (items: FileSystemItem[]) => {
      items.forEach((item) => {
        if (item.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          matchingPaths.add(item.path);

          // 根据类型分别记录
          if (item.isDirectory) {
            matchingFolders.add(item.path);
          } else {
            matchingFiles.add(item.path);
          }
        }

        if (item.children && item.children.length > 0) {
          findMatchingPaths(item.children);
        }
      });
    };

    findMatchingPaths(folderStructure);

    // 确保所有父文件夹都被展开
    const newExpandedFolders = new Set<string>();

    // 添加所有匹配文件的父文件夹路径到展开集合
    const addParentFolders = (path: string) => {
      const pathParts = path.split("/").filter(Boolean);
      let currentPath = "";

      // 添加除了最后一个部分（文件本身）的所有父文件夹路径
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
        newExpandedFolders.add(currentPath);
      }
    };

    // 处理匹配的文件，确保其父文件夹被展开
    matchingFiles.forEach((filePath) => {
      addParentFolders(filePath);
    });

    // 处理匹配的文件夹，确保其自身和父文件夹都被展开
    matchingFolders.forEach((folderPath) => {
      addParentFolders(folderPath);
      newExpandedFolders.add(folderPath);
    });

    // 深度复制并过滤文件夹结构，同时保留匹配文件夹的所有子内容
    const filterStructure = (items: FileSystemItem[]): FileSystemItem[] => {
      return items
        .map((item) => {
          // 检查当前项是否匹配
          const nameMatches = item.name
            .toLowerCase()
            .includes(searchQuery.toLowerCase());

          // 检查路径是否在匹配文件夹中或其子路径
          const isInMatchingFolder = Array.from(matchingFolders).some(
            (folderPath) =>
              item.path.startsWith(folderPath + "/") || item.path === folderPath
          );

          // 如果有子项，递归过滤
          let filteredChildren: FileSystemItem[] = [];
          if (item.children && item.children.length > 0) {
            // 如果当前项是匹配的文件夹，保留所有子项
            if (matchingFolders.has(item.path)) {
              filteredChildren = [...item.children];
            } else {
              filteredChildren = filterStructure(item.children);
            }
          }

          // 如果当前项匹配或者在匹配文件夹中或有匹配的子项，则保留此项
          if (
            nameMatches ||
            isInMatchingFolder ||
            filteredChildren.length > 0
          ) {
            return {
              ...item,
              children: filteredChildren,
              isOpen:
                nameMatches && item.isDirectory
                  ? true
                  : filteredChildren.length > 0
                  ? true
                  : item.isOpen,
            };
          }

          // 否则返回null，稍后过滤掉
          return null;
        })
        .filter((item): item is FileSystemItem => item !== null);
    };

    const filteredStructure = filterStructure(folderStructure);
    setFilteredFolderStructure(filteredStructure);
    setExpandedFolders(newExpandedFolders);

    // 如果只有一个匹配的文件，自动选择它
    if (matchingFiles.size === 1) {
      const filePath = Array.from(matchingFiles)[0];
      // 递归查找匹配的文件对象
      const findFile = (items: FileSystemItem[]): FileSystemItem | null => {
        for (const item of items) {
          if (item.path === filePath) {
            return item;
          }
          if (item.children && item.children.length > 0) {
            const found = findFile(item.children);
            if (found) return found;
          }
        }
        return null;
      };

      const matchedFile = findFile(folderStructure);
      if (matchedFile) {
        // 自动选择并加载文件内容
        setSelectedFile(matchedFile);
        fetchFileContent(matchedFile);
      }
    }
  }, [searchQuery, folderStructure]);

  // 添加获取文件内容的函数
  const fetchFileContent = async (
    file: FileSystemItem,
    e?: React.MouseEvent
  ) => {
    // 如果提供了事件对象，阻止事件冒泡
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (file.isDirectory) return;

    try {
      setFileContentLoading(true);
      setSelectedFile(file);

      // 简化路径处理 - 现在路径不再包含"模型文件夹"前缀
      const normalizedPath = file.path.replace(/^\/+/, "");

      // 通过文件扩展名确定文件类型
      const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
      const isTextFile = [
        "txt",
        "json",
        "xml",
        "md",
        "csv",
        "html",
        "js",
        "ts",
        "css",
        "py",
        "c",
        "cpp",
        "h",
      ].includes(fileExtension);
      const isImageFile = ["jpg", "jpeg", "png", "gif", "bmp", "svg"].includes(
        fileExtension
      );
      const isPdfFile = fileExtension === "pdf";
      const is3DModelFile = ["gltf", "glb"].includes(fileExtension);

      // 构建文件URL - 使用后端API从Supabase获取文件
      const fileUrl = `http://localhost:8000/api/file-content/${normalizedPath}`;

      if (isTextFile) {
        setFilePreviewType("text");
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`无法获取文件内容: ${response.statusText}`);
        }
        const text = await response.text();
        setFileContent(text);
      } else if (isImageFile) {
        setFilePreviewType("image");
        // 使用后端API获取图片URL
        setFileContent(fileUrl);

        // 更新当前文档，以便在DocumentViewer中显示
        setCurrentDrawing({
          id: file.path,
          name: file.name,
          url: fileUrl,
          createdAt: new Date(),
        });
      } else if (isPdfFile) {
        setFilePreviewType("binary");
        setFileContent(fileUrl);

        // 更新当前文档，以便在DocumentViewer中显示
        setCurrentDrawing({
          id: file.path,
          name: file.name,
          url: fileUrl,
          createdAt: new Date(),
        });
      } else if (is3DModelFile) {
        setFilePreviewType("model");
        setFileContent(fileUrl);

        // 打开3D模型查看器
        useAppStore.getState().setModelViewerOptions({
          document: fileUrl,
          title: file.name,
        });
        useAppStore.getState().toggleModelViewer();
      } else {
        // 对于其他文件类型
        setFilePreviewType("unsupported");
        setFileContent(null);
      }
    } catch (error) {
      console.error("获取文件内容时出错:", error);
      setFileContent(null);
      setFilePreviewType("unsupported");
    } finally {
      setFileContentLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "fixed left-0 top-0 z-10 h-full w-72 bg-white shadow-lg transition-transform duration-300 ease-in-out",
        showFileExplorer ? "translate-x-0" : "-translate-x-full"
      )}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="font-semibold">BOM管理</h2>
        <Button variant="ghost" size="icon" onClick={toggleFileExplorer}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 文件浏览区域 */}
      <div className="flex flex-col h-[calc(100%-4rem)]">
        {/* 文件搜索 */}
        <div className="p-2 border-b border-gray-200">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索文件和文件夹..."
              className={`w-full pl-8 pr-2 py-1 text-sm rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors ${
                searchQuery
                  ? "font-medium text-black"
                  : "text-gray-500 font-normal"
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 transform -translate-y-1/2"
              >
                <X className="h-3 w-3 text-gray-500 hover:text-gray-700" />
              </button>
            )}
          </div>
        </div>

        {/* 文件上传按钮 */}
        <div className="flex justify-between items-center p-2 border-b border-gray-200">
          <span className="text-xs text-gray-500">文件列表</span>
          <UploadFileButton variant="outline" size="sm" />
        </div>

        {/* 文件夹树 */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-20">
              <div className="flex items-center space-x-2">
                <RefreshCwIcon className="h-4 w-4 animate-spin" />
                <span className="text-sm text-gray-500">加载文件夹...</span>
              </div>
            </div>
          ) : filteredFolderStructure.length > 0 ? (
            filteredFolderStructure.map((item, index) => (
              <FolderTree
                key={`${item.path}-${index}`}
                item={item}
                expandedFolders={expandedFolders}
                setExpandedFolders={setExpandedFolders}
                selectedFile={selectedFile}
                fetchFileContent={fetchFileContent}
                searchQuery={searchQuery.trim()}
              />
            ))
          ) : searchQuery ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              未找到匹配 "{searchQuery}" 的结果
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500 text-sm">
              没有找到文件夹
            </div>
          )}
        </ScrollArea>

        {/* 文件预览区域 */}
        {selectedFile && !fileContentLoading && (
          <div className="border-t border-gray-200 p-2">
            <div className="text-xs font-medium mb-1 truncate">
              {selectedFile.name}
            </div>
            {filePreviewType === "text" && fileContent && (
              <div className="text-xs bg-gray-50 p-2 rounded max-h-32 overflow-auto">
                <pre className="whitespace-pre-wrap">{fileContent}</pre>
              </div>
            )}
            {filePreviewType === "image" && fileContent && (
              <div className="text-xs text-center text-gray-500">
                [图片预览]
              </div>
            )}
            {filePreviewType === "binary" && (
              <div className="text-xs text-center text-gray-500">
                [二进制文件]
              </div>
            )}
            {filePreviewType === "model" && (
              <div className="text-xs text-center text-gray-500">[3D模型]</div>
            )}
            {filePreviewType === "unsupported" && (
              <div className="text-xs text-center text-gray-500">
                不支持预览此类型的文件
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
