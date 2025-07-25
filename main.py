from utils.downloader import (
    download_file,
    get_file_info_from_url,
)
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager
import aiofiles
from fastapi import FastAPI, HTTPException, Request, File, UploadFile, Form, Response
from fastapi.responses import FileResponse, JSONResponse
from config import ADMIN_PASSWORD, MAX_FILE_SIZE, STORAGE_CHANNEL
from utils.clients import initialize_clients
from utils.directoryHandler import getRandomID
from utils.extra import auto_ping_website, convert_class_to_dict, reset_cache_dir
from utils.streamer import media_streamer
from utils.uploader import start_file_uploader
from utils.logger import Logger
import urllib.parse


# Startup Event
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Reset the cache directory, delete cache files
    reset_cache_dir()

    # Initialize the clients
    await initialize_clients()

    # Start the website auto ping task
    asyncio.create_task(auto_ping_website())

    yield


app = FastAPI(docs_url=None, redoc_url=None, lifespan=lifespan)
logger = Logger(__name__)


@app.get("/")
async def home_page():
    return FileResponse("website/home.html")


@app.get("/stream")
async def stream_page():
    return FileResponse("website/VideoPlayer.html")


@app.get("/fast-player")
async def fast_player_page():
    return FileResponse("website/FastPlayer.html")


@app.get("/pdf-viewer")
async def pdf_viewer_page():
    return FileResponse("website/PDFViewer.html")


@app.get("/static/{file_path:path}")
async def static_files(file_path):
    if "apiHandler.js" in file_path:
        with open(Path("website/static/js/apiHandler.js")) as f:
            content = f.read()
            content = content.replace("MAX_FILE_SIZE__SDGJDG", str(MAX_FILE_SIZE))
        return Response(content=content, media_type="application/javascript")
    return FileResponse(f"website/static/{file_path}")


@app.get("/file")
async def dl_file(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    path = request.query_params["path"]
    quality = request.query_params.get("quality", "original")  # original, 240p, 360p, 480p
    
    file = DRIVE_DATA.get_file(path)
    
    # Check if a specific quality is requested and available
    if quality != "original" and hasattr(file, 'encoded_versions') and file.encoded_versions:
        if quality in file.encoded_versions:
            encoded_version = file.encoded_versions[quality]
            # Use the encoded version's message ID
            return await media_streamer(STORAGE_CHANNEL, encoded_version['message_id'], f"{file.name}_{quality}", request)
    
    # Determine which channel to use for streaming
    if hasattr(file, 'is_fast_import') and file.is_fast_import and file.source_channel:
        # Use source channel for fast import files
        channel = file.source_channel
    else:
        # Use storage channel for regular files
        channel = STORAGE_CHANNEL
    
    return await media_streamer(channel, file.file_id, file.name, request)


# Api Routes


@app.post("/api/checkPassword")
async def check_password(request: Request):
    data = await request.json()
    if data["pass"] == ADMIN_PASSWORD:
        return JSONResponse({"status": "ok"})
    return JSONResponse({"status": "Invalid password"})


@app.post("/api/createNewFolder")
async def api_new_folder(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"createNewFolder {data}")
    folder_data = DRIVE_DATA.get_directory(data["path"]).contents
    for id in folder_data:
        f = folder_data[id]
        if f.type == "folder":
            if f.name == data["name"]:
                return JSONResponse(
                    {
                        "status": "Folder with the name already exist in current directory"
                    }
                )

    DRIVE_DATA.new_folder(data["path"], data["name"])
    return JSONResponse({"status": "ok"})


@app.post("/api/getDirectory")
async def api_get_directory(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    data = await request.json()

    if data["password"] == ADMIN_PASSWORD:
        is_admin = True
    else:
        is_admin = False

    auth = data.get("auth")
    sort_by = data.get("sort_by", "date")  # name, date, size
    sort_order = data.get("sort_order", "desc")  # asc, desc

    logger.info(f"getFolder {data}")

    if data["path"] == "/trash":
        data = {"contents": DRIVE_DATA.get_trashed_files_folders()}
        folder_data = convert_class_to_dict(data, isObject=False, showtrash=True, sort_by=sort_by, sort_order=sort_order)

    elif "/search_" in data["path"]:
        query = urllib.parse.unquote(data["path"].split("_", 1)[1])
        print(query)
        data = {"contents": DRIVE_DATA.search_file_folder(query)}
        print(data)
        folder_data = convert_class_to_dict(data, isObject=False, showtrash=False, sort_by=sort_by, sort_order=sort_order)
        print(folder_data)

    elif "/share_" in data["path"]:
        path = data["path"].split("_", 1)[1]
        folder_data, auth_home_path = DRIVE_DATA.get_directory(path, is_admin, auth)
        auth_home_path= auth_home_path.replace("//", "/") if auth_home_path else None
        folder_data = convert_class_to_dict(folder_data, isObject=True, showtrash=False, sort_by=sort_by, sort_order=sort_order)
        return JSONResponse(
            {"status": "ok", "data": folder_data, "auth_home_path": auth_home_path}
        )

    else:
        folder_data = DRIVE_DATA.get_directory(data["path"])
        folder_data = convert_class_to_dict(folder_data, isObject=True, showtrash=False, sort_by=sort_by, sort_order=sort_order)
    return JSONResponse({"status": "ok", "data": folder_data, "auth_home_path": None})


SAVE_PROGRESS = {}


@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    path: str = Form(...),
    password: str = Form(...),
    id: str = Form(...),
    total_size: str = Form(...),
):
    global SAVE_PROGRESS

    if password != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    total_size = int(total_size)
    SAVE_PROGRESS[id] = ("running", 0, total_size)

    ext = file.filename.lower().split(".")[-1]

    cache_dir = Path("./cache")
    cache_dir.mkdir(parents=True, exist_ok=True)
    file_location = cache_dir / f"{id}.{ext}"

    file_size = 0

    async with aiofiles.open(file_location, "wb") as buffer:
        while chunk := await file.read(1024 * 1024):  # Read file in chunks of 1MB
            SAVE_PROGRESS[id] = ("running", file_size, total_size)
            file_size += len(chunk)
            if file_size > MAX_FILE_SIZE:
                await buffer.close()
                file_location.unlink()  # Delete the partially written file
                raise HTTPException(
                    status_code=400,
                    detail=f"File size exceeds {MAX_FILE_SIZE} bytes limit",
                )
            await buffer.write(chunk)

    SAVE_PROGRESS[id] = ("completed", file_size, file_size)

    asyncio.create_task(
        start_file_uploader(file_location, id, path, file.filename, file_size)
    )

    return JSONResponse({"id": id, "status": "ok"})


@app.post("/api/getSaveProgress")
async def get_save_progress(request: Request):
    global SAVE_PROGRESS

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"getUploadProgress {data}")
    try:
        progress = SAVE_PROGRESS[data["id"]]
        return JSONResponse({"status": "ok", "data": progress})
    except:
        return JSONResponse({"status": "not found"})


