# 终极解决方案：动态功能开关

## 问题分析

之前的问题：
- Chrome 扩展的 content script 在页面首次加载时注入一次
- SPA 路由变化不会触发脚本重新注入
- 尝试通过 JavaScript 重新加载插件都会失败（这是浏览器级限制）

## 解决方案

**改变思路：不卸载/重新加载插件脚本本身，而是动态启用/禁用功能**

### 核心机制

1. **Manifest 改动**
   - 改为加载到整个 `https://creator.douyin.com/*` 域名
   - 插件脚本只注入一次（永不卸载）

2. **代码改动**
   - 添加 `isPluginEnabled` 标志位
   - 添加 `enablePlugin()` 和 `disablePlugin()` 函数
   - 添加路由监听：`setupRouteListener()`
   - 当路由变化时：
     - 如果进入 `/creator-micro/content/manage` → 调用 `enablePlugin()`
     - 如果离开该页面 → 调用 `disablePlugin()`

### 文件改动

**manifest.json**
```json
"content_scripts": [
  {
    "matches": ["https://creator.douyin.com/*"],  // 改为整个域名
    "js": ["content_unified.js"],
    "run_at": "document_idle"
  }
]
```

**content_unified.js**
```javascript
// 功能开关
const REQUIRED_PATH = '/creator-micro/content/manage';
let isPluginEnabled = false;

const isTargetPage = () => {
  const pathname = new URL(window.location.href).pathname;
  return pathname === REQUIRED_PATH || pathname === REQUIRED_PATH + '/';
};

const enablePlugin = () => {
  if (isPluginEnabled) return;
  isPluginEnabled = true;
  startCheckLoop(); // 调用原有初始化逻辑
};

const disablePlugin = () => {
  if (!isPluginEnabled) return;
  isPluginEnabled = false;
  // 清理监听器
  if (checkInterval) clearInterval(checkInterval);
  if (tabObserver) tabObserver.disconnect();
};

// 路由监听（核心！）
const setupRouteListener = () => {
  let lastPathname = new URL(window.location.href).pathname;
  
  const checkRoute = () => {
    const newPathname = new URL(window.location.href).pathname;
    if (newPathname === lastPathname) return;
    
    lastPathname = newPathname;
    if (isTargetPage()) {
      enablePlugin();
    } else {
      disablePlugin();
    }
  };
  
  window.addEventListener('popstate', () => setTimeout(checkRoute, 100));
  window.addEventListener('hashchange', checkRoute);
  setInterval(checkRoute, 500); // SPA 兼容
};
```

## 测试流程

1. **刷新扩展**
   - Chrome 开发者工具 → 扩展程序 → 刷新按钮

2. **场景 1：初始访问管理页面**
   - 访问 `https://creator.douyin.com/creator-micro/content/manage`
   - ✅ 插件立即激活，UI 按钮出现

3. **场景 2：SPA 导航到合集管理**
   - 点击左侧菜单的"合集管理"
   - 页面路由变化 → 监听器触发
   - ✅ 插件自动禁用，UI 按钮消失
   - ❌ 无页面刷新（这是关键！）

4. **场景 3：导航回作品管理**
   - 点击左侧菜单的"作品"
   - 页面路由变化 → 监听器触发
   - ✅ 插件自动启用，UI 按钮重新出现
   - ❌ 无页面刷新

5. **场景 4：浏览器后退/前进**
   - 使用浏览器后退按钮从合集 → 作品
   - ✅ 同样瞬间启用，无刷新

## 优势

✅ **瞬间响应**：不需要页面刷新，路由变化时立即激活/禁用  
✅ **可靠稳定**：不依赖任何黑魔法，完全是正常的 JavaScript 逻辑  
✅ **低耗能**：只有 500ms 轮询一次，性能开销极小  
✅ **向后兼容**：原有的所有功能代码无需修改  

## 控制台日志示例

```
🚀 抖音创作者中心批量管理视频插件已加载
📍 初始页面检查...
🔄 路由变化: /creator-micro/content/manage → /creator-micro/collection/manage
🔴 插件已禁用 - 清理 UI 元素和监听器

🔄 路由变化: /creator-micro/collection/manage → /creator-micro/content/manage
🟢 插件已启用 - 初始化 UI 和功能
```
