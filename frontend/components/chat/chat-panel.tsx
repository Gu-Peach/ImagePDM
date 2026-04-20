"use client";

import {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useAppStore, Message, Drawing } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, X, Loader2, FileText, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import axios from "axios";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// 添加精确匹配序列号的API函数
const searchByArtNo = async (serialNumber: string) => {
  try {
    const response = await axios.get(
      `http://localhost:8000/api/equipment/search-by-artno?artno=${encodeURIComponent(
        serialNumber
      )}`
    );
    return response.data;
  } catch (error) {
    console.error("通过序列号搜索设备失败:", error);
    return [];
  }
};

// 添加向量搜索API函数
const searchByVector = async (query: string) => {
  try {
    const response = await axios.post(
      `http://localhost:8000/api/equipment/vector-search`,
      { query: query }
    );
    return response.data;
  } catch (error) {
    console.error("向量搜索失败:", error);
    return [];
  }
};

// 定义组件ref类型
export interface ChatPanelRef {
  handleSearch: (query: string) => Promise<void>;
}

const ChatPanel = forwardRef<ChatPanelRef>((props, ref) => {
  const {
    messages,
    addMessage,
    showChatPanel,
    toggleChatPanel,
    setCurrentDrawing,
    setSearchQuery, // 用于在BOM中搜索文件
    toggleFileExplorer, // 用于显示BOM面板
  } = useAppStore();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [chatContext, setChatContext] = useState<
    Array<{ role: string; content: string }>
  >([]);

  // 自动滚动到最新消息
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

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
      con_no: "合同号",
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
      console.log("正在请求大模型API...");

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

  // 在BOM中定位文件
  const locateFileInBom = (filePath: string) => {
    // 确保BOM面板显示
    if (!useAppStore.getState().showFileExplorer) {
      toggleFileExplorer();
    }

    // 提取文件名用于搜索
    const fileName = filePath.split("/").pop() || filePath;

    // 设置搜索查询以在BOM中定位文件
    setSearchQuery(fileName);
  };

  // 处理搜索查询
  const handleSearch = async (query: string) => {
    setIsLoading(true);

    try {
      // 更新对话上下文
      const updatedContext = [...chatContext, { role: "user", content: query }];
      setChatContext(updatedContext);

      // 直接使用输入的序列号进行精确匹配
      const serialNumber = query.trim();

      // 查询设备信息
      let equipmentDataArray: any[] = [];

      // 使用序列号精确匹配art_no
      const results = await searchByArtNo(serialNumber);

      if (results && results.length > 0) {
        equipmentDataArray = results;

        // 准备发送给LLM的上下文信息
        let contextForLLM =
          "您是一个专业的设备信息助手，可以回答关于设备和BOM的各种问题。";

        if (equipmentDataArray.length > 0) {
          contextForLLM += "\n\n以下是相关设备的信息：\n";
          equipmentDataArray.forEach((equipment, index) => {
            contextForLLM += `\n设备 ${index + 1}：\n`;
            // 只提取供应商、产品编号、合同号和image_path字段
            const requiredFields = [
              "supplier",
              "art_no",
              "image_path",
              "con_no",
            ];
            Object.entries(equipment)
              .filter(
                ([key, value]) =>
                  requiredFields.includes(key) &&
                  value &&
                  value.toString().trim() !== ""
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
          // 构建完整的图片URL，确保正确处理特殊字符
          const encodedPath = encodeURIComponent(imagePath);
          drawingUrl = `http://localhost:8000/api/images/${encodedPath}?t=${Date.now()}`;
          console.log("构建的图片URL:", drawingUrl);

          // 在BOM中定位该图片文件
          locateFileInBom(imagePath);
        }

        // 如果找到了图纸，创建Drawing对象并更新当前图纸
        if (drawingUrl) {
          const drawing: Drawing = {
            id: Date.now().toString(),
            name: firstEquipment?.loc_des || `图纸-${query}`,
            url: drawingUrl,
            createdAt: new Date(),
          };
          setCurrentDrawing(drawing);
        }

        // 调用LLM API获取总结
        const llmResponse = await callLLMApi(
          query,
          contextForLLM,
          updatedContext
        );

        // 创建助手回复消息
        const aiResponse: Message = {
          id: (Date.now() + 1).toString(),
          content:
            llmResponse || `已找到序列号为 "${serialNumber}" 的设备信息。`,
          sender: "ai",
          timestamp: new Date(),
          equipmentData:
            equipmentDataArray.length > 0 ? equipmentDataArray[0] : undefined,
          drawingPath: drawingUrl || undefined,
        };

        // 添加AI回复
        addMessage(aiResponse);
      } else {
        // 如果没有精确匹配到序列号，使用向量搜索进行模糊匹配
        console.log("未找到精确匹配，尝试向量搜索...");

        // 调用向量搜索API
        const vectorResults = await searchByVector(query);

        if (vectorResults && vectorResults.length > 0) {
          // 最多显示5条结果
          const topResults = vectorResults.slice(0, 5);

          // 准备发送给LLM的上下文信息
          let contextForLLM =
            "您是一个专业的设备信息助手，可以回答关于设备和BOM的各种问题。";

          if (topResults.length > 0) {
            contextForLLM += "\n\n以下是相关设备的信息：\n";
            topResults.forEach((equipment: any, index: number) => {
              contextForLLM += `\n设备 ${index + 1}：\n`;
              // 只提取供应商、产品编号、合同号和image_path字段
              const requiredFields = [
                "supplier",
                "art_no",
                "image_path",
                "con_no",
                "similarity",
              ];
              Object.entries(equipment)
                .filter(
                  ([key, value]) =>
                    requiredFields.includes(key) &&
                    value &&
                    value.toString().trim() !== ""
                )
                .forEach(([key, value]) => {
                  const fieldName = formatFieldName(key);
                  contextForLLM += `${fieldName}: ${value}\n`;
                });
            });
          }

          // 调用LLM API获取总结
          const llmResponse = await callLLMApi(
            query,
            contextForLLM,
            updatedContext
          );

          // 创建助手回复消息
          const aiResponse: Message = {
            id: (Date.now() + 1).toString(),
            content:
              llmResponse ||
              `未找到序列号为 "${serialNumber}" 的精确匹配，以下是模糊匹配的结果：`,
            sender: "ai",
            timestamp: new Date(),
            equipmentData: topResults, // 传递整个数组，而不是单个对象
            drawingPath: undefined,
          };

          // 添加AI回复
          addMessage(aiResponse);

          // 处理第一个结果的图纸（如果有）
          const firstEquipment = topResults[0];
          const imagePath = firstEquipment?.image_path;

          if (imagePath) {
            // 构建完整的图片URL，确保正确处理特殊字符
            const encodedPath = encodeURIComponent(imagePath);
            const drawingUrl = `http://localhost:8000/api/images/${encodedPath}?t=${Date.now()}`;
            console.log("构建的图片URL:", drawingUrl);

            // 在BOM中定位该图片文件
            locateFileInBom(imagePath);

            // 创建Drawing对象并更新当前图纸
            const drawing: Drawing = {
              id: Date.now().toString(),
              name: firstEquipment?.loc_des || `图纸-${query}`,
              url: drawingUrl,
              createdAt: new Date(),
            };
            setCurrentDrawing(drawing);
          }
        } else {
          // 如果向量搜索也没有结果，尝试使用LLM回答一般问题
          const llmResponse = await callLLMApi(
            query,
            "您是一个专业的设备信息助手，可以回答关于设备和BOM的各种问题。",
            updatedContext
          );

          // 添加AI回复
          addMessage({
            id: Date.now().toString(),
            content: llmResponse || `未找到与 "${query}" 相关的设备信息`,
            sender: "ai",
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      console.error("搜索处理出错:", error);

      // 添加错误消息
      addMessage({
        id: (Date.now() + 1).toString(),
        content: `抱歉，处理您的请求时出现错误：${
          error instanceof Error ? error.message : "未知错误"
        }`,
        sender: "ai",
        timestamp: new Date(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 暴露handleSearch方法给父组件
  useImperativeHandle(ref, () => ({
    handleSearch,
  }));

  // 渲染设备信息表格
  const renderEquipmentTable = (equipment: any | any[]) => {
    if (!equipment) return null;

    // 处理单个设备或设备数组
    const equipmentArray = Array.isArray(equipment) ? equipment : [equipment];

    if (equipmentArray.length === 0) return null;

    return (
      <div className="mt-3 border rounded">
        {equipmentArray.map((item, equipmentIndex) => {
          // 只显示供应商、产品编号、相似度、合同号和image_path字段
          const requiredFields = [
            "supplier",
            "art_no",
            "image_path",
            "similarity",
            "con_no",
          ];
          const filteredEntries = Object.entries(item).filter(
            ([key, value]) =>
              requiredFields.includes(key) &&
              value &&
              value.toString().trim() !== ""
          );

          if (filteredEntries.length === 0) return null;

          return (
            <div
              key={equipmentIndex}
              className={equipmentIndex > 0 ? "mt-4 pt-4 border-t" : ""}
            >
              {equipmentArray.length > 1 && (
                <div className="px-4 py-2 bg-gray-100 font-medium flex justify-between items-center">
                  <span>
                    结果 {equipmentIndex + 1}
                    {item.similarity && (
                      <span className="ml-2 text-sm text-gray-500">
                        相似度: {(item.similarity * 100).toFixed(2)}%
                      </span>
                    )}
                  </span>

                  {/* 添加查看图纸按钮 */}
                  {item.image_path && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        // 构建完整的图片URL，确保正确处理特殊字符
                        const encodedPath = encodeURIComponent(item.image_path);
                        const drawingUrl = `http://localhost:8000/api/images/${encodedPath}?t=${Date.now()}`;
                        console.log("构建的图片URL:", drawingUrl);

                        // 创建Drawing对象并更新当前图纸
                        const drawing: Drawing = {
                          id: Date.now().toString(),
                          name:
                            item.loc_des ||
                            item.art_no ||
                            `图纸-${item.image_path}`,
                          url: drawingUrl,
                          createdAt: new Date(),
                        };
                        setCurrentDrawing(drawing);

                        // 在BOM中定位该图片文件
                        locateFileInBom(item.image_path);
                      }}
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      查看图纸
                    </Button>
                  )}
                </div>
              )}
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
        })}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "fixed right-0 top-0 z-10 h-full w-96 bg-white shadow-lg transition-transform duration-300 ease-in-out",
        showChatPanel ? "translate-x-0" : "translate-x-full"
      )}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="font-semibold">对话助手</h2>
        <Button variant="ghost" size="icon" onClick={toggleChatPanel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 消息区域 */}
      <ScrollArea className="h-[calc(100%-8rem)] p-4" ref={scrollAreaRef}>
        <div className="flex flex-col gap-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex items-start gap-2",
                message.sender === "user" ? "justify-end" : "justify-start"
              )}
            >
              {message.sender === "ai" && (
                <Avatar className="h-8 w-8">
                  <AvatarFallback>AI</AvatarFallback>
                </Avatar>
              )}

              <div
                className={cn(
                  "rounded-lg p-3 max-w-[80%]",
                  message.sender === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                <p className="text-sm">{message.content}</p>

                {/* 如果消息包含设备信息，显示表格 */}
                {message.sender === "ai" &&
                  message.equipmentData &&
                  renderEquipmentTable(message.equipmentData)}

                {/* 如果消息包含图纸路径，添加在BOM中定位的按钮 */}
                {message.sender === "ai" && message.drawingPath && (
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        const imagePath =
                          message.drawingPath?.split("/").pop() || "";
                        locateFileInBom(imagePath);
                      }}
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      在BOM中定位
                    </Button>
                  </div>
                )}

                {/* 如果消息包含图纸链接，显示链接 */}
                {message.drawingLinks && message.drawingLinks.length > 0 && (
                  <div className="mt-2">
                    {message.drawingLinks.map((drawing) => (
                      <Button
                        key={drawing.id}
                        variant="link"
                        className="p-0 h-auto text-xs underline"
                        onClick={() => {
                          useAppStore.getState().setCurrentDrawing(drawing);
                          // 在BOM中定位文件
                          const fileName = drawing.name;
                          locateFileInBom(fileName);
                        }}
                      >
                        {drawing.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {message.sender === "user" && (
                <Avatar className="h-8 w-8">
                  <AvatarFallback>ME</AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>AI</AvatarFallback>
              </Avatar>
              <div className="bg-muted rounded-lg p-3">
                <div className="flex space-x-1">
                  <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div
                    className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                  <div
                    className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.4s" }}
                  ></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});

ChatPanel.displayName = "ChatPanel";

export default ChatPanel;
