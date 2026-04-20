from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from app import llm_router  # 导入app.py中的路由器
import uvicorn
from utils.minio_utils import ensure_bucket_exists  # 导入Minio工具

# 创建FastAPI实例
app = FastAPI()

# 直接设置配置变量
FRONTEND_URL = "http://localhost:3000"
DATA_MODELS_PATH = "data/models"  # 相对于backend目录的路径
DATA_PATH = "data"  # 数据根目录路径

# 可以选择导出为全局变量供其他模块使用
os.environ["FRONTEND_URL"] = FRONTEND_URL
os.environ["DATA_MODELS_PATH"] = DATA_MODELS_PATH

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],  # 使用直接定义的变量
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(llm_router, prefix="/api")  # 只保留app.py中的路由


@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# 启动时确保Minio bucket存在
@app.on_event("startup")
async def startup_event():
    # 确保models bucket存在
    ensure_bucket_exists()
    print("已确保Minio models bucket存在")

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)

    
# uvicorn api:app --reload