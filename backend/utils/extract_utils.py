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
    
    # 检查是否包含字母和数字（必须条件）
    has_letter = bool(re.search(r'[a-zA-Z]', text))
    has_digit = bool(re.search(r'\d', text))
    
    # 如果不包含数字，直接返回极低的分数
    if not has_digit:
        return -10
    
    if has_letter and has_digit:
        score += 3  # 同时包含字母和数字是很强的特征
    
    # 检查是否只包含字母、数字和连字符
    if re.match(r'^[a-zA-Z0-9\-_]+$', text):
        score += 2  # 只包含合法字符
    else:
        score -= 2  # 包含其他字符，降低可能性
    
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
    
    # 从JSON中提取文本和坐标信息
    texts = []
    boxes = []
    
    # 处理PaddleOCR的不同JSON格式
    if "rec_texts" in data and "dt_polys" in data:
        # 新版PaddleOCR格式
        texts = data["rec_texts"]
        boxes = data["dt_polys"]
        print(f"使用PaddleOCR标准格式，找到 {len(texts)} 个文本和 {len(boxes)} 个坐标框")
    elif "rec_res" in data:
        # 旧版PaddleOCR格式
        for item in data["rec_res"]:
            if len(item) >= 2:
                text = item[0]
                box = item[1]
                texts.append(text)
                boxes.append(box)
        print(f"使用PaddleOCR旧格式，找到 {len(texts)} 个文本")
    else:
        print("JSON文件中未找到文本和坐标信息")
        return []
    
    if len(texts) != len(boxes):
        print(f"警告：文本数量 ({len(texts)}) 与坐标框数量 ({len(boxes)}) 不匹配")
        return []
    
    # 查找关键词
    keywords = ["TAG:", "TAG：", "TAG", "Tag No.", "Tag No:", "TAG NO.", "TAG NO:"]
    all_found_tags = []  # 存储所有找到的TAG
    
    # 定义判断文本位置关系的函数
    def is_to_right(box1, box2, threshold=0.5):
        """判断box2是否在box1的右侧"""
        # box1的右边界
        right_x = max(point[0] for point in box1)
        # box2的左边界
        left_x = min(point[0] for point in box2)
        
        # box1和box2的垂直范围
        box1_top = min(point[1] for point in box1)
        box1_bottom = max(point[1] for point in box1)
        box2_top = min(point[1] for point in box2)
        box2_bottom = max(point[1] for point in box2)
        
        # 计算垂直重叠比例
        overlap_top = max(box1_top, box2_top)
        overlap_bottom = min(box1_bottom, box2_bottom)
        if overlap_bottom <= overlap_top:
            return False  # 没有垂直重叠
        
        overlap_height = overlap_bottom - overlap_top
        box1_height = box1_bottom - box1_top
        box2_height = box2_bottom - box2_top
        min_height = min(box1_height, box2_height)
        
        # 如果重叠高度超过阈值且box2在box1右侧
        return overlap_height / min_height > threshold and left_x > right_x
    
    def is_below(box1, box2, threshold=0.3):
        """判断box2是否在box1的下方"""
        # box1的下边界
        bottom_y = max(point[1] for point in box1)
        # box2的上边界
        top_y = min(point[1] for point in box2)
        
        # box1和box2的水平范围
        box1_left = min(point[0] for point in box1)
        box1_right = max(point[0] for point in box1)
        box2_left = min(point[0] for point in box2)
        box2_right = max(point[0] for point in box2)
        
        # 计算水平重叠比例
        overlap_left = max(box1_left, box2_left)
        overlap_right = min(box1_right, box2_right)
        if overlap_right <= overlap_left:
            return False  # 没有水平重叠
        
        overlap_width = overlap_right - overlap_left
        box1_width = box1_right - box1_left
        box2_width = box2_right - box2_left
        min_width = min(box1_width, box2_width)
        
        # 如果重叠宽度超过阈值且box2在box1下方
        return overlap_width / min_width > threshold and top_y > bottom_y
    
    for i, text in enumerate(texts):
        # 检查当前文本是否包含关键词
        for keyword in keywords:
            if keyword.lower() in text.lower():
                print(f"找到关键词: {text} (索引: {i})")
                keyword_box = boxes[i]
                
                # 查找右侧的第一个文本
                right_candidates = []
                for j, candidate_text in enumerate(texts):
                    if i != j and is_to_right(keyword_box, boxes[j]):
                        right_candidates.append((j, candidate_text, boxes[j]))
                
                # 如果找到右侧文本，选择最近的一个（水平距离最小）
                if right_candidates:
                    # 按照水平距离排序
                    right_candidates.sort(key=lambda x: min(point[0] for point in x[2]) - max(point[0] for point in keyword_box))
                    j, right_text, _ = right_candidates[0]  # 取第一个（最近的）
                    
                    is_serial, score = is_serial_number(right_text, threshold=3)
                    if is_serial:
                        all_found_tags.append({
                            'keyword': text,
                            'value': right_text,
                            'position': 'right',
                            'is_serial': is_serial,
                            'score': score
                        })
                        print(f"关键词 '{text}' 右侧的文本: {right_text} (评分: {score}, 是有效序列号)")
                    else:
                        print(f"关键词 '{text}' 右侧的文本: {right_text} (评分: {score}, 不是有效序列号)")
                
                # 查找下方的第一个文本
                below_candidates = []
                for j, candidate_text in enumerate(texts):
                    if i != j and is_below(keyword_box, boxes[j]):
                        below_candidates.append((j, candidate_text, boxes[j]))
                
                # 如果找到下方文本，选择最近的一个（垂直距离最小）
                if below_candidates:
                    # 按照垂直距离排序
                    below_candidates.sort(key=lambda x: min(point[1] for point in x[2]) - max(point[1] for point in keyword_box))
                    j, below_text, _ = below_candidates[0]  # 取第一个（最近的）
                    
                    is_serial, score = is_serial_number(below_text, threshold=3)
                    if is_serial:
                        all_found_tags.append({
                            'keyword': text,
                            'value': below_text,
                            'position': 'below',
                            'is_serial': is_serial,
                            'score': score
                        })
                        print(f"关键词 '{text}' 下方的文本: {below_text} (评分: {score}, 是有效序列号)")
                    else:
                        print(f"关键词 '{text}' 下方的文本: {below_text} (评分: {score}, 不是有效序列号)")
                
                break
    
    # 如果没有找到TAG关键词或没有找到有效的序列号，直接从所有OCR文本中寻找符合条件的序列号
    if len(all_found_tags) == 0:
        print("\n未找到TAG关键词或有效序列号，尝试从所有OCR文本中寻找...")
        
        # 对所有文本进行评分，找出可能的序列号
        potential_serials = []
        for i, text in enumerate(texts):
            is_serial, score = is_serial_number(text, threshold=3)
            if is_serial:
                potential_serials.append({
                    'value': text,
                    'score': score
                })
        
        # 按评分从高到低排序
        potential_serials.sort(key=lambda x: x['score'], reverse=True)
        
        # 取前三个作为可能的序列号
        top_serials = potential_serials[:3]
        
        if top_serials:
            # 将前三个序列号用逗号连接
            combined_value = ','.join([serial['value'] for serial in top_serials])
            
            # 创建一个组合的TAG信息
            all_found_tags.append({
                'keyword': 'AUTO_DETECTED',
                'value': combined_value,
                'position': 'auto',
                'is_serial': True,
                'score': top_serials[0]['score']  # 使用最高分作为整体评分
            })
            
            print(f"\n自动检测到的序列号: {combined_value}")
            for i, serial in enumerate(top_serials):
                print(f"  序列号 {i+1}: {serial['value']} (评分: {serial['score']})")
    
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
    
    # 第一步：尝试精确匹配
    for vendor in vendor_list:
        vendor_lower = vendor.lower()
        # 完全匹配
        if vendor_lower in texts_lower:
            idx = texts_lower.index(vendor_lower)
            found_vendor = texts[idx]
            print(f"找到供应商(精确匹配): {found_vendor}")
            return vendor  # 返回字典中的标准名称
        
        # 部分匹配
        for i, text_lower in enumerate(texts_lower):
            if vendor_lower in text_lower:
                found_vendor = texts[i]
                print(f"找到供应商(部分匹配): {found_vendor}")
                return vendor  # 返回字典中的标准名称
    
    # 第二步：如果精确匹配失败，尝试模糊匹配
    print("未找到精确匹配的供应商，尝试模糊匹配...")
    
    # 计算字符串相似度的函数
    def string_similarity(s1, s2):
        """计算两个字符串的相似度，返回0-1之间的值，1表示完全相同"""
        from difflib import SequenceMatcher
        return SequenceMatcher(None, s1, s2).ratio()
    
    best_match = None
    best_similarity = 0.6  # 设置相似度阈值，低于此值认为不匹配
    best_vendor = None
    
    for vendor in vendor_list:
        vendor_lower = vendor.lower()
        for i, text_lower in enumerate(texts_lower):
            similarity = string_similarity(vendor_lower, text_lower)
            if similarity > best_similarity:
                best_similarity = similarity
                best_match = texts[i]
                best_vendor = vendor
    
    if best_match:
        print(f"找到供应商(模糊匹配): OCR文本 '{best_match}' 与供应商 '{best_vendor}' 相似度为 {best_similarity:.2f}")
        return best_vendor  # 返回字典中的标准名称
    
    print("未找到任何匹配的供应商")
    return None

