(() => {
  // ========== 调试模式配置 ==========
  // 设置为 false 用于生产环境（禁用所有日志）
  const DEBUG = false;
  
  // 调试日志包装函数
  const debugLog = (...args) => {
    if (DEBUG) console.log(...args);
  };
  const debugWarn = (...args) => {
    if (DEBUG) console.warn(...args);
  };
  const debugError = (...args) => {
    console.error(...args); // 错误日志始终输出
  };
  
  // ========== 功能开关 ==========
  const REQUIRED_PATH = '/creator-micro/content/manage';
  let isPluginEnabled = false;
  let pluginUIElements = [];
  
  // 检查当前页面是否是目标页面
  const isTargetPage = () => {
    const pathname = new URL(window.location.href).pathname;
    return pathname === REQUIRED_PATH || pathname === REQUIRED_PATH + '/';
  };
  
  // 启用插件 UI 和功能
  const enablePlugin = () => {
    if (isPluginEnabled) return;
    isPluginEnabled = true;
    debugLog('🟢 插件已启用 - 初始化 UI 和功能');
    
    // 立即调用启动检查循环
    if (typeof startCheckLoop === 'function') {
      startCheckLoop();
    } else {
      debugLog('⚠️ startCheckLoop 还未定义，延迟执行');
      setTimeout(() => {
        if (typeof startCheckLoop === 'function') {
          startCheckLoop();
        }
      }, 100);
    }
  };
  
  // 禁用插件 UI 和功能
  const disablePlugin = () => {
    if (!isPluginEnabled) return;
    isPluginEnabled = false;
    debugLog('🔴 插件已禁用 - 清理 UI 元素和监听器');
    
    // 清理 startCheckLoop 的监听器
    if (checkInterval) clearInterval(checkInterval);
    if (tabObserver) tabObserver.disconnect();
    
    // 移除所有插件 UI 元素
    pluginUIElements.forEach(el => {
      try { el.remove(); } catch(e) {}
    });
    pluginUIElements = [];
  };
  
  // 监听路由变化，动态启用/禁用插件
  const setupRouteListener = () => {
    let lastPathname = new URL(window.location.href).pathname;
    
    const checkRoute = () => {
      const newPathname = new URL(window.location.href).pathname;
      if (newPathname === lastPathname) return;
      
      debugLog('🔄 路由变化:', lastPathname, '→', newPathname);
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
  
  // ========== 延迟初始化函数 ==========
  
  debugLog('🚀 抖音创作者中心批量管理视频插件已加载');
  
  // 缓存的视频列表
  let cachedVideoList = [];
  
  // 获取当前页面的 status 参数（根据 tab 确定）
  function getCurrentStatus() {
    // 方法1: 从 URL 参数中读取
    const urlParams = new URLSearchParams(window.location.search);
    const statusFromUrl = urlParams.get('status');
    if (statusFromUrl !== null) {
      return statusFromUrl;
    }
    
    // 方法2: 从 hash 中读取
    const hash = window.location.hash;
    const hashMatch = hash.match(/status=(\d+)/);
    if (hashMatch) {
      return hashMatch[1];
    }
    
    // 方法3: 检查当前激活的 tab（通过 active class）
    const activeTab = document.querySelector('[class*="tab-item"][class*="active"]');
    if (activeTab) {
      const tabText = activeTab.textContent?.trim();
      // 根据文本内容映射到 status 值
      const statusMap = {
        '全部作品': '0',
        '已发布': '1',
        '审核中': '2',
        '未通过': '3'
      };
      
      if (statusMap[tabText]) {
        return statusMap[tabText];
      }
    }
    
    // 默认返回 0（已发布）
    return '0';
  }
  
  // 增量加载视频列表（按需加载，每次12个）
  let isFetching = false; // 防止重复请求
  let nextCursor = 0; // 记录下一页的游标（时间戳）
  
  async function fetchMoreVideos(neededCount) {
    if (isFetching) {
      debugLog('⏸️ 已有请求正在进行中，跳过...');
      return false;
    }
    
    try {
      isFetching = true;
      const status = getCurrentStatus();
      const currentCount = cachedVideoList.length;
      const countToFetch = 12; // 固定每次拉12个
      
      debugLog(`📡 增量请求视频 (当前${currentCount}个，需要${neededCount}个，拉取${countToFetch}个)...`);
      debugLog(`   max_cursor: ${nextCursor}`);
      
      // 构建完整的请求参数
      const params = new URLSearchParams({
        scene: 'star_atlas',
        device_platform: 'android',
        status: status,
        count: countToFetch,
        max_cursor: nextCursor,
        cookie_enabled: 'true',
        screen_width: window.screen.width || 1920,
        screen_height: window.screen.height || 1080,
        browser_language: navigator.language || 'zh-CN',
        browser_platform: navigator.platform || 'MacIntel',
        browser_name: 'Mozilla',
        browser_version: navigator.userAgent,
        browser_online: navigator.onLine,
        timezone_name: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
        aid: '1128',
        support_h265: '1'
      });
      
      const response = await fetch(`https://creator.douyin.com/janus/douyin/creator/pc/work_list?${params.toString()}`, {
        credentials: 'include',
        headers: {
          'accept': '*/*',
          'accept-language': 'zh-CN,zh;q=0.9'
        }
      });
      
      const data = await response.json();
      if (data && data.aweme_list && Array.isArray(data.aweme_list)) {
        // 只缓存必要字段，减少内存占用
        const essentialData = data.aweme_list.map(video => {
          // 获取下载链接 - 优先使用 download_addr，备用 play_addr
          let downloadUrl = '';
          
          // 调试：输出完整的视频数据结构
          debugLog('🎬 视频数据结构:', {
            aweme_id: video.aweme_id,
            has_video: !!video.video,
            has_download_addr: !!video.video?.download_addr,
            has_play_addr: !!video.video?.play_addr,
            download_urls: video.video?.download_addr?.url_list,
            play_urls: video.video?.play_addr?.url_list
          });
          
          if (video.video?.download_addr?.url_list?.length > 0) {
            // 使用第三个链接（creator.douyin.com），通常最稳定
            downloadUrl = video.video.download_addr.url_list[2] || 
                         video.video.download_addr.url_list[0];
            debugLog('✅ 从 download_addr 获取:', downloadUrl);
          } else if (video.video?.play_addr?.url_list?.length > 0) {
            downloadUrl = video.video.play_addr.url_list[2] || 
                         video.video.play_addr.url_list[0];
            debugLog('✅ 从 play_addr 获取:', downloadUrl);
          } else {
            debugWarn('⚠️ 视频没有可用的下载链接:', video.aweme_id);
          }
          
          return {
            aweme_id: video.aweme_id,
            allow_download: video.video_control?.allow_download ?? true,  // 下载权限
            private_status: video.status?.private_status ?? 0,  // 可见性: 0=公开, 1=私密, 2=好友
            download_url: downloadUrl,  // 下载链接
            title: video.desc || `video_${video.aweme_id}`  // 视频标题，用于文件名
          };
        });
        
        cachedVideoList = cachedVideoList.concat(essentialData);
        
        // 重要：使用返回的 max_cursor 作为下次请求的游标
        if (data.max_cursor) {
          nextCursor = data.max_cursor;
          debugLog(`   下次请求的 max_cursor: ${nextCursor}`);
        }
        
        debugLog(`✅ 成功拉取 ${data.aweme_list.length} 个视频，总计: ${cachedVideoList.length} 个`);
        if (data.aweme_list[0]) {
          debugLog('   第一个视频ID:', data.aweme_list[0].aweme_id);
        }
        if (data.aweme_list[data.aweme_list.length - 1]) {
          debugLog('   最后一个视频ID:', data.aweme_list[data.aweme_list.length - 1].aweme_id);
        }

        isFetching = false;
        return true;
      } else {
        debugError('❌ API返回数据格式不正确:', data);
        isFetching = false;
        return false;
      }
    } catch (e) {
      debugError('❌ 请求视频列表失败:', e);
      isFetching = false;
      return false;
    }
  }
  
  // ========== 视频管理页面逻辑 ==========
  
  // 辅助函数：切换自定义复选框状态
  function toggleCustomCheckbox(checkboxDiv, forceState = null) {
      const isChecked = checkboxDiv.getAttribute('data-checked') === 'true';
      const newState = forceState !== null ? forceState : !isChecked;
      
      checkboxDiv.setAttribute('data-checked', newState);
      
      // 更新 UI
      if (newState) {
          checkboxDiv.style.backgroundColor = '#ff4d4f';
          checkboxDiv.style.borderColor = '#ff4d4f';
          checkboxDiv.innerHTML = '<svg viewBox="0 0 1024 1024" width="12" height="12" fill="#ffffff"><path d="M912 190h-69.9c-9.8 0-19.1 4.5-25.1 12.2L404.7 724.5 207 474a32 32 0 0 0-25.1-12.2H112c-6.7 0-10.4 7.7-6.3 12.9l273.9 347c12.8 16.2 37.4 16.2 50.3 0l488.4-618.9c4.1-5.1 0.4-12.8-6.3-12.8z"/></svg>';
      } else {
          checkboxDiv.style.backgroundColor = '#ffffff';
          checkboxDiv.style.borderColor = '#d9d9d9';
          checkboxDiv.innerHTML = '';
      }
  }

  function insertCheckboxesVideo() {
    // 抖音视频卡片的选择器
    const rows = document.querySelectorAll('[class*="video-card"]');
    rows.forEach((el) => {
      // 过滤内部元素
      const className = el.className;
      if (className.includes('cover') || className.includes('content') || className.includes('info') || className.includes('top') || className.includes('bottom')) return;

      // 避免重复插入
      if (el.querySelector('.dy-bulk-checkbox-wrapper')) return;

      // 确保父容器定位
      const parentStyle = window.getComputedStyle(el);
      if (parentStyle.position === 'static') {
          el.style.position = 'relative';
      }

      // 容器
      const wrapper = document.createElement('div');
      wrapper.className = 'dy-bulk-checkbox-wrapper';
      wrapper.style.position = 'absolute';
      wrapper.style.left = '6px';
      wrapper.style.top = '6px';
      wrapper.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
      wrapper.style.borderRadius = '4px';
      wrapper.style.padding = '4px';
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.justifyContent = 'center';
      wrapper.style.cursor = 'pointer';
      
      // 自定义复选框
      const checkbox = document.createElement('div');
      checkbox.className = 'dy-bulk-custom-checkbox';
      checkbox.style.width = '18px';
      checkbox.style.height = '18px';
      checkbox.style.borderRadius = '4px';
      checkbox.style.border = '1px solid #d9d9d9';
      checkbox.style.backgroundColor = '#ffffff';
      checkbox.style.display = 'flex';
      checkbox.style.alignItems = 'center';
      checkbox.style.justifyContent = 'center';
      checkbox.style.transition = 'all 0.2s';
      checkbox.setAttribute('data-checked', 'false');
      
      // 事件处理
      const handleClick = (e) => {
          e.stopPropagation();
          e.preventDefault(); // 防止触发父级点击
          toggleCustomCheckbox(checkbox);
      };

      wrapper.addEventListener('click', handleClick);
      // 阻止其他事件冒泡
      ['mousedown', 'mouseup', 'dblclick'].forEach(evt => {
          wrapper.addEventListener(evt, (e) => e.stopPropagation());
      });

      wrapper.appendChild(checkbox);
      el.appendChild(wrapper);
    });
  }

  function insertControlsVideo() {
    // 优先寻找用户指定的容器 class="content-body-ITDUWf"
    // 使用模糊匹配以防hash变化
    let targetContainer = document.querySelector('[class*="content-body"]');
    let insertMode = 'prepend'; 

    // 如果找不到 content-body，尝试通过 video-card 向上查找
    if (!targetContainer) {
        const firstCard = document.querySelector('[class*="video-card"]');
        if (firstCard && firstCard.parentElement) {
             targetContainer = firstCard.parentElement;
        }
    }
    
    // 如果还是找不到正确容器，直接返回，等待下次检测
    if (!targetContainer) {
        return;
    }

    // 检查已存在的按钮
    const existingControls = document.getElementById('dy-bulk-controls');
    
    // 如果按钮已存在且在正确位置，直接返回
    if (existingControls && existingControls.parentElement === targetContainer) {
      return; // 已经在正确的容器中，不需要重新插入
    }
    
    // 位置不对，移除旧的
    if (existingControls) {
      debugLog('🔄 按钮位置不正确，重新插入...');
      existingControls.remove();
    }

    const container = document.createElement('div');
    container.id = 'dy-bulk-controls';
    container.style.display = 'flex';
    container.style.gap = '10px';
    // container.style.zIndex = '999';
    
    // 嵌入式样式：在列表上方
    container.style.position = 'relative';
    container.style.marginBottom = '10px';
    container.style.background = 'transparent';
    container.style.width = '100%';
    container.style.justifyContent = 'flex-start';
    container.style.alignItems = 'center';
    container.style.padding = '10px 0';

    const selectAllBtn = document.createElement('button');
    selectAllBtn.textContent = '全选';
    selectAllBtn.style.fontWeight = 'bold';
    selectAllBtn.style.background = '#ff4d4f';
    selectAllBtn.style.color = '#fff';
    selectAllBtn.style.border = 'none';
    selectAllBtn.style.padding = '6px 16px';
    selectAllBtn.style.borderRadius = '4px';
    selectAllBtn.style.cursor = 'pointer';
    selectAllBtn.style.fontSize = '14px';
    selectAllBtn.onclick = selectAllVideo;

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '批量删除';
    deleteBtn.style.fontWeight = 'bold';
    deleteBtn.style.background = '#333';
    deleteBtn.style.color = '#fff';
    deleteBtn.style.border = 'none';
    deleteBtn.style.padding = '6px 16px';
    deleteBtn.style.borderRadius = '4px';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.fontSize = '14px';
    deleteBtn.onclick = bulkDeleteVideo;

    // 分隔符1
    const separator1 = document.createElement('span');
    separator1.textContent = '│';
    separator1.style.color = '#d9d9d9';
    separator1.style.fontSize = '20px';
    separator1.style.lineHeight = '1';

    // 可见性按钮组
    const publicBtn = document.createElement('button');
    publicBtn.textContent = '公开';
    publicBtn.style.fontWeight = 'bold';
    publicBtn.style.background = '#1890ff';
    publicBtn.style.color = '#fff';
    publicBtn.style.border = 'none';
    publicBtn.style.padding = '6px 16px';
    publicBtn.style.borderRadius = '4px';
    publicBtn.style.cursor = 'pointer';
    publicBtn.style.fontSize = '14px';
    publicBtn.onclick = () => bulkUpdateVisibility(0);

    const privateBtn = document.createElement('button');
    privateBtn.textContent = '私密';
    privateBtn.style.fontWeight = 'bold';
    privateBtn.style.background = '#722ed1';
    privateBtn.style.color = '#fff';
    privateBtn.style.border = 'none';
    privateBtn.style.padding = '6px 16px';
    privateBtn.style.borderRadius = '4px';
    privateBtn.style.cursor = 'pointer';
    privateBtn.style.fontSize = '14px';
    privateBtn.onclick = () => bulkUpdateVisibility(1);

    const friendBtn = document.createElement('button');
    friendBtn.textContent = '好友';
    friendBtn.style.fontWeight = 'bold';
    friendBtn.style.background = '#13c2c2';
    friendBtn.style.color = '#fff';
    friendBtn.style.border = 'none';
    friendBtn.style.padding = '6px 16px';
    friendBtn.style.borderRadius = '4px';
    friendBtn.style.cursor = 'pointer';
    friendBtn.style.fontSize = '14px';
    friendBtn.onclick = () => bulkUpdateVisibility(2);

    // 分隔符2
    const separator2 = document.createElement('span');
    separator2.textContent = '│';
    separator2.style.color = '#d9d9d9';
    separator2.style.fontSize = '20px';
    separator2.style.lineHeight = '1';

    // 下载权限按钮组
    const allowDownloadBtn = document.createElement('button');
    allowDownloadBtn.textContent = '✓ 允许下载';
    allowDownloadBtn.style.fontWeight = 'bold';
    allowDownloadBtn.style.background = '#52c41a';
    allowDownloadBtn.style.color = '#fff';
    allowDownloadBtn.style.border = 'none';
    allowDownloadBtn.style.padding = '6px 16px';
    allowDownloadBtn.style.borderRadius = '4px';
    allowDownloadBtn.style.cursor = 'pointer';
    allowDownloadBtn.style.fontSize = '14px';
    allowDownloadBtn.onclick = () => bulkUpdateDownload(1);

    const disallowDownloadBtn = document.createElement('button');
    disallowDownloadBtn.textContent = '✗ 禁止下载';
    disallowDownloadBtn.style.fontWeight = 'bold';
    disallowDownloadBtn.style.background = '#fa8c16';
    disallowDownloadBtn.style.color = '#fff';
    disallowDownloadBtn.style.border = 'none';
    disallowDownloadBtn.style.padding = '6px 16px';
    disallowDownloadBtn.style.borderRadius = '4px';
    disallowDownloadBtn.style.cursor = 'pointer';
    disallowDownloadBtn.style.fontSize = '14px';
    disallowDownloadBtn.onclick = () => bulkUpdateDownload(0);

    // 分隔符3
    const separator3 = document.createElement('span');
    separator3.textContent = '│';
    separator3.style.color = '#d9d9d9';
    separator3.style.fontSize = '20px';
    separator3.style.lineHeight = '1';

    // 批量下载按钮
    const downloadVideosBtn = document.createElement('button');
    downloadVideosBtn.textContent = '📥 批量下载';
    downloadVideosBtn.style.fontWeight = 'bold';
    downloadVideosBtn.style.background = '#1890ff';
    downloadVideosBtn.style.color = '#fff';
    downloadVideosBtn.style.border = 'none';
    downloadVideosBtn.style.padding = '6px 16px';
    downloadVideosBtn.style.borderRadius = '4px';
    downloadVideosBtn.style.cursor = 'pointer';
    downloadVideosBtn.style.fontSize = '14px';
    downloadVideosBtn.onclick = bulkDownloadVideo;

    container.appendChild(selectAllBtn);
    container.appendChild(deleteBtn);
    container.appendChild(separator1);
    container.appendChild(publicBtn);
    container.appendChild(privateBtn);
    container.appendChild(friendBtn);
    container.appendChild(separator2);
    container.appendChild(allowDownloadBtn);
    container.appendChild(disallowDownloadBtn);
    container.appendChild(separator3);
    container.appendChild(downloadVideosBtn);

    if (insertMode === 'prepend') {
        targetContainer.insertBefore(container, targetContainer.firstChild);
    } else {
        document.body.appendChild(container);
    }
  }

  // 从缓存的视频列表中获取ID
  async function getItemsVideo() {
    debugLog('📋 执行 getItemsVideo...');
    
    const wrappers = document.querySelectorAll('.dy-bulk-checkbox-wrapper');
    debugLog('找到复选框容器:', wrappers.length, '个');
    debugLog('缓存的视频列表:', cachedVideoList.length, '个');
    
    // 如果缓存数量少于DOM数量，需要加载更多
    if (cachedVideoList.length < wrappers.length) {
      debugLog('⚠️ 缓存不足，需要加载更多视频...');
      await fetchMoreVideos(wrappers.length);
      debugLog('补充加载后，缓存数量:', cachedVideoList.length);
    }
    
    const items = [];
    let skippedCount = 0;
    
    // 使用缓存的视频列表
    if (cachedVideoList.length > 0) {
      wrappers.forEach((wrapper, index) => {
        const checkbox = wrapper.querySelector('.dy-bulk-custom-checkbox');
        const el = wrapper.parentElement;
        const isChecked = checkbox && checkbox.getAttribute('data-checked') === 'true';
        
        if (cachedVideoList[index] && cachedVideoList[index].aweme_id) {
          const videoData = cachedVideoList[index];
          items.push({
            el,
            itemId: videoData.aweme_id,
            checkbox,
            isChecked,
            allowDownload: videoData.allow_download,     // 当前下载权限
            privateStatus: videoData.private_status,     // 当前可见性
            downloadUrl: videoData.download_url,         // 下载链接
            title: videoData.title                       // 视频标题
          });
          
          if (index < 3 || isChecked) {
            debugLog(`  视频${index+1} ID:`, videoData.aweme_id, isChecked ? '✅已选中' : '');
          }
        } else {
          skippedCount++;
          debugWarn(`  ⚠️ 跳过视频${index+1}：缓存中没有对应数据`);
        }
      });
    } else {
      debugWarn('⚠️ 无法获取视频列表数据！');
    }
    
    if (skippedCount > 0) {
      debugWarn(`⚠️ 总共跳过了 ${skippedCount} 个视频，可能导致选中失败！`);
    }
    
    debugLog('getItemsVideo 返回:', items.length, '个视频');
    return items;
  }

  async function selectAllVideo() {
    const wrappers = document.querySelectorAll('.dy-bulk-checkbox-wrapper');
    let count = 0;
    wrappers.forEach(wrapper => {
      const checkbox = wrapper.querySelector('.dy-bulk-custom-checkbox');
      if (checkbox) {
        toggleCustomCheckbox(checkbox, true);
        count++;
      }
    });
    const items = await getItemsVideo();
    items.forEach(({ el }) => {
      el.style.outline = '2px solid #ff4d4f';
      el.setAttribute('data-selected', 'true');
    });
    alert(`已选中 ${count} 个视频`);
  }

  async function bulkDeleteVideo() {
    debugLog('🗑️ 开始批量删除...');
    const allItems = await getItemsVideo();
    debugLog('getItemsVideo 返回:', allItems.length, '个视频');
    
    const items = allItems.filter(({ isChecked }) => isChecked);
    debugLog('选中的视频数量:', items.length);
    
    if (items.length === 0) {
      debugLog('❌ 没有选中的视频！');
      alert('未选中任何视频');
      return;
    }
    if (!confirm(`确定要删除选中的 ${items.length} 个视频吗？此操作不可撤销。`)) return;

    let ok = 0;
    let failed = 0;
    
    for (let i = 0; i < items.length; i++) {
      const { itemId } = items[i];
      try {
        // 抖音删除API: POST /web/api/media/aweme/delete/
        // 参数: item_id=<作品ID>
        const formData = new URLSearchParams();
        formData.append('item_id', itemId);
        
        const resp = await fetch('https://creator.douyin.com/web/api/media/aweme/delete/', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'include',
          body: formData.toString()
        });
        
        if (resp.ok) {
          const data = await resp.json();
          // 抖音API成功返回通常status_code为0
          if (data.status_code === 0) {
            ok++;
            debugLog('删除成功:', itemId);
          } else {
            failed++;
            debugWarn('删除失败:', itemId, data);
          }
        } else {
          failed++;
          debugWarn('请求失败:', itemId, resp.status);
        }
        
        // 每次请求间隔1000ms，避免请求过快
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        failed++;
        debugWarn('删除出错:', itemId, e);
      }
    }
    
    alert(`删除完成！成功: ${ok}，失败: ${failed}。请刷新页面查看结果。`);
  }

  // 批量更新视频可见性
  async function bulkUpdateVisibility(visibilityType) {
    const visibilityNames = ['公开', '仅自己可见', '好友可见'];
    const visibilityName = visibilityNames[visibilityType] || '未知';
    
    debugLog('🔐 开始批量设置可见性:', visibilityName);
    const allItems = await getItemsVideo();
    const items = allItems.filter(({ isChecked }) => isChecked);
    
    if (items.length === 0) {
      alert('请先选择要设置的视频');
      return;
    }
    
    if (!confirm(`确定要将选中的 ${items.length} 个视频设置为【${visibilityName}】吗？`)) {
      return;
    }
    
    let ok = 0, failed = 0;
    
    for (let i = 0; i < items.length; i++) {
      const { itemId, allowDownload } = items[i];
      try {
        const formData = new URLSearchParams();
        formData.append('item_id', itemId);
        formData.append('visibility_type', visibilityType);
        formData.append('download', allowDownload ? 1 : 0);  // 保持当前下载权限不变
        formData.append('xg_user_id', '0');
        formData.append('dx_upgraded', '0');
        
        const resp = await fetch('https://creator.douyin.com/web/api/media/aweme/update/', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          },
          credentials: 'include',
          body: formData.toString()
        });
        
        if (resp.ok) {
          const data = await resp.json();
          if (data.status_code === 0) {
            ok++;
            debugLog('设置可见性成功:', itemId, visibilityName);
          } else {
            failed++;
            debugWarn('设置可见性失败:', itemId, data);
          }
        } else {
          failed++;
          debugWarn('请求失败:', itemId, resp.status);
        }
        
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        failed++;
        debugError('设置可见性出错:', itemId, e);
      }
    }
    
    alert(`设置完成！成功: ${ok}，失败: ${failed}`);
    
    if (ok > 0) {
      location.reload();
    }
  }

  // 批量更新视频下载权限
  async function bulkUpdateDownload(downloadEnabled) {
    const downloadName = downloadEnabled ? '允许下载' : '禁止下载';
    
    debugLog('📥 开始批量设置下载权限:', downloadName);
    const allItems = await getItemsVideo();
    const items = allItems.filter(({ isChecked }) => isChecked);
    
    if (items.length === 0) {
      alert('请先选择要设置的视频');
      return;
    }
    
    if (!confirm(`确定要将选中的 ${items.length} 个视频设置为【${downloadName}】吗？`)) {
      return;
    }
    
    let ok = 0, failed = 0;
    
    for (let i = 0; i < items.length; i++) {
      const { itemId, privateStatus } = items[i];
      try {
        const formData = new URLSearchParams();
        formData.append('item_id', itemId);
        formData.append('download', downloadEnabled);
        formData.append('visibility_type', privateStatus);  // 保持当前可见性不变
        formData.append('xg_user_id', '0');
        formData.append('dx_upgraded', '0');
        
        const resp = await fetch('https://creator.douyin.com/web/api/media/aweme/update/', {
          method: 'POST',
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          },
          credentials: 'include',
          body: formData.toString()
        });
        
        if (resp.ok) {
          const data = await resp.json();
          if (data.status_code === 0) {
            ok++;
            debugLog('设置下载权限成功:', itemId, downloadName);
          } else {
            failed++;
            debugWarn('设置下载权限失败:', itemId, data);
          }
        } else {
          failed++;
          debugWarn('请求失败:', itemId, resp.status);
        }
        
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        failed++;
        debugError('设置下载权限出错:', itemId, e);
      }
    }
    
    alert(`设置完成！成功: ${ok}，失败: ${failed}`);
    
    if (ok > 0) {
      location.reload();
    }
  }

  // ========== 下载进度UI ==========
  function createDownloadProgressUI(total) {
    const container = document.createElement('div');
    container.id = 'dy-download-progress';
    container.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      width: 360px;
      max-height: 520px;
      background: white;
      border: 2px solid #1890ff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', sans-serif;
      overflow: hidden;
      transition: all 0.3s ease;
    `;
    
    const header = document.createElement('div');
    header.style.cssText = `
      background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
      color: white;
      padding: 12px 16px;
      font-weight: bold;
      font-size: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    `;
    
    const titleSpan = document.createElement('span');
    titleSpan.textContent = '📥 批量下载进度';
    
    const rightContainer = document.createElement('div');
    rightContainer.style.display = 'flex';
    rightContainer.style.alignItems = 'center';
    rightContainer.style.gap = '10px';
    
    const countSpan = document.createElement('span');
    countSpan.id = 'dy-download-count';
    countSpan.textContent = `0/${total}`;
    
    const collapseBtn = document.createElement('button');
    collapseBtn.textContent = '−';
    collapseBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.18);
      border: 1px solid rgba(255, 255, 255, 0.35);
      color: white;
      width: 26px;
      height: 26px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: all 0.2s;
    `;
    collapseBtn.onmouseover = () => {
      collapseBtn.style.background = 'rgba(255, 255, 255, 0.28)';
    };
    collapseBtn.onmouseout = () => {
      collapseBtn.style.background = 'rgba(255, 255, 255, 0.18)';
    };
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.18);
      border: 1px solid rgba(255, 255, 255, 0.35);
      color: white;
      width: 26px;
      height: 26px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: all 0.2s;
    `;
    closeBtn.onmouseover = () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.28)';
    };
    closeBtn.onmouseout = () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.18)';
    };
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      container.remove();
    };
    
    let isCollapsed = false;
    
    const list = document.createElement('div');
    list.id = 'dy-download-list';
    list.style.cssText = `
      max-height: 420px;
      overflow-y: auto;
      padding: 8px;
      transition: max-height 0.3s ease, opacity 0.3s ease;
    `;
    
    // 折叠/展开逻辑
    const toggleCollapse = () => {
      isCollapsed = !isCollapsed;
      if (isCollapsed) {
        list.style.maxHeight = '0px';
        list.style.opacity = '0';
        list.style.overflow = 'hidden';
        collapseBtn.textContent = '+';
      } else {
        list.style.maxHeight = '420px';
        list.style.opacity = '1';
        collapseBtn.textContent = '−';
      }
    };
    collapseBtn.onclick = (e) => {
      e.stopPropagation();
      toggleCollapse();
    };
    
    rightContainer.appendChild(countSpan);
    rightContainer.appendChild(collapseBtn);
    rightContainer.appendChild(closeBtn);
    header.appendChild(titleSpan);
    header.appendChild(rightContainer);
    
    // 提示：文件保存在浏览器下载列表
    const hint = document.createElement('div');
    hint.textContent = '文件保存在浏览器“下载”列表，可随时手动关闭本窗口。';
    hint.style.cssText = `
      font-size: 12px;
      color: #8c8c8c;
      padding: 6px 12px 0 12px;
      line-height: 16px;
    `;
    
    container.appendChild(header);
    container.appendChild(hint);
    container.appendChild(list);
    document.body.appendChild(container);
    
    return { container, list, total, toggleCollapse, completedCount: 0 };
  }
  
  function updateDownloadProgress(progressUI, index, filename, status) {
    const { list, total } = progressUI;
    const countEl = document.getElementById('dy-download-count');
    
    // 完成计数只在成功/失败时递增
    if (status === 'success' || status === 'failed') {
      progressUI.completedCount = (progressUI.completedCount || 0) + 1;
    }
    if (countEl) {
      const completed = progressUI.completedCount || 0;
      countEl.textContent = `${completed}/${total}`;
    }
    
    // 创建或更新列表项
    let itemEl = document.getElementById(`dy-download-item-${index}`);
    if (!itemEl) {
      itemEl = document.createElement('div');
      itemEl.id = `dy-download-item-${index}`;
      itemEl.style.cssText = `
        padding: 10px 12px;
        margin-bottom: 6px;
        background: #f5f5f5;
        border-radius: 6px;
        font-size: 13px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        transition: all 0.3s;
      `;
      itemEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; min-height:24px;">
          <span class="dy-dl-icon" style="font-size:18px; flex-shrink:0;">⏳</span>
          <span class="dy-dl-title" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#666;">${filename}</span>
        </div>
        <div class="dy-dl-bar" style="width:100%; height:6px; background:#f0f0f0; border-radius:4px; overflow:hidden;">
          <div class="dy-dl-bar-inner" style="width:0%; height:100%; background:linear-gradient(90deg,#91d5ff,#1890ff); transition:width 0.3s ease;">
          </div>
        </div>
      `;
      list.appendChild(itemEl);
    }
    
    const iconEl = itemEl.querySelector('.dy-dl-icon');
    const titleEl = itemEl.querySelector('.dy-dl-title');
    const barInner = itemEl.querySelector('.dy-dl-bar-inner');
    
    let icon = '⏳';
    let color = '#666';
    let bgColor = '#f5f5f5';
    let barColor = 'linear-gradient(90deg,#91d5ff,#1890ff)';
    let barWidth = '0%';
    
    if (status === 'pending') {
      icon = '⌛';
      color = '#8c8c8c';
      bgColor = '#fafafa';
      barColor = '#f0f0f0';
      barWidth = '0%';
    } else if (status === 'downloading') {
      icon = '⬇️';
      color = '#1890ff';
      bgColor = '#e6f7ff';
      barWidth = '50%';
    } else if (status === 'success') {
      icon = '✅';
      color = '#52c41a';
      bgColor = '#f6ffed';
      barColor = '#52c41a';
      barWidth = '100%';
    } else if (status === 'failed') {
      icon = '❌';
      color = '#ff4d4f';
      bgColor = '#fff1f0';
      barColor = '#ff7875';
      barWidth = '100%';
    } else if (status === 'completed') {
      icon = '🎉';
      color = '#52c41a';
      bgColor = '#f6ffed';
      barColor = '#52c41a';
      barWidth = '100%';
    }
    
    itemEl.style.background = bgColor;
    itemEl.style.borderLeft = `3px solid ${color}`;
    if (iconEl) iconEl.textContent = icon;
    if (titleEl) {
      titleEl.textContent = filename;
      titleEl.style.color = color;
    }
    if (barInner) {
      barInner.style.background = barColor;
      barInner.style.width = barWidth;
    }
    
    if (status === 'downloading') {
      itemEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
  
  function removeDownloadProgressUI(progressUI) {
    if (progressUI && progressUI.container) {
      progressUI.container.style.opacity = '0';
      progressUI.container.style.transform = 'translateX(400px)';
      setTimeout(() => {
        if (progressUI.container.parentNode) {
          progressUI.container.parentNode.removeChild(progressUI.container);
        }
      }, 300);
    }
  }

  // ========== 批量下载视频 ==========
  async function bulkDownloadVideo() {
    debugLog('📥 开始批量下载视频');
    const allItems = await getItemsVideo();
    const items = allItems.filter(({ isChecked }) => isChecked);
    
    if (items.length === 0) {
      alert('请先选择要下载的视频');
      return;
    }
    
    // 过滤掉没有下载链接的视频
    const validItems = items.filter(item => item.downloadUrl);
    if (validItems.length === 0) {
      alert('选中的视频没有可用的下载链接，请稍后重试');
      return;
    }
    
    if (validItems.length < items.length) {
      const skipCount = items.length - validItems.length;
      if (!confirm(`有 ${skipCount} 个视频没有下载链接将被跳过，是否继续下载其他 ${validItems.length} 个视频？`)) {
        return;
      }
    } else {
      if (!confirm(`确定要下载选中的 ${validItems.length} 个视频吗？\n\n下载将逐个进行，请耐心等待...\n建议：为避免触发限流，下载间隔为 2-4 秒`)) {
        return;
      }
    }
    
    // 创建下载进度UI，并预先展示所有待下载项目
    const progressUI = createDownloadProgressUI(validItems.length);
    const downloadQueue = validItems.map(({ itemId, title }, idx) => {
      const cleanTitle = (title || `video_${itemId}`)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .substring(0, 100);
      const filename = `${cleanTitle}.mp4`;
      updateDownloadProgress(progressUI, idx, filename, 'pending');
      return { itemId, filename, downloadUrl: validItems[idx].downloadUrl };
    });
    
    let ok = 0, failed = 0;
    
    // 创建下载函数
    const downloadVideo = async (url, filename) => {
      try {
        debugLog('📥 开始下载:', filename, 'URL:', url);
        
        // 使用 fetch 获取视频（不携带凭证，避免CORS跨域问题）
        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',  // 关键：不发送Cookie，避免CORS wildcard限制
          headers: {
            'Accept': '*/*',
          }
        });
        
        debugLog('📊 响应状态:', response.status, response.statusText);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        // 获取 blob
        const blob = await response.blob();
        debugLog('📦 Blob 大小:', (blob.size / 1024 / 1024).toFixed(2), 'MB');
        
        // 创建下载链接
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        
        debugLog('✅ 触发下载:', filename);
        
        // 清理
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        }, 100);
        
        return true;
      } catch (e) {
        debugError('❌ 下载失败:', filename, e);
        return false;
      }
    };
    
    // 带重试机制的下载函数（针对403等临时错误）
    const downloadVideoWithRetry = async (url, filename, maxRetries = 2) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const success = await downloadVideo(url, filename);
        if (success) {
          return true;
        }
        
        // 如果失败且还有重试次数，等待后重试
        if (attempt < maxRetries) {
          const retryDelay = 3000 + Math.random() * 2000; // 3-5秒
          debugLog(`⚠️ 下载失败，${(retryDelay/1000).toFixed(1)}秒后重试 (${attempt}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, retryDelay));
        }
      }
      debugWarn(`❌ 重试 ${maxRetries} 次后仍然失败:`, filename);
      return false;
    };
    
    // 逐个下载视频
    for (let i = 0; i < downloadQueue.length; i++) {
      const { itemId, downloadUrl, filename } = downloadQueue[i];
      
      try {
        debugLog(`下载进度: [${i + 1}/${downloadQueue.length}] ${filename}`);
        updateDownloadProgress(progressUI, i, filename, 'downloading');
        
        const success = await downloadVideoWithRetry(downloadUrl, filename);
        
        if (success) {
          ok++;
          debugLog('✅ 下载成功:', filename);
          updateDownloadProgress(progressUI, i, filename, 'success');
        } else {
          failed++;
          debugWarn('❌ 下载失败:', filename);
          updateDownloadProgress(progressUI, i, filename, 'failed');
        }
        
        // 下载间隔：2-4秒随机，避免触发限流
        if (i < downloadQueue.length - 1) {
          const delay = 2000 + Math.random() * 2000; // 2-4秒
          debugLog(`⏳ 等待 ${(delay/1000).toFixed(1)} 秒后继续...`);
          await new Promise(r => setTimeout(r, delay));
        }
      } catch (e) {
        failed++;
        debugError('下载出错:', itemId, e);
        updateDownloadProgress(progressUI, i, filename, 'failed');
      }
    }
    
    // 完成后只提示，不自动关闭窗口
    updateDownloadProgress(progressUI, downloadQueue.length - 1, '全部完成', 'completed');
    
    const failedMsg = failed > 0 ? `\n\n❌ 失败: ${failed} 个（可能触发限流，建议稍后重试）` : '';
    alert(`✅ 下载完成！\n\n成功: ${ok} 个${failedMsg}\n\n请在浏览器下载管理器中查看文件。`);
    debugLog('📥 批量下载完成，成功:', ok, '失败:', failed);
  }

  let preloadTimeout = null; // 预加载定时器
  let lastDomCount = 0; // 记录上次的DOM数量
  
  function runInitVideo() {
    insertControlsVideo();
    insertCheckboxesVideo();
    
    // 初始加载首页数据
    if (preloadTimeout) clearTimeout(preloadTimeout);
    preloadTimeout = setTimeout(() => {
      if (cachedVideoList.length === 0 && !isFetching) {
        debugLog('🔄 预加载首页视频数据...');
        fetchMoreVideos(12); // 初始加载12个
      }
      preloadTimeout = null;
    }, 1000);
    
    // 监听滚动，按需加载更多
    setupScrollMonitor();
  }
  
  function setupScrollMonitor() {
    // 防止重复绑定
    if (window.__dyScrollMonitorSet) return;
    window.__dyScrollMonitorSet = true;
    
    let scrollTimer = null;
    window.addEventListener('scroll', () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        checkAndLoadMore();
      }, 300); // 滚动停止300ms后检查
    }, { passive: true });
    
    debugLog('✅ 已启用滚动监听');
  }
  
  function checkAndLoadMore() {
    const currentDomCount = document.querySelectorAll('.dy-bulk-checkbox-wrapper').length;
    
    if (currentDomCount > lastDomCount && currentDomCount > cachedVideoList.length) {
      debugLog(`📊 DOM数量变化: ${lastDomCount} → ${currentDomCount}, 缓存: ${cachedVideoList.length}`);
      lastDomCount = currentDomCount;
      fetchMoreVideos(currentDomCount);
    }
  }

  // ========== 统一初始化 ==========
  let lastPageType = null;
  let lastStatus = null; // 记录上次的 status

  function runInit() {
    const url = location.href;
    let currentPageType = null;

    // 根据抖音创作者平台的实际URL结构判断
    if (url.includes('creator.douyin.com')) {
      currentPageType = 'video';
    }
    
    // 检查 status 是否变化（切换了 tab）
    const currentStatus = getCurrentStatus();
    if (lastStatus !== null && lastStatus !== currentStatus) {
      debugLog('🔄 检测到 tab 切换 (status: ' + lastStatus + ' → ' + currentStatus + ')，清空缓存');
      cachedVideoList = [];
      nextCursor = 0; // 重置游标
      lastDomCount = 0; // 重置DOM计数
      // 切换 tab 后预加载新数据
      setTimeout(() => {
        debugLog('🔄 加载新 tab 的视频数据...');
        fetchMoreVideos(12);
      }, 1500);
    }
    lastStatus = currentStatus;

    // 页面类型切换时才清理旧控件
    if (lastPageType !== currentPageType) {
      const oldControls = document.getElementById('dy-bulk-controls');
      if (oldControls) oldControls.remove();
      document.querySelectorAll('.dy-bulk-checkbox-wrapper').forEach(el => el.remove());
      lastPageType = currentPageType;
    }

    if (currentPageType === 'video') {
      runInitVideo();
    }
  }

  // ========== 持续检测目标节点并插入 ==========
  let lastUrl = location.href;
  let checkInterval = null;
  let tabObserver = null;

  function startCheckLoop() {
    // 清理旧的监听器
    if (checkInterval) clearInterval(checkInterval);
    if (tabObserver) tabObserver.disconnect();
    
    // 方案1: 使用 MutationObserver 监听 tab class 变化（立即响应）
    const setupTabObserver = () => {
      const tabContainer = document.querySelector('[class*="tab-item"]')?.parentElement;
      if (tabContainer) {
        debugLog('✅ 找到 tab 容器，启用 MutationObserver');
        tabObserver = new MutationObserver(() => {
          runInit();
        });
        tabObserver.observe(tabContainer, {
          subtree: true,
          attributes: true,
          attributeFilter: ['class']
        });
        return true;
      }
      return false;
    };
    
    // 尝试设置 Observer，如果失败则延迟重试
    if (!setupTabObserver()) {
      setTimeout(setupTabObserver, 1000);
    }
    
    // 方案2: 保留轮询作为兜底（降低频率到 2 秒）
    checkInterval = setInterval(runInit, 2000);
    
    // 初始化时立即执行一次
    runInit();
  }

  function observeUrlChange() {
    // URL 变化监听（轮询法）
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        startCheckLoop();
      }
    }, 300);

    // history API 事件监听
    window.addEventListener('popstate', () => {
      startCheckLoop();
    });

    // 拦截 pushState
    const _pushState = history.pushState;
    history.pushState = function() {
      _pushState.apply(this, arguments);
      setTimeout(startCheckLoop, 100);
    };

    // 拦截 replaceState
    const _replaceState = history.replaceState;
    history.replaceState = function() {
      _replaceState.apply(this, arguments);
      setTimeout(startCheckLoop, 100);
    };

    // hashchange 监听
    window.addEventListener('hashchange', () => {
      startCheckLoop();
    });
  }

  // ========== 入口函数 ==========
  const init = () => {
    debugLog('🚀 初始化插件');
    
    // 设置路由监听（始终启用）
    setupRouteListener();
    
    // 检查初始页面
    if (isTargetPage()) {
      debugLog('📍 初始页面在目标路径上，启用插件');
      enablePlugin();
    } else {
      debugLog('📍 初始页面不在目标路径，等待导航');
    }
  };

  // 确保 DOM 加载后再初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM 已经加载，直接初始化
    setTimeout(init, 100);
  }
})();
