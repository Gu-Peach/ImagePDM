from minio import Minio
from minio.error import S3Error
import os
from typing import List, Dict, Any, Optional, BinaryIO
from fastapi import HTTPException
import io
from dotenv import load_dotenv

# 加载.env文件中的环境变量
load_dotenv()

# 从环境变量获取Minio配置
minio_endpoint = os.getenv("MINIO_ENDPOINT", "localhost:9000")
minio_access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
minio_secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
minio_secure = os.getenv("MINIO_SECURE", "false").lower() == "true"
minio_bucket = os.getenv("MINIO_BUCKET", "models")

# 初始化Minio客户端
minio_client = Minio(
    endpoint=minio_endpoint,
    access_key=minio_access_key,
    secret_key=minio_secret_key,
    secure=minio_secure
)

# 确保bucket存在
def ensure_bucket_exists(bucket_name: str = minio_bucket):
    """确保指定的bucket存在，如果不存在则创建"""
    try:
        if not minio_client.bucket_exists(bucket_name):
            minio_client.make_bucket(bucket_name)
            print(f"Bucket '{bucket_name}' 创建成功")
        return True
    except S3Error as e:
        print(f"Minio操作错误: {e}")
        return False

# 上传文件
def upload_file(file_content: BinaryIO, file_path: str, content_type: str = None, bucket_name: str = minio_bucket) -> bool:
    """上传文件到Minio存储"""
    try:
        ensure_bucket_exists(bucket_name)
        
        # 获取文件大小
        file_content.seek(0, os.SEEK_END)
        file_size = file_content.tell()
        file_content.seek(0)
        
        # 上传文件
        minio_client.put_object(
            bucket_name=bucket_name,
            object_name=file_path,
            data=file_content,
            length=file_size,
            content_type=content_type
        )
        return True
    except S3Error as e:
        print(f"上传文件到Minio时出错: {e}")
        return False

# 下载文件
def download_file(file_path: str, bucket_name: str = minio_bucket) -> Optional[bytes]:
    """从Minio下载文件内容"""
    try:
        response = minio_client.get_object(bucket_name, file_path)
        data = response.read()
        response.close()
        return data
    except S3Error as e:
        print(f"从Minio下载文件时出错: {e}")
        return None

# 检查文件是否存在
def file_exists(file_path: str, bucket_name: str = minio_bucket) -> bool:
    """检查文件是否存在于Minio存储中"""
    try:
        minio_client.stat_object(bucket_name, file_path)
        return True
    except S3Error:
        return False

# 删除文件
def delete_file(file_path: str, bucket_name: str = minio_bucket) -> bool:
    """从Minio删除文件"""
    try:
        minio_client.remove_object(bucket_name, file_path)
        return True
    except S3Error as e:
        print(f"删除Minio文件时出错: {e}")
        return False

# 列出目录内容
def list_directory(directory_path: str = "", bucket_name: str = minio_bucket) -> List[Dict[str, Any]]:
    """列出Minio中指定目录的内容"""
    try:
        # 确保路径以/结尾，但不以/开头
        prefix = directory_path.strip("/")
        if prefix and not prefix.endswith("/"):
            prefix += "/"
            
        # 获取对象列表
        objects = minio_client.list_objects(bucket_name, prefix=prefix, recursive=False)
        
        # 转换为前端需要的格式
        result = []
        for obj in objects:
            # 获取对象名称（去除前缀）
            name = obj.object_name[len(prefix):] if prefix else obj.object_name
            
            # 跳过空名称或以.开头的隐藏文件
            if not name or name.startswith("."):
                continue
                
            # 判断是否是目录
            is_directory = name.endswith("/")
            
            # 如果是目录，去掉末尾的/
            if is_directory:
                name = name[:-1]
                
            # 构建路径
            path = f"{directory_path}/{name}".replace("//", "/")
            if path.startswith("/"):
                path = path[1:]
                
            # 添加到结果列表
            result.append({
                "name": name,
                "isDirectory": is_directory,
                "path": path,
                "size": obj.size if not is_directory else None,
                "lastModified": obj.last_modified.isoformat() if hasattr(obj, "last_modified") and obj.last_modified else None
            })
            
        return result
    except S3Error as e:
        print(f"列出Minio目录内容时出错: {e}")
        return []

# 递归获取目录结构
def get_directory_structure(directory_path: str = "", bucket_name: str = minio_bucket) -> List[Dict[str, Any]]:
    """递归获取Minio中指定目录的结构"""
    try:
        items = list_directory(directory_path, bucket_name)
        
        # 递归处理子目录
        for item in items:
            if item["isDirectory"]:
                item["children"] = get_directory_structure(item["path"], bucket_name)
                
        return items
    except Exception as e:
        print(f"获取Minio目录结构时出错: {e}")
        return [] 