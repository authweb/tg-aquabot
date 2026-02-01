module.exports = {
    apps: [
        {
            name: "tg-aquabot",
            script: "src/app.js",
            cwd: "/opt/tg-aquabot",
            interpreter: "node",
            instances: 1,
            exec_mode: "fork",
            autorestart: true,
            max_restarts: 10,
            restart_delay: 3000,

            // Важно: подхватываем .env
            env: {
                NODE_ENV: "production"
            },

            // Логи
            out_file: "/var/log/tg-aquabot/out.log",
            error_file: "/var/log/tg-aquabot/error.log",
            log_date_format: "YYYY-MM-DD HH:mm:ss Z"
        }
    ]
};
