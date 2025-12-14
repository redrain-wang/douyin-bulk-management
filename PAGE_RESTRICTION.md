# 页面限制功能说明

## 🎯 功能

插件现已配置为**仅在指定页面生效**，避免在其他页面产生不必要的干扰。

## 🔧 实现方式

采用**双重保险机制**：

### 1️⃣ Manifest.json 配置（第一层）
```json
"content_scripts": [
  {
    "matches": ["https://creator.douyin.com/creator-micro/content/manage*"],
    "js": ["content_unified.js"],
    "run_at": "document_idle"
  }
]
```

**说明**：
- `matches` 限制脚本仅注入到指定 URL 模式
- `https://creator.douyin.com/creator-micro/content/manage*` 表示：
  - 协议：`https://`
  - 域名：`creator.douyin.com`
  - 路径：`/creator-micro/content/manage` （及其子路径）

**效果**：
- ✅ 只有访问该路径时，脚本才会被加载
- ✅ 其他页面（如首页、内容分析等）完全不加载脚本
- ✅ 节省资源，避免冲突

---

### 2️⃣ 运行时检查（第二层）
```javascript
// 脚本加载后立即检查
const currentUrl = window.location.href;
const requiredPath = '/creator-micro/content/manage';

if (!currentUrl.includes(requiredPath)) {
  console.log('⚠️ 当前页面不是管理页面，插件不会启动');
  return; // 退出执行
}
```

**说明**：
- 即使通过某种方式加载了脚本，也会再次验证 URL
- 如果不匹配，立即返回，不执行任何功能代码
- 双重保险，确保 100% 安全

**效果**：
- ✅ 额外的安全检查
- ✅ 防止意外的路径变化或重定向
- ✅ 清晰的日志提示

---

## 📍 支持的页面

### ✅ 生效的页面
```
https://creator.douyin.com/creator-micro/content/manage
https://creator.douyin.com/creator-micro/content/manage?status=1
https://creator.douyin.com/creator-micro/content/manage#some=param
https://creator.douyin.com/creator-micro/content/manage/anything
```

### ❌ 不生效的页面
```
https://creator.douyin.com/                                    (首页)
https://creator.douyin.com/creator-micro/dashboard/home        (仪表板)
https://creator.douyin.com/creator-micro/content/analytics     (数据分析)
https://creator.douyin.com/creator-micro/account/profile       (账户设置)
https://www.douyin.com/                                        (主站)
https://www.douyin.com/video/xxx                               (用户主页)
```

---

## 🧪 测试方法

### 测试 1: 验证在正确页面生效

1. 访问 `https://creator.douyin.com/creator-micro/content/manage`
2. 打开开发者工具（F12）
3. 查看 Console

**预期结果**：
```
🔥 抖音创作者中心批量管理视频插件已加载
```

✅ 插件正常工作，按钮出现

---

### 测试 2: 验证在其他页面不生效

1. 访问 `https://creator.douyin.com/` (首页)
2. 打开开发者工具（F12）
3. 查看 Console

**预期结果**：
```
⚠️ 当前页面不是管理页面，插件不会启动
🔥 抖音批量管理插件仅在 https://creator.douyin.com/creator-micro/content/manage 页面生效
```

❌ 插件不工作，按钮**不出现**，不会有任何功能

---

### 测试 3: 验证导航时的行为

1. 在 `manage` 页面，点击其他 tab 或导航按钮
2. 离开该页面
3. 再次返回

**预期结果**：
- 离开后：按钮消失，日志显示不生效
- 返回后：按钮重新出现，日志显示已加载

---

## 📋 URL 匹配规则详解

### Pattern: `https://creator.douyin.com/creator-micro/content/manage*`

```
https://                    ← 必须是 HTTPS（不支持 HTTP）
creator.douyin.com          ← 精确域名（不支持其他域名）
/creator-micro/content/     ← 精确路径前缀
manage*                     ← manage 开头的任何路径
```

