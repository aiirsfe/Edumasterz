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
            '240p': {'width': 426, 'height': 240, 'bitrate': '400k', 'audio_bitrate': '64k'},
            '360p': {'width': 640, 'height': 360, 'bitrate': '800k', 'audio_bitrate': '96k'},
            '480p': {'width': 854, 'height': 480, 'bitrate': '1200k', 'audio_bitrate': '128k'},
            '720p': {'width': 1280, 'height': 720, 'bitrate': '2500k', 'audio_bitrate': '128k'},
            '1080p': {'width': 1920, 'height': 1080, 'bitrate': '5000k', 'audio_bitrate': '192k'}
        }
        self.encoding_progress = {}
        self.ffmpeg_available = None
    
    def check_ffmpeg(self):
        """Check if FFmpeg is available and install if needed"""
        if self.ffmpeg_available is not None:
            return self.ffmpeg_available
            
        try:
            result = subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True, timeout=10)
            logger.info("FFmpeg is available and working")
            self.ffmpeg_available = True
            return True
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            logger.warning("FFmpeg not found, attempting to install...")
            
            # Try to install FFmpeg
            try:
                # For Ubuntu/Debian systems
                subprocess.run(['apt-get', 'update'], check=True, timeout=60)
                subprocess.run(['apt-get', 'install', '-y', 'ffmpeg'], check=True, timeout=300)
                
                # Test again
                subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True, timeout=10)
                logger.info("FFmpeg installed successfully")
                self.ffmpeg_available = True
                return True
                
            except Exception as install_error:
                logger.error(f"Failed to install FFmpeg: {install_error}")
                self.ffmpeg_available = False
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
                        'codec': stream.get('codec_name', 'unknown'),
                        'bitrate': int(stream.get('bit_rate', 0)) if stream.get('bit_rate') else 0
                    }
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting video info: {e}")
            return None
    
    async def download_video_from_telegram(self, file_id: int, filename: str):
        """Download video from Telegram storage channel"""
        try:
            client = get_client()
            message = await client.get_messages(STORAGE_CHANNEL, file_id)
            
            if not message or (not message.video and not message.document):
                raise Exception("Video message not found")
            
            cache_dir = Path("./cache")
            cache_dir.mkdir(parents=True, exist_ok=True)
            
            # Download to cache directory
            download_path = await message.download(file_name=cache_dir / filename)
            return Path(download_path)
            
        except Exception as e:
            logger.error(f"Error downloading video from Telegram: {e}")
            raise
    
    async def encode_video_to_quality(self, input_path: Path, output_path: Path, quality: str, encoding_id: str):
        """Encode video to specific quality"""
        try:
            if quality not in self.resolutions:
                raise Exception(f"Unsupported quality: {quality}")
            
            config = self.resolutions[quality]
            
            # Get original video info
            video_info = await self.get_video_info(input_path)
            if not video_info:
                raise Exception("Could not get video information")
            
            original_width = video_info['width']
            original_height = video_info['height']
            target_width = config['width']
            target_height = config['height']
            
            # Skip if original resolution is lower than target
            if original_height <= target_height:
                raise Exception(f"Original resolution ({original_width}x{original_height}) is lower than target {quality}")
            
            # FFmpeg command for encoding
            cmd = [
                'ffmpeg',
                '-i', str(input_path),
                '-vf', f'scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2',
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-crf', '23',
                '-b:v', config['bitrate'],
                '-maxrate', config['bitrate'],
                '-bufsize', str(int(config['bitrate'].replace('k', '')) * 2) + 'k',
                '-c:a', 'aac',
                '-b:a', config['audio_bitrate'],
                '-movflags', '+faststart',
                '-progress', 'pipe:1',
                '-y',  # Overwrite output file
                str(output_path)
            ]
            
            logger.info(f"Starting encoding to {quality} ({target_width}x{target_height})")
            self.encoding_progress[encoding_id] = {'status': 'encoding', 'progress': 0}
            
            # Start FFmpeg process
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            # Monitor progress
            total_duration = video_info.get('duration', 0)
            
            async def monitor_progress():
                try:
                    while True:
                        line = await process.stdout.readline()
                        if not line:
                            break
                        
                        line = line.decode().strip()
                        if line.startswith('out_time_ms='):
                            time_ms = int(line.split('=')[1])
                            time_seconds = time_ms / 1000000
                            
                            if total_duration > 0:
                                progress = min(100, (time_seconds / total_duration) * 100)
                                self.encoding_progress[encoding_id] = {
                                    'status': 'encoding', 
                                    'progress': round(progress, 1)
                                }
                except Exception as e:
                    logger.error(f"Error monitoring progress: {e}")
            
            # Start progress monitoring
            progress_task = asyncio.create_task(monitor_progress())
            
            # Wait for process to complete
            stdout, stderr = await process.communicate()
            progress_task.cancel()
            
            if process.returncode == 0:
                self.encoding_progress[encoding_id] = {'status': 'completed', 'progress': 100}
                logger.info(f"Successfully encoded to {quality}")
                return True
            else:
                error_msg = stderr.decode() if stderr else "Unknown error"
                logger.error(f"FFmpeg encoding failed: {error_msg}")
                self.encoding_progress[encoding_id] = {'status': 'error', 'progress': 0, 'error': error_msg}
                return False
                
        except Exception as e:
            logger.error(f"Error encoding video: {e}")
            self.encoding_progress[encoding_id] = {'status': 'error', 'progress': 0, 'error': str(e)}
            return False
    
    async def upload_encoded_video(self, video_path: Path, original_filename: str, quality: str):
        """Upload encoded video to Telegram storage channel"""
        try:
            client = get_client()
            
            # Create descriptive filename
            name_without_ext = Path(original_filename).stem
            encoded_filename = f"{name_without_ext}_{quality}.mp4"
            
            caption = f"🎬 Encoded Version - {quality.upper()}\n📁 Original: {original_filename}\n⚡ Optimized for streaming"
            
            message = await client.send_document(
                STORAGE_CHANNEL,
                video_path,
                caption=caption,
                file_name=encoded_filename,
                disable_notification=True,
            )
            
            logger.info(f"Uploaded encoded video {quality} with message ID: {message.id}")
            return message.id
            
        except Exception as e:
            logger.error(f"Error uploading encoded video: {e}")
            return None
    
    async def encode_video_manual(self, file_path: str, qualities: list, encoding_id: str):
        """Manual encoding process for selected video and qualities"""
        try:
            from utils.directoryHandler import DRIVE_DATA
            
            # Check FFmpeg availability
            if not self.check_ffmpeg():
                raise Exception("FFmpeg is not available on this system")
            
            # Get file info from drive data
            file_obj = DRIVE_DATA.get_file(file_path)
            if not file_obj:
                raise Exception("File not found in drive")
            
            # Download video from Telegram
            self.encoding_progress[encoding_id] = {'status': 'downloading', 'progress': 0}
            logger.info(f"Downloading video: {file_obj.name}")
            
            video_path = await self.download_video_from_telegram(file_obj.file_id, file_obj.name)
            
            # Get video info
            video_info = await self.get_video_info(video_path)
            if not video_info:
                raise Exception("Could not analyze video file")
            
            logger.info(f"Video info: {video_info['width']}x{video_info['height']}, Duration: {video_info['duration']}s")
            
            # Initialize encoded versions if not exists
            if not hasattr(file_obj, 'encoded_versions') or not file_obj.encoded_versions:
                file_obj.encoded_versions = {}
            
            encoded_count = 0
            cache_dir = Path("./cache")
            
            # Encode to each requested quality
            for quality in qualities:
                try:
                    if quality in file_obj.encoded_versions:
                        logger.info(f"Quality {quality} already exists, skipping")
                        continue
                    
                    # Check if target resolution is valid
                    target_height = self.resolutions[quality]['height']
                    if video_info['height'] <= target_height:
                        logger.warning(f"Skipping {quality} - original resolution is too low")
                        continue
                    
                    # Create output path
                    output_filename = f"{encoding_id}_{quality}.mp4"
                    output_path = cache_dir / output_filename
                    
                    # Encode video
                    success = await self.encode_video_to_quality(
                        video_path, output_path, quality, f"{encoding_id}_{quality}"
                    )
                    
                    if success and output_path.exists():
                        # Upload encoded version
                        message_id = await self.upload_encoded_video(
                            output_path, file_obj.name, quality
                        )
                        
                        if message_id:
                            # Store encoded version info
                            file_obj.encoded_versions[quality] = {
                                'message_id': message_id,
                                'width': self.resolutions[quality]['width'],
                                'height': self.resolutions[quality]['height'],
                                'bitrate': self.resolutions[quality]['bitrate'],
                                'file_size': output_path.stat().st_size
                            }
                            encoded_count += 1
                            logger.info(f"Successfully encoded and stored {quality} version")
                        
                        # Clean up encoded file
                        try:
                            output_path.unlink()
                        except:
                            pass
                    
                except Exception as e:
                    logger.error(f"Failed to encode {quality}: {e}")
                    continue
            
            # Clean up downloaded video
            try:
                video_path.unlink()
            except:
                pass
            
            # Save updated drive data
            DRIVE_DATA.save()
            
            self.encoding_progress[encoding_id] = {
                'status': 'completed', 
                'progress': 100,
                'encoded_count': encoded_count,
                'total_requested': len(qualities)
            }
            
            logger.info(f"Encoding completed. {encoded_count}/{len(qualities)} qualities encoded successfully")
            return encoded_count
            
        except Exception as e:
            logger.error(f"Error in manual encoding: {e}")
            self.encoding_progress[encoding_id] = {
                'status': 'error', 
                'progress': 0, 
                'error': str(e)
            }
            raise
    
    def get_encoding_progress(self, encoding_id: str):
        """Get encoding progress for a specific encoding job"""
        return self.encoding_progress.get(encoding_id, {'status': 'not_found', 'progress': 0})
    
    def cleanup_progress(self, encoding_id: str):
        """Clean up progress data for completed encoding"""
        if encoding_id in self.encoding_progress:
            del self.encoding_progress[encoding_id]

# Global encoder instance
VIDEO_ENCODER = VideoEncoder()