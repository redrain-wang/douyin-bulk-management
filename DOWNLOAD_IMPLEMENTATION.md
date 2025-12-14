# 批量下载功能技术实现说明

## 📊 下载链接来源

### API 数据结构

批量下载功能从抖音创作者平台的 API 响应中提取下载链接：

```javascript
// API: https://creator.douyin.com/janus/douyin/creator/pc/work_list
{
  "aweme_list": [
    {
      "aweme_id": "7441234567890123456",
      "desc": "视频标题",
      "video": {
        "download_addr": {
          "uri": "v1e00fgi0000xxx",
          "url_list": [
            "https://v3-cold3.douyinvod.com/...",  // CDN 1
            "https://v81-cold.douyinvod.com/...",  // CDN 2
            "https://creator.douyin.com/aweme/v1/play/?video_id=xxx&..."  // 创作者端点
          ]
        },
        "play_addr": {
          "url_list": [
            "https://...",  // 备用播放链接
            "https://...",
            "https://creator.douyin.com/aweme/v1/play/?..."
          ]
        }
      }
    }
  ]
}
```

### 链接提取逻辑

```javascript
// 位置：content_unified.js, line 112-125
let downloadUrl = '';

// 1. 优先使用 download_addr（下载专用地址）
if (video.video?.download_addr?.url_list?.length > 0) {
  // 使用第三个链接（索引2），通常是 creator.douyin.com 端点
  downloadUrl = video.video.download_addr.url_list[2] || 
                video.video.download_addr.url_list[0];
}
// 2. 备用：使用 play_addr（播放地址）
else if (video.video?.play_addr?.url_list?.length > 0) {
  downloadUrl = video.video.play_addr.url_list[2] || 
                video.video.play_addr.url_list[0];
}
```

**为什么选择第三个链接（索引2）？**
- 前两个通常是 CDN 链接（douyinvod.com），可能有防盗链限制
- 第三个是 `creator.douyin.com` 端点，创作者平台专用，权限更稳定
- 如果第三个不存在，回退到第一个链接

---

## 🔧 下载实现流程

### 1. 缓存阶段（fetchMoreVideos）

```javascript
// 从 API 获取视频列表时，缓存必要字段
const essentialData = data.aweme_list.map(video => ({
  aweme_id: video.aweme_id,
  allow_download: video.video_control?.allow_download ?? true,
  private_status: video.status?.private_status ?? 0,
  download_url: downloadUrl,  // 提取的下载链接
  title: video.desc || `video_${video.aweme_id}`  // 视频标题
}));
```

**内存占用**：
- 每个视频约 150-200 字节（包含 URL）
- 100 个视频约 15-20 KB

---

### 2. 下载触发（bulkDownloadVideo）

```javascript
// 用户点击"📥 批量下载"按钮
async function bulkDownloadVideo() {
  // 1. 获取选中的视频
  const items = (await getItemsVideo()).filter(({ isChecked }) => isChecked);
  
  // 2. 过滤有效链接
  const validItems = items.filter(item => item.downloadUrl);
  
  // 3. 用户确认
  if (!confirm(`确定要下载选中的 ${validItems.length} 个视频吗？`)) {
    return;
  }
  
  // 4. 逐个下载
  for (let i = 0; i < validItems.length; i++) {
    const { downloadUrl, title } = validItems[i];
    await downloadVideo(downloadUrl, filename);
    await new Promise(r => setTimeout(r, 1000));  // 1秒间隔
  }
}
```

---

### 3. 下载核心逻辑（downloadVideo）

```javascript
const downloadVideo = async (url, filename) => {
  // Step 1: 使用 Fetch API 获取视频
  const response = await fetch(url, {
    credentials: 'include',  // 携带 Cookie（认证信息）
    headers: {
      'Accept': '*/*',
    }
  });
  
  // Step 2: 转换为 Blob
  const blob = await response.blob();
  
  // Step 3: 创建临时 URL
  const blobUrl = URL.createObjectURL(blob);
  
  // Step 4: 创建隐藏的 <a> 标签触发下载
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;  // 设置文件名
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();  // 触发下载
  
  // Step 5: 清理资源
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }, 100);
};
```

**为什么使用 Blob URL 而不是直接链接？**
- 直接使用 `<a href="视频URL" download>` 可能因为跨域被拦截
- Blob URL 是浏览器内部 URL（`blob:https://creator.douyin.com/xxx`），绕过跨域限制
- 可以设置自定义文件名

---

## 🐛 常见问题排查

### 问题 1：下载失败，控制台报错 "Failed to fetch"

**可能原因**：
1. 视频链接已过期（API 返回的 URL 有时效性）
2. 跨域问题（CORS）
3. 网络问题

**排查步骤**：
```javascript
// 1. 开启调试模式（content_unified.js, line 4）
const DEBUG = true;

// 2. 打开开发者工具，查看控制台日志
// 会显示：
🎬 视频数据结构: {...}
✅ 从 download_addr 获取: https://...
📥 开始下载: xxx.mp4 URL: https://...
📊 响应状态: 200 OK
📦 Blob 大小: 12.5 MB

// 3. 如果看到 403/401 错误，说明链接无权限
// 4. 如果看到 404 错误，说明链接已失效
```

