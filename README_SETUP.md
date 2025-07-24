# TGDrive Environment Setup Guide

## Required Environment Variables

Before running TGDrive, you need to set up the following environment variables in your `.env` file:

### 1. Telegram API Credentials
Get these from https://my.telegram.org/auth:
```
API_ID=123456
API_HASH=your_api_hash_here
```

### 2. Bot Configuration
Create a Telegram bot via @BotFather and get the token:
```
BOT_TOKENS=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
```
For multiple bots, separate with commas:
```
BOT_TOKENS=token1,token2,token3
```

### 3. Storage Channel
Create a Telegram channel and get its ID:
```
STORAGE_CHANNEL=-1001234567890
```
**Important:** 
- The channel ID must be negative
- Add all your bots as admins to this channel

### 4. Database Backup Message
Upload any file to your storage channel and get its message ID:
```
DATABASE_BACKUP_MSG_ID=123
```

## Optional Variables

### Admin Access
```
ADMIN_PASSWORD=your_secure_password
```

### Premium Features
For files larger than 2GB, add premium account sessions:
```
STRING_SESSIONS=session_string_here
```

### Bot Mode (Upload via Telegram)
```
MAIN_BOT_TOKEN=your_main_bot_token
TELEGRAM_ADMIN_IDS=123456789,987654321
```

### Performance Settings
```
SLEEP_THRESHOLD=60
DATABASE_BACKUP_TIME=60
WEBSITE_URL=https://your-domain.com
```

## Setup Steps

1. **Create Telegram App:**
   - Go to https://my.telegram.org/auth
   - Create a new application
   - Note down API_ID and API_HASH

2. **Create Bots:**
   - Message @BotFather on Telegram
   - Use `/newbot` command
   - Get bot tokens

3. **Create Storage Channel:**
   - Create a new Telegram channel
   - Add your bots as admins
   - Get channel ID (use @userinfobot)

4. **Upload Database File:**
   - Upload any file to storage channel
   - Note the message ID

5. **Update .env file:**
   - Copy the provided `.env` template
   - Fill in your actual values
   - Save the file

6. **Run the application:**
   ```bash
   npm start
   # or
   python main.py
   ```

## Security Notes

- Keep your `.env` file secure and never commit it to version control
- Use strong passwords for admin access
- Regularly rotate bot tokens if needed
- Monitor your storage channel for unauthorized access

## Troubleshooting

- **Bot not responding:** Check if bot tokens are correct and bots are added to storage channel
- **File upload fails:** Verify storage channel ID is negative and correct
- **Database errors:** Ensure database backup message ID points to an actual file
- **Permission errors:** Make sure all bots have admin rights in storage channel