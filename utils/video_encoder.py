import asyncio
import subprocess
import os
import json
from pathlib import Path
from utils.logger import Logger
from utils.clients import get_client
from config import STORAGE_CHANNEL
from pyrogram.types import InputMediaDocument

logger = Logger(__name__)

class VideoEncoder:
    def __init__(self):
        self.resolutions = {
            '240p': {'width': 426, 'height': 240, 'bitrate': '400k'},
            '360p': {'width': 640, 'height': 360, 'bitrate': '800k'},
            '480p': {'width': 854, 'height': 480, 'bitrate': '1200k'}
        }
    
    async def encode_video(self, input_path: str, upload_id: str, original_filename: str):
        """Encode video to multiple resolutions"""
        try:
            # Check if ffmpeg is available
            if not self.check_ffmpeg():
                logger.error("FFmpeg not found. Video encoding skipped.")
                return {}
            
            # Get video info
            video_info = await self.get_video_info(input_path)
            if not video_info:
                logger.error(f"Could not get video info for {input_path}")
                return {}
            
            original_width = video_info.get('width', 0)
            original_height = video_info.get('height', 0)
            
            logger.info(f"Original video resolution: {original_width}x{original_height}")
            
            encoded_versions = {}
            cache_dir = Path("./cache")
            
            # Encode to each resolution
            for resolution, config in self.resolutions.items():
                target_width = config['width']
                target_height = config['height']
                
                # Skip if original resolution is lower than target
                if original_height <= target_height:
                    logger.info(f"Skipping {resolution} encoding - original resolution is lower")
                    continue
                
                output_path = cache_dir / f"{upload_id}_{resolution}.mp4"
                
                success = await self.encode_to_resolution(
                    input_path, output_path, target_width, target_height, config['bitrate']
                )
                
                if success:
                    # Upload encoded version to Telegram
                    message_id = await self.upload_encoded_video(
                        output_path, f"{original_filename}_{resolution}", resolution
                    )
                    
                    if message_id:
                        encoded_versions[resolution] = {
                            'message_id': message_id,
                            'width': target_width,
                            'height': target_height,
                            'bitrate': config['bitrate'],
                            'file_size': output_path.stat().st_size
                        }
                        logger.info(f"Successfully encoded and uploaded {resolution} version")
                    
                    # Clean up encoded file
                    try:
                        output_path.unlink()
                    except:
                        pass
                else:
                    logger.error(f"Failed to encode {resolution} version")
            
            return encoded_versions
            
        except Exception as e:
            logger.error(f"Error in video encoding: {e}")
            return {}
    
    def check_ffmpeg(self):
        """Check if FFmpeg is available"""
        try:
            subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
    
    async def get_video_info(self, video_path: str):
        """Get video information using ffprobe"""
        try:
            cmd = [
                'ffprobe',
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_streams',
                '-select_streams', 'v:0',
                str(video_path)
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                data = json.loads(result.stdout)
                if data.get('streams'):
                    stream = data['streams'][0]
                    return {
                        'width': int(stream.get('width', 0)),
                        'height': int(stream.get('height', 0)),
                        'duration': float(stream.get('duration', 0)),
                        'codec': stream.get('codec_name', 'unknown')
                    }
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting video info: {e}")
            return None
    
    async def encode_to_resolution(self, input_path: str, output_path: str, width: int, height: int, bitrate: str):
        """Encode video to specific resolution"""
        try:
            cmd = [
                'ffmpeg',
                '-i', str(input_path),
                '-vf', f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2',
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-crf', '23',
                '-b:v', bitrate,
                '-maxrate', bitrate,
                '-bufsize', str(int(bitrate.replace('k', '')) * 2) + 'k',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', '+faststart',
                '-y',  # Overwrite output file
                str(output_path)
            ]
            
            logger.info(f"Starting encoding to {width}x{height} with bitrate {bitrate}")
            
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode == 0:
                logger.info(f"Successfully encoded to {output_path}")
                return True
            else:
                logger.error(f"FFmpeg encoding failed: {stderr.decode()}")
                return False
                
        except Exception as e:
            logger.error(f"Error encoding video: {e}")
            return False
    
    async def upload_encoded_video(self, video_path: Path, filename: str, resolution: str):
        """Upload encoded video to Telegram storage channel"""
        try:
            client = get_client()
            
            caption = f"🎬 Encoded Version - {resolution}\nOriginal: {filename}"
            
            message = await client.send_document(
                STORAGE_CHANNEL,
                video_path,
                caption=caption,
                disable_notification=True,
            )
            
            return message.id
            
        except Exception as e:
            logger.error(f"Error uploading encoded video: {e}")
            return None

# Global encoder instance
VIDEO_ENCODER = VideoEncoder()