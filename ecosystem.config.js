module.exports = {
  apps: [
    {
      name: 'als-flowers-api',
      script: './bin/als-flowers-api',
      max_memory_restart: '350M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
