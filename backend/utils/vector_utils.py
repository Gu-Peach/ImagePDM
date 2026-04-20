import torch
from sentence_transformers import SentenceTransformer
import numpy as np
import os
from pathlib import Path

# 加载模型
model = None

def load_model():
    """
    加载向量化模型，如果模型已加载则直接返回
    直接使用本地模型
    """
    global model
    if model is None:
        # 本地模型路径，可以根据实际情况修改
        local_model_path = "E:\model\m3e-base"
        
        try:
            print(f"正在从本地路径加载模型: {local_model_path}")
            model = SentenceTransformer(local_model_path)
            print("本地模型加载成功")
        except Exception as e:
            print(f"加载本地模型失败: {str(e)}")
            raise
    
    return model

def text_to_vector(text):
    """
    将文本转换为向量
    
    参数:
        text (str): 需要向量化的文本
        
    返回:
        list: 文本的向量表示，转换为Python列表
    """
    if not text:
        return None
    
    # 确保模型已加载
    model = load_model()
    
    # 将文本转换为向量
    with torch.no_grad():
        embedding = model.encode(text)
    
    # 将numpy数组转换为Python列表，以便存储到数据库
    return embedding.tolist()

def cosine_similarity(vec1, vec2):
    """
    计算两个向量之间的余弦相似度
    
    参数:
        vec1 (list): 第一个向量
        vec2 (list): 第二个向量
        
    返回:
        float: 余弦相似度，范围为[-1, 1]
    """
    if vec1 is None or vec2 is None:
        return 0.0
    
    # 转换为numpy数组，确保类型为float
    try:
        # 如果是字符串表示的列表，先转换为Python列表
        if isinstance(vec1, str):
            import json
            try:
                vec1 = json.loads(vec1)
            except:
                print(f"无法解析向量字符串: {vec1[:100]}...")
                return 0.0
                
        if isinstance(vec2, str):
            import json
            try:
                vec2 = json.loads(vec2)
            except:
                print(f"无法解析向量字符串: {vec2[:100]}...")
                return 0.0
        
        # 转换为numpy数组并确保是float类型
        vec1 = np.array(vec1, dtype=float)
        vec2 = np.array(vec2, dtype=float)
        
        # 计算余弦相似度
        dot_product = np.dot(vec1, vec2)
        norm_vec1 = np.linalg.norm(vec1)
        norm_vec2 = np.linalg.norm(vec2)
        
        if norm_vec1 == 0 or norm_vec2 == 0:
            return 0.0
        
        return dot_product / (norm_vec1 * norm_vec2)
    except Exception as e:
        print(f"计算余弦相似度出错: {str(e)}")
        return 0.0 