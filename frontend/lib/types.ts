// 扩展Window接口，添加自定义全局方法
interface Window {
  refreshBomTree?: () => Promise<void>;
}

export {};
