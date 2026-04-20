import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// 递归获取目录结构
function getDirectoryStructure(dirPath: string, basePath: string = ""): any[] {
  const relativePath = path.join(basePath, path.basename(dirPath));

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    return entries.map((entry) => {
      const entryPath = path.join(dirPath, entry.name);
      const entryRelativePath = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        return {
          name: entry.name,
          isDirectory: true,
          isOpen: false,
          path: entryRelativePath.replace(/\\/g, "/"),
          children: getDirectoryStructure(entryPath, entryRelativePath),
        };
      } else {
        return {
          name: entry.name,
          isDirectory: false,
          isOpen: false,
          path: entryRelativePath.replace(/\\/g, "/"),
          children: [],
        };
      }
    });
  } catch (error) {
    console.error(`读取目录 ${dirPath} 时出错:`, error);
    return [];
  }
}

export async function GET() {
  try {
    // 获取public/models目录的完整路径
    const modelsDir = path.join(process.cwd(), "public", "models");

    // 检查目录是否存在
    if (!fs.existsSync(modelsDir)) {
      // 如果目录不存在，创建它
      fs.mkdirSync(modelsDir, { recursive: true });
    }

    // 获取目录结构
    const structure = [
      {
        name: "模型文件夹",
        isDirectory: true,
        isOpen: true,
        path: "/models",
        children: getDirectoryStructure(modelsDir, "/models"),
      },
    ];

    return NextResponse.json(structure);
  } catch (error) {
    console.error("获取模型目录结构时出错:", error);
    return NextResponse.json({ error: "获取目录结构失败" }, { status: 500 });
  }
}
