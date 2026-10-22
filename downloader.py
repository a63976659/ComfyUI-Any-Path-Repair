import asyncio
import logging
import os
import threading
import time
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import server
from aiohttp import web

from .config import canonical_type
from .core_utils import infer_url_type, prepare_download_url, resolve_download_path


ACTIVE_STATES = {"queued", "downloading", "cancelling"}


@dataclass
class DownloadTask:
    id: str
    url: str
    filename: str
    model_type: str
    subfolder: str
    path: str
    status: str = "queued"
    current: int = 0
    total: int = 0
    error: str = ""
    revision: int = 0
    updated_at: float = field(default_factory=time.time)
    cancel_event: threading.Event = field(default_factory=threading.Event, repr=False)

    def public(self):
        return {name: getattr(self, name) for name in (
            "id", "url", "filename", "model_type", "subfolder", "path",
            "status", "current", "total", "error", "revision", "updated_at",
        )}


class DownloadManager:
    def __init__(self, max_workers=3):
        self.tasks = {}
        self.lock = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="path-fixer")

    def _notify(self, snapshot):
        try:
            server.PromptServer.instance.send_sync("model_fixer_task", snapshot)
        except Exception:
            logging.exception("[Path-Fixer] 下载状态通知失败，请重新打开修复面板查看")

    def _prune(self):
        finished = sorted((task for task in self.tasks.values() if task.status not in ACTIVE_STATES), key=lambda task: task.updated_at)
        for task in finished[:-128]:
            del self.tasks[task.id]

    def _update(self, task, **changes):
        with self.lock:
            for name, value in changes.items():
                setattr(task, name, value)
            task.revision += 1
            task.updated_at = time.time()
            snapshot = task.public()
            self._prune()
        self._notify(snapshot)

    def snapshots(self):
        with self.lock:
            return [task.public() for task in self.tasks.values()]

    def refresh_tasks(self):
        with self.lock:
            completed = [task for task in self.tasks.values() if task.status == "completed"]
        for task in completed:
            try:
                valid = os.path.isfile(task.path) and os.path.getsize(task.path) > 0
            except OSError:
                valid = False
            if not valid:
                self._update(task, status="failed", error="文件已被移动、删除或清空，可重新下载")
        return self.snapshots()

    def start(self, url, model_type, subfolder="", filename=None):
        url, url_filename = prepare_download_url(url)
        model_type = canonical_type(model_type) or infer_url_type(url)
        filename = filename or url_filename
        path = resolve_download_path(model_type, subfolder, filename)
        with self.lock:
            for task in self.tasks.values():
                if os.path.normcase(task.path) == os.path.normcase(path) and task.status in ACTIVE_STATES:
                    return task.public()
            task = DownloadTask(uuid.uuid4().hex, url, filename, model_type, subfolder, path)
            if os.path.exists(path):
                if not os.path.isfile(path) or os.path.getsize(path) == 0:
                    raise ValueError("目标位置已有无效文件或目录，请检查后重试")
                task.status = "completed"
                task.current = task.total = os.path.getsize(path)
            self.tasks[task.id] = task
            self._prune()
            snapshot = task.public()
        self._notify(snapshot)
        if task.status == "queued":
            try:
                self.executor.submit(self._run, task)
            except RuntimeError as error:
                self._update(task, status="failed", error=str(error))
                raise
        return snapshot

    def cancel(self, task_id):
        with self.lock:
            task = self.tasks.get(task_id)
            if task is None:
                raise ValueError("下载任务不存在")
            if task.status not in ACTIVE_STATES:
                return task.public()
            task.cancel_event.set()
            task.status = "cancelled" if task.status == "queued" else "cancelling"
            task.revision += 1
            task.updated_at = time.time()
            snapshot = task.public()
        self._notify(snapshot)
        return snapshot

    def _run(self, task):
        part_path = task.path + "." + task.id + ".part"
        try:
            if task.cancel_event.is_set():
                raise InterruptedError("下载已取消")
            self._update(task, status="downloading")
            os.makedirs(os.path.dirname(task.path), exist_ok=True)
            request = urllib.request.Request(task.url, headers={"User-Agent": "ComfyUI-Any-Path-Repair"})
            with urllib.request.urlopen(request, timeout=30) as response:
                content_type = response.info().get("Content-Type", "").lower()
                if "text/html" in content_type:
                    raise ValueError("链接返回了网页，请使用模型文件直链")
                total = int(response.info().get("Content-Length", 0))
                downloaded = 0
                last_report = 0
                self._update(task, total=total)
                with open(part_path, "xb") as output:
                    while True:
                        if task.cancel_event.is_set():
                            raise InterruptedError("下载已取消")
                        block = response.read(256 * 1024)
                        if not block:
                            break
                        output.write(block)
                        downloaded += len(block)
                        now = time.monotonic()
                        if now - last_report >= 0.5:
                            self._update(task, current=downloaded)
                            last_report = now
                    output.flush()
                    os.fsync(output.fileno())
                if task.cancel_event.is_set():
                    raise InterruptedError("下载已取消")
                if downloaded == 0 or (total and downloaded != total):
                    raise ValueError(f"下载不完整：收到 {downloaded} 字节，预期 {total or '非空文件'}")
            with self.lock:
                try:
                    if os.name == "nt":
                        os.rename(part_path, task.path)
                    else:
                        os.link(part_path, task.path)
                except FileExistsError:
                    raise FileExistsError("目标文件已由其他操作创建，本次下载未覆盖它") from None
            self._update(task, status="completed", current=downloaded, total=total or downloaded)
        except InterruptedError as error:
            self._update(task, status="cancelled", error=str(error))
        except Exception as error:
            self._update(task, status="failed", error=str(error))
        finally:
            if os.path.exists(part_path):
                try:
                    os.remove(part_path)
                except OSError:
                    logging.exception("[Path-Fixer] 无法清理下载临时文件：%s", part_path)


download_manager = DownloadManager()


async def handle_download_request(request):
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError("下载参数格式错误")
        task = await asyncio.to_thread(
            download_manager.start, data.get("url"), data.get("model_type"),
            data.get("subfolder", ""), data.get("filename"),
        )
        return web.json_response({"success": True, "task": task})
    except (ValueError, TypeError) as error:
        return web.json_response({"error": str(error)}, status=400)
    except Exception as error:
        return web.json_response({"error": f"无法启动下载：{error}"}, status=500)


async def handle_cancel_request(request):
    try:
        data = await request.json()
        if not isinstance(data, dict) or not isinstance(data.get("task_id"), str):
            raise ValueError("缺少下载任务编号")
        return web.json_response({"success": True, "task": download_manager.cancel(data["task_id"])})
    except ValueError as error:
        return web.json_response({"error": str(error)}, status=400)


async def handle_get_active_tasks(request):
    return web.json_response({"tasks": await asyncio.to_thread(download_manager.refresh_tasks)})
