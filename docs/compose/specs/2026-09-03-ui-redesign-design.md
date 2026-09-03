# 前端视觉重设计 + 主题切换 + 中英文切换 — 设计文档

日期:2026-09-03 · 方向:B 石墨中性(Linear 风)· 深度:换肤 + 组件级优化(不动布局骨架与交互逻辑)

## [S1] 背景与目标

现前端由早期迭代堆成,视觉粗糙(demo 感):按钮全部同级灰框、无主题能力、仅中文硬编码。
目标三件事:
1. 视觉升级:B 石墨中性方向,双主题 token 体系,组件三级层级化;
2. 深色/浅色主题切换;
3. 中/英文界面切换。

约束:零依赖、零框架,原生 HTML/CSS/JS;`server.ts` 与 `lib/` 零改动;网格布局与交互逻辑不变。

## [S2] 设计 Token 体系

`style.css` 重写核心。`:root[data-theme="dark"]` 与 `:root[data-theme="light"]` 各一套结构对称的变量:

| Token | 深色 | 浅色 | 用途 |
|---|---|---|---|
| `--bg` | `#0f1112` | `#f6f7f8` | 页面底 |
| `--card` | `#15181b` | `#ffffff` | 卡片/对话框/菜单 |
| `--card-hover` | `#1a1d20` | `#f6f7f8` | 悬停 |
| `--border` | `#23272b` | `#e3e5e8` | 常规描边 |
| `--border-strong` | `#31363b` | `#d3d7db` | 强描边/输入框 |
| `--text` | `#e8eaec` | `#1b1e21` | 正文(对比度 ≥ 4.5:1) |
| `--muted` | `#767d85` | `#7d858d` | 次要文字 |
| `--accent` | `#5e6ad2` | `#5e6ad2` | 仅:默认徽章、默认卡片描边、下拉选中、focus 环 |
| `--accent-soft` | `rgba(94,106,210,.14)` | `rgba(94,106,210,.09)` | 选中/悬停底色 |
| `--danger` | `#eb5757` | `#c73737` | 删除/登出 |
| `--danger-soft` | `rgba(235,87,87,.12)` | `rgba(199,55,55,.08)` | 危险悬停底 |
| `--shadow` | 近无(描边分层) | `0 1px 2px rgba(20,24,30,.05)` | 卡片/菜单 |

- 主按钮反色实心:深主题 = 白底(#e8eaec)黑字(#131517);浅主题 = 黑底(#1b1e21)白字。每屏唯一最强动作。
- 字体:正文 `system-ui` 栈 13.5px/1.55;id/URL/数字 `'Cascadia Code', Consolas, monospace`;标题靠字重 600–650 分层,不靠字号差。
- 间距:4px 基准网格(4/8/12/16/24),收敛现有混乱值。
- 圆角:卡片 10px、按钮/输入 6px、chips 999px。
- 动效:仅对话框入场(fade + scale .98)与既有 hover 过渡;一律包在 `@media (prefers-reduced-motion: no-preference)` 内。

## [S3] 组件级优化清单

布局骨架(cards 网格、model-row 网格、对话框结构)不变,逐项精修:

1. **按钮三级体系**:primary(反色实心)→ secondary(描边幽灵,如「变体库」)→ 文字按钮(编辑/复制/删除去框化;删除用 danger 文字,hover 淡红底)。卡片操作行 = 1 个默认模型下拉 + 3 个文字按钮。
2. **小图标**:编辑/复制/主题/语言用 12px 内联 SVG 描边图标,零依赖,不用 emoji(📝 备注前缀保留属内容,可保留)。
3. **Toast 替代 `alert()`**:右上角堆叠,success/error 两型,3.5s 自动消失,可点击关闭。
4. **确认框替代 `confirm()`**:小型居中模态(标题+描述+取消/确认danger按钮),复用 dialog 视觉,Promise 化 `confirmDialog(msg)`。
5. **默认卡片**:accent 描边 + 顶部微渐变(比现版收敛),「默认」徽章右置。
6. **表单/对话框**:输入 focus = accent 描边 + 淡 accent 光晕;label/输入间距按 4px 网格统一。
7. **Header 右侧**:主题切换(☾/☀ SVG)与语言切换(中/EN)两个 secondary 小按钮,位于「变体库」之前。
8. 下拉菜单、chips、变体库列表、空态:仅按新 token 换肤,结构不变。

## [S4] 主题切换

- `<html data-theme="dark|light">` 控制整套 CSS 变量;JS 只写属性,零重排。
- localStorage `ui-theme`(`"dark"`/`"light"`)持久化;**无存储时跟随系统** `prefers-color-scheme`(matchMedia 一次性读取,不监听系统变化——用户显式选择优先)。
- `<head>` 内联约 5 行脚本在 CSS 绘制前设定 `data-theme`,杜绝闪烁(FOUC)。
- 切换按钮:深色显 ☀(切到浅)、浅色显 ☾(切到深),图标随主题即时更新。

## [S5] 中英文切换(i18n)

- 新增 `public/i18n.js`:`zh` / `en` 字典 + 全局 `t(key)`;key 用点分命名(如 `card.edit`、`toast.saved`)。
- 静态 HTML:`data-i18n="key"` 标注文本节点,`data-i18n-ph="key"` 标注 placeholder;切换时批量应用,并更新 `<html lang>`。
- app.js 动态字符串(按钮、下拉项、确认语、Toast、空态、对话框标题、`title` 提示)全部走 `t()`;渲染函数(render/renderAuth/renderModels/renderVbList)在语言切换后重跑。
- localStorage `ui-lang`(`"zh"`/`"en"`)持久化;默认 `navigator.language`:`zh-*` → zh,否则 en。
- **边界**:后端返回的报错文案(如「供应商 xxx 已存在」)保持中文不翻译;i18n 只覆盖 UI 框架文案。

## [S6] 文件改动与验证

| 文件 | 改动 |
|---|---|
| `public/style.css` | 重写:双主题 token + 组件精修(约 +200 行) |
| `public/i18n.js` | 新增:字典 + t()(约 150 行) |
| `public/index.html` | data-i18n 标注、header 两个切换按钮、head 防闪烁内联脚本、SVG symbol 定义 |
| `public/app.js` | t() 包裹、toast/confirmDialog 组件、主题/语言切换逻辑、SVG 图标引用 |

验证:`bun test` 维持 73 pass(后端零改动);`bun build public/app.js` 与 `bun build public/i18n.js` 语法检查;启动服务器人工过 深色/浅色 × 中/英 四组合与主流程(增删改供应商、拖拽排序、变体库 CRUD、提取目录、登出)。

## [S7] 明确不做(Out of Scope)

- 不改 cards 网格/model-row 布局骨架,不动任何交互逻辑与 API;
- 不引框架、构建步骤、外部字体/图标库;
- 不改 `server.ts` / `lib/` / 测试;
- 不监听系统主题实时变化、不做多语言 beyond 中/英、不翻译后端报错;
- 备注里的 📝 属用户内容,不替换。
