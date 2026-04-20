from paddleocr import PaddleOCR
import os
import fitz  # PyMuPDF
import numpy as np
import cv2
import re
import json
import glob

def pdf_to_first_page_image(pdf_path):
    """将PDF文件的第一页转换为图像"""
    doc = fitz.open(pdf_path)
    if len(doc) == 0:
        return None
    
    # 只处理第一页
    page = doc.load_page(0)
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 放大2倍以提高清晰度
    img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n == 4:  # RGBA
        img_array = cv2.cvtColor(img_array, cv2.COLOR_RGBA2RGB)
    
    return img_array

def score_serial_number(text):
    """
    给文本作为序列号的可能性打分
    分数越高，越可能是序列号
    """
    score = 0
    
    # 检查是否包含字母和数字
    has_letter = bool(re.search(r'[a-zA-Z]', text))
    has_digit = bool(re.search(r'\d', text))
    
    if has_letter and has_digit:
        score += 3  # 同时包含字母和数字是很强的特征
    
    # 检查是否包含连字符或下划线
    if '-' in text:
        score += 2  # 连字符是序列号的常见特征
    if '_' in text:
        score += 1  # 下划线也是序列号的特征，但不如连字符常见
    
    # 检查长度，序列号通常不会太短
    if len(text) >= 8:
        score += 2  # 长度适中
    elif len(text) >= 5:
        score += 1  # 长度较短但可接受
    
    # 检查是否有特殊格式，如xxxx-xxxx-xxxx或类似格式
    if re.search(r'[a-zA-Z0-9]+-[a-zA-Z0-9]+-[a-zA-Z0-9]+', text):
        score += 3  # 多段式序列号，非常可能
    elif re.search(r'[a-zA-Z0-9]+-[a-zA-Z0-9]+', text):
        score += 2  # 双段式序列号，很可能
    
    # 检查数字和字母的比例，序列号通常有一定比例的数字
    digit_count = sum(c.isdigit() for c in text)
    digit_ratio = digit_count / len(text) if len(text) > 0 else 0
    if 0.3 <= digit_ratio <= 0.7:
        score += 1  # 数字比例适中
    
    # 排除一些明显不是序列号的文本
    excluded_words = ["page", "rev", "date", "drawing", "approved", "qty", "item"]
    for word in excluded_words:
        if word.lower() in text.lower():
            score -= 3  # 包含这些词的很可能不是序列号
    
    # 检查是否全部是数字，纯数字的可能性较低
    if text.isdigit():
        score -= 1
    
    # 检查是否包含常见的序列号前缀
    common_prefixes = ["SN-", "P/N", "PN-", "S/N", "REF-", "ID-"]
    for prefix in common_prefixes:
        if text.upper().startswith(prefix):
            score += 2  # 常见序列号前缀
    
    return score

def is_serial_number(text, threshold=3):
    """
    判断文本是否是序列号
    基于评分系统，分数超过阈值则认为是序列号
    """
    score = score_serial_number(text)
    return score >= threshold, score

