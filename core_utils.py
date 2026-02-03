import os
import json

def normalize_path(path):
    if not path: return ""
    norm = path.replace("\\", "/")
    if norm.startswith("./"): norm = norm[2:]
    return norm.strip()

def load_local_links():
    try:
        current_dir = os.path.dirname(os.path.realpath(__file__))
        json_path = os.path.join(current_dir, "model_links.json")
        if os.path.exists(json_path):
            with open(json_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except: pass
    return {}

def parse_hf_url(url):
    """
    解析 Hugging Face URL。
    返回: (repo_id, path_in_repo)
    注意：path_in_repo 可能包含子文件夹 (如 split_files/vae/model.pt)，
    调用者(downloader)需要决定是否保留这些子文件夹。
    """
    if "huggingface.co" not in url and "hf-mirror.com" not in url: return None, None
    
    clean_url = url.replace("https://", "").replace("http://", "")
    parts = clean_url.split("/")
    
    if len(parts) < 5: return None, None
    
    try:
        repo_id = f"{parts[1]}/{parts[2]}"
        filename = ""
        
        # 提取 URL 中的文件路径部分
        if "resolve" in parts:
            idx = parts.index("resolve")
            # idx+2 跳过了 branch (例如 main)
            filename = "/".join(parts[idx+2:])
        elif "blob" in parts:
            idx = parts.index("blob")
            filename = "/".join(parts[idx+2:])
        else:
            filename = parts[-1]
            
        return repo_id, filename
    except:
        return None, os.path.basename(url)