@app.post("/api/getUploadProgress")
async def get_upload_progress(request: Request):
    from utils.uploader import PROGRESS_CACHE

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"getUploadProgress {data}")

    try:
        progress = PROGRESS_CACHE[data["id"]]
        return JSONResponse({"status": "ok", "data": progress})
    except:
        return JSONResponse({"status": "not found"})


@app.post("/api/cancelUpload")
async def cancel_upload(request: Request):
    from utils.uploader import STOP_TRANSMISSION
    from utils.downloader import STOP_DOWNLOAD

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"cancelUpload {data}")
    STOP_TRANSMISSION.append(data["id"])
    STOP_DOWNLOAD.append(data["id"])
    return JSONResponse({"status": "ok"})


@app.post("/api/renameFileFolder")
async def rename_file_folder(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"renameFileFolder {data}")
    DRIVE_DATA.rename_file_folder(data["path"], data["name"])
    return JSONResponse({"status": "ok"})


@app.post("/api/trashFileFolder")
async def trash_file_folder(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"trashFileFolder {data}")
    DRIVE_DATA.trash_file_folder(data["path"], data["trash"])
    return JSONResponse({"status": "ok"})


@app.post("/api/deleteFileFolder")
async def delete_file_folder(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"deleteFileFolder {data}")
    DRIVE_DATA.delete_file_folder(data["path"])
    return JSONResponse({"status": "ok"})


@app.post("/api/moveFileFolder")
async def move_file_folder(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"moveFileFolder {data}")
    try:
        DRIVE_DATA.move_file_folder(data["source_path"], data["destination_path"])
        return JSONResponse({"status": "ok"})
    except Exception as e:
        return JSONResponse({"status": str(e)})


@app.post("/api/copyFileFolder")
async def copy_file_folder(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"copyFileFolder {data}")
    try:
        DRIVE_DATA.copy_file_folder(data["source_path"], data["destination_path"])
        return JSONResponse({"status": "ok"})
    except Exception as e:
        return JSONResponse({"status": str(e)})


@app.post("/api/getFolderTree")
async def get_folder_tree(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"getFolderTree {data}")
    try:
        folder_tree = DRIVE_DATA.get_folder_tree()
        return JSONResponse({"status": "ok", "data": folder_tree})
    except Exception as e:
        return JSONResponse({"status": str(e)})


@app.post("/api/getFileInfoFromUrl")
async def getFileInfoFromUrl(request: Request):

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"getFileInfoFromUrl {data}")
    try:
        file_info = await get_file_info_from_url(data["url"])
        return JSONResponse({"status": "ok", "data": file_info})
    except Exception as e:
        return JSONResponse({"status": str(e)})


@app.post("/api/startFileDownloadFromUrl")
async def startFileDownloadFromUrl(request: Request):
    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"startFileDownloadFromUrl {data}")
    try:
        id = getRandomID()
        asyncio.create_task(
            download_file(data["url"], id, data["path"], data["filename"], data["singleThreaded"])
        )
        return JSONResponse({"status": "ok", "id": id})
    except Exception as e:
        return JSONResponse({"status": str(e)})


