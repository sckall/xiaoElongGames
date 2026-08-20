# 云游戏平台 - 小鳄龙之家

## 📁 文件说明

本文件夹包含从 https://ys.mihoyo.com/cloud/# 下载的完整网页源码和JavaScript文件，并已修改为"小鳄龙之家"品牌。

### ✅ 已完成的修改

#### HTML文件修改
- **标题**: `云·原神` → `云游戏平台 - 小鳄龙游戏中心`
- **描述**: 改为小鳄龙云游戏平台介绍
- **关键词**: 更新为通用云游戏关键词
- **noscript提示**: `云·原神` → `小鳄龙之家`

#### JavaScript文件修改
- **web.2847f177.js** 和 **web-legacy.903b4ece.js**:
  - ✅ 已使用 Prettier 格式化为可读代码（从单行压缩 → 26,824/34,944 行）
  - `米哈游官方云游戏` → `小鳄龙之家云游戏平台`
  - `米哈游` → `小鳄龙之家` (共12处)
  - `无需下载，随时随地进入异想世界` → `无需下载，随时随地开启游戏冒险`
  - **主界面文字位置**（第18517行JSON配置）:
    - `web_home_title`: "小鳄龙之家云游戏平台"
    - `web_home_subtitle`: "无需下载，随时随地开启游戏冒险"
    - `launcher_start_game`: "开始游戏"

### 🌐 本地访问

服务器运行在: **http://localhost:8081/ys_mihoyo_cloud_source.html**

刷新浏览器即可看到修改后的界面文字！

### HTML文件
- `ys_mihoyo_cloud_source.html` - 主页面HTML源码（5.7KB）

### JavaScript文件（共13个，总计7.0MB）

#### 核心应用文件
1. **web.2847f177.js** (549KB) - 主要Web应用逻辑
2. **combo-web.81be9e77.js** (679KB) - 组合Web功能模块
3. **chunk-vendors.cc3fa94c.js** (887KB) - 第三方依赖包
4. **cg-sdk.c39c60f7.js** (1.2MB) - 云游戏SDK

#### Legacy版本（兼容旧浏览器）
5. **web-legacy.903b4ece.js** (611KB) - 主要Web应用逻辑（Legacy）
6. **combo-web-legacy.81be9e77.js** (679KB) - 组合Web功能模块（Legacy）
7. **chunk-vendors-legacy.edb21ab9.js** (990KB) - 第三方依赖包（Legacy）
8. **cg-sdk-legacy.bc71bec9.js** (1.3MB) - 云游戏SDK（Legacy）

#### 框架和工具库
9. **vue.runtime.global.prod.js** (83KB) - Vue.js运行时（生产环境）
10. **main.7.0.0.js** (2.8KB) - 初始化脚本
11. **main.js** (65KB) - 米哈游分析工具
12. **main.js** (83KB) - 米哈游H5日志工具
13. **aplus_v2.js** (15KB) - 阿里云APM监控

## 🔍 技术栈分析

- **前端框架**: Vue.js (Runtime Only)
- **构建工具**: Webpack/Vite（代码分割为多个chunk）
- **模块化**: ES Modules (`type="module"`) + Legacy支持
- **监控系统**: 
  - 米哈游自研分析系统
  - 阿里云ARMS监控（aplus）
- **云游戏SDK**: 自研CG-SDK（1.2MB+）

## 📊 文件大小统计

| 类型 | 数量 | 总大小 |
|------|------|--------|
| HTML | 1 | 5.7KB |
| JavaScript | 13 | 7.0MB |
| **合计** | **14** | **~7MB** |

## 💡 注意事项

1. 这是一个单页应用（SPA），大部分内容通过JavaScript动态加载
2. 使用了现代浏览器的ES Module特性，同时提供Legacy版本兼容
3. 代码已混淆压缩，适合学习架构但不易阅读具体实现
4. 云游戏SDK是核心组件，负责与云端服务器通信

## 📅 下载时间
2024年8月20日
