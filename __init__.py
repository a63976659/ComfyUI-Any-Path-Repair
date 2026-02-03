import server
from .config import register_custom_paths
from .downloader import handle_download_request, handle_get_active_tasks, handle_cancel_request # 引入 handle_cancel_request
from .search import handle_fix_request

register_custom_paths()

@server.PromptServer.instance.routes.post("/model_path_fixer/fix")
async def route_fix(request):
    return await handle_fix_request(request)

@server.PromptServer.instance.routes.post("/model_path_fixer/download")
async def route_download(request):
    return await handle_download_request(request)

# [新增] 中断路由
@server.PromptServer.instance.routes.post("/model_path_fixer/cancel")
async def route_cancel(request):
    return await handle_cancel_request(request)

@server.PromptServer.instance.routes.get("/model_path_fixer/active_tasks")
async def route_active(request):
    return await handle_get_active_tasks(request)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web"
print("🔧 Model Path Fixer: Loaded (Console Progress + Cancel Support).")