@app.post("/api/getFileDownloadProgress")
async def getFileDownloadProgress(request: Request):
    from utils.downloader import DOWNLOAD_PROGRESS

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"getFileDownloadProgress {data}")

    try:
        progress = DOWNLOAD_PROGRESS[data["id"]]
        return JSONResponse({"status": "ok", "data": progress})
    except:
        return JSONResponse({"status": "not found"})


@app.post("/api/getFolderShareAuth")
async def getFolderShareAuth(request: Request):
    from utils.directoryHandler import DRIVE_DATA

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"getFolderShareAuth {data}")

    try:
        auth = DRIVE_DATA.get_folder_auth(data["path"])
        return JSONResponse({"status": "ok", "auth": auth})
    except:
        return JSONResponse({"status": "not found"})


@app.post("/api/smartBulkImport")
async def smart_bulk_import(request: Request):
    """API endpoint for smart bulk import functionality"""
    from utils.fast_import import SMART_IMPORT_MANAGER
    from utils.clients import get_client

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    logger.info(f"smartBulkImport {data}")

    try:
        client = get_client()
        channel_identifier = data["channel"]
        destination_folder = data["path"]
        start_msg_id = data.get("start_msg_id")
        end_msg_id = data.get("end_msg_id")
        import_mode = data.get("import_mode", "auto")  # auto, fast, regular

        imported_count, total_files, used_fast_import = await SMART_IMPORT_MANAGER.smart_bulk_import(
            client, 
            channel_identifier, 
            destination_folder, 
            start_msg_id, 
            end_msg_id,
            import_mode
        )

        return JSONResponse({
            "status": "ok", 
            "imported": imported_count, 
            "total": total_files,
            "method": "fast_import" if used_fast_import else "regular_import"
        })
    except Exception as e:
        logger.error(f"Smart bulk import error: {e}")
        return JSONResponse({"status": str(e)})


@app.post("/api/checkChannelAdmin")
async def check_channel_admin(request: Request):
    """Check if bot is admin in a channel"""
    from utils.fast_import import SMART_IMPORT_MANAGER
    from utils.clients import get_client

    data = await request.json()

    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})

    try:
        client = get_client()
        channel_identifier = data["channel"]
        
        is_valid, result, is_admin = await SMART_IMPORT_MANAGER.validate_channel_access(client, channel_identifier)
        
        if not is_valid:
            return JSONResponse({"status": "error", "message": result})
        
        return JSONResponse({
            "status": "ok",
            "is_admin": is_admin,
            "channel_name": result.title or result.username or str(result.id)
        })
    except Exception as e:
        logger.error(f"Check channel admin error: {e}")
        return JSONResponse({"status": "error", "message": str(e)})


@app.post("/api/encodeVideo")
async def encode_video(request: Request):
    """API endpoint for manual video encoding"""
    from utils.video_encoder import VIDEO_ENCODER
    
    data = await request.json()
    
    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})
    
    logger.info(f"encodeVideo {data}")
    
    try:
        file_path = data["file_path"]
        qualities = data["qualities"]  # List of qualities to encode
        encoding_id = getRandomID()
        
        # Start encoding in background
        asyncio.create_task(
            VIDEO_ENCODER.encode_video_manual(file_path, qualities, encoding_id)
        )
        
        return JSONResponse({"status": "ok", "encoding_id": encoding_id})
        
    except Exception as e:
        logger.error(f"Error starting video encoding: {e}")
        return JSONResponse({"status": str(e)})


@app.post("/api/getEncodingProgress")
async def get_encoding_progress(request: Request):
    """Get encoding progress for a specific encoding job"""
    from utils.video_encoder import VIDEO_ENCODER
    
    data = await request.json()
    
    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})
    
    try:
        encoding_id = data["encoding_id"]
        progress = VIDEO_ENCODER.get_encoding_progress(encoding_id)
        return JSONResponse({"status": "ok", "data": progress})
        
    except Exception as e:
        logger.error(f"Error getting encoding progress: {e}")
        return JSONResponse({"status": str(e)})


@app.post("/api/checkVideoEncodingSupport")
async def check_video_encoding_support(request: Request):
    """Check if video encoding is supported (FFmpeg available)"""
    from utils.video_encoder import VIDEO_ENCODER
    
    data = await request.json()
    
    if data["password"] != ADMIN_PASSWORD:
        return JSONResponse({"status": "Invalid password"})
    
    try:
        ffmpeg_available = VIDEO_ENCODER.check_ffmpeg()
        return JSONResponse({
            "status": "ok", 
            "ffmpeg_available": ffmpeg_available,
            "supported_qualities": list(VIDEO_ENCODER.resolutions.keys()) if ffmpeg_available else []
        })
        
    except Exception as e:
        logger.error(f"Error checking encoding support: {e}")
        return JSONResponse({"status": str(e)})