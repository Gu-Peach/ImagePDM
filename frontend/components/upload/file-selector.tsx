"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  FolderIcon,
  FileIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  X,
  Search,
  UploadIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// 文件/文件夹接口定义
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

interface FileSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selectedFiles: FileSystemItem[]) => void;
  initialPath?: string;
}

export default function FileSelector({
  isOpen,
  onClose,
  onSelect,
  initialPath = "/models",
}: FileSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [fileItems, setFileItems] = useState<FileSystemItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<FileSystemItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, boolean>
  >({});
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const folderUploadRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 获取文件列表 - 修改此函数，不再从Supabase获取文件
  useEffect(() => {
    if (isOpen) {
      // 重置选中项
      setSelectedItems([]);
      // 不再调用fetchFiles，而是使用空数组初始化
      setFileItems([]);
      setIsLoading(false);
    }
  }, [isOpen, currentPath]);

  // 在关闭对话框时清理状态
  const handleClose = () => {
    setSelectedItems([]);
    setFileItems([]);
    setSearchQuery("");
    onClose();
  };

  // 确保在打开对话框时滚动区域获得焦点，以便能够立即响应鼠标滚轮
  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      // 小延迟确保DOM已完全渲染
      setTimeout(() => {
        scrollContainerRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // 处理文件/文件夹选择
  const toggleItemSelection = (item: FileSystemItem) => {
    // 如果是文件夹，则需要同时处理子项
    if (item.isDirectory && item.children && item.children.length > 0) {
      // 获取当前项是否已选中的状态
      const isCurrentlySelected = selectedItems.some((i) => i.id === item.id);

      // 获取所有需要受影响的项目ID（包括自身和所有子项）
      const affectedIds = new Set<string>();

      // 递归收集所有子项ID
      const collectChildIds = (folder: FileSystemItem) => {
        affectedIds.add(folder.id);

        if (folder.children) {
          for (const child of folder.children) {
            if (child.isDirectory) {
              collectChildIds(child);
            } else {
              affectedIds.add(child.id);
            }
          }
        }
      };

      collectChildIds(item);

      // 更新选中状态
      setSelectedItems((prevSelected) => {
        if (isCurrentlySelected) {
          // 如果当前是选中状态，则移除所有受影响的项
          return prevSelected.filter((i) => !affectedIds.has(i.id));
        } else {
          // 如果当前是未选中状态，则添加所有受影响的项

          // 先移除可能已经选中的子项（避免重复）
          const filteredPrev = prevSelected.filter(
            (i) => !affectedIds.has(i.id)
          );

          // 收集所有需要添加的项目
          const itemsToAdd: FileSystemItem[] = [];

          // 递归收集文件夹及其子项
          const collectItems = (folder: FileSystemItem) => {
            itemsToAdd.push(folder);

            if (folder.children) {
              for (const child of folder.children) {
                if (child.isDirectory) {
                  collectItems(child);
                } else {
                  itemsToAdd.push(child);
                }
              }
            }
          };

          collectItems(item);

          // 返回更新后的选中项目列表
          return [...filteredPrev, ...itemsToAdd];
        }
      });
    } else {
      // 如果是普通文件，处理该文件的选择状态变化
      setSelectedItems((prevSelected) => {
        const isAlreadySelected = prevSelected.some((i) => i.id === item.id);

        // 创建新的选择状态数组
        let newSelected = [...prevSelected];

        if (isAlreadySelected) {
          // 如果已选中，则移除
          newSelected = newSelected.filter((i) => i.id !== item.id);
        } else {
          // 如果未选中，则添加
          newSelected.push(item);
        }

        // 查找并处理所有受影响的父文件夹
        const updateAllParentFolders = (
          items: FileSystemItem[],
          processedFolders = new Set<string>()
        ) => {
          // 遍历所有可能的文件夹
          for (const folder of items) {
            if (
              !folder.isDirectory ||
              !folder.children ||
              processedFolders.has(folder.id)
            )
              continue;

            // 标记此文件夹已处理，防止循环递归
            processedFolders.add(folder.id);

            // 检查是否为受影响的父文件夹
            const isParentFolder = folder.children.some(
              (child) => child.id === item.id
            );

            // 如果是直接父文件夹，检查所有子项的选中状态
            if (isParentFolder) {
              const allChildrenSelected = folder.children.every((child) =>
                child.id === item.id
                  ? !isAlreadySelected // 考虑当前正在切换的项的新状态
                  : newSelected.some((selected) => selected.id === child.id)
              );

              const folderIndex = newSelected.findIndex(
                (i) => i.id === folder.id
              );
              const folderSelected = folderIndex !== -1;

              if (allChildrenSelected && !folderSelected) {
                // 如果所有子项都选中但文件夹未选中，添加文件夹
                newSelected.push(folder);
              } else if (!allChildrenSelected && folderSelected) {
                // 如果有任何子项未选中但文件夹已选中，移除文件夹
                newSelected.splice(folderIndex, 1);
              }

              // 继续查找此文件夹的父文件夹，但不在这里递归调用自身
              // 而是让外层循环继续处理
              continue;
            }

            // 递归检查子文件夹
            if (folder.children) {
              updateAllParentFolders(folder.children, processedFolders);
            }
          }
        };

        // 从根开始查找所有父文件夹
        updateAllParentFolders(fileItems);
        return newSelected;
      });
    }
  };

  // 处理文件夹展开/折叠
  const toggleFolderExpand = (folderId: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  // 处理确认选择
  const handleConfirmSelection = () => {
    // 检查是否有选中的项目
    if (selectedItems.length === 0) {
      alert("请选择文件或文件夹");
      return;
    }

    // 找出所有选中的项目和它们的父文件夹
    const selectedIds = new Set(selectedItems.map((item) => item.id));
    const selectedItemsWithParents: FileSystemItem[] = [];
    const processedIds = new Set<string>();

    // 递归函数，查找所有选中项的原始文件夹结构
    const findSelectedItemsWithStructure = (
      items: FileSystemItem[],
      parentFolder: FileSystemItem | null = null
    ) => {
      items.forEach((item) => {
        if (processedIds.has(item.id)) return;
        processedIds.add(item.id);

        // 如果这是一个被选中的文件
        const isSelected = selectedIds.has(item.id);

        // 如果这是一个文件夹
        if (item.isDirectory) {
          // 创建一个文件夹副本，初始时没有子项
          const folderCopy: FileSystemItem = {
            ...item,
            children: [],
          };

          // 如果文件夹被选中或者至少有一个子项被选中，将其添加到结果中
          if (
            isSelected ||
            (item.children &&
              item.children.some((child) => selectedIds.has(child.id)))
          ) {
            // 如果有父文件夹，将此文件夹添加为父文件夹的子项
            if (parentFolder) {
              parentFolder.children = parentFolder.children || [];
              parentFolder.children.push(folderCopy);
            } else {
              // 否则添加到顶级结果
              selectedItemsWithParents.push(folderCopy);
            }

            // 递归处理子项，保持结构
            if (item.children) {
              findSelectedItemsWithStructure(item.children, folderCopy);
            }
          }
        } else if (isSelected) {
          // 如果是被选中的文件
          if (parentFolder) {
            // 如果有父文件夹，添加到父文件夹的子项
            parentFolder.children = parentFolder.children || [];
            parentFolder.children.push(item);
          } else {
            // 否则添加到顶级结果
            selectedItemsWithParents.push(item);
          }
        }
      });
    };

    // 从文件列表的根开始查找
    findSelectedItemsWithStructure(fileItems);

    // 过滤掉空文件夹（没有子项的文件夹）
    const filterEmptyFolders = (items: FileSystemItem[]): FileSystemItem[] => {
      return items.filter((item) => {
        if (item.isDirectory && item.children) {
          item.children = filterEmptyFolders(item.children);
          // 保留有子项的文件夹或明确被选中的文件夹
          return selectedIds.has(item.id) || item.children.length > 0;
        }
        return true; // 保留所有文件
      });
    };

    const filteredResult = filterEmptyFolders(selectedItemsWithParents);

    // 检查是否有有效项目
    if (filteredResult.length === 0) {
      alert("所选项目无效，请重新选择");
      return;
    }

    // 调用回调函数，将选中的项传递给父组件
    onSelect(filteredResult);
    onClose();
  };

  // 处理搜索
  const filterItems = (items: FileSystemItem[]): FileSystemItem[] => {
    if (!searchQuery.trim()) return items;

    return items.filter((item) => {
      const nameMatches = item.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

      // 如果是文件夹且有子项，递归搜索子项
      if (item.isDirectory && item.children && item.children.length > 0) {
        const filteredChildren = filterItems(item.children);

        // 如果子项中有匹配的，自动展开此文件夹
        if (filteredChildren.length > 0) {
          setExpandedFolders((prev) => ({
            ...prev,
            [item.id]: true,
          }));

          // 复制项目但替换子项为过滤后的子项
          return {
            ...item,
            children: filteredChildren,
          };
        }
      }

      return nameMatches;
    });
  };

  // 处理文件上传
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);

      // 创建文件项并保存到fileItems状态
      const newFileItems: FileSystemItem[] = files.map((file) => {
        return {
          id: `file-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          name: file.name,
          isDirectory: false,
          path: `${currentPath}/${file.name}`.replace(/\/+/g, "/"),
          size: formatFileSize(file.size),
          lastModified: new Date(file.lastModified).toLocaleDateString(),
          fileObject: file, // 关键: 保存实际的文件对象
        };
      });

      // 更新文件列表
      setFileItems((prev) => [...prev, ...newFileItems]);

      // 自动选中这些新文件
      setSelectedItems((prev) => [...prev, ...newFileItems]);

      // 清空input，以便可以重复选择相同的文件
      e.target.value = "";
    }
  };

  // 将processUploadedFolder函数添加为组件内的独立函数

  // 在handleFolderUpload函数前添加此函数
  const processUploadedFolder = (
    folderName: string,
    files: File[]
  ): FileSystemItem[] => {
    // 创建根文件夹
    const rootFolder: FileSystemItem = {
      id: `uploaded-${Date.now()}`,
      name: folderName,
      isDirectory: true,
      path: `${currentPath}/${folderName}`,
      children: [],
    };

    // 用于跟踪文件夹结构
    const folderMap: Record<string, FileSystemItem> = {
      "": rootFolder,
    };

    // 处理每个文件
    files.forEach((file) => {
      const relativePath = file.webkitRelativePath;
      const pathParts = relativePath.split("/");

      // 跳过根文件夹名称
      pathParts.shift();

      let currentPath = "";
      let parentPath = "";

      // 创建或获取文件路径中的每个文件夹
      for (let i = 0; i < pathParts.length - 1; i++) {
        parentPath = currentPath;
        currentPath = currentPath
          ? `${currentPath}/${pathParts[i]}`
          : pathParts[i];

        // 如果此文件夹尚未创建，创建它
        if (!folderMap[currentPath]) {
          const newFolder: FileSystemItem = {
            id: `folder-${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 9)}`,
            name: pathParts[i],
            isDirectory: true,
            path: `${currentPath}/${pathParts[i]}`,
            children: [],
          };

          folderMap[currentPath] = newFolder;

          // 添加到父文件夹
          if (folderMap[parentPath]) {
            folderMap[parentPath].children =
              folderMap[parentPath].children || [];
            folderMap[parentPath].children.push(newFolder);
          }
        }
      }

      // 创建文件项
      const fileName = pathParts[pathParts.length - 1];

      // 如果文件名存在（不是空目录的情况）
      if (fileName) {
        const fileItem: FileSystemItem = {
          id: `file-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 9)}`,
          name: fileName,
          isDirectory: false,
          path: `${currentPath}/${fileName}`,
          size: formatFileSize(file.size),
          lastModified: new Date(file.lastModified).toLocaleDateString(),
          fileObject: file, // 保存原始文件对象
        };

        // 添加到其父文件夹
        const parentFolder =
          pathParts.length > 1 ? folderMap[currentPath] : rootFolder;
        parentFolder.children = parentFolder.children || [];
        parentFolder.children.push(fileItem);
      }
    });

    // 处理空文件夹的情况
    if (
      files.length === 0 ||
      (rootFolder.children && rootFolder.children.length === 0)
    ) {
      // 如果是空文件夹，确保它被正确创建
      rootFolder.children = [];
    }

    return [rootFolder];
  };

  // 处理文件夹上传
  const handleFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);

      // 按文件夹分组
      const folderGroups = new Map<string, File[]>();

      // 分组所有文件
      files.forEach((file) => {
        const relativePath = file.webkitRelativePath;
        const pathParts = relativePath.split("/");
        const folderName = pathParts[0]; // 获取顶级文件夹名

        if (!folderGroups.has(folderName)) {
          folderGroups.set(folderName, []);
        }

        folderGroups.get(folderName)!.push(file);
      });

      // 处理每个文件夹
      const allProcessedFolders: FileSystemItem[] = [];

      folderGroups.forEach((folderFiles, folderName) => {
        // 对每个文件夹调用一次 processUploadedFolder
        const processedFolder = processUploadedFolder(folderName, folderFiles);
        allProcessedFolders.push(...processedFolder);
      });

      // 合并到现有文件列表
      setFileItems((prev) => {
        // 创建新的文件列表
        const newFileItems = [...prev];

        // 处理每个上传的文件夹
        allProcessedFolders.forEach((folder) => {
          // 检查是否已存在同名文件夹
          const existingIndex = newFileItems.findIndex(
            (item) => item.isDirectory && item.name === folder.name
          );

          if (existingIndex !== -1) {
            // 如果存在同名文件夹，替换它
            newFileItems[existingIndex] = folder;
          } else {
            // 如果不存在，添加到列表
            newFileItems.push(folder);
          }
        });

        return newFileItems;
      });

      // 自动展开上传的所有文件夹
      setExpandedFolders((prev) => {
        const newExpandedState = { ...prev };
        allProcessedFolders.forEach((folder) => {
          newExpandedState[folder.id] = true;
        });
        return newExpandedState;
      });

      // 自动选中上传的文件夹
      setSelectedItems((prev) => [...prev, ...allProcessedFolders]);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    else return (bytes / 1048576).toFixed(1) + " MB";
  };

  // 渲染文件/文件夹项
  const renderFileItem = (item: FileSystemItem, level = 0) => {
    const isExpanded = expandedFolders[item.id];
    const isSelected = selectedItems.some((i) => i.id === item.id);

    return (
      <div key={item.id}>
        <div
          className="flex items-center py-2 px-2 hover:bg-gray-100 rounded"
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          <div
            onClick={(e) => {
              e.stopPropagation(); // 阻止事件冒泡，避免触发文件夹展开/折叠
              toggleItemSelection(item);
            }}
            className="w-6 flex-shrink-0"
          >
            <Checkbox
              checked={isSelected}
              className="mr-2"
              id={`checkbox-${item.id}`}
            />
          </div>

          {item.isDirectory ? (
            <div
              className="flex items-center flex-1 min-w-0 cursor-pointer"
              onClick={() => toggleFolderExpand(item.id)}
            >
              <span className="mr-2 flex-shrink-0">
                {isExpanded ? (
                  <ChevronDownIcon className="h-4 w-4" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4" />
                )}
              </span>
              <FolderIcon className="h-4 w-4 text-yellow-500 mr-2 flex-shrink-0" />
              <span className="text-sm truncate">{item.name}</span>
            </div>
          ) : (
            <div className="flex items-center flex-1 min-w-0">
              <span className="w-4 mr-2 flex-shrink-0"></span>
              <FileIcon className="h-4 w-4 text-gray-500 mr-2 flex-shrink-0" />
              <span className="text-sm truncate">{item.name}</span>
            </div>
          )}

          {!item.isDirectory && (
            <div className="text-xs text-gray-500 flex space-x-4 w-48 justify-end flex-shrink-0">
              <span className="w-16 text-right">{item.size}</span>
              <span className="w-24 text-right">{item.lastModified}</span>
            </div>
          )}
        </div>

        {/* 如果是展开的文件夹，渲染子项 */}
        {item.isDirectory && isExpanded && item.children && (
          <div>
            {item.children.map((child) => renderFileItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const filteredItems = searchQuery ? filterItems(fileItems) : fileItems;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>选择文件</DialogTitle>
          </DialogHeader>

          {/* 搜索和上传按钮区域 */}
          <div className="px-4 py-2 flex items-center space-x-2">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索文件和文件夹..."
                  className="pl-8"
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

            <div className="flex space-x-2">
              <input
                ref={fileUploadRef}
                id="file-upload"
                type="file"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
              <input
                ref={folderUploadRef}
                id="folder-upload"
                type="file"
                className="hidden"
                // @ts-ignore - webkitdirectory 和 directory 属性在 TypeScript 中没有正确定义，但在现代浏览器中支持
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFolderUpload}
              />

              <Button
                variant="outline"
                size="sm"
                className="flex items-center"
                onClick={() => fileUploadRef.current?.click()}
              >
                <UploadIcon className="h-4 w-4 mr-2" />
                上传文件
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="flex items-center"
                onClick={() => folderUploadRef.current?.click()}
              >
                <FolderIcon className="h-4 w-4 mr-2" />
                上传文件夹
              </Button>
            </div>
          </div>

          {/* 列表头部 */}
          <div className="px-4 text-xs flex border-b border-t py-2 bg-gray-50">
            <div className="w-8"></div>
            <div className="flex-1 font-medium">名称</div>
            <div className="flex space-x-4 w-48 justify-end">
              <span className="w-16 text-right">大小</span>
              <span className="w-24 text-right">修改日期</span>
            </div>
          </div>

          {/* 文件列表区域 - 确保能够响应滚轮滚动 */}
          <div className="flex-1 overflow-hidden">
            <ScrollArea
              className="h-[calc(60vh-150px)] w-full"
              type="auto"
              ref={scrollContainerRef}
              // 添加tabIndex使元素可聚焦，从而能够接收滚轮事件
              tabIndex={0}
            >
              {isLoading ? (
                <div className="flex justify-center items-center h-40">
                  <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                  <span className="ml-2 text-sm text-gray-500">加载中...</span>
                </div>
              ) : filteredItems.length > 0 ? (
                <div className="p-2">
                  {filteredItems.map((item) => renderFileItem(item))}
                </div>
              ) : (
                <div className="flex flex-col justify-center items-center h-40 text-gray-500">
                  {searchQuery ? (
                    `未找到匹配 "${searchQuery}" 的文件`
                  ) : (
                    <>
                      <FolderIcon className="h-12 w-12 text-gray-300 mb-2" />
                      <p className="text-sm">请上传文件或文件夹</p>
                      <p className="text-xs mt-1">
                        点击上方的"上传文件"或"上传文件夹"按钮添加内容
                      </p>
                    </>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* 底部按钮区域 */}
          <DialogFooter className="px-4 py-3 flex justify-between items-center border-t bg-gray-50">
            <div className="text-sm text-gray-500">
              已选择 {selectedItems.length} 个项目
            </div>
            <div className="flex space-x-2">
              <DialogClose asChild>
                <Button variant="outline">取消</Button>
              </DialogClose>
              <Button
                onClick={handleConfirmSelection}
                disabled={selectedItems.length === 0}
                className="bg-gray-700 hover:bg-gray-800"
              >
                确认选择
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
