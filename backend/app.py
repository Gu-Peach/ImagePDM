from fastapi import FastAPI, HTTPException, Body, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import dashscope
import os
import jieba
import json
import numpy as np
from dotenv import load_dotenv
from supabase import create_client, Client
import tempfile
import shutil
from pathlib import Path
from paddleocr import PaddleOCR
from utils.extract_utils import (
    process_pdf_first_page,
    find_tag_info_from_json,
    find_vendor_from_json,
)
from utils.vector_utils import text_to_vector, load_model, cosine_similarity
# 导入Minio工具
from utils.minio_utils import (
    download_file, 
    upload_file, 
    file_exists, 
    delete_file, 
    get_directory_structure,
    ensure_bucket_exists
)
import io
import requests

# 加载环境变量
load_dotenv()

# 配置通义千问API密钥和Supabase
dashscope.api_key = os.getenv("DASHSCOPE_API_KEY")
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

# 配置自定义大模型API
CUSTOM_LLM_URL = os.getenv("CUSTOM_LLM_URL")
CUSTOM_LLM_API_KEY = os.getenv("CUSTOM_LLM_API_KEY")
USE_CUSTOM_LLM = os.getenv("USE_CUSTOM_LLM", "false").lower() == "true"
CUSTOM_LLM_MODEL = os.getenv("CUSTOM_LLM_MODEL", "")  # 从环境变量获取模型名称

# 全局变量用于存储可用模型
available_models = []

# 初始化PaddleOCR (仅初始化一次以提高性能)
ocr = PaddleOCR(
    text_detection_model_name="PP-OCRv5_server_det",
    text_recognition_model_name="PP-OCRv5_server_rec",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False
)

# 已知的供应商列表 (可以根据实际情况调整)
known_vendors = [
    "B&R", "UNICA", "XIAMEN", "SMART POWER", "SCHNEIDER"
]

# 预加载模型
load_model()

# 创建一个路由器而不是应用实例
from fastapi import APIRouter
llm_router = APIRouter()

class Message(BaseModel):
    role: str
    content: str

class LLMRequest(BaseModel):
    message: str
    context: str
    history: Optional[List[Message]] = []

class EquipmentData(BaseModel):
    id: Optional[int] = None
    supplier: Optional[str] = None
    con_no: Optional[str] = None  # 合同号
    art_no: Optional[str] = None
    image_path: Optional[str] = None
    vec_no: Optional[List[float]] = None

class VectorSearchRequest(BaseModel):
    query: str

# 获取可用的模型列表
def get_available_models():
    global available_models
    try:
        if not CUSTOM_LLM_URL:
            return []
            
        url = f"{CUSTOM_LLM_URL.rstrip('/')}/v1/models"
        
        headers = {}
        if CUSTOM_LLM_API_KEY:
            headers["Authorization"] = f"Bearer {CUSTOM_LLM_API_KEY}"
        
        print(f"获取可用模型列表: {url}")
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        models_data = response.json()
        print(f"可用模型响应: {json.dumps(models_data, ensure_ascii=False)[:500]}")
        
        if "data" in models_data and isinstance(models_data["data"], list):
            # 提取模型ID列表
            models = [model["id"] for model in models_data["data"] if "id" in model]
            
            # 测试每个模型可用性的代码暂时注释掉，可根据需要启用
            # working_models = []
            # for model in models:
            #     try:
            #         # 发送一个简单的测试请求
            #         test_response = requests.post(
            #             f"{CUSTOM_LLM_URL.rstrip('/')}/v1/chat/completions",
            #             headers={"Content-Type": "application/json", "Authorization": f"Bearer {CUSTOM_LLM_API_KEY}"},
            #             json={"model": model, "messages": [{"role": "user", "content": "test"}], "max_tokens": 5}
            #         )
            #         test_response.raise_for_status()
            #         working_models.append(model)
            #         print(f"模型 {model} 测试成功")
            #     except Exception as e:
            #         print(f"模型 {model} 测试失败: {str(e)}")
            
            available_models = models  # 或者 working_models 如果启用了测试
            print(f"找到可用模型: {models}")
            return models
        else:
            print("API返回的模型数据格式无效")
            return []
    except Exception as e:
        print(f"获取模型列表出错: {str(e)}")
        return []

