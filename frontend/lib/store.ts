import { create } from "zustand";
import { StateCreator } from "zustand";

// 定义图纸类型
export interface Drawing {
  id: string;
  name: string;
  url: string;
  createdAt: Date;
}

// 定义对话消息类型
export interface Message {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  drawingLinks?: Drawing[];
  bomData?: any;
  equipmentData?: any;
  drawingPath?: string;
}

// 定义BOM数据类型
export interface BOMItem {
  id: string;
  name: string;
  quantity: number;
  description: string;
  material?: string;
  partNumber?: string;
  children?: BOMItem[];
}

// 定义3D模型查看器选项
export interface ModelViewerOptions {
  document: string | null;
  title: string | null;
}

// 定义状态类型
interface AppState {
  // 当前显示的图纸
  currentDrawing: Drawing | null;
  // 历史图纸
  drawings: Drawing[];
  // 对话消息
  messages: Message[];
  // BOM结构树
  bomStructure: BOMItem[] | null;
  // 是否显示对话面板
  showChatPanel: boolean;
  // 是否显示文件浏览器
  showFileExplorer: boolean;
  // 是否显示3D模型查看器
  showModelViewer: boolean;
  // 3D模型查看器选项
  modelViewerOptions: ModelViewerOptions;
  // BOM搜索查询
  searchQuery: string;

  // 动作
  setCurrentDrawing: (drawing: Drawing | null) => void;
  addDrawing: (drawing: Drawing) => void;
  addMessage: (message: Message) => void;
  setBomStructure: (items: BOMItem[] | null) => void;
  toggleChatPanel: () => void;
  toggleFileExplorer: () => void;
  toggleModelViewer: () => void;
  setModelViewerOptions: (options: ModelViewerOptions) => void;
  setSearchQuery: (query: string) => void;
}

// 创建状态管理
export const useAppStore = create<AppState>((set: any) => ({
  currentDrawing: null,
  drawings: [],
  messages: [
    {
      id: "1",
      content: "你好！我是您的AutoCAD图纸管理助手。请输入您想查询的图纸信息。",
      sender: "ai",
      timestamp: new Date(),
    },
  ],
  bomStructure: null,
  showChatPanel: true,
  showFileExplorer: false,
  showModelViewer: false,
  modelViewerOptions: {
    document: null,
    title: null,
  },
  searchQuery: "",

  setCurrentDrawing: (drawing) => set({ currentDrawing: drawing }),
  addDrawing: (drawing) =>
    set((state: AppState) => ({
      drawings: [...state.drawings, drawing],
      currentDrawing: drawing,
    })),
  addMessage: (message) =>
    set((state: AppState) => ({
      messages: [...state.messages, message],
    })),
  setBomStructure: (items) => set({ bomStructure: items }),
  toggleChatPanel: () =>
    set((state: AppState) => ({ showChatPanel: !state.showChatPanel })),
  toggleFileExplorer: () =>
    set((state: AppState) => ({ showFileExplorer: !state.showFileExplorer })),
  toggleModelViewer: () =>
    set((state: AppState) => ({ showModelViewer: !state.showModelViewer })),
  setModelViewerOptions: (options) => set({ modelViewerOptions: options }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
