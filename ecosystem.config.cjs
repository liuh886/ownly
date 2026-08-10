module.exports = {
  apps: [
    {
      name: "wyqd-app",
      cwd: __dirname,
      script: "scripts/serve-static.mjs",
      args: "out 4173",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "4173",
      },
    },
    {
      name: "wyqd-app-dev",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "dev --hostname 0.0.0.0 --port 4173",
      interpreter: "node",
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
