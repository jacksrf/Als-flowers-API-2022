/**
 * PM2 ecosystem — copy to server ~/deploy and run:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *
 * Or merge max_memory_restart into existing processes:
 *   pm2 restart als-flowers-api --max-memory-restart 350M
 */
module.exports = {
  apps: [
    {
      name: 'als-flowers-api',
      cwd: '/home/nodeuser/deploy/API-als-flowers-2022',
      script: 'bin/als-flowers-api',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '350M',
      env: {
        NODE_ENV: 'production',
        PORT: 8092
      }
    },
    {
      name: 'ADMIN-als-flowers-2021',
      cwd: '/home/nodeuser/deploy/ADMIN-als-flowers-2021',
      script: 'bin/ADMIN-als-flowers-2021',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 8093
      }
    }
  ]
};
