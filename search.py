import asyncio
import os

import folder_paths
from aiohttp import web

from .config import canonical_type, resolve_model_type
from .core_utils import infer_url_type, load_local_links, model_subfolder, normalize_path, path_key


def build_file_index(model_types):
    index = {}
    for model_type in set(model_types):
        by_name = {}
        if model_type in {"LLM", "TTS"}:
            files = []
            for root in folder_paths.get_folder_paths(model_type):
                if os.path.isdir(root):
                    files.extend(name for name in os.listdir(root) if os.path.isdir(os.path.join(root, name)))
        elif model_type in folder_paths.folder_names_and_paths:
            files = folder_paths.get_filename_list(model_type)
        else:
            files = []
        for filename in files:
            by_name.setdefault(normalize_path(filename).rsplit("/", 1)[-1].casefold(), []).append(filename)
        index[model_type] = by_name
    return index


def find_download_link(basename, model_type, databases):
    for database in databases:
        matches = []
        for category, links in database.items():
            if not isinstance(links, dict):
                continue
            category_type = canonical_type(category)
            if model_type and category_type not in {model_type, "uncategorized"}:
                continue
            for name, url in links.items():
                if name.casefold() == basename and isinstance(url, str):
                    priority = 0 if model_type and category_type == model_type else 1
                    matches.append((priority, url, model_type or (category_type if category != "uncategorized" else infer_url_type(url))))
        if matches:
            priority = min(match[0] for match in matches)
            unique = list(dict.fromkeys((url, category) for rank, url, category in matches if rank == priority))
            if len(unique) == 1:
                return unique[0]
            return None, model_type
    return None, model_type


def scan_models(queries, dynamic_links):
    prepared = []
    for item in queries:
        if not isinstance(item, dict) or not isinstance(item.get("type"), str) or not isinstance(item.get("node_type"), str):
            raise ValueError("模型查询格式错误")
        value = item.get("current_val", "")
        if not isinstance(value, str):
            raise ValueError("模型路径必须是字符串")
        options = item.get("options")
        if options is not None and (not isinstance(options, list) or any(not isinstance(option, str) for option in options)):
            raise ValueError("模型候选选项格式错误")
        prepared.append((item, value, options, resolve_model_type(item["type"], item["node_type"], value)))
    required_types = {model_type for _, _, options, model_type in prepared if options is None and model_type}
    file_index = build_file_index(required_types)
    local_links = load_local_links()
    results = []
    for item, value, options, model_type in prepared:
        basename = normalize_path(value).rsplit("/", 1)[-1].casefold()
        if options is not None:
            if value and value in options:
                continue
            candidates = [option for option in options if basename and normalize_path(option).rsplit("/", 1)[-1].casefold() == basename]
        else:
            candidates = file_index.get(model_type, {}).get(basename, [])
            if value and path_key(value) in {path_key(candidate) for candidate in candidates}:
                continue
        candidates = list(dict.fromkeys(candidates))
        url, download_type = (None, model_type) if candidates else find_download_link(basename, model_type, (dynamic_links, local_links))
        results.append({
            "id": item.get("id"), "widget_name": item["type"], "old_value": value,
            "candidates": candidates, "download_url": url, "model_type": download_type,
            "subfolder": model_subfolder(value, download_type),
        })
    return results


async def handle_fix_request(request):
    try:
        data = await request.json()
        if not isinstance(data, dict) or not isinstance(data.get("queries"), list) or not isinstance(data.get("dynamic_links", {}), dict):
            raise ValueError("扫描参数格式错误")
        results = await asyncio.to_thread(scan_models, data["queries"], data.get("dynamic_links", {}))
        return web.json_response({"fixed": results})
    except ValueError as error:
        return web.json_response({"error": str(error)}, status=400)
    except Exception as error:
        return web.json_response({"error": f"模型扫描失败：{error}"}, status=500)