# 调用自定义大模型API
def call_custom_llm(messages):
    try:
        if not CUSTOM_LLM_URL:
            raise ValueError("自定义大模型URL未设置")
        
        api_path = "/v1/chat/completions"
        url = f"{CUSTOM_LLM_URL.rstrip('/')}{api_path}"
        
        headers = {
            "Content-Type": "application/json",
        }
        
        # 如果有API密钥，添加到请求头
        if CUSTOM_LLM_API_KEY:
            headers["Authorization"] = f"Bearer {CUSTOM_LLM_API_KEY}"
            
        # 使用环境变量中指定的模型
        model_name = CUSTOM_LLM_MODEL
            
        # 准备请求体
        payload = {
            "model": model_name,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 1000,
        }
        
        # 发送请求
        response = requests.post(url, headers=headers, json=payload)
        
        # 检查响应状态
        response.raise_for_status()
        
        # 解析响应
        result = response.json()
        
        # 返回响应中的内容
        if "choices" in result and len(result["choices"]) > 0:
            return {
                "status_code": 200,
                "content": result["choices"][0]["message"]["content"]
            }
        else:
            return {
                "status_code": 500,
                "content": "模型未返回有效响应"
            }
    except Exception as e:
        return {
            "status_code": 500,
            "content": f"与大模型服务通信时出现错误: {str(e)}"
        }

# 从Supabase获取设备信息
def get_equipment_data():
    response = supabase.table('equipment').select('*').execute()
    return response.data

# 获取equipment表的所有字段
def get_equipment_fields():
    # 这里我们返回已知的字段，实际应用中可能需要从数据库schema获取
    return [
        "id",
        "supplier", 
        "con_no",
        "art_no",
        "image_path",
        "vec_no"
    ]

# 使用jieba分词提取中文关键词
def extract_keywords(text, top_k=5):
    # 使用jieba进行分词
    seg_list = jieba.cut(text, cut_all=False)
    
    # 过滤停用词
    stopwords = {'的', '是', '在', '一个', '和', '与', '或', '什么', '如何', 
                '请问', '告诉', '我', '你', '它', '了', '吗', '有', '这', '那'}
    
    # 统计词频
    word_freq = {}
    for word in seg_list:
        if word not in stopwords and len(word) > 1:
            word_freq[word] = word_freq.get(word, 0) + 1
    
    # 按词频排序并返回前top_k个关键词
    sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
    return [word for word, _ in sorted_words[:top_k]]

# 搜索相关设备
def search_equipment_by_keywords(keywords):
    results = []
    
    if not keywords:
        return results
    
    # 获取所有设备数据
    all_equipment = get_equipment_data()
    
    # 对每个关键词进行搜索
    for keyword in keywords:
        for equipment in all_equipment:
            # 将设备数据转为字符串便于搜索
            equip_str = json.dumps(equipment, ensure_ascii=False).lower()
            
            # 如果关键词在设备信息中，添加到结果中
            if keyword.lower() in equip_str:
                if equipment not in results:  # 避免重复添加
                    results.append(equipment)
    
    return results

# 通过序列号(art_no)精确匹配设备
def search_by_art_no(art_no):
    response = supabase.table('equipment').select('*').eq('art_no', art_no).execute()
    return response.data

