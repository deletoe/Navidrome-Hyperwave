# My Navidrome 5.6 设计规格

## 决策背景

原始需求要求 React + Vite + TypeScript、浏览器 SPA、优先使用 Subsonic/OpenSubsonic，并强调桌面/手机分别适配和强烈的动态曲风视觉。用户明确授权本轮不等待交互确认，因此本规格用已写需求、现有同类实现审计和实时 Navidrome 探测来替代逐段确认。

2026-07-10 的实时探测确认：目标 Navidrome 0.62.0 支持 OpenSubsonic；带 `Origin: http://127.0.0.1:5173` 的 API GET/OPTIONS 返回允许跨域；带 Range 的 `stream.view` 返回 `206 audio/mp4` 并允许 `Range` 预检。空的 `getStarred2` 和部分专辑列表会省略数组字段。

## 比较过的实现路线

### 路线 A：浏览器直连，模块化 SPA（采用）

React 直接请求 Navidrome，使用 token/salt 查询参数，音频和封面同样直接使用服务 URL。优点是符合原始技术方向、部署轻、手机和桌面使用同一构建；当前目标服务的 CORS 和 Range 已实测可用。缺点是未来 HTTPS 部署会遇到混合内容，并依赖服务器 CORS。

### 路线 B：Vite 动态代理

所有请求先进入本地 Vite 中间件再转发 Navidrome。它能绕过 CORS，但只对开发服务器天然成立，生产预览和部署要再实现一次；允许任意目标还引入本地 SSRF 防护和流媒体转发复杂度。本版不采用。

### 路线 C：独立 BFF/本地服务

用 Node 服务持有凭据、代理 API/音频并托管前端。它最适合未来 HTTPS、远程访问和凭据隔离，但改变了“浏览器 SPA 直连”的产品形态，也扩大了服务生命周期、安全和部署范围。本版不采用。

采用路线 A，同时让 Subsonic client 独占 URL 构造和 `fetch` 注入点。未来加入代理只需替换 transport，不改变 UI、队列或主题层。

## 架构

### 1. API 与数据模型

- `src/types.ts`：Navidrome 实体、页面状态和视觉人格公共类型。
- `src/lib/subsonic.ts`：URL 归一化、token/salt、响应解包、空数组归一化、端点方法和错误分类。
- `src/lib/mediaUrls.ts`：按客户端会话缓存封面和音频 URL，确保重绘时地址稳定。
- `src/lib/format.ts`：时长、数量和 URL 展示函数。

`createSubsonicClient(config)` 返回稳定会话对象，提供 `ping`、专辑列表、专辑、艺术家、曲风歌曲、搜索、收藏、scrobble、封面和流 URL。任何 `status=failed` 都转换为包含 code 的 `SubsonicError`。HTTP 错误、JSON 错误和浏览器网络错误保留不同的用户诊断。

### 2. 会话与资料库状态

- `src/hooks/useNavidrome.ts` 管理连接/断开、分区数据、搜索、详情、收藏和重试。
- 连接成功后用 `Promise.allSettled` 并行加载 newest/random/frequent/genres/starred；失败分区生成非阻断 warning。
- password/API key 只存在 hook state 和 Subsonic client closure；localStorage 仅保存服务器 URL 和用户名。
- 断开时清除 client、资料库详情、搜索和收藏状态，并调用播放器 reset。

### 3. 播放器与队列

- `src/state/playerQueue.ts` 是纯 reducer，定义 play-now、append、select、next、previous、remove、clear、shuffle 和 repeat。
- `src/hooks/useAudioPlayer.ts` 独占一个 `HTMLAudioElement` ref，负责媒体装载、播放状态、进度、音量、错误、scrobble 和 Media Session。
- 队列从非空变为空时 hook 必须 pause、移除 `src` 并 load；这个行为不依赖 React effect 提前返回。
- 播放结束时：repeat one 重播；队尾 repeat all 回到首项；repeat off 停止。

### 4. 页面和组件

