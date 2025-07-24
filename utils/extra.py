import mimetypes
from urllib.parse import unquote_plus
import re
import urllib.parse
from pathlib import Path
from config import WEBSITE_URL
import asyncio, aiohttp
from utils.directoryHandler import get_current_utc_time, getRandomID
from utils.logger import Logger

logger = Logger(__name__)


def convert_class_to_dict(data, isObject, showtrash=False, sort_by="date", sort_order="desc"):
    if isObject == True:
        data = data.__dict__.copy()
    new_data = {"contents": {}}

    for key in data["contents"]:
        if data["contents"][key].trash == showtrash:
            if data["contents"][key].type == "folder":
                folder = data["contents"][key]
                new_data["contents"][key] = {
                    "name": folder.name,
                    "type": folder.type,
                    "id": folder.id,
                    "path": folder.path,
                    "upload_date": folder.upload_date,
                }
            else:
                file = data["contents"][key]
                new_data["contents"][key] = {
                    "name": file.name,
                    "type": file.type,
                    "size": file.size,
                    "id": file.id,
                    "path": file.path,
                    "upload_date": file.upload_date,
                }
    
    # Sort the contents
    sorted_contents = sort_directory_contents(new_data["contents"], sort_by, sort_order)
    new_data["contents"] = sorted_contents
    
    return new_data


def sort_directory_contents(contents, sort_by="date", sort_order="desc"):
    """Sort directory contents by specified criteria"""
    
    # Convert to list of tuples for sorting
    items = list(contents.items())
    
    # Separate folders and files
    folders = [(k, v) for k, v in items if v["type"] == "folder"]
    files = [(k, v) for k, v in items if v["type"] == "file"]
    
    # Define sorting functions
    def get_sort_key(item):
        key, value = item
        if sort_by == "name":
            return value["name"].lower()
        elif sort_by == "size":
            return value.get("size", 0) if value["type"] == "file" else 0
        else:  # date
            return value["upload_date"]
    
    # Sort folders and files separately
    reverse_order = (sort_order == "desc")
    folders.sort(key=get_sort_key, reverse=reverse_order)
    files.sort(key=get_sort_key, reverse=reverse_order)
    
    # Combine back into dictionary (folders first, then files)
    sorted_contents = {}
    for key, value in folders + files:
        sorted_contents[key] = value
    
    return sorted_contents


async def auto_ping_website():
    if WEBSITE_URL is not None:
        async with aiohttp.ClientSession() as session:
            while True:
                try:
                    async with session.get(WEBSITE_URL) as response:
                        if response.status == 200:
                            logger.info(f"Pinged website at {get_current_utc_time()}")
                        else:
                            logger.warning(f"Failed to ping website: {response.status}")
                except Exception as e:
                    logger.warning(f"Failed to ping website: {e}")

                await asyncio.sleep(60)  # Ping website every minute


import shutil


def reset_cache_dir():
    cache_dir = Path("./cache")
    downloads_dir = Path("./downloads")
    shutil.rmtree(cache_dir, ignore_errors=True)
    shutil.rmtree(downloads_dir, ignore_errors=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    downloads_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Cache and downloads directory reset")


def parse_content_disposition(content_disposition):
    # Split the content disposition into parts
    parts = content_disposition.split(";")

    # Initialize filename variable
    filename = None

    # Loop through parts to find the filename
    for part in parts:
        part = part.strip()
        if part.startswith("filename="):
            # If filename is found
            filename = part.split("=", 1)[1]
        elif part.startswith("filename*="):
            # If filename* is found
            match = re.match(r"filename\*=(\S*)''(.*)", part)
            if match:
                encoding, value = match.groups()
                try:
                    filename = urllib.parse.unquote(value, encoding=encoding)
                except ValueError:
                    # Handle invalid encoding
                    pass

    if filename is None:
        raise Exception("Failed to get filename")
    return filename


def get_filename(headers, url):
    try:
        if headers.get("Content-Disposition"):
            filename = parse_content_disposition(headers["Content-Disposition"])
        else:
            filename = unquote_plus(url.strip("/").split("/")[-1])

        filename = filename.strip(' "')
    except:
        filename = unquote_plus(url.strip("/").split("/")[-1])

    filename = filename.strip()

    if filename == "" or "." not in filename:
        if headers.get("Content-Type"):
            extension = mimetypes.guess_extension(headers["Content-Type"])
            if extension:
                filename = f"{getRandomID()}{extension}"
            else:
                filename = getRandomID()
        else:
            filename = getRandomID()

    return filename
