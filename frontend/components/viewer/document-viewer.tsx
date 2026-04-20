"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
} from "lucide-react";

interface DocumentViewerProps {
  url: string;
}

export default function DocumentViewer({ url }: DocumentViewerProps) {
  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [fileType, setFileType] = useState<"pdf" | "image" | "unknown">(
    "unknown"
  );
  const [normalizedUrl, setNormalizedUrl] = useState<string>(url);

  // 检测文件类型并修正URL
  useEffect(() => {
    if (!url) return;

    setIsLoading(true);
    console.log("原始URL:", url);

    // 修正URL中的双斜杠问题
    let fixedUrl = url;
    if (url.includes("://")) {
      const [protocol, path] = url.split("://");
      fixedUrl = `${protocol}://${path.replace(/\/+/g, "/")}`;
    } else {
      fixedUrl = url.replace(/\/+/g, "/");
    }

    console.log("修正后URL:", fixedUrl);
    setNormalizedUrl(fixedUrl);

    // 根据文件扩展名判断类型
    const extension =
      fixedUrl.toLowerCase().split(".").pop()?.split("?")[0] || "";
    console.log("检测到的文件扩展名:", extension);

    const imageExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"];

    if (extension === "pdf") {
      console.log("设置文件类型为PDF");
      setFileType("pdf");
    } else if (imageExtensions.includes(extension)) {
      console.log("设置文件类型为图片");
      setFileType("image");
    } else {
      // 对于未知扩展名，尝试根据URL判断
      if (
        fixedUrl.includes("/api/images/") &&
        fixedUrl.toLowerCase().includes(".pdf")
      ) {
        console.log("URL包含PDF，设置为PDF类型");
        setFileType("pdf");
      } else if (fixedUrl.includes("/api/images/")) {
        console.log("URL包含/api/images/，设置为图片类型");
        setFileType("image");
      } else {
        console.log("无法确定文件类型，设置为未知");
        setFileType("unknown");
      }
    }

    setIsLoading(false);
  }, [url]);

  function zoomIn() {
    setScale((prevScale) => Math.min(prevScale + 0.2, 3));
  }

  function zoomOut() {
    setScale((prevScale) => Math.max(prevScale - 0.2, 0.5));
  }

  function rotate() {
    setRotation((prevRotation) => (prevRotation + 90) % 360);
  }

  // 加载状态显示
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[500px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  // 渲染PDF查看器 - 使用object标签
  const renderPDFViewer = () => (
    <>
      <div className="bg-white rounded-lg shadow-lg p-4 mb-4 w-full h-[600px]">
        <object
          data={normalizedUrl}
          type="application/pdf"
          className="w-full h-full"
          title="PDF文档查看器"
        >
          <div className="flex flex-col items-center justify-center h-full">
            <p className="mb-4 text-gray-600">PDF无法直接显示</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(normalizedUrl, "_blank")}
            >
              在新窗口打开PDF
            </Button>
          </div>
        </object>
      </div>

      <div className="flex items-center justify-center w-full max-w-md mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(normalizedUrl, "_blank")}
        >
          在新窗口打开PDF
        </Button>
      </div>
    </>
  );

  // 渲染图片查看器
  const renderImageViewer = () => (
    <>
      <div className="bg-white rounded-lg shadow-lg p-4 mb-4 w-full flex justify-center">
        <div
          className="relative overflow-hidden"
          style={{
            transform: `rotate(${rotation}deg) scale(${scale})`,
            transition: "transform 0.3s ease",
          }}
        >
          <img
            src={normalizedUrl}
            alt="文档图片"
            className="max-w-full object-contain"
            style={{ maxHeight: "70vh" }}
            onError={() => {
              // 图片加载失败处理
              setFileType("unknown");
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-center w-full max-w-md mb-4">
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="icon" onClick={zoomOut} title="缩小">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm">{Math.round(scale * 100)}%</span>
          <Button variant="outline" size="icon" onClick={zoomIn} title="放大">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={rotate} title="旋转">
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );

  // 渲染未知文件类型
  const renderUnknownFileType = () => (
    <div className="flex flex-col justify-center items-center h-[500px] bg-white rounded-lg shadow-lg p-4">
      <FileText className="h-12 w-12 text-gray-400 mb-4" />
      <p className="text-gray-700 font-medium">无法识别的文件格式</p>
      <p className="text-sm text-gray-500 mt-2 mb-4">
        文件路径: {normalizedUrl}
      </p>
      <Button
        variant="outline"
        onClick={() => window.open(normalizedUrl, "_blank")}
      >
        尝试直接打开
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col items-center">
      {fileType === "pdf" && renderPDFViewer()}
      {fileType === "image" && renderImageViewer()}
      {fileType === "unknown" && renderUnknownFileType()}
    </div>
  );
}
