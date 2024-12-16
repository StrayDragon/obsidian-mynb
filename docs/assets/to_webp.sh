#!/bin/bash

# 获取脚本所在的目录
SCRIPT_DIR=$(dirname "$0")

# 定义输出质量
QUALITY=75

# 切换到脚本所在的目录
cd "$SCRIPT_DIR" || { echo "Failed to change directory to $SCRIPT_DIR"; exit 1; }

# 遍历当前目录下的所有图片文件
for file in *.jpg *.jpeg *.png *.bmp *.tiff *.gif; do
    # 检查文件是否存在（防止没有匹配文件时脚本出错）
    if [[ -f "$file" ]]; then
        # 获取文件名和扩展名
        filename="${file%.*}"
        extension="${file##*.}"

        # 使用ffmpeg将图片转换为webp格式
        ffmpeg -i "$file" -q:v $QUALITY "${filename}.webp"

        # 检查转换是否成功
        if [[ $? -eq 0 ]]; then
            # 转换成功后删除旧图片
            rm "$file"
            echo "Converted '$file' to '${filename}.webp' and removed the original."
        else
            echo "Failed to convert '$file'."
        fi
    fi
done