**解决方案**：
- 刷新页面，重新加载视频列表（链接会更新）
- 检查是否登录抖音创作者平台
- 尝试使用其他链接索引（修改代码 line 113）

---

### 问题 2：点击下载后没有反应

**可能原因**：
1. 视频没有缓存 `download_url` 字段
2. 浏览器阻止了下载
3. 下载链接为空

**排查步骤**：
```javascript
// 在控制台输入：
cachedVideoList

// 查看输出：
[
  {
    aweme_id: "xxx",
    download_url: "https://...",  // ← 检查这个字段是否存在且有效
    title: "视频标题"
  }
]

// 如果 download_url 为空字符串，说明 API 响应中没有视频链接
```

**解决方案**：
- 检查 API 响应中的 `video.download_addr` 和 `video.play_addr` 是否存在
- 尝试不同的视频（某些视频可能没有下载权限）
- 检查浏览器设置中的下载权限

---

### 问题 3：下载的文件损坏或无法播放

**可能原因**：
1. 下载中断
2. URL 返回的不是视频内容（如 HTML 错误页）
3. 编码问题

**排查步骤**：
```javascript
// 查看 Blob 大小
📦 Blob 大小: 12.5 MB  // ← 正常的视频文件应该有几 MB

// 如果只有几 KB，说明下载的不是视频
// 可能是 HTML 错误页或 403 页面
```

**解决方案**：
- 在浏览器中直接访问 `download_url`，看是否能播放
- 检查 Content-Type 是否为 `video/mp4`
- 尝试使用不同索引的链接

---

### 问题 4：批量下载时浏览器卡死

**可能原因**：
1. 同时下载太多大文件，内存溢出
2. 浏览器并发下载限制（Chrome 默认 6 个）

**已实现的解决方案**：
```javascript
// 1秒间隔，逐个下载
await new Promise(r => setTimeout(r, 1000));
```

**建议**：
- 每次下载不超过 20-30 个视频
- 大视频（>50MB）建议分批下载

---

## 🔍 调试步骤

### 1. 开启调试模式

```javascript
// content_unified.js, line 4
const DEBUG = true;
```

### 2. 重新加载扩展

1. 访问 `chrome://extensions/`
2. 点击扩展下方的"重新加载"图标

### 3. 查看控制台日志

打开开发者工具（F12），切换到 Console 标签页，会看到详细日志：

```
🔄 预加载首页视频数据...
📡 调用 API: https://creator.douyin.com/janus/douyin/creator/pc/work_list
✅ API 返回成功，视频数量: 12
🎬 视频数据结构: {aweme_id: "xxx", has_video: true, ...}
✅ 从 download_addr 获取: https://creator.douyin.com/aweme/v1/play/?video_id=...
📋 执行 getItemsVideo...
📥 开始批量下载视频
📥 开始下载: 我的视频.mp4 URL: https://...
📊 响应状态: 200 OK
📦 Blob 大小: 15.6 MB
✅ 触发下载: 我的视频.mp4
```

### 4. 检查缓存数据

```javascript
// 在控制台输入：
cachedVideoList.map(v => ({
  id: v.aweme_id,
  has_url: !!v.download_url,
  url: v.download_url?.substring(0, 50)
}))

// 输出示例：
[
  {id: "7441234567890123456", has_url: true, url: "https://creator.douyin.com/aweme/v1/play/?vi..."},
  {id: "7441234567890123457", has_url: true, url: "https://creator.douyin.com/aweme/v1/play/?vi..."}
]
```

---

## 🔧 可能需要的修改

### 方案 1：改用其他链接索引

如果第三个链接（索引2）失败，可以尝试第一个或第二个：

```javascript
// content_unified.js, line 113
// 原代码：
downloadUrl = video.video.download_addr.url_list[2] || 
              video.video.download_addr.url_list[0];

// 改为使用第一个链接：
downloadUrl = video.video.download_addr.url_list[0];

// 或第二个链接：
downloadUrl = video.video.download_addr.url_list[1];
```

### 方案 2：改用 Chrome Downloads API

如果 Blob 方式失败，可以使用 Chrome 扩展的下载 API：

```javascript
// 1. 修改 manifest.json，添加权限
{
  "permissions": ["downloads"]
}

// 2. 修改下载函数
const downloadVideo = async (url, filename) => {
  return new Promise((resolve) => {
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false  // 自动保存，不弹出对话框
    }, (downloadId) => {
      resolve(!!downloadId);
    });
  });
};
```

### 方案 3：添加更多调试信息

```javascript
// 在 downloadVideo 函数中添加：
const response = await fetch(url, {
  credentials: 'include',
  headers: {
    'Accept': '*/*',
  }
});

// 检查响应头
console.log('Content-Type:', response.headers.get('Content-Type'));
console.log('Content-Length:', response.headers.get('Content-Length'));

// 如果不是 video/mp4，可能下载的是错误页面
```

---

## 📞 需要提供的信息

如果问题仍未解决，请提供以下信息：

1. **控制台日志截图**（开启 DEBUG 模式后）
2. **缓存数据**（`cachedVideoList` 的输出）
3. **下载链接示例**（`download_url` 的完整 URL）
4. **浏览器版本**（Chrome 版本号）
5. **错误信息**（如果有报错）

我会根据这些信息进一步分析和修复问题。
