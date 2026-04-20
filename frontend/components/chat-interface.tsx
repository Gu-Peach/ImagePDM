"use client";

import type React from "react";

import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Paperclip,
  ImageIcon,
  Smile,
  MoreVertical,
  X,
  Loader2,
  Download,
  FileText,
  FolderIcon,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type MessageType = {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  attachments?: {
    type: "image" | "file";
    name: string;
    url: string;
    size?: string;
  }[];
  equipmentData?: any; // 添加用于存储设备信息的字段
  drawingPath?: string; // 添加用于存储图纸路径的字段
};

// 添加从ChatBox引入的API函数
const searchByLocDes = async (query: string) => {
  try {
    const response = await axios.get(
      `http://localhost:8000/api/equipment/search?query=${query}`
    );
    return response.data;
  } catch (error) {
    console.error("搜索设备失败:", error);
    return [];
  }
};

// 创建一个单独的图纸查看组件
const DrawingViewer = ({ drawingPath }: { drawingPath: string }) => {
  const [zoomLevel, setZoomLevel] = useState(1);

  const increaseZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  };

  const decreaseZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
  };

  const resetZoom = () => {
    setZoomLevel(1);
  };

  return (
    <div className="mt-3">
      <div className="text-sm font-medium mb-2">产品图纸:</div>
      <Dialog>
        <DialogTrigger asChild>
          <div className="border rounded overflow-hidden cursor-pointer hover:shadow-md transition-shadow">
            <img
              src={drawingPath}
              alt="产品图纸"
              className="max-w-full object-contain"
              style={{ maxHeight: "300px" }}
            />
          </div>
        </DialogTrigger>
        <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] flex flex-col">
          <DialogHeader className="flex justify-between items-center flex-row">
            <DialogTitle>产品图纸详情</DialogTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={decreaseZoom}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm">{Math.round(zoomLevel * 100)}%</span>
              <Button variant="outline" size="icon" onClick={increaseZoom}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={resetZoom}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center p-2">
            <img
              src={drawingPath}
              alt="产品图纸"
              className="object-contain transition-transform"
              style={{
                transform: `scale(${zoomLevel})`,
                maxWidth: "100%",
                maxHeight: "100%",
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default function ChatInterface({
  expandedChat = false,
}: {
  expandedChat?: boolean;
}) {
  const [messages, setMessages] = useState<MessageType[]>([
    {
      id: "1",
      content:
        "你好！我是您的AI助手。我能帮您查询零件信息和管理BOM。请问有什么可以帮助您的吗？",
      sender: "ai",
      timestamp: new Date(Date.now() - 3600000),
    },
  ]);

  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<
    { type: "image" | "file"; file: File }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [chatContext, setChatContext] = useState<
    Array<{ role: string; content: string }>
  >([]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 格式化字段名称
  const formatFieldName = (key: string): string => {
    const fieldMap: Record<string, string> = {
      loc_des: "短型号",
      item_des: "项目描述",
      name: "名称",
      type: "类型",
      data: "数据",
      supplier: "供应商",
      order_sub: "订单编号",
      art_no: "产品编号",
      circuit_diag_page: "电路图页",
      rev: "修订版本",
    };

    return fieldMap[key] || key;
  };

  // 从用户输入中提取关键词
  const extractKeywords = (text: string): string[] => {
    // 移除标点符号，分割成单词
    const words = text
      .toLowerCase()
      .replace(/[.,?!;:]/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 1); // 过滤掉过短的词

    // 移除常见的停用词
    const stopWords = [
      "的",
      "是",
      "在",
      "一个",
      "和",
      "与",
      "或",
      "什么",
      "如何",
      "请问",
      "告诉",
      "我",
      "你",
      "它",
    ];
    return words.filter((word) => !stopWords.includes(word));
  };

  // 调用LLM API
  const callLLMApi = async (
    userQuery: string,
    context: string,
    conversationHistory: Array<{ role: string; content: string }>
  ) => {
    try {
      console.log("正在请求通义千问API...");

      // 调用后端API
      const response = await axios.post("http://localhost:8000/api/llm", {
        message: userQuery,
        context: context,
        history: conversationHistory.slice(-6), // 保留最近的对话历史
      });

      return response.data.response;
    } catch (error) {
      console.error("LLM API调用错误:", error);
      return "抱歉，与AI服务通信时出现错误。请稍后再试。";
    }
  };

  const handleSendMessage = async () => {
    if (inputMessage.trim() === "" && attachments.length === 0) return;

    // 添加用户消息
    const newUserMessage: MessageType = {
      id: Date.now().toString(),
      content: inputMessage,
      sender: "user",
      timestamp: new Date(),
      attachments: attachments.map((att) => ({
        type: att.type,
        name: att.file.name,
        url: URL.createObjectURL(att.file),
        size: formatFileSize(att.file.size),
      })),
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setInputMessage("");
    setAttachments([]);
    setIsLoading(true);

    try {
      // 更新对话上下文
      const updatedContext = [
        ...chatContext,
        { role: "user", content: inputMessage },
      ];
      setChatContext(updatedContext);

      // 尝试从输入中提取设备型号
      const shortCodeMatch = inputMessage.match(/[A-Z]\d+(\.\d+)?/i);
      const potentialShortCode = shortCodeMatch ? shortCodeMatch[0] : null;

      // 查询设备信息
      let equipmentData = null;
      let equipmentDataArray: any[] = [];

      // 如果找到潜在的设备型号，查询该设备
      if (potentialShortCode) {
        const results = await searchByLocDes(potentialShortCode);
        if (results && results.length > 0) {
          equipmentData = results[0];
          equipmentDataArray.push(equipmentData);
        }
      }

      // 如果没有明确的设备型号或者没有找到对应设备，尝试关键词搜索
      if (!equipmentData) {
        const keywords = extractKeywords(inputMessage);
        for (const keyword of keywords) {
          if (keyword.length >= 3) {
            // 只搜索长度大于等于3的关键词
            const results = await searchByLocDes(keyword);
            if (results && results.length > 0) {
              // 添加到设备数据数组，避免重复
              results.forEach((item: any) => {
                if (
                  !equipmentDataArray.some((e) => e.loc_des === item.loc_des)
                ) {
                  equipmentDataArray.push(item);
                }
              });
            }
          }
        }
      }

      // 准备发送给LLM的上下文信息
      let contextForLLM =
        "您是一个专业的设备信息助手，可以回答关于设备和BOM的各种问题。";

      if (equipmentDataArray.length > 0) {
        contextForLLM += "\n\n以下是相关设备的信息：\n";
        equipmentDataArray.forEach((equipment, index) => {
          contextForLLM += `\n设备 ${index + 1}：\n`;
          Object.entries(equipment)
            .filter(
              ([key, value]) =>
                key !== "id" && value && value.toString().trim() !== ""
            )
            .forEach(([key, value]) => {
              const fieldName = formatFieldName(key);
              contextForLLM += `${fieldName}: ${value}\n`;
            });
        });
      }

      // 检查是否有image_path字段
      const firstEquipment = equipmentDataArray[0];
      const imagePath = firstEquipment?.image_path;
      let drawingUrl = null;

      if (imagePath) {
        // 构建完整的图片URL
        drawingUrl = `http://localhost:8000/api/images/${imagePath}`;
      }

      // 调用LLM API
      const llmResponse = await callLLMApi(
        inputMessage,
        contextForLLM,
        updatedContext
      );

      // 更新对话上下文
      setChatContext([
        ...updatedContext,
        { role: "assistant", content: llmResponse },
      ]);

      // 创建助手回复消息，包含图纸路径
      const aiResponse: MessageType = {
        id: (Date.now() + 1).toString(),
        content: llmResponse,
        sender: "ai",
        timestamp: new Date(),
        equipmentData:
          equipmentDataArray.length > 0 ? equipmentDataArray[0] : null,
        drawingPath: drawingUrl, // 添加图纸URL
      };

      setMessages((prev) => [...prev, aiResponse]);
    } catch (error) {
      console.error("处理消息时出错:", error);

      // 添加错误消息
      const errorMessage: MessageType = {
        id: (Date.now() + 1).toString(),
        content: `抱歉，处理您的请求时出现错误：${
          error instanceof Error ? error.message : "未知错误"
        }`,
        sender: "ai",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 渲染设备信息表格
  const renderEquipmentTable = (equipment: any) => {
    if (!equipment) return null;

    // 过滤掉不需要显示的字段和空值
    const filteredEntries = Object.entries(equipment).filter(
      ([key, value]) => key !== "id" && value && value.toString().trim() !== ""
    );

    if (filteredEntries.length === 0) return null;

    return (
      <div className="mt-3 border rounded">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">属性</TableHead>
              <TableHead>值</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntries.map(([key, value], index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">
                  {formatFieldName(key)}
                </TableCell>
                <TableCell>{value as string}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "file" | "image"
  ) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).map((file) => ({
        type: type === "image" ? ("image" as const) : ("file" as const),
        file,
      }));
      setAttachments((prev) => [...prev, ...newFiles]);
    }

    // Reset the input
    if (e.target) {
      e.target.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    else return (bytes / 1048576).toFixed(1) + " MB";
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // 修改renderDrawing函数，使用新组件
  const renderDrawing = (drawingPath: string | undefined) => {
    if (!drawingPath) return null;
    return <DrawingViewer drawingPath={drawingPath} />;
  };

  return (
    <div
      className={`h-full flex flex-col bg-gray-50 transition-all duration-300 ${
        expandedChat ? "flex-1" : "w-1/2"
      }`}
    >
      {/* Chat header */}
      <div className="p-3 border-b flex items-center justify-between bg-white">
        <div className="flex items-center">
          <Avatar className="h-9 w-9 mr-2">
            <AvatarImage src="/placeholder.svg" alt="AI" />
            <AvatarFallback>AI</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-medium text-sm">智能助手</h3>
            <p className="text-xs text-gray-500">在线</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>清空对话</DropdownMenuItem>
            <DropdownMenuItem>导出聊天记录</DropdownMenuItem>
            <DropdownMenuItem>设置</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 添加一个占位行，与BOM管理组件的文件列表标题行对齐 */}
      <div className="bg-gray-100 border-b border-gray-300 py-2 px-3">
        <div className="text-sm font-semibold">聊天消息</div>
      </div>

      {/* Chat messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.sender === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] ${
                  message.sender === "user" ? "order-2" : "order-1"
                }`}
              >
                {message.sender === "ai" && (
                  <Avatar className="h-8 w-8 mb-1">
                    <AvatarImage src="/placeholder.svg" alt="AI" />
                    <AvatarFallback>AI</AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`rounded-lg p-3 ${
                    message.sender === "user"
                      ? "bg-primary text-primary-foreground ml-auto"
                      : "bg-muted text-black"
                  }`}
                >
                  <p className="text-sm">{message.content}</p>

                  {/* 添加设备信息表格渲染 */}
                  {message.sender === "ai" &&
                    message.equipmentData &&
                    renderEquipmentTable(message.equipmentData)}

                  {/* 添加图纸渲染 */}
                  {message.sender === "ai" &&
                    message.drawingPath &&
                    renderDrawing(message.drawingPath)}

                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {message.attachments.map((attachment, index) => (
                        <div key={index} className="rounded overflow-hidden">
                          {attachment.type === "image" ? (
                            <div>
                              <img
                                src={attachment.url || "/placeholder.svg"}
                                alt={attachment.name}
                                className="max-w-full rounded"
                              />
                              <div className="flex items-center justify-between mt-1 text-xs">
                                <span>{attachment.name}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className={`flex items-center p-2 rounded ${
                                message.sender === "user"
                                  ? "bg-primary/80"
                                  : "bg-muted/80"
                              }`}
                            >
                              <FileText className="h-5 w-5 mr-2" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs truncate">
                                  {attachment.name}
                                </p>
                                <p className="text-xs opacity-70">
                                  {attachment.size}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 ml-2"
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {formatTime(message.timestamp)}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div>
                <Avatar className="h-8 w-8 mb-1">
                  <AvatarImage src="/placeholder.svg" alt="AI" />
                  <AvatarFallback>AI</AvatarFallback>
                </Avatar>
                <div className="rounded-lg p-3 bg-muted">
                  <div className="flex items-center">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <p className="text-sm text-muted-foreground">思考中...</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 border-t bg-white">
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, index) => (
              <div
                key={index}
                className="relative border rounded p-2 bg-gray-50 flex items-center"
              >
                {attachment.type === "image" ? (
                  <div className="flex items-center">
                    <div className="h-8 w-8 mr-2 rounded overflow-hidden">
                      <img
                        src={
                          URL.createObjectURL(attachment.file) ||
                          "/placeholder.svg"
                        }
                        alt={attachment.file.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="text-xs max-w-[120px]">
                      <p className="truncate">{attachment.file.name}</p>
                      <p className="text-gray-500">
                        {formatFileSize(attachment.file.size)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <FileText className="h-8 w-8 mr-2 text-blue-500" />
                    <div className="text-xs max-w-[120px]">
                      <p className="truncate">{attachment.file.name}</p>
                      <p className="text-gray-500">
                        {formatFileSize(attachment.file.size)}
                      </p>
                    </div>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 absolute -top-2 -right-2 bg-gray-200 rounded-full p-0"
                  onClick={() => removeAttachment(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input area with buttons above */}
      <div className="p-3 border-t bg-white">
        <div className="flex flex-col gap-2">
          {/* 工具按钮 - 现在是水平排列在文本框上方 */}
          <div className="flex items-center gap-2 border-b pb-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFileUpload(e, "file")}
              className="hidden"
              multiple
            />
            <input
              type="file"
              ref={imageInputRef}
              onChange={(e) => handleFileUpload(e, "image")}
              className="hidden"
              accept="image/*"
              multiple
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => imageInputRef.current?.click()}
              className="flex items-center gap-1"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
            >
              <Smile className="h-4 w-4" />
            </Button>
          </div>

          {/* 文本输入和发送按钮 */}
          <div className="flex gap-2">
            <Textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息..."
              className="min-h-[80px] resize-none flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={inputMessage.trim() === "" && attachments.length === 0}
              className="self-end"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
