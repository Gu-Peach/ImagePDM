"use client";

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileIcon,
  FolderIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  SearchIcon,
  FilterIcon,
  RefreshCwIcon,
  ChevronUpIcon,
  ChevronDownIcon as ChevronDown,
  ChevronsUpDownIcon,
  ChevronLeftIcon,
  X,
} from "lucide-react";
import UploadFileButton from "@/components/upload/upload-file-button";

// Sample BOM data
const bomItems = [
  {
    id: "JV-0109",
    name: "Vertical Rod",
    state: "Work in Progress",
    qty: 1,
    revision: "-",
    description: "Vertical Rod",
    material: "AISI 1020",
    version: "2[1]",
  },
  {
    id: "JV-0102",
    name: "Handle",
    state: "Work in Progress",
    qty: 1,
    revision: "-",
    description: "Handle",
    material: "AISI 1020",
    version: "3[1]",
  },
];

// 文件/文件夹接口定义
interface FileSystemItem {
  name: string;
  isOpen: boolean;
  isDirectory: boolean;
  children: FileSystemItem[];
  path: string;
}

export default function BOMManagement({
  isCollapsed = true,
  onToggleCollapse,
}: {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [activeTab, setActiveTab] = useState("bom");
  const [selectedConfiguration, setSelectedConfiguration] = useState(
    "Default <Active Configuration>"
  );
  const [selectedVersion, setSelectedVersion] = useState(
    "3, added rivets and modified a couple parts"
  );
  const [fileListExpanded, setFileListExpanded] = useState(true);
  const [folderStructure, setFolderStructure] = useState<FileSystemItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fileListItems, setFileListItems] = useState<FileSystemItem[]>([]);
  const [fileListLoading, setFileListLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredFolderStructure, setFilteredFolderStructure] = useState<
    FileSystemItem[]
  >([]);
  const [selectedFile, setSelectedFile] = useState<FileSystemItem | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileContentLoading, setFileContentLoading] = useState(false);
  const [filePreviewType, setFilePreviewType] = useState<
    "text" | "image" | "binary" | "unsupported"
  >("text");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    // 从服务器获取模型文件夹结构
    const fetchFolderStructure = async () => {
      try {
        setIsLoading(true);
        // 修改这里，指向FastAPI后端
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

        // 获取一级目录文件列表 - 直接使用顶层目录
        setFileListItems(actualFolderStructure);
      } catch (error) {
        console.error("获取文件夹结构时出错:", error);
        // 如果API调用失败，使用默认的文件夹结构作为后备
        // ... existing error handling code ...
      } finally {
        setIsLoading(false);
        setFileListLoading(false);
      }
    };

    fetchFolderStructure();
  }, []);

  // 添加搜索过滤功能
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFolderStructure(folderStructure);
      return;
    }

    // 深度复制并过滤文件夹结构
    const filterStructure = (items: FileSystemItem[]): FileSystemItem[] => {
      return items
        .map((item) => {
          // 检查当前项是否匹配
          const nameMatches = item.name
            .toLowerCase()
            .includes(searchQuery.toLowerCase());

          // 如果有子项，递归过滤
          let filteredChildren: FileSystemItem[] = [];
          if (item.children && item.children.length > 0) {
            filteredChildren = filterStructure(item.children);
          }

          // 如果当前项匹配或者有匹配的子项，则保留此项
          if (nameMatches || filteredChildren.length > 0) {
            return {
              ...item,
              children: filteredChildren,
              isOpen: filteredChildren.length > 0 ? true : item.isOpen, // 如果有匹配的子项，自动展开
            };
          }

          // 否则返回null，稍后过滤掉
          return null;
        })
        .filter((item): item is FileSystemItem => item !== null);
    };

    setFilteredFolderStructure(filterStructure(folderStructure));
  }, [searchQuery, folderStructure]);

  const toggleFileList = () => {
    setFileListExpanded(!fileListExpanded);
  };

  // 修改后的FolderTree组件
  const FolderTree = ({
    item,
    level = 0,
  }: {
    item: FileSystemItem;
    level?: number;
  }) => {
    const isOpen = expandedFolders.has(item.path);

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
          } ${selectedFile?.path === item.path ? "bg-blue-100" : ""}`}
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
                />
              ))}
            </div>
          )}
      </div>
    );
  };

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

      if (isTextFile) {
        setFilePreviewType("text");
        const response = await fetch(
          `http://localhost:8000/api/file-content/${normalizedPath}`
        );
        if (!response.ok) {
          throw new Error(`无法获取文件内容: ${response.statusText}`);
        }
        const text = await response.text();
        setFileContent(text);
      } else if (isImageFile) {
        setFilePreviewType("image");
        // 修正图片URL路径
        setFileContent(
          `http://localhost:8000/api/file-content/${normalizedPath}`
        );
      } else if (isPdfFile) {
        setFilePreviewType("binary");
        setFileContent(
          `http://localhost:8000/api/file-content/${normalizedPath}`
        );
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
      className={`h-full flex flex-col transition-all duration-300 ${
        isCollapsed ? "w-64" : "flex-1"
      }`}
    >
      {/* 顶部工具栏 - 已删除折叠按钮 */}
      <div className="bg-gray-200 p-2 flex items-center justify-between border-b border-gray-300">
        <div className="flex items-center space-x-2">
          <span className="font-medium text-sm truncate">BOM管理</span>
        </div>

        <div className="flex items-center space-x-2">
          <UploadFileButton
            variant="default"
            size="sm"
            title={isCollapsed ? "" : "上传文件"}
          />
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧边栏 - 文件夹结构 */}
        <div className={`w-full bg-gray-100 overflow-y-auto flex flex-col`}>
          {/* 添加搜索栏 */}
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

          {/* 文件夹树 */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-20">
                <div className="flex items-center space-x-2">
                  <RefreshCwIcon className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-gray-500">加载文件夹...</span>
                </div>
              </div>
            ) : filteredFolderStructure.length > 0 ? (
              filteredFolderStructure.map((item, index) => (
                <FolderTree key={`${item.path}-${index}`} item={item} />
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
          </div>
        </div>
      </div>
    </div>
  );
}
