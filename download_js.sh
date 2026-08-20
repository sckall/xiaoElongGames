#!/bin/bash

# 创建保存JS文件的目录
mkdir -p js_files

echo "开始下载JavaScript文件..."

# 定义JS文件列表
declare -a JS_FILES=(
    "https://webstatic.mihoyo.com/common/clgm-web-app/ys/comp/main.7.0.0.js"
    "https://webstatic.mihoyo.com/common/clgm-web-app/ys/static/vue.runtime.global.prod.js"
    "https://webstatic.mihoyo.com/dora/biz/mihoyo-analysis/v2/main.js"
    "https://webstatic.mihoyo.com/dora/biz/mihoyo-h5log/v1.0/main.js"
    "https://webstatic.mihoyo.com/common/clgm-web-app/ys/js/cg-sdk.c39c60f7.js"
    "https://webstatic.mihoyo.com/common/clgm-web-app/ys/js/combo-web.81be9e77.js"
    "https://webstatic.mihoyo.com/common/clgm-web-app/ys/js/chunk-vendors.cc3fa94c.js"
    "https://webstatic.mihoyo.com/common/clgm-web-app/ys/js/web.2847f177.js"
    "https://webstatic.mihoyo.com/common/clgm-web-app/ys/js/cg-sdk-legacy.bc71bec9.js"
    "https://webstatic.mihoyo.com/common/clgm-web-app/ys/js/combo-web-legacy.81be9e77.js"
    "https://webstatic.mihoyo.com/common/clgm-web-app/ys/js/chunk-vendors-legacy.edb21ab9.js"
    "https://webstatic.mihoyo.com/common/clgm-web-app/ys/js/web-legacy.903b4ece.js"
    "https://g.alicdn.com/alilog/mlog/aplus_v2.js"
)

# 下载每个JS文件
for url in "${JS_FILES[@]}"; do
    # 从URL中提取文件名
    filename=$(basename "$url")
    
    echo "正在下载: $filename"
    curl -L -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "$url" -o "js_files/$filename"
    
    if [ $? -eq 0 ]; then
        echo "✓ 成功下载: $filename"
    else
        echo "✗ 下载失败: $filename"
    fi
    echo ""
done

echo "所有文件下载完成！"
echo "文件保存在: $(pwd)/js_files/"
