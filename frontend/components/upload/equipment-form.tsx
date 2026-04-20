"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";

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

interface EquipmentFormProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFiles: FileSystemItem[];
  destinationPath: string;
  onComplete: () => void;
  extractedData?: Record<string, string>; // 从PDF中提取的数据，可选
}

// 检测是否存在足够完整的数据（至少有art_no或supplier）
const hasEnoughData = (data: Record<string, string>) => {
  return (
    (data.art_no && data.art_no.trim() !== "") ||
    (data.supplier && data.supplier.trim() !== "")
  );
};

export default function EquipmentForm({
  isOpen,
  onClose,
  selectedFiles,
  destinationPath,
  onComplete,
  extractedData = {}, // 默认为空对象
}: EquipmentFormProps) {
  // 平铺所有文件（包括文件夹内的文件）
  const [allFiles, setAllFiles] = useState<
    { item: FileSystemItem; path: string }[]
  >([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [totalPdfCount, setTotalPdfCount] = useState(0);

  // 初始化时收集所有文件
  useEffect(() => {
    if (isOpen) {
      const files: { item: FileSystemItem; path: string }[] = [];
      let pdfCount = 0;

      // 递归函数，收集所有文件
      const collectFiles = (
        items: FileSystemItem[],
        parentPath: string = ""
      ) => {
        items.forEach((item) => {
          const currentPath = parentPath
            ? `${parentPath}/${item.name}`
            : item.name;

          if (item.isDirectory && item.children) {
            // 如果是文件夹，递归处理其子项
            collectFiles(item.children, currentPath);
          } else if (!item.isDirectory && item.fileObject) {
            // 如果是文件且有fileObject，添加到文件列表
            const filePath = `${destinationPath}/${currentPath}`.replace(
              /\/+/g,
              "/"
            );
            files.push({
              item,
              path: filePath,
            });

            // 计算PDF文件数量
            if (item.name.toLowerCase().endsWith(".pdf")) {
              pdfCount++;
            }
          }
        });
      };

      collectFiles(selectedFiles);
      setAllFiles(files);
      setTotalPdfCount(pdfCount);
      setCurrentFileIndex(0);
      setProcessedCount(0);
      setFailedCount(0);

      // 如果有文件，立即开始处理
      if (files.length > 0) {
        processFiles(files);
      } else {
        // 如果没有文件，直接完成
        onComplete();
      }
    }
  }, [isOpen, selectedFiles, destinationPath]);

  // 处理所有文件
  const processFiles = async (
    files: { item: FileSystemItem; path: string }[]
  ) => {
    setIsProcessing(true);

    for (let i = 0; i < files.length; i++) {
      setCurrentFileIndex(i);
      const file = files[i];

      // 只处理PDF文件
      if (!file.item.name.toLowerCase().endsWith(".pdf")) {
        continue;
      }

      // 准备表单数据
      const formData: Record<string, string> = {
        image_path: file.path,
      };

      // 获取当前文件的提取数据
      let currentFileData: Record<string, string> = {};

      // 尝试从extractedData中获取当前文件的数据
      const fileKey = file.item.path || file.item.name;
      if (extractedData[fileKey]) {
        try {
          // 解析JSON字符串为对象
          currentFileData = JSON.parse(extractedData[fileKey]);
          console.log(`使用${fileKey}的提取数据:`, currentFileData);
        } catch (error) {
          console.error(`解析${fileKey}的提取数据失败:`, error);
        }
      } else if (file.item.fileObject) {
        // 如果是PDF文件但没有提取数据，尝试即时提取
        try {
          console.log(`尝试即时提取${file.item.name}的数据`);
          const pdfFormData = new FormData();
          pdfFormData.append("file", file.item.fileObject);

          const response = await axios.post(
            "http://localhost:8000/api/extract-pdf-info",
            pdfFormData,
            {
              headers: {
                "Content-Type": "multipart/form-data",
              },
            }
          );

          if (response.data) {
            currentFileData = response.data;
            console.log(
              `即时提取${file.item.name}的数据成功:`,
              currentFileData
            );
          }
        } catch (error) {
          console.error(`即时提取${file.item.name}的数据失败:`, error);
          // 单个文件提取失败不应阻止其他文件的处理
        }
      }

      // 添加提取的数据
      if (Object.keys(currentFileData).length > 0) {
        if (currentFileData.supplier) {
          formData.supplier = currentFileData.supplier;
        }
        if (currentFileData.art_no) {
          formData.art_no = currentFileData.art_no;
        }
        // 可以添加更多字段的映射
      }

      // 只有当有足够的数据时才上传
      if (hasEnoughData(formData)) {
        try {
          // 发送设备数据到后端
          const response = await axios.post(
            "http://localhost:8000/api/equipment",
            formData
          );

          if (response.data.status === "success") {
            setProcessedCount((prev) => prev + 1);
          } else {
            setFailedCount((prev) => prev + 1);
            console.error("上传设备信息失败:", response.data);
          }
        } catch (error: any) {
          setFailedCount((prev) => prev + 1);
          console.error("上传设备信息失败:", error);
          const errorMessage =
            error.response?.data?.detail || error.message || "未知错误";
          console.error("详细错误信息:", errorMessage);
        }
      } else {
        // 数据不足，跳过此文件
        console.log("数据不足，跳过文件:", file.item.name);
      }
    }

    // 所有文件处理完毕
    setIsProcessing(false);
    onComplete();
  };

  // 如果组件可见但不处于处理状态，立即关闭
  useEffect(() => {
    if (isOpen && !isProcessing && currentFileIndex >= allFiles.length) {
      console.log(
        `处理完成: 成功 ${processedCount} 个文件, 失败 ${failedCount} 个文件`
      );
      onComplete();
    }
  }, [isOpen, isProcessing, currentFileIndex, allFiles.length]);

  // 此组件现在显示处理进度
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
        <h3 className="text-lg font-medium mb-4">处理PDF文件</h3>

        {isProcessing ? (
          <>
            <div className="mb-4">
              <div className="flex justify-between mb-2">
                <span>正在处理PDF文件...</span>
                <span>
                  {currentFileIndex + 1} / {totalPdfCount}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full"
                  style={{
                    width: `${
                      totalPdfCount > 0
                        ? (currentFileIndex / totalPdfCount) * 100
                        : 0
                    }%`,
                  }}
                ></div>
              </div>
            </div>
            <p className="text-sm text-gray-500">
              正在提取PDF信息并上传到设备数据库，请稍候...
            </p>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="mb-2 text-green-600 font-medium">处理完成！</p>
            <p>成功处理 {processedCount} 个PDF文件</p>
            {failedCount > 0 && (
              <p className="text-red-500">失败 {failedCount} 个文件</p>
            )}
            <Button
              onClick={onComplete}
              className="mt-4 bg-gray-700 hover:bg-gray-800"
            >
              关闭
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