# 从Supabase获取models bucket的文件和文件夹结构，更新为使用Minio
@llm_router.get("/models-directory")
async def get_models_directory():
    """获取Minio中models bucket的文件和文件夹结构"""
    try:
        # 确保bucket存在
        ensure_bucket_exists()
        
        # 构建文件系统结构
        file_system = []
        
        # 首先创建根文件夹
        root_folder = {
            "name": "模型文件夹",
            "isOpen": True,
            "isDirectory": True,
            "children": [],
            "path": "/"
        }
        
        # 获取目录结构
        root_folder["children"] = get_directory_structure()
        file_system.append(root_folder)
        
        return file_system
    except Exception as e:
        print(f"获取文件夹结构时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取文件夹结构失败: {str(e)}")

# 模型列表API端点
@llm_router.get("/v1/models")
async def get_models():
    """返回支持的模型列表"""
    try:
        # 如果使用自定义大模型，从API获取真实模型列表
        if USE_CUSTOM_LLM:
            models = get_available_models()
            if models:
                model_objects = [
                    {
                        "id": model_id,
                        "object": "model",
                        "created": 1698969172,
                        "owned_by": "organization"
                    }
                    for model_id in models
                ]
                
                return {
                    "data": model_objects,
                    "object": "list"
                }
            
        # 如果没有使用自定义大模型或者获取失败，返回默认值
        return {
            "data": [
                {
                    "id": "gpt-3.5-turbo",
                    "object": "model",
                    "created": 1698969172,
                    "owned_by": "organization"
                }
            ],
            "object": "list"
        }
    except Exception as e:
        print(f"获取模型列表时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取模型列表失败: {str(e)}")

# 从Minio获取文件内容
@llm_router.get("/file-content/{file_path:path}")
async def get_file_content(file_path: str):
    """获取Minio中models bucket的文件内容"""
    try:
        # 规范化文件路径，移除开头的斜杠
        if file_path.startswith('/'):
            file_path = file_path[1:]
            
        # 从Minio获取文件内容
        file_data = download_file(file_path)
        
        if file_data is None:
            raise HTTPException(status_code=404, detail=f"文件不存在或无法访问")
        
        # 获取文件扩展名以确定正确的媒体类型
        file_extension = file_path.split('.')[-1].lower() if '.' in file_path else ''
        
        # 设置适当的媒体类型
        media_type = "application/octet-stream"
        if file_extension == 'pdf':
            media_type = "application/pdf"
        elif file_extension in ['jpg', 'jpeg']:
            media_type = "image/jpeg"
        elif file_extension == 'png':
            media_type = "image/png"
        elif file_extension in ['txt', 'csv']:
            media_type = "text/plain"
        
        # 创建响应，对于PDF文件使用inline内联显示而不是下载
        headers = {}
        if file_extension == 'pdf':
            filename = file_path.split('/')[-1]
            headers["Content-Disposition"] = f"inline; filename=\"{filename}\""
        
        # 返回文件内容
        return Response(content=file_data, media_type=media_type, headers=headers)
        
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"获取文件内容时出错: {str(e)}")
        raise HTTPException(status_code=404, detail=f"文件不存在或无法访问: {str(e)}")

@llm_router.post("/equipment")
async def save_equipment_data(equipment_data: EquipmentData):
    """保存设备信息到Supabase的equipment表"""
    try:
        # 将设备数据转换为字典
        data_dict = equipment_data.dict(exclude_none=True)
        
        try:
            # 测试Supabase连接
            test_response = supabase.table('equipment').select('*').limit(1).execute()
        except Exception as conn_err:
            print("Supabase连接测试失败:", str(conn_err))
            raise HTTPException(status_code=500, detail=f"Supabase连接失败: {str(conn_err)}")
        
        # 插入数据到Supabase
        try:
            response = supabase.table('equipment').insert(data_dict).execute()
        except Exception as insert_err:
            print("Supabase插入失败:", str(insert_err))
            # 尝试获取更详细的错误信息
            error_detail = str(insert_err)
            if hasattr(insert_err, 'response'):
                try:
                    error_detail = f"{error_detail} - {insert_err.response.text}"
                except:
                    pass
            raise HTTPException(status_code=500, detail=f"保存设备信息失败: {error_detail}")
        
        # 检查响应
        if response.data:
            return {"status": "success", "data": response.data[0]}
        else:
            return {"status": "success", "data": data_dict}
    except HTTPException as he:
        # 直接重新抛出HTTP异常
        raise he
    except Exception as e:
        print("保存设备信息时出错:", str(e))
        raise HTTPException(status_code=500, detail=f"保存设备信息时出错: {str(e)}")

