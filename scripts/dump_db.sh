#!/bin/bash

# This Bash script is used to make a MongoDB dump for SILI.

# 设置默认数据库名称
db=${1:-"sili_v4"}

# 获取脚本所在的目录，并找到 ../backup 目录的绝对路径
script_path=$(realpath "$0")
script_dir=$(dirname "$script_path")
mkdir -p "$script_dir/../.backups/mongo_dump"
backup_dir=$(realpath "$script_dir/../.backups/mongo_dump")

# 获取当前日期时间
cur_date=$(date +"%Y%m%d%H%M%S")

# 执行 MongoDB 备份
docker exec -i sili-mongo bash -c "mongodump --db $db --archive --gzip" > "$backup_dir/$db-$cur_date.gz"