def find_contract_no_from_json(json_dir):
    """
    从JSON文件中查找合同号信息，并识别最可能的合同号
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
    
    # 从JSON中提取文本和坐标信息
    texts = []
    boxes = []
    
    # 处理PaddleOCR的不同JSON格式
    if "rec_texts" in data and "dt_polys" in data:
        # 新版PaddleOCR格式
        texts = data["rec_texts"]
        boxes = data["dt_polys"]
        print(f"使用PaddleOCR标准格式，找到 {len(texts)} 个文本和 {len(boxes)} 个坐标框")
    elif "rec_res" in data:
        # 旧版PaddleOCR格式
        for item in data["rec_res"]:
            if len(item) >= 2:
                text = item[0]
                box = item[1]
                texts.append(text)
                boxes.append(box)
        print(f"使用PaddleOCR旧格式，找到 {len(texts)} 个文本")
    else:
        print("JSON文件中未找到文本和坐标信息")
        return None
    
    if len(texts) != len(boxes):
        print(f"警告：文本数量 ({len(texts)}) 与坐标框数量 ({len(boxes)}) 不匹配")
        return None
    
    # 查找关键词
    keywords = ["CONTRACT NO.", "CONTRACT NO:", "CONTRACT NO：", "CONTRACT NO"]
    all_found_contracts = []  # 存储所有找到的合同号
    
    # 定义判断文本位置关系的函数
    def is_to_right(box1, box2, threshold=0.5):
        """判断box2是否在box1的右侧"""
        # box1的右边界
        right_x = max(point[0] for point in box1)
        # box2的左边界
        left_x = min(point[0] for point in box2)
        
        # box1和box2的垂直范围
        box1_top = min(point[1] for point in box1)
        box1_bottom = max(point[1] for point in box1)
        box2_top = min(point[1] for point in box2)
        box2_bottom = max(point[1] for point in box2)
        
        # 计算垂直重叠比例
        overlap_top = max(box1_top, box2_top)
        overlap_bottom = min(box1_bottom, box2_bottom)
        if overlap_bottom <= overlap_top:
            return False  # 没有垂直重叠
        
        overlap_height = overlap_bottom - overlap_top
        box1_height = box1_bottom - box1_top
        box2_height = box2_bottom - box2_top
        min_height = min(box1_height, box2_height)
        
        # 如果重叠高度超过阈值且box2在box1右侧
        return overlap_height / min_height > threshold and left_x > right_x
    
    def is_below(box1, box2, threshold=0.3):
        """判断box2是否在box1的下方"""
        # box1的下边界
        bottom_y = max(point[1] for point in box1)
        # box2的上边界
        top_y = min(point[1] for point in box2)
        
        # box1和box2的水平范围
        box1_left = min(point[0] for point in box1)
        box1_right = max(point[0] for point in box1)
        box2_left = min(point[0] for point in box2)
        box2_right = max(point[0] for point in box2)
        
        # 计算水平重叠比例
        overlap_left = max(box1_left, box2_left)
        overlap_right = min(box1_right, box2_right)
        if overlap_right <= overlap_left:
            return False  # 没有水平重叠
        
        overlap_width = overlap_right - overlap_left
        box1_width = box1_right - box1_left
        box2_width = box2_right - box2_left
        min_width = min(box1_width, box2_width)
        
        # 如果重叠宽度超过阈值且box2在box1下方
        return overlap_width / min_width > threshold and top_y > bottom_y
    
    # 定义合同号评分函数
    def score_contract_number(text):
        """
        给文本作为合同号的可能性打分
        分数越高，越可能是合同号
        """
        score = 0
        
        # 检查是否包含数字（必须条件）
        has_digit = bool(re.search(r'\d', text))
        has_letter = bool(re.search(r'[a-zA-Z]', text))
        
        # 如果不包含数字，直接返回极低的分数
        if not has_digit:
            return -10
        
        # 检查是否只包含字母、数字和连字符
        if re.match(r'^[a-zA-Z0-9\-_]+$', text):
            score += 3  # 只包含合法字符
        else:
            score -= 2  # 包含其他字符，降低可能性
        
        # 同时包含字母和数字
        if has_letter and has_digit:
            score += 2
        
        # 检查是否包含连字符
        if '-' in text:
            score += 2  # 连字符是合同号的常见特征
        
        # 检查长度，合同号通常不会太短
        if 8 <= len(text) <= 20:
            score += 2  # 长度适中
        elif len(text) > 20:
            score -= 1  # 太长可能不是合同号
        elif len(text) < 5:
            score -= 2  # 太短可能不是合同号
        
        # 检查是否有特殊格式，如xxxx-xxxx-xxxx或类似格式
        if re.search(r'[a-zA-Z0-9]+-[a-zA-Z0-9]+-[a-zA-Z0-9]+', text):
            score += 3  # 多段式合同号，非常可能
        elif re.search(r'[a-zA-Z0-9]+-[a-zA-Z0-9]+', text):
            score += 2  # 双段式合同号，很可能
        
        # 检查数字和字母的比例
        digit_count = sum(c.isdigit() for c in text)
        digit_ratio = digit_count / len(text) if len(text) > 0 else 0
        if 0.3 <= digit_ratio <= 0.7:
            score += 1  # 数字比例适中
        
        return score
    
    # 判断是否是有效的合同号
    def is_valid_contract_number(text, threshold=3):
        """判断文本是否是有效的合同号"""
        score = score_contract_number(text)
        return score >= threshold, score
    
    for i, text in enumerate(texts):
        # 检查当前文本是否包含关键词
        for keyword in keywords:
            if keyword.lower() in text.lower():
                print(f"找到合同号关键词: {text} (索引: {i})")
                keyword_box = boxes[i]
                
                # 查找右侧的第一个文本
                right_candidates = []
                for j, candidate_text in enumerate(texts):
                    if i != j and is_to_right(keyword_box, boxes[j]):
                        right_candidates.append((j, candidate_text, boxes[j]))
                
                # 如果找到右侧文本，选择最近的一个（水平距离最小）
                if right_candidates:
                    # 按照水平距离排序
                    right_candidates.sort(key=lambda x: min(point[0] for point in x[2]) - max(point[0] for point in keyword_box))
                    j, right_text, _ = right_candidates[0]  # 取第一个（最近的）
                    
                    # 使用专门的合同号评分函数
                    is_valid, score = is_valid_contract_number(right_text, threshold=3)
                    if is_valid:
                        all_found_contracts.append({
                            'keyword': text,
                            'value': right_text,
                            'position': 'right',
                            'score': score
                        })
                        print(f"合同号关键词 '{text}' 右侧的文本: {right_text} (评分: {score}, 是有效合同号)")
                    else:
                        print(f"合同号关键词 '{text}' 右侧的文本: {right_text} (评分: {score}, 不是有效合同号)")
                
                # 查找下方的第一个文本
                below_candidates = []
                for j, candidate_text in enumerate(texts):
                    if i != j and is_below(keyword_box, boxes[j]):
                        below_candidates.append((j, candidate_text, boxes[j]))
                
                # 如果找到下方文本，选择最近的一个（垂直距离最小）
                if below_candidates:
                    # 按照垂直距离排序
                    below_candidates.sort(key=lambda x: min(point[1] for point in x[2]) - max(point[1] for point in keyword_box))
                    j, below_text, _ = below_candidates[0]  # 取第一个（最近的）
                    
                    # 使用专门的合同号评分函数
                    is_valid, score = is_valid_contract_number(below_text, threshold=3)
                    if is_valid:
                        all_found_contracts.append({
                            'keyword': text,
                            'value': below_text,
                            'position': 'below',
                            'score': score
                        })
                        print(f"合同号关键词 '{text}' 下方的文本: {below_text} (评分: {score}, 是有效合同号)")
                    else:
                        print(f"合同号关键词 '{text}' 下方的文本: {below_text} (评分: {score}, 不是有效合同号)")
                
                break
    
    # 定义best_contract默认为None
    best_contract = None
    
    # 如果找到多个合同号，选择评分最高的作为最可能的合同号
    if len(all_found_contracts) > 1:
        all_found_contracts.sort(key=lambda x: x['score'], reverse=True)
        best_contract = all_found_contracts[0]
        print(f"\n找到多个合同号，最可能的合同号是: {best_contract['value']} (评分: {best_contract['score']})")
    elif len(all_found_contracts) == 1:
        best_contract = all_found_contracts[0]
        print(f"\n只找到一个合同号: {best_contract['value']} (评分: {best_contract['score']})")
    
    # 输出找到的合同号信息
    if best_contract:
        return best_contract
    else:
        print("\n未找到合同号信息")
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
        return None, None, [], None, None
    
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
    
    # 从JSON文件中查找合同号信息
    contract_info = find_contract_no_from_json(page_dir)
    
    # 输出找到的供应商信息
    if vendor:
        print(f"\n找到的供应商: {vendor}")
    else:
        print("\n未找到供应商")
    
    # 定义best_tag默认为None
    best_tag = None
    
    # 输出找到的TAG信息
    if tag_info and len(tag_info) > 0:
        print("\n找到的TAG信息:")
        for tag in tag_info:
            serial_status = "是序列号" if tag.get('is_serial', False) else "可能不是序列号"
            position = tag.get('position', '未知')
            print(f"{tag['keyword']}: {tag['value']} (位置: {position}, 评分: {tag['score']}, {serial_status})")
        
        # 输出最可能的序列号
        best_tag = max(tag_info, key=lambda x: x['score'])
        position = best_tag.get('position', '未知')
        
        # 检查是否是自动检测的序列号
        if position == 'auto':
            print(f"\n使用自动检测的序列号组合: {best_tag['value']}")
        else:
            print(f"\n最可能的序列号是: {best_tag['value']} (位置: {position}, 评分: {best_tag['score']})")
    else:
        print("\n未找到TAG信息")
    
    return result, vendor, tag_info, best_tag, contract_info