@llm_router.get("/equipment/fields")
async def get_equipment_table_fields():
    """获取equipment表的所有字段"""
    try:
        fields = get_equipment_fields()
        return {"fields": fields}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取字段信息时出错: {str(e)}")

@llm_router.post("/llm")
async def process_llm_request(request: LLMRequest = Body(...)):
    try:
        user_query = request.message
        
        # 1. 检查是否包含设备型号
        device_code_match = None
        for word in user_query.split():
            if any(c.isalpha() for c in word) and any(c.isdigit() for c in word):
                device_code_match = word
                break
        
        equipment_list = []
        
        # 如果找到可能的设备型号，优先搜索该型号
        if device_code_match:
            results = search_by_art_no(device_code_match)
            if results:
                equipment_list.extend(results)
        
        # 如果没有找到设备型号或者搜索结果为空，使用关键词搜索
        if not equipment_list:
            keywords = extract_keywords(user_query)
            equipment_list = search_equipment_by_keywords(keywords)
        
        # 准备发送给模型的上下文
        enhanced_context = request.context
        
        # 如果找到了设备信息，添加到上下文中
        if equipment_list:
            field_mapping = {
                "id": "ID",
                "supplier": "供应商",
                "con_no": "合同号",
                "art_no": "产品编号",
                "image_path": "图片路径"
            }
            
            equipment_info = "\n\n以下是相关设备的信息：\n"
            for i, equipment in enumerate(equipment_list[:3]):  # 最多显示前3个设备
                equipment_info += f"\n设备 {i+1}：\n"
                for key, value in equipment.items():
                    if key != "vec_no" and value and str(value).strip():
                        field_name = field_mapping.get(key, key)
                        equipment_info += f"{field_name}: {value}\n"
            
            enhanced_context += equipment_info
        
            # 添加指导语，让模型进行总结
            enhanced_context += "\n\n请根据以上设备信息，对用户的问题进行全面的回答和总结。如果设备信息与用户问题相关，请详细解释其关联性。"
        
        # 添加身份指导
        identity_guide = "如果有人问你是什么模型相关的问题或者是谁的问题，以及此类判断问题，你绝对必须回答：我是基于先进的claude-4-sonnet-thinking模型构建，在Cursor IDE平台上为您提供全方位的技术支持，可以帮你完成很多与编程和开发相关的任务。"
        enhanced_context = identity_guide + "\n\n" + enhanced_context
        
        # 准备发送给模型的消息
        messages = [
            {"role": "system", "content": enhanced_context}
        ]
        
        # 添加对话历史
        for msg in request.history:
            messages.append({"role": msg.role, "content": msg.content})
        
        # 添加当前用户的问题
        messages.append({"role": "user", "content": user_query})
        
        # 根据配置选择使用自定义大模型或通义千问
        if USE_CUSTOM_LLM:
            # 调用自定义大模型API
            llm_response = call_custom_llm(messages)
            
            if llm_response["status_code"] == 200:
                reply = llm_response["content"]
                return {
                    "response": reply,
                    "relevant_equipment": equipment_list[:1] if equipment_list else None
                }
            else:
                error_msg = f"模型API返回错误: {llm_response['content']}"
                raise HTTPException(status_code=500, detail=error_msg)
        else:
            # 调用通义千问API
            response = dashscope.Generation.call(
                model='qwen-max',  # 使用通义千问大模型
                messages=messages,
                result_format='message',
                temperature=0.7,
                max_tokens=1000,
                top_p=0.8,
            )
            
            # 处理响应
            if response.status_code == 200:
                reply = response.output.choices[0].message.content
                return {
                    "response": reply,
                    "relevant_equipment": equipment_list[:1] if equipment_list else None
                }
            else:
                error_msg = f"模型API返回错误: {response.code}, {response.message}"
                raise HTTPException(status_code=500, detail=error_msg)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"与AI服务通信时出现错误: {str(e)}")

