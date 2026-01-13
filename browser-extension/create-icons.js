// Simple icon generator - creates placeholder icons
// For production, replace with proper designed icons

const fs = require('fs');

// Base64 encoded minimal PNG icons with purple background
// These are simple placeholder icons - a purple rounded square with "M"

// 16x16 purple icon
const icon16 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA' +
  'hklEQVR4AWMYWuD/Dwa2tfLDqRz/rP/8pwBhYPn8+TMoLjw8' +
  'nJSUlJycnJKSkpCQkJiYmJaWlpaWlpGRkZmZmZWVlZ2dnZeX' +
  'l5+fn5CQkJSUlJqampGRkZmZmZWVlZ2dnZ+fn5CQkJycnJSU' +
  'lJqampGRkZmZmZWVlZ2dnZCQkJycnJqampaWlgAaQDDAA/dw' +
  'YAAAAABJRU5ErkJggg==',
  'base64'
);

// For simplicity, we'll use the same small icon for all sizes
// In production, you'd want properly sized icons
fs.writeFileSync('icon16.png', icon16);
fs.writeFileSync('icon48.png', icon16);
fs.writeFileSync('icon128.png', icon16);

console.log('Created placeholder icons.');
console.log('For better icons, use an image editor to create:');
console.log('  - icon16.png (16x16)');
console.log('  - icon48.png (48x48)');
console.log('  - icon128.png (128x128)');
