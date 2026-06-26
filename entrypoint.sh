#!/bin/sh
# entrypoint.sh — 设置 cron 定时任务并根据计划运行生成 PAC

set -e

# 默认值
CRON_SCHEDULE="${CRON_SCHEDULE:-0 */6 * * *}"
PROXY="${PROXY:-}"
OUTPUT_DIR="${OUTPUT_DIR:-/app/output}"
USER_RULES="${USER_RULES:-/app/user-rules.txt}"

# 将输出目录链接到工作目录，使 pac.txt 写入到挂载卷中
if [ ! -d "$OUTPUT_DIR" ]; then
  mkdir -p "$OUTPUT_DIR"
fi

# 构建执行命令
CMD="cd /app && deno run --allow-net --allow-read=. --allow-write=. --allow-env gfwlist2pac.ts -o \"${OUTPUT_DIR}/pac.txt\" --user-rules \"${USER_RULES}\""

if [ -n "$PROXY" ]; then
  CMD="$CMD -p \"$PROXY\""
fi

# 写入 crontab
echo "$CRON_SCHEDULE root $CMD > ${OUTPUT_DIR}/last-run.log 2>&1" > /etc/cron.d/gfwlist2pac
echo "" >> /etc/cron.d/gfwlist2pac

# 立即执行一次
echo "========================================"
echo "首次启动，立即执行 PAC 生成..."
echo "Cron 计划: $CRON_SCHEDULE"
echo "代理: ${PROXY:-未设置（自动检测）}"
echo "输出目录: $OUTPUT_DIR"
echo "========================================"
eval "$CMD" && echo "首次生成完成" || echo "首次生成失败"

# 前台运行 crond
echo "启动 cron 守护进程..."
crond -b

# 持续等待，保持容器运行
while true; do
  sleep 3600 &
  wait
done