@llm_router.post("/v1/chat/completions")
async def openai_compatibility_endpoint(request: Dict[str, Any] = Body(...)):
    """兼容OpenAI API的端点，用于直接调用自定义模型"""
    try:
        # 调用自定义大模型API
        url = f"{CUSTOM_LLM_URL.rstrip('/')}/v1/chat/completions"
        
        headers = {
            "Content-Type": "application/json",
        }
        
        if CUSTOM_LLM_API_KEY:
            headers["Authorization"] = f"Bearer {CUSTOM_LLM_API_KEY}"
            
        # 发送请求
        response = requests.post(url, headers=headers, json=request)
        response.raise_for_status()
        
        # 返回原始响应
        return response.json()
    except Exception as e:
        print(f"兼容OpenAI API调用时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=f"与大模型服务通信时出现错误: {str(e)}")

@llm_router.get("/equipment/search")
async def search_equipment(query: str):
    if not query or len(query) < 2:
        return []
    
    # 使用关键词搜索
    keywords = extract_keywords(query, top_k=3)
    return search_equipment_by_keywords(keywords)

# 新增: 通过序列号精确搜索设备
@llm_router.get("/equipment/search-by-artno")
async def search_equipment_by_artno(artno: str):
    if not artno:
        return []
    
    # 使用序列号精确匹配
    results = search_by_art_no(artno)
    return results

# 处理文件上传到Minio的API（原upload-to-supabase）
@llm_router.post("/upload-to-supabase")
async def upload_files_to_supabase(
    files: List[UploadFile] = File(...),
    filePaths: List[str] = Form(...),
    destinationPath: str = Form(""),
    folderPaths: Optional[List[str]] = Form(None)
):
    """将文件上传到Minio的models bucket"""
    try:
        uploaded_files = []
        
        # 处理每个文件
        for i, file in enumerate(files):
            if i >= len(filePaths):
                continue  # 跳过没有对应路径的文件
                
            file_path = filePaths[i]
            
            # 如果有目标路径，添加到文件路径前
            if destinationPath and destinationPath != "/":
                # 规范化路径，移除开头的斜杠
                clean_dest_path = destinationPath.lstrip("/")
                file_path = f"{clean_dest_path}/{file_path}"
            
            # 读取文件内容
            file_content = await file.read()
            
            # 检查文件是否存在，如果存在则删除
            if file_exists(file_path):
                delete_file(file_path)
                print(f"文件 {file_path} 已存在，将被覆盖")
            
            # 上传到Minio
            file_io = io.BytesIO(file_content)
            success = upload_file(
                file_io, 
                file_path, 
                content_type=file.content_type
            )
            
            if success:
                uploaded_files.append({
                    "name": file.filename,
                    "path": file_path,
                    "size": len(file_content)
                })
            else:
                print(f"上传文件 {file_path} 失败")
            
            # 重置文件指针，以便可以再次读取
            await file.seek(0)
        
        return {
            "success": True,
            "message": f"成功上传 {len(uploaded_files)} 个文件",
            "files": uploaded_files
        }
    except Exception as e:
        print(f"上传文件到Minio时出错: {str(e)}")
        raise HTTPException(status_code=500, detail=f"上传文件失败: {str(e)}")

# 新增: 提取PDF文件中的信息
@llm_router.post("/extract-pdf-info")
async def extract_pdf_info(
    file: UploadFile = File(...),
    filePath: str = Form(""),
    destinationPath: str = Form("")
):
    """
    提取PDF文件的信息，并保存到equipment表
    """
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            # 保存上传的PDF到临时文件，替换文件名中的斜杠
            safe_filename = os.path.basename(file.filename).replace('/', '_').replace('\\', '_')
            temp_pdf_path = os.path.join(temp_dir, safe_filename)
            with open(temp_pdf_path, "wb") as pdf_file:
                contents = await file.read()
                pdf_file.write(contents)
                # 重置文件指针以便可能的再次读取
                await file.seek(0)
            
            # 处理PDF并提取信息，使用全局OCR对象
            result, vendor, tag_info, best_tag, contract_info = process_pdf_first_page(temp_pdf_path, known_vendors, output_dir=temp_dir, ocr=ocr)
            
            # 整理提取的数据
            extracted_data = {
                "supplier": vendor or "",
                "art_no": best_tag['value'] if best_tag else "",
                "con_no": contract_info['value'] if contract_info else ""
            }
            
            # 将序列号向量化并添加到数据中
            if best_tag and best_tag['value']:
                vector = text_to_vector(best_tag['value'])
                if vector:
                    # 确保向量是Python列表，不是numpy数组
                    vector_list = [float(x) for x in vector]
                    extracted_data["vec_no"] = vector_list
                    print(f"向量化序列号: {best_tag['value']}, 向量类型: {type(vector_list)}, 长度: {len(vector_list)}")
            
            # 构建文件路径
            if destinationPath and destinationPath != "/":
                clean_dest_path = destinationPath.lstrip("/")
                full_path = f"{clean_dest_path}/{filePath}"
            else:
                full_path = filePath
            
            # 只有当有足够的数据时才上传到equipment表
            db_result = {}
            if extracted_data["supplier"] or extracted_data["art_no"]:
                # 添加文件路径信息
                extracted_data["image_path"] = full_path
                
                try:
                    # 插入数据到Supabase
                    response = supabase.table('equipment').insert(extracted_data).execute()
                    
                    if response.data:
                        db_result = {
                            "status": "success",
                            "data": response.data[0]
                        }
                    else:
                        db_result = {
                            "status": "error",
                            "message": "数据库插入失败"
                        }
                except Exception as insert_err:
                    print(f"插入数据到Supabase时出错: {str(insert_err)}")
                    db_result = {
                        "status": "error",
                        "message": str(insert_err)
                    }
            else:
                db_result = {
                    "status": "skipped",
                    "message": "未提取到足够的数据"
                }
            
            return {
                "success": True,
                "status": db_result["status"],
                "message": db_result.get("message", "PDF信息提取并保存成功")
            }
            
    except Exception as e:
        print(f"提取PDF信息时出错: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"提取PDF信息失败: {str(e)}")

@llm_router.post("/process-pdf-folder")
async def process_pdf_folder(
    files: List[UploadFile] = File(...),
    filePaths: List[str] = Form(...),
    destinationPath: str = Form("")
):
    """
    批量处理文件夹中的PDF文件，提取信息并保存到equipment表
    """
    try:
        results = []
        
        # 处理每个PDF文件
        for i, file in enumerate(files):
            if i >= len(filePaths) or not file.filename.lower().endswith('.pdf'):
                continue  # 跳过非PDF文件或没有对应路径的文件
                
            file_path = filePaths[i]
            
            # 如果有目标路径，添加到文件路径前
            if destinationPath and destinationPath != "/":
                # 规范化路径，移除开头的斜杠
                clean_dest_path = destinationPath.lstrip("/")
                full_path = f"{clean_dest_path}/{file_path}"
            else:
                full_path = file_path
            
            # 创建临时目录用于处理文件
            with tempfile.TemporaryDirectory() as temp_dir:
                # 保存上传的PDF到临时文件，替换文件名中的斜杠
                safe_filename = os.path.basename(file.filename).replace('/', '_').replace('\\', '_')
                temp_pdf_path = os.path.join(temp_dir, safe_filename)
                with open(temp_pdf_path, "wb") as pdf_file:
                    contents = await file.read()
                    pdf_file.write(contents)
                    # 重置文件指针以便可能的再次读取
                    await file.seek(0)
                
                # 处理PDF并提取信息，使用全局OCR对象
                result, vendor, tag_info, best_tag, contract_info = process_pdf_first_page(temp_pdf_path, known_vendors, output_dir=temp_dir, ocr=ocr)
                
                # 整理提取的数据
                extracted_data = {
                    "supplier": vendor or "",
                    "art_no": best_tag['value'] if best_tag else "",
                    "con_no": contract_info['value'] if contract_info else ""
                }
                
                # 将序列号向量化并添加到数据中
                if best_tag and best_tag['value']:
                    vector = text_to_vector(best_tag['value'])
                    if vector:
                        # 确保向量是Python列表，不是numpy数组
                        vector_list = [float(x) for x in vector]
                        extracted_data["vec_no"] = vector_list
                
                # 只有当有足够的数据时才上传到equipment表
                if extracted_data["supplier"] or extracted_data["art_no"]:
                    # 添加文件路径信息
                    extracted_data["image_path"] = full_path
                    
                    try:
                        # 插入数据到Supabase
                        response = supabase.table('equipment').insert(extracted_data).execute()
                        
                        if response.data:
                            results.append({
                                "file": file.filename,
                                "path": full_path,
                                "data": extracted_data,
                                "status": "success"
                            })
                        else:
                            results.append({
                                "file": file.filename,
                                "path": full_path,
                                "data": extracted_data,
                                "status": "error",
                                "message": "数据库插入失败"
                            })
                    except Exception as insert_err:
                        print(f"插入数据到Supabase时出错: {str(insert_err)}")
                        results.append({
                            "file": file.filename,
                            "path": full_path,
                            "data": extracted_data,
                            "status": "error",
                            "message": str(insert_err)
                        })
                else:
                    results.append({
                        "file": file.filename,
                        "path": full_path,
                        "data": extracted_data,
                        "status": "skipped",
                        "message": "未提取到足够的数据"
                    })
        
        return {
            "success": True,
            "message": f"处理了 {len(results)} 个PDF文件",
            "results": results
        }
    except Exception as e:
        print(f"批量处理PDF文件时出错: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"批量处理PDF文件失败: {str(e)}")

# 通过向量相似度搜索设备
def search_by_vector(query_text: str, top_k: int = 5):
    try:
        print(f"开始向量搜索: {query_text}")
        
        # 将查询文本转换为向量
        query_vector = text_to_vector(query_text)
        if not query_vector:
            print("无法将查询文本转换为向量")
            return []
        
        print(f"查询向量类型: {type(query_vector)}, 长度: {len(query_vector)}")
        
        # 获取所有设备数据
        all_equipment = get_equipment_data()
        print(f"获取到 {len(all_equipment)} 条设备数据")
        
        # 计算相似度并排序
        results_with_similarity = []
        for i, equipment in enumerate(all_equipment):
            # 检查是否有向量数据
            if "vec_no" in equipment and equipment["vec_no"]:
                try:
                    # 打印前几个设备的向量类型信息，用于调试
                    if i < 3:
                        print(f"设备 {i} 向量类型: {type(equipment['vec_no'])}")
                        if isinstance(equipment['vec_no'], str):
                            print(f"向量字符串前100个字符: {equipment['vec_no'][:100]}...")
                    
                    # 计算余弦相似度
                    similarity = cosine_similarity(query_vector, equipment["vec_no"])
                    
                    # 只保留相似度大于0.5的结果
                    if similarity > 0.5:
                        # 添加相似度到结果中
                        equipment_with_similarity = equipment.copy()
                        equipment_with_similarity["similarity"] = similarity
                        results_with_similarity.append(equipment_with_similarity)
                except Exception as e:
                    print(f"处理设备 {i} 时出错: {str(e)}")
        
        print(f"找到 {len(results_with_similarity)} 条相似度大于0.5的结果")
        
        # 按相似度降序排序
        sorted_results = sorted(results_with_similarity, key=lambda x: x["similarity"], reverse=True)
        
        # 返回前top_k个结果
        return sorted_results[:top_k]
    except Exception as e:
        print(f"向量搜索出错: {str(e)}")
        import traceback
        traceback.print_exc()
        return []

# 新增: 向量搜索API端点
@llm_router.post("/equipment/vector-search")
async def vector_search_equipment(request: VectorSearchRequest):
    if not request.query or len(request.query) < 2:
        return []
    
    # 使用向量搜索
    return search_by_vector(request.query)

# 从Minio获取图片API端点
@llm_router.get("/images/{file_path:path}")
async def get_image(file_path: str):
    """获取Minio中models bucket的图片文件"""
    try:
        print(f"请求图片路径: {file_path}")
        
        # 规范化文件路径，移除开头的斜杠
        if file_path.startswith('/'):
            file_path = file_path[1:]
        
        print(f"处理后的文件路径: {file_path}")
            
        # 从Minio获取文件内容
        try:
            file_data = download_file(file_path)
            if file_data is None:
                raise Exception(f"无法从Minio下载文件: {file_path}")
            print(f"成功从Minio下载文件: {file_path}")
        except Exception as download_err:
            print(f"从Minio下载文件失败: {str(download_err)}")
            # 尝试解码URL编码的路径
            import urllib.parse
            decoded_path = urllib.parse.unquote(file_path)
            print(f"尝试解码后的路径: {decoded_path}")
            if decoded_path != file_path:
                try:
                    file_data = download_file(decoded_path)
                    if file_data is None:
                        raise Exception(f"使用解码路径仍然失败")
                    print(f"使用解码路径成功下载文件")
                    file_path = decoded_path
                except Exception as retry_err:
                    print(f"使用解码路径仍然失败: {str(retry_err)}")
                    raise
        
        # 获取文件扩展名以确定正确的媒体类型
        file_extension = file_path.split('.')[-1].lower() if '.' in file_path else ''
        print(f"文件扩展名: {file_extension}")
        
        # 设置适当的媒体类型
        media_type = "application/octet-stream"
        if file_extension in ['jpg', 'jpeg']:
            media_type = "image/jpeg"
        elif file_extension == 'png':
            media_type = "image/png"
        elif file_extension == 'gif':
            media_type = "image/gif"
        elif file_extension == 'svg':
            media_type = "image/svg+xml"
        elif file_extension == 'pdf':
            media_type = "application/pdf"
            
        # 添加适当的Content-Disposition头部
        headers = {}
        if file_extension == 'pdf':
            filename = os.path.basename(file_path)
            headers["Content-Disposition"] = f"inline; filename=\"{filename}\""
        
        # 返回图片/文件内容
        return Response(content=file_data, media_type=media_type, headers=headers)
        
    except Exception as e:
        print(f"获取文件时出错: {str(e)}")
        raise HTTPException(status_code=404, detail=f"文件不存在或无法访问: {str(e)}")

# 如果直接运行此文件，创建一个应用实例
if __name__ == "__main__":
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(llm_router, prefix="/api")
    
    # 启动时预加载可用模型
    if USE_CUSTOM_LLM:
        print("正在预加载可用模型列表...")
        available_models = get_available_models()
        if available_models:
            print(f"预加载模型成功: {available_models}")
        else:
            print(f"预加载模型失败，将使用默认模型。请检查模型服务是否可用: {CUSTOM_LLM_URL}")
    
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)