def find_tag_info_from_json(json_dir):
    """
    从JSON文件中查找TAG信息，并识别真正的序列号
    """
    # 查找最新的JSON文件
    json_files = glob.glob(os.path.join(json_dir, "*.json"))
    if not json_files:
        print(f"在 {json_dir} 中未找到JSON文件")
        return []
    
    # 按修改时间排序，取最新的
    latest_json = max(json_files, key=os.path.getmtime)
    print(f"使用最新的JSON文件: {latest_json}")
    
    # 读取JSON文件
    with open(latest_json, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 直接从JSON中提取文本列表
    if "rec_texts" in data:
        texts = data["rec_texts"]
    else:
        print("JSON文件中未找到rec_texts字段")
        return []
    
    print(f"从JSON中提取了 {len(texts)} 个文本")
    
    # 查找关键词
    keywords = ["TAG:", "TAG：", "CONTRACT NO.", "Tag No.", "Tag No:", "TAG NO.", "TAG NO:", "Equipment Tag No."]
    all_found_tags = []  # 存储所有找到的TAG
    
    for i, text in enumerate(texts):
        # 检查当前文本是否包含关键词
        for keyword in keywords:
            if keyword.lower() in text.lower():
                print(f"找到关键词: {text} (索引: {i})")
                
                # 收集关键词周围可能的序列号
                candidates = []
                
                # 检查接下来的几个文本
                for j in range(i + 1, min(i + 5, len(texts))):
                    is_serial, score = is_serial_number(texts[j])
                    candidates.append({
                        'text': texts[j],
                        'is_serial': is_serial,
                        'score': score,
                        'index': j
                    })
                
                # 如果找到了候选项，按评分排序
                if candidates:
                    candidates.sort(key=lambda x: x['score'], reverse=True)
                    best_candidate = candidates[0]
                    
                    all_found_tags.append({
                        'keyword': text,
                        'value': best_candidate['text'],
                        'is_serial': best_candidate['is_serial'],
                        'score': best_candidate['score'],
                        'all_candidates': candidates
                    })
                    
                    print(f"关键词 '{text}' 最佳序列号候选: {best_candidate['text']} (评分: {best_candidate['score']})")
                
                break
    
    # 如果找到多个TAG，选择评分最高的作为最可能的序列号
    if len(all_found_tags) > 1:
        all_found_tags.sort(key=lambda x: x['score'], reverse=True)
        print(f"\n找到多个TAG，最可能的序列号是: {all_found_tags[0]['value']} (评分: {all_found_tags[0]['score']})")
    
    return all_found_tags

def find_vendor_from_json(json_dir, vendor_list):
    """
    从JSON文件中查找指定的供应商名称
    """
    # 查找最新的JSON文件
    json_files = glob.glob(os.path.join(json_dir, "*.json"))
    if not json_files:
        print(f"在 {json_dir} 中未找到JSON文件")
        return None
    
    # 按修改时间排序，取最新的
    latest_json = max(json_files, key=os.path.getmtime)
    print(f"使用最新的JSON文件: {latest_json}")
    
    # 读取JSON文件
    with open(latest_json, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 直接从JSON中提取文本列表
    if "rec_texts" in data:
        texts = data["rec_texts"]
    else:
        print("JSON文件中未找到rec_texts字段")
        return None
    
    print(f"从JSON中提取了 {len(texts)} 个文本")
    
    # 查找供应商名称
    found_vendor = None
    
    # 将所有文本转换为小写以进行不区分大小写的匹配
    texts_lower = [text.lower() for text in texts]
    
    for vendor in vendor_list:
        vendor_lower = vendor.lower()
        # 完全匹配
        if vendor_lower in texts_lower:
            idx = texts_lower.index(vendor_lower)
            found_vendor = texts[idx]
            print(f"找到供应商: {found_vendor}")
            return found_vendor
        
        # 部分匹配
        for i, text_lower in enumerate(texts_lower):
            if vendor_lower in text_lower:
                found_vendor = texts[i]
                print(f"找到供应商(部分匹配): {found_vendor}")
                return found_vendor
    
    print("未找到任何已知供应商")
    return None

def process_pdf_first_page(pdf_path, vendor_list, output_dir="output", ocr=None):
    """处理PDF文件的第一页并查找供应商和TAG信息"""
    os.makedirs(output_dir, exist_ok=True)
    page_dir = os.path.join(output_dir, "page_1")
    os.makedirs(page_dir, exist_ok=True)
    
    # 获取PDF第一页的图像
    img = pdf_to_first_page_image(pdf_path)
    if img is None:
        print(f"无法处理PDF: {pdf_path}")
        return None, None, None
    
    # 如果没有传入OCR对象，则创建一个新的
    if ocr is None:
        ocr = PaddleOCR(
            text_detection_model_name="PP-OCRv5_server_det",
            text_recognition_model_name="PP-OCRv5_server_rec",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False)
    
    # 对图像进行OCR识别
    result = ocr.predict(img)
    
    # 处理结果
    for res in result:
        res.print()
        res.save_to_img(page_dir)
        res.save_to_json(page_dir)
    
    # 从JSON文件中查找供应商信息
    vendor = find_vendor_from_json(page_dir, vendor_list)
    
    # 从JSON文件中查找TAG信息
    tag_info = find_tag_info_from_json(page_dir)
    
    # 输出找到的供应商信息
    if vendor:
        print(f"\n找到的供应商: {vendor}")
    else:
        print("\n未找到供应商")
    
    # 输出找到的TAG信息
    if tag_info:
        print("\n找到的TAG信息:")
        for tag in tag_info:
            serial_status = "是序列号" if tag.get('is_serial', False) else "可能不是序列号"
            print(f"{tag['keyword']}: {tag['value']} (评分: {tag['score']}, {serial_status})")
        
        # 输出最可能的序列号
        best_tag = max(tag_info, key=lambda x: x['score'])
        print(f"\n最可能的序列号是: {best_tag['value']} (评分: {best_tag['score']})")
    else:
        print("\n未找到TAG信息")
    
    return result, vendor, tag_info 