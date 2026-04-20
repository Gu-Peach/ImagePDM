"use client";

import { useState, useEffect } from "react";
import {
  BookOpen,
  MenuIcon,
  User,
  Bell,
  ChevronDown,
  FileText,
  Settings,
  LogOut,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export default function AppHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // 处理滚动效果
  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 10;
      if (isScrolled !== scrolled) {
        setScrolled(isScrolled);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [scrolled]);

  // 切换移动端菜单
  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-30 transition-all duration-300",
        scrolled
          ? "bg-white shadow-md py-2"
          : "bg-gradient-to-r from-blue-600 to-indigo-700 py-3"
      )}
    >
      <div className="container mx-auto px-4 md:pl-8 lg:pl-12">
        <div className="flex items-center justify-between">
          {/* Logo 和应用名称 */}
          <div className="flex items-center">
            <BookOpen
              className={cn(
                "h-7 w-7 sm:h-8 sm:w-8 mr-2 transition-colors",
                scrolled ? "text-blue-600" : "text-white"
              )}
            />
            <h1
              className={cn(
                "text-lg sm:text-xl font-bold transition-colors truncate max-w-[180px] sm:max-w-full",
                scrolled ? "text-gray-800" : "text-white"
              )}
            >
              智能图纸管理系统
            </h1>
          </div>

          {/* 桌面端导航链接 */}
          <nav className="hidden md:flex items-center space-x-6">
            <a
              href="#"
              className={cn(
                "transition-colors font-medium",
                scrolled
                  ? "text-gray-700 hover:text-blue-600"
                  : "text-white/90 hover:text-white"
              )}
            >
              首页
            </a>
            <a
              href="#"
              className={cn(
                "transition-colors font-medium",
                scrolled
                  ? "text-gray-700 hover:text-blue-600"
                  : "text-white/90 hover:text-white"
              )}
            >
              图纸库
            </a>
            <a
              href="#"
              className={cn(
                "transition-colors font-medium",
                scrolled
                  ? "text-gray-700 hover:text-blue-600"
                  : "text-white/90 hover:text-white"
              )}
            >
              项目管理
            </a>
            <a
              href="#"
              className={cn(
                "transition-colors font-medium",
                scrolled
                  ? "text-gray-700 hover:text-blue-600"
                  : "text-white/90 hover:text-white"
              )}
            >
              文档中心
            </a>
          </nav>

          {/* 用户相关功能区 */}
          <div className="flex items-center space-x-3">
            {/* 通知按钮 */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "rounded-full transition-colors",
                scrolled
                  ? "text-gray-700 hover:text-blue-600 hover:bg-blue-50"
                  : "text-white hover:bg-white/10"
              )}
            >
              <Bell className="h-5 w-5" />
            </Button>

            {/* 用户头像和下拉菜单 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "flex items-center space-x-2 rounded-full transition-colors",
                    scrolled
                      ? "text-gray-700 hover:bg-blue-50"
                      : "text-white hover:bg-white/10"
                  )}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="/placeholder-avatar.jpg" />
                    <AvatarFallback className="bg-blue-100 text-blue-800">
                      用户
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline">管理员</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>我的账户</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  <span>个人资料</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <FileText className="mr-2 h-4 w-4" />
                  <span>我的项目</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>设置</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <HelpCircle className="mr-2 h-4 w-4" />
                  <span>帮助</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>退出登录</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 移动端菜单按钮 */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "md:hidden rounded-full transition-colors",
                scrolled
                  ? "text-gray-700 hover:bg-blue-50"
                  : "text-white hover:bg-white/10"
              )}
              onClick={toggleMenu}
            >
              <MenuIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* 移动端菜单 */}
        <div
          className={cn(
            "md:hidden overflow-hidden transition-all duration-300 ease-in-out",
            isMenuOpen ? "max-h-60 mt-4" : "max-h-0 mt-0"
          )}
        >
          <nav className="flex flex-col space-y-3 py-3 pl-2">
            <a
              href="#"
              className={cn(
                "px-2 py-1 rounded transition-colors",
                scrolled
                  ? "text-gray-700 hover:bg-blue-50"
                  : "text-white hover:bg-white/10"
              )}
            >
              首页
            </a>
            <a
              href="#"
              className={cn(
                "px-2 py-1 rounded transition-colors",
                scrolled
                  ? "text-gray-700 hover:bg-blue-50"
                  : "text-white hover:bg-white/10"
              )}
            >
              图纸库
            </a>
            <a
              href="#"
              className={cn(
                "px-2 py-1 rounded transition-colors",
                scrolled
                  ? "text-gray-700 hover:bg-blue-50"
                  : "text-white hover:bg-white/10"
              )}
            >
              项目管理
            </a>
            <a
              href="#"
              className={cn(
                "px-2 py-1 rounded transition-colors",
                scrolled
                  ? "text-gray-700 hover:bg-blue-50"
                  : "text-white hover:bg-white/10"
              )}
            >
              文档中心
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
