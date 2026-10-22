import json
import ntpath
import os
from urllib.parse import unquote, urlsplit, urlunsplit

import folder_paths

from .config import NON_MODEL_TYPES, canonical_type


def normalize_path(path):
    return str(path or "").strip().replace("\\", "/").removeprefix("./")


def path_key(path):
    return os.path.normcase(normalize_path(path))


def load_local_links():
    with open(os.path.join(os.path.dirname(__file__), "model_links.json"), encoding="utf-8") as file:
        links = json.load(file)
    if not isinstance(links, dict):
        raise ValueError("模型链接数据库格式错误")
    return links


def prepare_download_url(url):
    if not isinstance(url, str):
        raise ValueError("下载链接必须是网址")
    parsed = urlsplit(url.strip())
    if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("仅支持 HTTP/HTTPS 模型直链")
    parts = parsed.path.split("/")
    host = parsed.netloc
    if parsed.hostname in {"huggingface.co", "hf-mirror.com"}:
        host = "hf-mirror.com"
        if len(parts) > 3 and parts[3] == "blob":
            parts[3] = "resolve"
    elif parsed.hostname == "github.com" and len(parts) > 4 and parts[3] == "blob":
        host = "raw.githubusercontent.com"
        del parts[3]
    filename = unquote(parts[-1])
    validate_filename(filename)
    return urlunsplit((parsed.scheme, host, "/".join(parts), parsed.query, "")), filename


def validate_filename(filename):
    if not isinstance(filename, str) or not filename or filename in {".", ".."} or filename != filename.strip():
        raise ValueError("模型文件名无效")
    if any(char in filename for char in '\\/:*?"<>|') or any(ord(char) < 32 for char in filename):
        raise ValueError("模型文件名包含无效字符")
    reserved = {"CON", "PRN", "AUX", "NUL", *[f"COM{i}" for i in range(1, 10)], *[f"LPT{i}" for i in range(1, 10)]}
    if filename.endswith((".", " ")) or filename.split(".")[0].upper() in reserved:
        raise ValueError("模型文件名不能使用系统保留名称")
    return filename


def safe_subfolder(value):
    if not isinstance(value, str):
        raise ValueError("模型子目录必须是字符串")
    value = normalize_path(value)
    if not value:
        return ""
    if ntpath.splitdrive(value)[0] or value.startswith("/"):
        raise ValueError("模型子目录必须是相对路径")
    for part in value.split("/"):
        validate_filename(part)
    return value


def model_subfolder(value, model_type):
    normalized = normalize_path(value)
    if ntpath.splitdrive(normalized)[0] or normalized.startswith("/"):
        return ""
    parts = normalized.split("/")[:-1]
    if parts and parts[0].casefold() == "models":
        parts.pop(0)
    if parts and canonical_type(parts[0]) == canonical_type(model_type):
        parts.pop(0)
    try:
        return safe_subfolder("/".join(parts))
    except ValueError:
        return ""


def infer_url_type(url):
    path = unquote(urlsplit(url).path).casefold()
    segments = path.split("/")
    for name in ("diffusion_models", "text_encoders", "vae", "loras", "unet", "clip", "background_removal", "detection", "nlf"):
        if name in segments:
            return canonical_type(name)
    filename = segments[-1]
    if any(name in filename for name in ("vitpose", "yolov10", "mediapipe")):
        return "detection"
    if filename.startswith("nlf_l_multi"):
        return "nlf"
    return None


def resolve_download_path(model_type, subfolder, filename):
    model_type = canonical_type(model_type)
    if model_type in NON_MODEL_TYPES or model_type not in folder_paths.folder_names_and_paths:
        raise ValueError(f"未注册的模型类型：{model_type or '未知'}")
    roots = folder_paths.get_folder_paths(model_type)
    if not roots:
        raise ValueError("模型类型未配置保存目录")
    root = os.path.realpath(roots[0])
    subfolder = safe_subfolder(subfolder)
    filename = validate_filename(filename)
    target = os.path.realpath(os.path.join(root, *subfolder.split("/"), filename))
    if os.path.commonpath([root, target]) != root:
        raise ValueError("保存路径超出模型目录")
    return target
