// Node.js entry point for Python application
const { spawn } = require('child_process');
const path = require('path');

console.log('Starting Python video streaming application...');

// Start the Python application
const pythonProcess = spawn('python', ['main.py'], {
  cwd: __dirname,
  stdio: 'inherit'
});

pythonProcess.on('error', (error) => {
  console.error('Failed to start Python application:', error);
  process.exit(1);
});

pythonProcess.on('close', (code) => {
  console.log(`Python application exited with code ${code}`);
  process.exit(code);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down...');
  pythonProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  pythonProcess.kill('SIGTERM');
});