- `ConnectionGate`：未连接时的专用连接界面，不让完整表单长期占用手机内容。
- `AppShell`/`Navigation`：桌面左栏和手机底部导航。
- `HomeView`：最新、随机、常听、曲风入口；分区失败可单独显示。
- `SearchView`：歌曲、专辑、艺术家结果。
- `FavoritesView`：真实收藏歌曲。
- `AlbumDetail`、`ArtistDetail`、`GenreDetail`：可返回的层级详情。
- `TrackList`、`AlbumCarousel`：共享的操作型内容组件。
- `PlayerDock`：桌面右栏/平板底栏/手机迷你播放器和展开播放面板。
- `QueuePanel`：队列项、删除、跳转、清空和模式切换。

`App.tsx` 只负责组合 hook、当前页面和组件事件，不直接拼 API URL，也不包含具体音频生命周期。

## 数据流

1. `ConnectionGate` 提交配置。
2. `useNavidrome` 创建 client，调用 ping，成功后建立会话并并行加载首页数据。
3. 用户打开专辑/艺术家/曲风，hook 加载详情并更新可返回页面栈。
4. 用户点击播放，App 把 Track 列表交给 queue reducer；`useAudioPlayer` 观察当前 Track，装载稳定 stream URL 并从用户手势调用 play。
5. 当前 Track 同时进入 theme engine，根节点更新 `data-theme` 和 CSS token。
6. 收藏动作先更新 UI，再调用服务端；失败时回滚并显示 toast。

## 视觉设计

根节点始终包含不影响可读性的环境层、主界面层和主题装饰层。每种人格至少改变以下五项：

1. 主/辅色和对比关系。
2. 标题字体类别、字重和字距。
3. 卡片圆角/切角、边框与阴影。
4. 背景纹理和装饰 motif。
5. 动效曲线、距离和节奏。

播放控件的语义和排列保持稳定。`prefers-reduced-motion: reduce` 时关闭循环背景和位移动效，仅保留即时颜色/形态切换。

## 响应式设计

- `>=1180px`：`260px / minmax(0,1fr) / 340px` 三列，页面本身不滚动，内容和队列独立滚动。
- `768–1179px`：收窄侧栏，播放条固定底部，队列使用抽屉。
- `<=767px`：单列内容、固定底部导航、导航上方固定迷你播放器、全屏播放/队列 sheet，支持安全区。

手机断点除了重排，还会隐藏常驻连接表单、缩短卡片信息、扩大触控目标并改变播放详情入口，属于独立交互形态。

## 错误处理

- 输入错误：连接前校验 URL、用户名/密码或 API key。
- Subsonic 错误：展示服务端 message 和 code，不丢失已加载内容。
- CORS/网络：说明浏览器直连条件，并提示检查服务器 CORS、协议和可达性。
- 分区加载：部分成功，失败区显示重试，不把会话标记成失败。
- 搜索/详情：保留上一屏，错误 toast 不清空已有数据。
- 播放错误：播放器显示错误，队列仍可跳到下一首。
- 收藏写入：乐观更新；失败回滚。

## 测试策略

### 自动化

- `subsonic.test.ts`：token、API key、失败响应、空数组、端点和稳定媒体 URL。
- `themeEngine.test.ts`：七种人格、匹配优先级和 CSS token。
- `playerQueue.test.ts`：播放、追加、导航、删除、清空、随机和循环边界。
- `format.test.ts`：URL、时长、计数。
- `App.test.tsx`：连接门、主要导航、可访问名称和基础空状态。

### 真实服务与浏览器

- API 分层验证：ping、专辑、曲风、搜索、收藏和 stream Range。
- 桌面 Chrome：连接、首页、搜索、打开详情、播放状态、收藏和队列。
- 手机 Chrome 视口：固定底栏、全屏播放器、无横向溢出和主要触控入口。
- 浏览器媒体手势可能限制自动播放；验收以用户点击后 UI 状态和真实 stream `206` 为稳定证据，不以自动化环境能否发声为唯一条件。

## 规格自检结论

- 无待定项或占位符。
- 所有本版功能均映射到具体模块和验收标准。
- 直连方案与已验证的 HTTP/CORS 条件一致，未来 HTTPS 限制已明确。
- 播放列表、歌词、离线和多账号已明确排除，不与“日常主流程完整”冲突。
- 原始文档中的测试凭据不会复制到源码、生成文档或持久化存储。
