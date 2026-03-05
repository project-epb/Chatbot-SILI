#!/bin/bash
#
# 定期重启 sili-napcat 容器的定时任务脚本。
# 每次执行时检查距上次重启是否已过 21 天，若是则重启容器并记录日志。
#
# 添加定时任务（每天凌晨3点检查一次）：
#   crontab -e
#   0 3 * * * /data/chatbot-sili/scripts/cron_restart_napcat.sh
#

LAST_RUN_FILE="/tmp/sili-napcat_last_restart"
CONTAINER_NAME="sili-napcat"

if [ ! -f "$LAST_RUN_FILE" ]; then
    echo "$(date +%s)" > "$LAST_RUN_FILE"
fi

last_run=$(cat "$LAST_RUN_FILE")
now=$(date +%s)
days=$(( (now - last_run) / 86400 ))

if [ "$days" -ge 21 ]; then
    docker restart "$CONTAINER_NAME"
    echo "$(date +%s)" > "$LAST_RUN_FILE"
    echo "$(date): Restarted $CONTAINER_NAME after $days days" >> /var/log/restart_qq.log
    sleep 15
    echo "$(date): Container logs (last 15s):" >> /var/log/restart_qq.log
    docker logs --since 15s "$CONTAINER_NAME" >> /var/log/restart_qq.log 2>&1
else
    echo "$(date): Checked $CONTAINER_NAME, $days days since last restart, skipping" >> /var/log/restart_qq.log
fi