### 匹配示例

| URL | 是否匹配 | 原因 |
|-----|---------|------|
| `https://creator.douyin.com/creator-micro/content/manage` | ✅ | 精确匹配 |
| `https://creator.douyin.com/creator-micro/content/manage?status=1` | ✅ | 查询参数不影响 |
| `https://creator.douyin.com/creator-micro/content/manage/123` | ✅ | `manage*` 匹配子路径 |
| `https://creator.douyin.com/creator-micro/content/` | ❌ | 缺少 `manage` |
| `https://creator.douyin.com/creator-micro/` | ❌ | 路径不完整 |
| `https://creator.douyin.com/creator-micro/dashboard` | ❌ | 不同的路径 |
| `http://creator.douyin.com/creator-micro/content/manage` | ❌ | HTTP 而非 HTTPS |
| `https://www.douyin.com/creator-micro/content/manage` | ❌ | 不同的域名 |

---

## 🔐 安全性说明

### 为什么需要页面限制？

1. **避免冲突**
   - 抖音的其他页面可能有不同的 DOM 结构
   - 我们的选择器和逻辑可能导致冲突
   - 限制页面可以避免这种问题

2. **防止误操作**
   - 批量操作按钮可能在不适当的页面造成困惑
   - 页面限制确保用户只在预期的页面看到功能

3. **性能优化**
   - 避免在不需要的页面加载和初始化脚本
   - 减少浏览器内存占用

4. **合规性**
   - 如果抖音更新了页面结构，明确的路径限制能提早发现问题
   - 不会意外影响其他功能页面

---

## ⚙️ 如何修改限制范围

### 场景 1: 支持多个页面

如需插件在多个页面生效，修改 `manifest.json`：

```json
"matches": [
  "https://creator.douyin.com/creator-micro/content/manage*",
  "https://creator.douyin.com/creator-micro/content/draft*"
]
```

然后在 `content_unified.js` 中更新检查：

```javascript
const requiredPaths = [
  '/creator-micro/content/manage',
  '/creator-micro/content/draft'
];

const isValidPage = requiredPaths.some(path => currentUrl.includes(path));
if (!isValidPage) {
  console.log('⚠️ 当前页面不支持');
  return;
}
```

---

### 场景 2: 扩大路径范围

如需支持 `/creator-micro/content` 下的所有页面：

```json
"matches": ["https://creator.douyin.com/creator-micro/content*"]
```

**风险**：可能影响其他子页面

---

## 📞 常见问题

### Q: 为什么其他页面看不到按钮？
**A**: 这是正确的行为。插件仅在 `/creator-micro/content/manage` 页面生效。

---

### Q: 如何确认插件已加载？
**A**: 
1. 打开 F12 开发者工具
2. 查看 Console 输出
3. 看到 `🔥 抖音创作者中心批量管理视频插件已加载` 表示成功

---

### Q: 为什么我在其他页面也看到了按钮？
**A**: 可能是：
1. 页面 URL 包含 `/creator-micro/content/manage` 路径
2. 或者是旧版插件仍在运行，需要重新加载扩展

**解决**：访问 `chrome://extensions/`，找到扩展点击"重新加载"

---

### Q: 能否修改支持的页面？
**A**: 可以，但需要修改两个文件：
1. `manifest.json` - 更新 `matches` 规则
2. `content_unified.js` - 更新运行时检查逻辑

建议保持当前配置，避免误操作。

---

## 📝 总结

✅ **当前配置的优势**：
- 精确的页面控制
- 双重安全检查
- 清晰的日志提示
- 避免误操作和冲突

✅ **用户体验**：
- 仅在需要的页面看到功能
- 其他页面完全不受影响
- 性能最优化

🔒 **安全性**：
- 不会干扰其他页面的功能
- 不会有意外的副作用
- 符合最佳实践

