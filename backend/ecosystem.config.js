module.exports = {
  apps: [
    {
      name: "rankify",
      script: "venv/bin/gunicorn",
      interpreter: "none",
      // 3 workers with 8 threads each is a good small box starting point
      args: "--chdir /var/www/mightyrankings/backend Rankify.wsgi:application " +
            "--bind 127.0.0.1:8000 " +
            "--workers 3 " +
            "--worker-class gthread " +
            "--threads 8 " +
            "--timeout 120 " +           // kill long-hung workers instead of half-sending bodies
            "--graceful-timeout 30 " +
            "--max-requests 1000 " +     // recycle to avoid leaks
            "--max-requests-jitter 200 " +
            "--log-level info",
      cwd: "/var/www/mightyrankings/backend",
      env: {
        DJANGO_SETTINGS_MODULE: "Rankify.settings"
      }
    }
  ]
}
